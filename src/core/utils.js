function removeElement(elementId) {
    const elem = document.getElementById(elementId);
    if (elem) {
        elem.parentElement.removeChild(elem);
    }
}

const fileCache = new Map();
// Cap the in-memory cache so a long-lived page (many fetched files/API pages)
// can't grow it without bound. Entries are keyed by full URL (ref/commit
// included), so eviction only costs a re-fetch, never staleness. FIFO: Map
// keeps insertion order, so the first key is the oldest.
const FILE_CACHE_MAX_ENTRIES = 200;

function cacheFileContent(fileUrl, content) {
    if (fileCache.size >= FILE_CACHE_MAX_ENTRIES) {
        const oldestKey = fileCache.keys().next().value;
        fileCache.delete(oldestKey);
    }
    fileCache.set(fileUrl, content);
}

async function loadFileContent(
    fileUrl,
    throwIf404 = true,
    timeoutMs = 10000,
    forceReload = false
) {
    if (!forceReload && fileCache.has(fileUrl)) {
        console.debug('cache hit for:', fileUrl);
        return fileCache.get(fileUrl);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const start = performance.now();

    try {
        console.debug('loading file content from:', fileUrl);

        const response = await fetch(fileUrl, { signal: controller.signal });
        const durationMs = performance.now() - start;

        console.debug(`response status: ${response.status}, load time: ${durationMs.toFixed(1)} ms`);

        if (response.status === 404) {
            if (throwIf404) throw new Error('File not found: ' + fileUrl);
            return null;
        }
        if (!response.ok) {
            throw new Error(`Cannot load file content from ${fileUrl} (status ${response.status})`);
        }

        const content = await response.text();
        cacheFileContent(fileUrl, content);

        return content;
    } catch (error) {
        const durationMs = performance.now() - start;

        if (error.name === 'AbortError') {
            throw new Error(`Timeout fetching ${fileUrl} after ${durationMs.toFixed(0)} ms`);
        }
        throw new Error(`Error fetching ${fileUrl} after ${durationMs.toFixed(0)} ms: ${error.message}`);
    } finally {
        clearTimeout(timer);
    }
}

function getFileNameFromPath(path) {
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart;
}

function getFileNameWithoutExtensionFromPath(path) {
    const filename = getFileNameFromPath(path);
    return filename.substring(0, filename.lastIndexOf('.'));
}

// Short form of a commit id for display (first 8 chars, the common git short-SHA
// length). Returns the input unchanged when it is not a string (null / undefined).
function shortenCommitId(commitId) {
    return typeof commitId === 'string' ? commitId.substring(0, 8) : commitId;
}

// A branch name as a URL path segment: slashes stay path separators, anything else
// git allows in a name (e.g. '#') is escaped.
function encodeBranchName(branchName) {
    return branchName.split('/').map(encodeURIComponent).join('/');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Polls `action` until it returns a truthy value, then returns that value.
// `action` must be synchronous; a falsy result means "not ready yet, retry".
// Returns null if it never becomes truthy within `attempts` checks. Used to wait
// for asynchronously rendered DOM (bpmn-js/preact properties panel, GitLab DOM)
// without relying on a fixed delay.
async function doWithAttempts(action, attempts = 10, delayMs = 150) {
    for (let index = 0; index < attempts; index++) {
        const res = action();
        if (res) {
            return res;
        }
        // No point sleeping after the final check — return promptly on failure.
        if (index < attempts - 1) {
            await delay(delayMs);
        }
    }
    return null;
}

// Finds a bpmn-js properties-panel group by its header text, returning the
// clickable header element (`.bio-properties-panel-group-header`) or null.
// The group title carries no `title` attribute, so it is matched by text.
// Polls via doWithAttempts to ride out the panel's async preact re-render
// (BUG-0011). Shared by PropertiesPanelHighlighter and PropertiesGroupExpander.
async function findPropertiesGroupHeader(groupName) {
    return doWithAttempts(function () {
        const titles = document.querySelectorAll('.bio-properties-panel-group-header-title');
        for (const title of titles) {
            if (title.textContent.trim() === groupName) {
                return title.parentElement;
            }
        }
        return null;
    });
}

function requireDefined(arg, argName) {
    if (!arg) {
        throw new Error(`${argName} is undefined`);
    }
    return arg;
}

// FEAT-0024: a bounded ring of the lines this page logged, so the feedback
// report can carry the tail of what actually happened. Write-only diagnostics:
// nothing reads it but getConsoleLogTail() and nothing renders from it — the one
// accepted piece of global mutable state on the differ page (docs/conventions.md).
const CONSOLE_RING_SIZE = 200;
// A single argument is capped rather than trusted: callers log whole param
// objects, and an uncapped JSON.stringify would drop a moddle descriptor — or a
// user's diagram XML — into the report.
const CONSOLE_MAX_ARG_CHARS = 300;
// An Error gets a larger budget: its message alone can fill the ordinary one (a
// failed request repeats a long URL twice), leaving no stack frames — and the
// frames are what locates the failure.
const CONSOLE_MAX_ERROR_CHARS = 600;
const consoleRing = [];
let consoleRingInstalled = false;

// `1 line` / `2 lines`. The log markers are read by a human in every report.
function plural(count, word) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// Once a stack enters a minified bundle the offsets say nothing to anyone, so
// keep the frame that entered it and count the rest away.
function collapseLibraryFrames(stack) {
    return stack.replace(/(?:\n[^\n]*\blibs\/[^\n]*){2,}/g, (run) => {
        const frames = run.split('\n');
        return `\n${frames[1]}\n    … ${plural(frames.length - 2, 'more library frame')}`;
    });
}

function formatLogArg(arg) {
    let text;
    let limit = CONSOLE_MAX_ARG_CHARS;
    if (arg instanceof Error) {
        // Every frame is prefixed with chrome-extension://<32-char id>/, which is
        // 52 characters of nothing — about a quarter of the budget over four
        // frames. The repo-relative path is what a reader needs.
        text = collapseLibraryFrames((arg.stack || `${arg.name}: ${arg.message}`)
            .replace(/chrome-extension:\/\/[a-z]+\//g, ''));
        limit = CONSOLE_MAX_ERROR_CHARS;
    } else if (typeof arg === 'string') {
        text = arg;
    } else {
        try {
            const json = JSON.stringify(arg);
            text = json === undefined ? String(arg) : json;
        } catch (error) {
            text = String(arg);
        }
    }
    return text.length > limit
        ? `${text.slice(0, limit)}…(+${plural(text.length - limit, 'char')})`
        : text;
}

// `at <fn> (path/to/file.js:12:34)` → `file.js:12`, plus whether the caller is a
// vendored library. The same message text is logged verbatim from several files,
// so without the site a reader of the report cannot tell which one spoke.
function callSiteFromStack(stack) {
    // [0] is 'Error', [1] the proxy trap that captured it, [2] the real caller.
    const frame = (stack || '').split('\n')[2] || '';
    const match = frame.match(/([^/\\ ()]+\.js):(\d+):\d+\)?\s*$/);
    return {
        site: match ? ` [${match[1]}:${match[2]}]` : '',
        fromLibrary: frame.includes('/libs/')
    };
}

// The levels worth keeping wherever they sit in the buffer, as opposed to the
// narrative around the moment the report was raised. `info` is in: every one of
// its call sites reports that something the user asked for was not found, which
// is usually the conclusion a report is about.
const CONSOLE_SIGNAL_LEVELS = new Set(['info', 'warn', 'error', 'uncaught', 'unhandled-rejection']);

// A library's own complaints never earn that promotion. bpmn-js warns about a
// deprecated call on every context-pad click and dmn-js errors about its own
// build on every load (INFRA-0001): both repeat in every session, carry a
// minified stack nobody can read, and would crowd out the lines that differ from
// one report to the next. A genuine library failure still reaches the report —
// through the recent window, through our own catch-and-warn around the call, or
// as an uncaught error, which never comes through console.* at all.
function isPromotedSignal(entry) {
    return CONSOLE_SIGNAL_LEVELS.has(entry.level) && !entry.fromLibrary;
}

// The rendered line keeps the level in its text (`12:00:00.000 warn [file.js:12]: …`),
// which FeedbackReport reads back to decide what to shed under the URL budget.
function recordConsoleLine(timestamp, level, args, { site = '', fromLibrary = false } = {}) {
    // `body` is the line without its timestamp — what makes two lines "the same"
    // when a run of them is collapsed.
    const body = `${level}${site}: ${args.map(formatLogArg).join(' ')}`;
    consoleRing.push({ level, fromLibrary, body, line: `${timestamp} ${body}` });
    if (consoleRing.length > CONSOLE_RING_SIZE) {
        consoleRing.shift();
    }
}

// Picked entries, oldest first, with an explicit marker wherever the selection
// jumped over buffered lines — so a reader never mistakes the join for a
// continuous stream.
function renderConsoleLines(picked) {
    const out = [];
    let runLine = null;
    let repeats = 1;
    for (let i = 0; i < picked.length; i++) {
        const previous = i > 0 ? picked[i - 1] : null;
        const skipped = previous ? picked[i].index - previous.index - 1 : 0;
        // A run of identical lines says only that the same thing happened N
        // times — which the count says exactly, in one line instead of N. Only
        // an uninterrupted run: anything between them is part of the story.
        if (previous && skipped === 0 && picked[i].entry.body === previous.entry.body) {
            repeats++;
            out[out.length - 1] = `${runLine} (×${repeats})`;
            continue;
        }
        repeats = 1;
        runLine = picked[i].entry.line;
        if (skipped > 0) {
            out.push(`… ${plural(skipped, 'line')} skipped`);
        }
        out.push(runLine);
    }
    return out.join('\n');
}

// The tail of this page's console, oldest first, within both budgets. Two tiers:
// the last `maxLines` entries of any level (what was happening when the user
// pressed the button) PLUS every signal line still buffered, wherever it sits.
// Debug outnumbers warn/error about two to one, so a plain tail regularly drops
// the single warning that explains the report and keeps 50 lines of chatter.
// `omitted` counts the buffered lines before the first shown one; lines skipped
// between shown ones are marked inline instead.
function getConsoleLogTail({ maxLines = 50, maxChars = 4000 } = {}) {
    const recentFrom = Math.max(0, consoleRing.length - maxLines);
    const picked = consoleRing
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry, index }) => index >= recentFrom || isPromotedSignal(entry));

    while (picked.length > 1 && renderConsoleLines(picked).length > maxChars) {
        picked.shift();
    }
    let text = renderConsoleLines(picked);
    if (text.length > maxChars) {
        text = text.slice(-maxChars);
    }
    return { text, omitted: picked.length ? picked[0].index : consoleRing.length };
}

// What is safe to log about the params a differ tab was opened with. The raw
// object carries the whole camunda moddle descriptor and, in local-file mode,
// the user's own diagram XML — neither belongs in a log that ships with a
// feedback report (FEAT-0024).
function describeDifferParams(rawParams) {
    return {
        platform: rawParams.platform && rawParams.platform.kind,
        host: rawParams.platform && rawParams.platform.hostUrl,
        changeRequestId: rawParams.changeRequestId,
        sourceRef: shortenCommitId(rawParams.sourceRef),
        targetRef: shortenCommitId(rawParams.targetRef),
        filePath: rawParams.filePath,
        targetFilePath: rawParams.targetFilePath,
        mode: rawParams.mode,
        editSide: rawParams.editSide,
        localFile: Boolean(rawParams.localFileContent),
        extensionVersion: rawParams.extensionVersion
    };
}

function appendTimeToConsoleLogs() {
    if (consoleRingInstalled) {
        return;
    }
    consoleRingInstalled = true;

    const formatter = new Intl.DateTimeFormat('en', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
        fractionalSecondDigits: 3
    });
    const handlerFor = (level) => ({
        apply: function (target, thisArg, argArray) {
            const ts = formatter.format(new Date());
            recordConsoleLine(ts, level, argArray, callSiteFromStack(new Error().stack));
            target.apply(console, [`${ts}:`, ...argArray]);
        }
    });

    console.debug = new Proxy(console.debug, handlerFor('debug'));
    console.info = new Proxy(console.info, handlerFor('info'));
    console.warn = new Proxy(console.warn, handlerFor('warn'));
    console.error = new Proxy(console.error, handlerFor('error'));

    // The failures that matter most never go through console.*. addEventListener
    // rather than window.onerror, so an existing handler is not clobbered.
    window.addEventListener('error', (event) => {
        const where = event.filename ? ` (${event.filename}:${event.lineno})` : '';
        recordConsoleLine(formatter.format(new Date()), 'uncaught',
            [(event.message || String(event.error)) + where]);
    });
    window.addEventListener('unhandledrejection', (event) => {
        recordConsoleLine(formatter.format(new Date()), 'unhandled-rejection', [event.reason]);
    });
}

function parseXml(xml) {
    const parser = new DOMParser();
    return parser.parseFromString(xml, 'text/xml');
}

// Serialised markup of an XML node with the whitespace between tags collapsed:
// indentation carries no meaning, but comparing subtrees as raw markup would
// report a differently formatted document as changed everywhere.
function markupOf(node) {
    return node.outerHTML.replace(/>\s+</g, '><');
}

function capitalizeFirstLetter(string) {
    if (string.length === 0) {
        return string;
    }
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getTitle(fileName) {
    return fileName.replace(/(.{31})/g, "$1 ");
}

// Hands the user a text file to save. Extracted from DiagramVersions.download so
// the FEAT-0031 edit download can supply a verbatim file name (the version
// download always prefixes the branch label).
function downloadTextFile(content, fileName) {
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

async function openDiffer(params, extParams, msgId, getResourceUrlByNameFunc) {
    console.debug('opening differ...');
    const newWindow = window.open('about:blank');
    if (!newWindow) {
        console.error('failed to open new window');
        return false;
    }

    console.debug('setting title...');
    newWindow.document.title = getTitle(params.fileName);

    console.debug('loading scripts...');
    await loadScripts(newWindow.document, getResourceUrlByNameFunc);
    console.debug('loading scripts...done');

    if (extParams) {
        params = { ...params, ...extParams };
    }
    const msg = {
        id: msgId,
        params: params
    }
    console.debug('sending message...');
    newWindow.postMessage(msg, '*');
    console.debug('opening differ...done');
    return true;
}

async function loadScripts(doc, getResourceUrlByNameFunc) {
    await addStylesheet('libs/bpmn-js/assets/bpmn-js.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/bpmn-js/assets/diagram-js.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/bpmn-js/assets/bpmn-font/css/bpmn.css', doc, getResourceUrlByNameFunc);
    await addScript('libs/bpmn-js/bpmn-modeler.production.min.js', doc, getResourceUrlByNameFunc);

    await addStylesheet('libs/dmn-js/assets/diagram-js.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-decision-table-controls.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-decision-table.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-drd.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-literal-expression.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-shared.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-font/css/dmn.css', doc, getResourceUrlByNameFunc);

    await addScript('libs/dmn-js/dmn-viewer.production.min.js', doc, getResourceUrlByNameFunc);

    // properties panel
    await addStylesheet('libs/bpmn-js-properties-panel/assets/element-templates.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/bpmn-js-properties-panel/assets/properties-panel.css', doc, getResourceUrlByNameFunc);
    await addScript('libs/bpmn-js-properties-panel/bpmn-js-properties-panel.umd.js', doc, getResourceUrlByNameFunc);

    await addStylesheet('src/differ/styles.css', doc, getResourceUrlByNameFunc);
    await addScript('src/core/config.js', doc, getResourceUrlByNameFunc);
    await addScript('src/core/utils.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/diff-type.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/condition-formatter.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/canvas-viewport.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/bpmn-xml-comparator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/diff-highlighter.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/changes-table-view.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/element-searcher.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/search-panel.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/properties-panel-highlighter.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/properties-group-expander.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/edit/edit-color-resolver.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/edit/edit-xml-colorizer.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/edit/edit-diff-painter.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/edit/edit-session.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/edit/edit-color-control.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/platform/platform-client.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/platform/gitlab-platform-client.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/platform/github-platform-client.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/platform/platform-client-factory.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/process-file-index.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/call-activity-locator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/call-activity-navigator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/decision-locator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/decision-navigator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/caller-locator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/decision-caller-locator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/handler-locator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/handler-navigator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/correlation-locator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/correlation-navigator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/differ-params.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/diagram-versions.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/branch-indicator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/differ-loading-overlay.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/differ-empty-state.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/differ-tab-navigator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/feedback-report.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/bpmn-differ-view.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/navigation/back-navigator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/dmn/dmn-table-viewport.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/dmn/dmn-xml-comparator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/dmn/dmn-diff-painter.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/dmn/dmn-differ-view.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/bpmn/bpmn-differ.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/dmn/dmn-differ.js', doc, getResourceUrlByNameFunc);
}

async function addStylesheet(resourceName, doc, getResourceUrlByNameFunc) {
    return new Promise((resolve, reject) => {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = getResourceUrlByNameFunc(resourceName);
        doc.head.appendChild(link);
        link.onload = () => { resolve(link); };
        link.onerror = () => { reject(new Error(`Loading failed: ${resourceName}`)); };
    });
}

async function addScript(resourceName, doc, getResourceUrlByNameFunc) {
    return new Promise((resolve, reject) => {
        const script = doc.createElement('script');
        script.src = getResourceUrlByNameFunc(resourceName);
        doc.head.appendChild(script);
        script.onload = () => { resolve(script); };
        script.onerror = () => { reject(new Error(`Loading failed: ${resourceName}`)); };
    });
}
