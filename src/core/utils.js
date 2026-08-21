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

function appendTimeToConsoleLogs() {
    const formatter = new Intl.DateTimeFormat('en', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
        fractionalSecondDigits: 3
    });
    const handler = {
        apply: function (target, thisArg, argArray) {
            const ts = formatter.format(new Date());
            target.apply(console, [`${ts}:`, ...argArray]);
        }
    };

    console.debug = new Proxy(console.debug, handler);
    console.info = new Proxy(console.info, handler);
    console.warn = new Proxy(console.warn, handler);
    console.error = new Proxy(console.error, handler);
}

function parseXml(xml) {
    const parser = new DOMParser();
    return parser.parseFromString(xml, 'text/xml');
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

    await addScript('libs/dmn-js/dmn-viewer.development.js', doc, getResourceUrlByNameFunc);

    // properties panel
    await addStylesheet('libs/bpmn-js-properties-panel/assets/element-templates.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/bpmn-js-properties-panel/assets/properties-panel.css', doc, getResourceUrlByNameFunc);
    await addScript('libs/bpmn-js-properties-panel/bpmn-js-properties-panel.umd.js', doc, getResourceUrlByNameFunc);

    await addStylesheet('src/differ/styles.css', doc, getResourceUrlByNameFunc);
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
    await addScript('src/differ/shared/update-indicator.js', doc, getResourceUrlByNameFunc);
    await addScript('src/differ/shared/differ-tab-navigator.js', doc, getResourceUrlByNameFunc);
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
