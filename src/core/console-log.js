// A bounded ring of the lines this page logged, so the feedback report can carry
// the tail of what actually happened (FEAT-0024). Write-only diagnostics:
// nothing reads the ring but `tail()` and nothing renders from it — the one
// accepted piece of global mutable state on the differ page (docs/conventions.md).
//
// `install()` replaces the four console methods with proxies, so this also
// captures what bpmn-js and dmn-js log, and adds the window error listeners,
// because the failures that matter most never go through console.* at all.
//
// It also owns what is *safe* to log — `describeImportError`,
// `describeDifferParams` — because the ring is what ships in a report, and the
// report must never carry the user's diagram.
class ConsoleLog {
    static RING_SIZE = 200;

    // A single argument is capped rather than trusted: callers log whole param
    // objects, and an uncapped JSON.stringify would drop a moddle descriptor —
    // or a user's diagram XML — into the report.
    static MAX_ARG_CHARS = 300;

    // An Error gets a larger budget: its message alone can fill the ordinary one
    // (a failed request repeats a long URL twice), leaving no stack frames — and
    // the frames are what locates the failure.
    static MAX_ERROR_CHARS = 600;

    // The levels worth keeping wherever they sit in the buffer, as opposed to the
    // narrative around the moment the report was raised. `info` is in: every one
    // of its call sites reports that something the user asked for was not found,
    // which is usually the conclusion a report is about.
    static SIGNAL_LEVELS = new Set(['info', 'warn', 'error', 'uncaught', 'unhandled-rejection']);

    static #ring = [];
    static #installed = false;

    static install() {
        if (ConsoleLog.#installed) {
            return;
        }
        ConsoleLog.#installed = true;

        const formatter = new Intl.DateTimeFormat('en', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
            fractionalSecondDigits: 3
        });
        const handlerFor = (level) => ({
            apply: function (target, thisArg, argArray) {
                const ts = formatter.format(new Date());
                ConsoleLog.#record(ts, level, argArray, ConsoleLog.callSite(new Error().stack));
                target.apply(console, [`${ts}:`, ...argArray]);
            }
        });

        console.debug = new Proxy(console.debug, handlerFor('debug'));
        console.info = new Proxy(console.info, handlerFor('info'));
        console.warn = new Proxy(console.warn, handlerFor('warn'));
        console.error = new Proxy(console.error, handlerFor('error'));

        // addEventListener rather than window.onerror, so an existing handler is
        // not clobbered.
        window.addEventListener('error', (event) => {
            const where = event.filename ? ` (${event.filename}:${event.lineno})` : '';
            ConsoleLog.#record(formatter.format(new Date()), 'uncaught',
                [(event.message || String(event.error)) + where]);
        });
        window.addEventListener('unhandledrejection', (event) => {
            ConsoleLog.#record(formatter.format(new Date()), 'unhandled-rejection', [event.reason]);
        });
    }

    // The tail of this page's console, oldest first, within both budgets. Two
    // tiers: the last `maxLines` entries of any level (what was happening when
    // the user pressed the button) PLUS every signal line still buffered,
    // wherever it sits. Debug outnumbers warn/error about two to one, so a plain
    // tail regularly drops the single warning that explains the report and keeps
    // 50 lines of chatter.
    // `omitted` counts the buffered lines before the first shown one; lines
    // skipped between shown ones are marked inline instead.
    static tail({ maxLines = 50, maxChars = 4000 } = {}) {
        const ring = ConsoleLog.#ring;
        const recentFrom = Math.max(0, ring.length - maxLines);
        const picked = ring
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry, index }) => index >= recentFrom || ConsoleLog.isPromotedSignal(entry));

        while (picked.length > 1 && ConsoleLog.#render(picked).length > maxChars) {
            // Shed the narrative before the signals. Shifting blindly from the
            // front discarded exactly what the second tier had promoted —
            // promoted entries are by definition older than the recent window, so
            // they sit at the front — and left recent chatter in their place.
            // What goes is marked, so the gap is visible rather than silent.
            const droppable = picked.findIndex(({ entry }) => !ConsoleLog.isPromotedSignal(entry));
            picked.splice(droppable >= 0 ? droppable : 0, 1);
        }
        let text = ConsoleLog.#render(picked);
        if (text.length > maxChars) {
            text = text.slice(-maxChars);
        }
        return { text, omitted: picked.length ? picked[0].index : ring.length };
    }

    // A library's own complaints never earn that promotion. bpmn-js warns about a
    // deprecated call on every context-pad click and dmn-js errors about its own
    // build on every load (INFRA-0001): both repeat in every session, carry a
    // minified stack nobody can read, and would crowd out the lines that differ
    // from one report to the next. A genuine library failure still reaches the
    // report — through the recent window, through our own catch-and-warn around
    // the call, or as an uncaught error, which never comes through console.* at all.
    static isPromotedSignal(entry) {
        return ConsoleLog.SIGNAL_LEVELS.has(entry.level) && !entry.fromLibrary;
    }

    // `at <fn> (path/to/file.js:12:34)` → `file.js:12`, plus whether the caller is
    // a vendored library. The same message text is logged verbatim from several
    // files, so without the site a reader of a report cannot tell which one spoke.
    static callSite(stack) {
        // [0] is 'Error', [1] the proxy trap that captured it, [2] the real caller.
        const frame = (stack || '').split('\n')[2] || '';
        const match = frame.match(/([^/\\ ()]+\.js):(\d+):\d+\)?\s*$/);
        return {
            site: match ? ` [${match[1]}:${match[2]}]` : '',
            fromLibrary: frame.includes('/libs/')
        };
    }

    // A failed diagram import must never be logged verbatim. moddle-xml renders
    // the parser's complaint as `unparsable content <slice> detected`, and that
    // slice is a raw substring of the user's document — it shortens it only when
    // the slice looks like a tag, so a parse that dies on a text node quotes the
    // text. The line would also be the most durable one in a report (level
    // `error`, call site in our own code, so never shed).
    //
    // A whitelist, not a redaction: keep the position and the parser's own reason,
    // which cannot be document text, and drop the rest. If a library upgrade
    // changes the shape, nothing matches and nothing leaks.
    static describeImportError(error) {
        const message = String((error && error.message) || error);
        const parts = [];
        const position = message.match(/line:\s*(\d+)[\s\S]*?column:\s*(\d+)/);
        if (position) {
            parts.push(`line ${position[1]}, column ${position[2]}`);
        }
        const reason = message.match(/nested error:\s*([^\n]{0,80})/);
        if (reason) {
            parts.push(reason[1].trim());
        }
        if (!parts.length) {
            return 'import failed; details withheld — they can quote the document';
        }
        return `${(error && error.name) || 'Error'}: ${parts.join(' — ')}`;
    }

    // What is safe to log about the params a differ tab was opened with. The raw
    // object carries the whole camunda moddle descriptor and, in local-file mode,
    // the user's own diagram XML — neither belongs in a log that ships with a
    // feedback report.
    static describeDifferParams(rawParams) {
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

    // The rendered line keeps the level in its text
    // (`12:00:00.000 warn [file.js:12]: …`), which FeedbackReport reads back to
    // decide what to shed under the URL budget.
    static #record(timestamp, level, args, { site = '', fromLibrary = false } = {}) {
        // `body` is the line without its timestamp — what makes two lines "the
        // same" when a cycle of them is collapsed.
        const body = `${level}${site}: ${args.map(ConsoleLog.#formatArg).join(' ')}`;
        ConsoleLog.#ring.push({ level, fromLibrary, body, line: `${timestamp} ${body}` });
        if (ConsoleLog.#ring.length > ConsoleLog.RING_SIZE) {
            ConsoleLog.#ring.shift();
        }
    }

    static #formatArg(arg) {
        let text;
        let limit = ConsoleLog.MAX_ARG_CHARS;
        try {
            if (arg instanceof Error) {
                // Every frame is prefixed with chrome-extension://<32-char id>/,
                // which is 52 characters of nothing — about a quarter of the
                // budget over four frames. The repo-relative path is what a
                // reader needs.
                text = ConsoleLog.#collapseLibraryFrames((arg.stack || `${arg.name}: ${arg.message}`)
                    .replace(/chrome-extension:\/\/[a-z]+\//g, ''));
                limit = ConsoleLog.MAX_ERROR_CHARS;
            } else if (typeof arg === 'string') {
                text = arg;
            } else {
                // Tag-based, not instanceof: a Map built in another realm is still
                // a Map, and JSON.stringify renders either one as '{}' — which is
                // how a line reporting a Map's contents came out saying nothing.
                const tag = Object.prototype.toString.call(arg);
                if (tag === '[object Map]') {
                    text = JSON.stringify(Object.fromEntries(arg));
                } else if (tag === '[object Set]') {
                    text = JSON.stringify(Array.from(arg));
                } else {
                    const json = JSON.stringify(arg);
                    text = json === undefined ? String(arg) : json;
                }
            }
        } catch (error) {
            // This runs inside the console proxy, so nothing an argument does may
            // escape: a throwing toString/toJSON/getter would otherwise turn an
            // ordinary log call into an uncaught exception at its own call site.
            text = '[unloggable argument]';
        }
        return text.length > limit
            ? `${text.slice(0, limit)}…(+${plural(text.length - limit, 'char')})`
            : text;
    }

    // Once a stack enters a minified bundle the offsets say nothing to anyone, so
    // keep the frame that entered it and count the rest away.
    static #collapseLibraryFrames(stack) {
        return stack.replace(/(?:\n[^\n]*\blibs\/[^\n]*){2,}/g, (run) => {
            const frames = run.split('\n');
            return `\n${frames[1]}\n    … ${plural(frames.length - 2, 'more library frame')}`;
        });
    }

    // Length, in entries, of the cycle of the given period starting at `start`.
    // Stops at the first entry that breaks the pattern or that the tail selection
    // skipped over — a gap means the two lines were not actually in a row.
    static #cycleLength(picked, start, period) {
        if (start + period > picked.length) {
            return 1;
        }
        for (let j = 1; j < period; j++) {
            if (picked[start + j].index !== picked[start + j - 1].index + 1) {
                return 1;
            }
        }
        let length = period;
        while (start + length < picked.length) {
            const current = picked[start + length];
            if (current.index !== picked[start + length - 1].index + 1) {
                break;
            }
            if (current.entry.body !== picked[start + length - period].entry.body) {
                break;
            }
            length++;
        }
        return length;
    }

    // Picked entries, oldest first, with an explicit marker wherever the selection
    // jumped over buffered lines — so a reader never mistakes the join for a
    // continuous stream.
    //
    // A cycle of identical or of two alternating lines says only how many times
    // the same thing happened, so it shows the cycle once and counts the rest.
    // Switch branch pressed fifteen times spent 22 lines on that one sentence, and
    // those lines pushed the boot and the first failed lookup out of the report.
    // Only an uninterrupted cycle: anything in between is part of the story.
    static #render(picked) {
        const out = [];
        let i = 0;
        while (i < picked.length) {
            if (i > 0) {
                const skipped = picked[i].index - picked[i - 1].index - 1;
                if (skipped > 0) {
                    out.push(`… ${plural(skipped, 'line')} skipped`);
                }
            }

            let period = 1;
            let length = ConsoleLog.#cycleLength(picked, i, 1);
            if (length === 1) {
                // Not a repeat; maybe an alternation. `A B A B` is the shortest
                // one worth collapsing — below that the marker costs more than
                // it saves.
                const alternating = ConsoleLog.#cycleLength(picked, i, 2);
                if (alternating >= 4) {
                    period = 2;
                    length = alternating;
                }
            }

            for (let j = 0; j < period; j++) {
                out.push(picked[i + j].entry.line);
            }
            const collapsed = length - period;
            if (collapsed > 0) {
                if (period === 1) {
                    out[out.length - 1] = `${picked[i].entry.line} (×${length})`;
                } else {
                    out.push(`… ${plural(collapsed, 'more line')} alternating between these`);
                }
            }
            i += length;
        }
        return out.join('\n');
    }
}
