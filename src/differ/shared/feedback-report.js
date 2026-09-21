// FEAT-0024: assembles the prefilled GitHub issue that the differ toolbar's 💬
// button opens. Pure string work — no DOM, no network, no chrome.*: the caller
// supplies the context and the console tail (getConsoleLogTail in utils.js) and
// opens the returned URL itself.
//
// Schema/XML content is never part of a report: only the fields spelled out in
// buildBody() reach the body, so a caller that puts a diagram into the context
// object cannot leak it by accident.
class FeedbackReport {
    static ISSUE_TEMPLATE = 'bug_report.md';

    // GitHub answers 414 to a prefilled issue URL somewhere around 8 KB. Stay
    // clear of the cliff — the log is what gets trimmed to fit.
    static MAX_URL_LENGTH = 7000;

    static buildTitle(context) {
        return `[differ] ${context.fileName || 'diagram'}`;
    }

    // `logTail`: { text, omitted } from getConsoleLogTail(), optionally with
    // `debugDropped` — the debug lines buildUrl() shed to fit the budget.
    static buildBody(context, logTail) {
        return [
            '## What happened',
            '',
            '<!-- Describe the problem or the suggestion. Everything below was filled',
            '     in automatically — edit or delete anything you would rather not share. -->',
            '',
            '## Context',
            '',
            '| Field | Value |',
            '| --- | --- |',
            `| Extension | ${FeedbackReport.#cell(context.extensionVersion)} |`,
            `| Platform | ${FeedbackReport.#cell(context.platformKind)} · ${FeedbackReport.#cell(context.hostUrl)} |`,
            `| Page | ${FeedbackReport.#pageDescription(context)} |`,
            `| File | ${FeedbackReport.#cell(context.fileName)} (${FeedbackReport.#cell(context.fileType)}) |`,
            `| Compared | ${FeedbackReport.#side(context.sourceLabel, context.sourceUrl)} |`,
            `| Against | ${FeedbackReport.#side(context.targetLabel, context.targetUrl)} |`,
            '',
            '## Console log',
            '',
            ...FeedbackReport.#logSection(logTail),
            '',
            '---',
            'No diagram or XML content is included. The log above can still contain file',
            'paths, branch names and your host — review it before submitting.'
        ].join('\n');
    }

    static buildUrl(feedbackUrl, context, logTail) {
        const base = `${feedbackUrl}/new?template=${FeedbackReport.ISSUE_TEMPLATE}`
            + `&title=${encodeURIComponent(FeedbackReport.buildTitle(context))}&body=`;

        // The log goes last and is the only variable-length part, so shed it until
        // the WHOLE url fits: the limit is on the url, not on the body, and
        // percent-encoding roughly triples a newline-heavy log. Debug chatter goes
        // first, wherever it sits — a warning or a stack trace is worth far more to
        // whoever reads the report than the debug line that preceded it.
        const lines = logTail.text ? logTail.text.split('\n') : [];
        let omitted = logTail.omitted;
        let debugDropped = 0;
        for (;;) {
            const body = FeedbackReport.buildBody(context, { text: lines.join('\n'), omitted, debugDropped });
            const url = base + encodeURIComponent(body);
            if (url.length <= FeedbackReport.MAX_URL_LENGTH || lines.length === 0) {
                return url;
            }
            const debugIndex = lines.findIndex(line => FeedbackReport.#isDebugLine(line));
            if (debugIndex >= 0) {
                lines.splice(debugIndex, 1);
                debugDropped++;
            } else {
                lines.shift();
                omitted++;
            }
        }
    }

    // `12:00:00.000 debug [bpmn-differ.js:72]: …`
    static #isDebugLine(line) {
        return /^\S+\s+debug[\s[:]/.test(line);
    }

    static #logSection(logTail) {
        if (!logTail.text) {
            return ['_(no console output was captured)_'];
        }
        const markers = [];
        if (logTail.omitted > 0) {
            markers.push(`… ${logTail.omitted} earlier lines omitted`);
        }
        if (logTail.debugDropped > 0) {
            markers.push(`… ${logTail.debugDropped} debug lines dropped to fit the URL`);
        }
        return [
            '<details>',
            "<summary>last lines of this tab's console</summary>",
            '',
            '```',
            ...markers,
            logTail.text,
            '```',
            '',
            '</details>'
        ];
    }

    static #pageDescription(context) {
        return context.changeRequestId
            ? `merge request !${FeedbackReport.#cell(context.changeRequestId)}`
            : 'branch view (no merge request)';
    }

    static #side(label, url) {
        return url
            ? `${FeedbackReport.#cell(label)} — ${url}`
            : `${FeedbackReport.#cell(label)} — n/a (file absent on this side)`;
    }

    // A pipe would break the markdown table row; the values are short labels and
    // refs, so escaping the separator is all that is needed.
    static #cell(value) {
        return value == null ? '—' : String(value).replace(/\|/g, '\\|');
    }
}
