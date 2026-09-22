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

    // What the diff's source side actually is. The three cases render very
    // differently and conflating them makes the report lie: a branch view has no
    // second side at all, and a local file is present but has no URL in the
    // repository — neither is "the file is absent on this side", which is the
    // genuine third case (a file added or deleted in the merge request).
    static SOURCE_REF = 'ref';
    static SOURCE_LOCAL_FILE = 'local-file';
    static SOURCE_NONE = 'none';

    // How the edit session's diff colouring stands. `paused` means a recompute
    // failed and the colours on screen are the last good ones — the one state a
    // reader must know about before believing a complaint that the diff is wrong.
    static COLORING_ON = 'on';
    static COLORING_OFF = 'off';
    static COLORING_PAUSED = 'paused';

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
            ...FeedbackReport.#comparisonRows(context),
            ...FeedbackReport.#editRow(context),
            '',
            '## Console log',
            '',
            ...FeedbackReport.#logSection(logTail),
            '',
            // Addressed to whoever is about to press Submit, so it is a comment:
            // GitHub's new-issue form shows it plainly, and the published issue
            // does not carry a privacy notice nobody needs any more.
            '<!-- The diagram file itself is never attached. The log above can still',
            '     contain file paths, branch names, your host and identifiers from the',
            '     diagram (process and element ids, topic names) — review it, and edit',
            '     or delete anything you would rather not share. -->'
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
            markers.push(`… ${plural(logTail.omitted, 'earlier line')} omitted`);
        }
        if (logTail.debugDropped > 0) {
            markers.push(`… ${plural(logTail.debugDropped, 'debug line')} dropped to fit the URL`);
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
        const page = context.changeRequestId
            ? `merge request !${FeedbackReport.#cell(context.changeRequestId)}`
            : 'branch view (no merge request)';
        // An edit tab owns one side and its toolbar is a different one, so a report
        // that only said "merge request !123" would describe the wrong screen
        // (FEAT-0031 edit mode). View mode is the default and stays unannotated.
        return context.editSide
            ? `${page} — **edit mode**, editing the ${FeedbackReport.#cell(context.editSide)} side`
            : page;
    }

    // Which side is which, told as the reader needs it rather than as the params
    // happen to be shaped.
    static sourceKindFor({ localFileContent, sourceRef }) {
        if (localFileContent) {
            return FeedbackReport.SOURCE_LOCAL_FILE;
        }
        return sourceRef ? FeedbackReport.SOURCE_REF : FeedbackReport.SOURCE_NONE;
    }

    // Nothing in the edit subsystem writes to the console on a normal session, so
    // without this the log of an edit-mode report stops at boot and says nothing
    // about the editing. A row is bounded, unlike a line per recompute.
    static #editRow(context) {
        if (!context.editSide) {
            return [];
        }
        const edits = context.editDirty ? 'edited' : 'untouched';
        const coloring = context.editColoring === FeedbackReport.COLORING_PAUSED
            ? 'colouring paused — the colours on screen are the last good ones'
            : `colouring ${FeedbackReport.#cell(context.editColoring)}`;
        return [`| Edit session | ${edits}, ${coloring} |`];
    }

    static #comparisonRows(context) {
        if (context.sourceKind === FeedbackReport.SOURCE_NONE) {
            // One version on screen and nothing to compare it with; a
            // Compared/Against pair here reads as if a side had gone missing.
            return [`| Version | ${FeedbackReport.#side(context.targetLabel, context.targetUrl)} |`];
        }
        return [
            `| Compared | ${FeedbackReport.#sourceSide(context)} |`,
            `| Against | ${FeedbackReport.#side(context.targetLabel, context.targetUrl)} |`
        ];
    }

    static #sourceSide(context) {
        if (context.sourceKind === FeedbackReport.SOURCE_LOCAL_FILE) {
            return `local file "${FeedbackReport.#cell(context.sourceLabel)}" (not in the repository)`;
        }
        return FeedbackReport.#side(context.sourceLabel, context.sourceUrl);
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
