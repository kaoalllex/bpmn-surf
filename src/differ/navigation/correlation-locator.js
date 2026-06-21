// Locates, in the project's source code, the point that wakes up a
// message-catching BPMN element (FEAT-0027).
//
// Elements that WAIT for a message — bpmn:ReceiveTask and catch/start/boundary
// events with a bpmn:MessageEventDefinition — are resumed from code via message
// correlation: correlateMessage("<name>") in Camunda 7, publishMessage /
// newPublishMessageCommand().messageName("<name>") in Zeebe / Camunda 8. The
// correlation is keyed by the message NAME (not the element id), and that name is
// a literal string at the call site, so it is searchable.
//
// The flow mirrors HandlerLocator: from a BPMN element derive a string key (here
// the message name) → GitLab blob-search → classify/rank hits → the UI shows a
// badge + dropdown (CorrelationNavigator) that opens the chosen blobFileUrl.
//
// Search runs in up to two phases:
//  - Phase 1 searches the literal name and classifies each hit by its snippet and
//    path: a line with a correlation keyword is a correlation point; a constant
//    declaration (FOO = "<name>") captures the constant name for Phase 2; a
//    .bpmn/.dmn file is the receiving side and is excluded; .yml/.properties is
//    config; a test file is kept but deprioritised.
//  - Phase 2 resolves the captured constant(s): a second search for the constant
//    name, keeping the hits whose line carries a correlation keyword. This catches
//    the indirection `correlate(Messages.ORDER_PLACED)` (cases B/C).
//
// Designed-in limitations (not fought): a sender in another microservice/project
// is out of scope (search is scoped to the current project); a dynamic name
// (${...}) cannot be searched literally and degrades to config hits + a raw-search
// link; a name that only exists in the Kafka payload at runtime is impossible to
// find by static analysis.
class CorrelationLocator {
    // Element types that can WAIT for a message. A message StartEvent /
    // IntermediateCatchEvent / BoundaryEvent only qualifies when it actually
    // carries a MessageEventDefinition — #messageRef returns null otherwise, so a
    // timer/signal/plain variant yields no name and no badge. Message THROW/END
    // events are deliberately absent: they send a message, they do not wait.
    static #CATCHING_TYPES = new Set([
        'bpmn:ReceiveTask',
        'bpmn:IntermediateCatchEvent',
        'bpmn:StartEvent',
        'bpmn:BoundaryEvent'
    ]);

    // Correlation keywords (matched case-insensitively against the hit snippet):
    //  - Camunda 7:  correlate / correlateMessage / correlateWithResult /
    //                createMessageCorrelation
    //  - Zeebe / C8: publishMessage / newPublishMessageCommand / messageName
    // 'correlate' subsumes the camunda-7 fluent variants; 'publishmessage' is a
    // substring of 'newpublishmessagecommand' once lower-cased.
    static #CORRELATION_KEYWORDS = ['correlate', 'createmessagecorrelation', 'publishmessage', 'messagename'];

    // File-name fragments that mark a likely correlation source (a Kafka listener,
    // consumer or handler); used only to boost ranking, never to filter.
    static #HANDLER_LIKE_NAME_REGEX = /Listener|Consumer|Kafka|Handler/;

    static #CONFIG_EXTENSIONS = ['.yml', '.yaml', '.properties'];
    static #DIAGRAM_EXTENSIONS = ['.bpmn', '.dmn'];

    // Blob-search page size. Larger than GitLab's default 20 because the tokenised
    // search returns many sub-token matches that can outrank the genuine one.
    static #SEARCH_PAGE_SIZE = 100;

    #projectUrl;
    #projectHostUrl;
    #projectId;

    // Cache of resolveCorrelations() results, keyed by `${ref}\n${name}`.
    #cache = new Map();

    constructor(projectUrl, projectHostUrl, projectId) {
        this.#projectUrl = projectUrl;
        this.#projectHostUrl = projectHostUrl;
        this.#projectId = projectId;
    }

    /**
     * The message name a message-catching element waits for, or null if the
     * element does not wait for a message. Covers bpmn:ReceiveTask (name on
     * bo.messageRef) and message catch/start/boundary events (name on the nested
     * bpmn:MessageEventDefinition's messageRef). The `dynamic` flag is set when
     * the name embeds an expression (${...}), which cannot be searched literally.
     * @returns {{name: string, dynamic: boolean}|null}
     */
    static extractMessageName(bo) {
        if (!bo || !CorrelationLocator.#CATCHING_TYPES.has(bo.$type)) {
            return null;
        }
        const messageRef = CorrelationLocator.#messageRef(bo);
        const name = messageRef && (messageRef.name || (messageRef.get && messageRef.get('name')));
        if (!name) {
            return null;
        }
        return { name, dynamic: CorrelationLocator.isDynamicName(name) };
    }

    // The bpmn:Message a catching element refers to: directly on a ReceiveTask
    // (bo.messageRef), or on the nested bpmn:MessageEventDefinition for a message
    // event. Returns null for an element that carries no message reference.
    static #messageRef(bo) {
        if (bo.messageRef || (bo.get && bo.get('messageRef'))) {
            return bo.messageRef || bo.get('messageRef');
        }
        const defs = bo.eventDefinitions || (bo.get && bo.get('eventDefinitions'));
        const msgDef = defs && defs.find(d => d.$type === 'bpmn:MessageEventDefinition');
        if (!msgDef) {
            return null;
        }
        return msgDef.messageRef || (msgDef.get && msgDef.get('messageRef')) || null;
    }

    /**
     * Whether a message name embeds an expression (${...}) and is therefore built
     * at runtime — it cannot be searched as a literal.
     */
    static isDynamicName(name) {
        return !!name && name.includes('${');
    }

    /**
     * Whether the hit snippet contains a message-correlation keyword.
     */
    static hasCorrelationKeyword(text) {
        if (!text) {
            return false;
        }
        const lower = text.toLowerCase();
        return CorrelationLocator.#CORRELATION_KEYWORDS.some(kw => lower.includes(kw));
    }

    /**
     * If the snippet declares a constant initialised to the given name
     * (`static final String FOO = "<name>"`, `const val FOO = "<name>"`,
     * `const FOO = "<name>"`, …), returns the constant name; otherwise null. The
     * captured name drives Phase 2 (resolve the indirection to its usage site).
     * @returns {string|null}
     */
    static constantNameFromDeclaration(text, name) {
        if (!text || !name) {
            return null;
        }
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(
            '(?:static\\s+final\\s+String|final\\s+String|const\\s+val|val|const)\\s+' +
            '([A-Za-z_]\\w*)\\s*=\\s*"' + escaped + '"'
        );
        const match = regex.exec(text);
        return match ? match[1] : null;
    }

    /**
     * Classifies a single blob-search hit by its path and snippet.
     *  - 'diagram'     — a .bpmn/.dmn file: the receiving side, to be excluded.
     *  - 'config'      — a .yml/.yaml/.properties file: a possible dynamic source.
     *  - 'correlation' — the snippet carries a correlation keyword.
     *  - 'constant'    — the snippet declares a constant = "<name>"; the captured
     *                    constant name is returned for Phase 2.
     *  - 'other'       — a plain literal occurrence.
     * @returns {{category: string, constantName?: string}}
     */
    static classifyHit(item, name) {
        const path = (item && item.path) || '';
        if (CorrelationLocator.isDiagramFile(path)) {
            return { category: 'diagram' };
        }
        if (CorrelationLocator.isConfigFile(path)) {
            return { category: 'config' };
        }
        const data = (item && item.data) || '';
        if (CorrelationLocator.hasCorrelationKeyword(data)) {
            return { category: 'correlation' };
        }
        const constantName = CorrelationLocator.constantNameFromDeclaration(data, name);
        if (constantName) {
            return { category: 'constant', constantName };
        }
        return { category: 'other' };
    }

    static isConfigFile(path) {
        return !!path && CorrelationLocator.#CONFIG_EXTENSIONS.some(ext => path.endsWith(ext));
    }

    static isDiagramFile(path) {
        return !!path && CorrelationLocator.#DIAGRAM_EXTENSIONS.some(ext => path.endsWith(ext));
    }

    // Whether a hit comes from test code (unit or auto-test, any language). Such
    // hits are segregated and hidden by default (FEAT-0027 review): they are
    // rarely the correlation point the user is after. (A future setting may opt
    // them back in — that is why they are kept in a `tests` group, not dropped.)
    static isTestPath(path) {
        if (!path) {
            return false;
        }
        // A test/spec directory anywhere in the path (src/test, autotests/, e2e/,
        // integration-test/, …). Deliberately NOT a bare `it/` — that collides
        // with the Italian i18n locale directory.
        if (/(^|\/)(tests?|autotests?|androidtest|integration-?tests?|e2e)\//i.test(path)) {
            return true;
        }
        const fileName = path.split('/').pop();
        // JS/TS test/spec files: foo.spec.ts, foo.test.tsx, bar.spec.js …
        if (/\.(spec|test)\.[jt]sx?$/i.test(fileName)) {
            return true;
        }
        // JVM test classes (PascalCase by convention): FooTest.kt, FooSpec.kt,
        // OrderServiceIT.java … The `[a-z]` before IT avoids all-caps words like
        // SPLIT.java; the lower-cased `test`/`spec` in a name is not matched (so
        // Latest.kt / Audit.kt are not mistaken for tests).
        return /(?:Test|Tests|Spec|[a-z]IT)\.(?:kt|java|scala|groovy)$/.test(fileName);
    }

    /**
     * Turns raw blob-search items into classified, scored hits (excluding the
     * diagram files). The search term is the literal being searched in this phase
     * (the message name in Phase 1, the constant name in Phase 2) and anchors the
     * matched line number within the snippet.
     * @returns {{path: string, line: number, category: string, constantName: ?string, isTest: boolean, score: number}[]}
     */
    static collectHits(items, term) {
        if (!Array.isArray(items)) {
            return [];
        }
        const hits = [];
        for (const item of items) {
            if (!item || !item.path) {
                continue;
            }
            // GitLab Advanced Search (Elasticsearch) tokenises an underscored name
            // (FINISH_VERIFICATION_API -> finish / verification / api), so it also
            // returns files that match only a sub-token, not the exact identifier
            // (and quoting the term to force a phrase is impossible here — see
            // handler-locator BUG-0013). Keep only hits whose snippet actually
            // contains the searched term, otherwise a correlation keyword on an
            // unrelated line (a handler correlating a DIFFERENT message) is
            // mistaken for our message's correlation point.
            if (!item.data || !item.data.includes(term)) {
                continue;
            }
            const classification = CorrelationLocator.classifyHit(item, term);
            if (classification.category === 'diagram') {
                continue;
            }
            hits.push({
                path: item.path,
                line: CorrelationLocator.#computeMatchLine(item, term),
                category: classification.category,
                constantName: classification.constantName || null,
                isTest: CorrelationLocator.isTestPath(item.path),
                score: CorrelationLocator.#scoreHit(classification.category, item.path)
            });
        }
        return hits;
    }

    // Ranking score (higher = better) WITHIN a group. A correlation point beats a
    // plain literal beats a constant declaration beats config; a handler-like file
    // name (Listener/Consumer/Kafka/Handler) boosts. Test hits are segregated into
    // their own group before ranking, so no test penalty is needed here.
    static #scoreHit(category, path) {
        let score;
        switch (category) {
            case 'correlation': score = 100; break;
            case 'other': score = 40; break;
            case 'constant': score = 30; break;
            case 'config': score = 20; break;
            default: score = 10;
        }
        if (CorrelationLocator.#HANDLER_LIKE_NAME_REGEX.test(path)) {
            score += 10;
        }
        return score;
    }

    /**
     * De-duplicates hits by path+line and orders them best-first by score.
     */
    static rankHits(hits) {
        const seen = new Set();
        const unique = [];
        for (const hit of hits) {
            const key = `${hit.path}:${hit.line}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            unique.push(hit);
        }
        return unique.sort((a, b) => b.score - a.score);
    }

    /**
     * Runs the two-phase resolution against injected I/O — `searchFn(term) ->
     * Promise<items[]>` (Phase 1 blob-search) and `fetchFileFn(path) ->
     * Promise<string>` (Phase 2 file fetch). Kept pure (no network, no project
     * state) so the whole flow is unit-testable with fakes. Returns the grouped,
     * ranked result:
     *   { name, dynamic, groups: { correlation, other, config, tests } }
     * Test hits land in their own `tests` group (hidden by default).
     * @returns {Promise<object>}
     */
    static async resolveWith(name, searchFn, fetchFileFn) {
        const result = CorrelationLocator.#emptyResult(name);
        if (!name) {
            return result;
        }
        if (CorrelationLocator.isDynamicName(name)) {
            result.dynamic = true;
            return result;
        }

        // Phase 1: search the literal message name. Direct correlation sites
        // (the name appears at the correlate/publish call — case A) land in the
        // correlation group right away. A constant declaration (FOO = "<name>")
        // records its file for Phase 2.
        const phase1 = await searchFn(name);
        const declarations = [];
        for (const hit of CorrelationLocator.collectHits(phase1, name)) {
            CorrelationLocator.#route(result, hit);
            if (!hit.isTest && hit.category === 'constant' && hit.constantName
                && !declarations.some(d => d.file === hit.path && d.constantName === hit.constantName)) {
                declarations.push({ file: hit.path, constantName: hit.constantName });
            }
        }

        // Phase 2 (cases B): the message-name string is kept in a constant that is
        // declared AND used to correlate within the SAME file (the common
        // companion-object idiom). So resolve the constant by fetching its
        // declaring file and locating the correlation usage there — NOT by a global
        // search for the constant name: message constants are routinely named
        // generically (CORRELATION_MESSAGE, MESSAGE_NAME), and a global search for
        // such a name floods the result with the correlations of OTHER messages.
        for (const { file, constantName } of declarations.slice(0, 2)) {
            let content = null;
            try {
                content = fetchFileFn ? await fetchFileFn(file) : null;
            } catch (error) {
                console.warn(`cannot fetch declaring file '${file}' for constant '${constantName}'`, error);
            }
            const line = CorrelationLocator.findConstantCorrelationLine(content, constantName);
            if (line) {
                CorrelationLocator.#route(result, {
                    path: file,
                    line,
                    category: 'correlation',
                    constantName: null,
                    isTest: CorrelationLocator.isTestPath(file),
                    score: CorrelationLocator.#scoreHit('correlation', file)
                });
            }
        }

        for (const group of Object.keys(result.groups)) {
            result.groups[group] = CorrelationLocator.rankHits(result.groups[group]);
        }
        return result;
    }

    /**
     * In a source file's content, finds the 1-based line where the given constant
     * is referenced near a correlation keyword (i.e. the constant is used to
     * correlate). Matches the constant by word boundary so a longer constant that
     * merely contains the name as a substring (CORRELATION_MESSAGE inside
     * STS_SCREEN_COMPLETED_CORRELATION_MESSAGE) is NOT mistaken for it. Returns
     * null when the file only declares the constant without correlating with it.
     * @returns {number|null}
     */
    static findConstantCorrelationLine(content, constantName) {
        if (!content || !constantName) {
            return null;
        }
        const lines = content.split('\n');
        const escaped = constantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const constRegex = new RegExp('\\b' + escaped + '\\b');
        const WINDOW = 5;
        for (let i = 0; i < lines.length; i++) {
            // Skip the declaration line itself (= "literal"); we want the usage.
            if (!constRegex.test(lines[i]) || /=\s*"/.test(lines[i])) {
                continue;
            }
            const from = Math.max(0, i - WINDOW);
            const to = Math.min(lines.length - 1, i + WINDOW);
            for (let j = from; j <= to; j++) {
                if (CorrelationLocator.hasCorrelationKeyword(lines[j])) {
                    return i + 1;
                }
            }
        }
        return null;
    }

    // Files a classified hit into the matching result group. A test hit always
    // goes to `tests` (hidden by default), regardless of its category.
    static #route(result, hit) {
        if (hit.isTest) {
            result.groups.tests.push(hit);
        } else if (hit.category === 'correlation') {
            result.groups.correlation.push(hit);
        } else if (hit.category === 'config') {
            result.groups.config.push(hit);
        } else {
            result.groups.other.push(hit);
        }
    }

    static #emptyResult(name) {
        return { name, dynamic: false, groups: { correlation: [], other: [], config: [], tests: [] } };
    }

    /**
     * Resolves the correlation sites for a message name at the given ref via the
     * GitLab blob-search API. Result (success only) is cached per ref+name; a
     * failed search returns a result flagged `error: true` and is not cached, so
     * the next click retries.
     * @returns {Promise<object>}
     */
    async resolveCorrelations(name, ref) {
        if (!name || !ref) {
            return CorrelationLocator.#emptyResult(name);
        }
        const cacheKey = `${ref}\n${name}`;
        if (this.#cache.has(cacheKey)) {
            return this.#cache.get(cacheKey);
        }
        try {
            const result = await CorrelationLocator.resolveWith(
                name,
                (term) => this.#searchBlobs(term, ref),
                (path) => this.#fetchFile(path, ref)
            );
            this.#cache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.warn(`cannot resolve correlation sites for message '${name}'`, error);
            return { ...CorrelationLocator.#emptyResult(name), error: true };
        }
    }

    /**
     * GitLab UI URL of a source file at a ref, anchored to a line.
     */
    blobFileUrl(filePath, line, ref) {
        const anchor = line ? `#L${line}` : '';
        return `${this.#projectUrl}/-/blob/${ref}/${filePath}${anchor}`;
    }

    // Fetches a source file's content at a ref (for Phase-2 same-file constant
    // resolution); 404s resolve to null rather than throwing.
    async #fetchFile(path, ref) {
        return loadFileContent(`${this.#projectUrl}/-/raw/${ref}/${path}`, false);
    }

    async #searchBlobs(term, ref) {
        // Fetch a generous page: the tokenised search (see collectHits) can rank
        // many sub-token matches above the genuine exact match, so the real
        // correlation site must not be paginated out of the default 20 results.
        const url = `${this.#projectHostUrl}/api/v4/projects/${this.#projectId}/search` +
            `?scope=blobs&ref=${encodeURIComponent(ref)}` +
            `&search=${encodeURIComponent(term)}&per_page=${CorrelationLocator.#SEARCH_PAGE_SIZE}`;
        const content = await loadFileContent(url, false);
        if (!content) {
            return [];
        }
        return JSON.parse(content);
    }

    // Derives the 1-based line of the matching occurrence from a blob-search item.
    // GitLab returns `startline` (first line of the `data` snippet); the exact line
    // is that plus the offset of the matching line within the snippet.
    static #computeMatchLine(item, term) {
        const startLine = item.startline || 1;
        if (!item.data) {
            return startLine;
        }
        const lines = item.data.split('\n');
        const offset = lines.findIndex(line => line.includes(term));
        return offset >= 0 ? startLine + offset : startLine;
    }
}
