// Locates the BPMN files that CALL a given decision — the reverse of
// DecisionLocator (which resolves a called decision id to its defining DMN file,
// for "diving in"). Here we go the other way: given the decision(s) defined by
// the DMN currently shown, find every BPMN file that references one of them via a
// Business Rule Task (`decisionRef="<decisionId>"`). These are the diagrams from
// which the user could have arrived here, offered by the "back" navigation
// (FEAT-0005, the DMN direction of FEAT-0023) so they can step out to a caller —
// even one not opened yet.
//
// The DMN mirror of CallerLocator: a targeted GitLab blob-search per decision id
// (only matching files are touched), unioned and cached per ref+ids. Like
// CallerLocator it has no legacy fallback index.
//
// resolveCallers throws on a search/transport error so the UI can tell
// "no callers" (an empty array — a top-level decision) from "could not check"
// (a thrown error — search disabled/unreachable), which read very differently.
class DecisionCallerLocator {
    #client;

    // Cache of resolveCallers() results, keyed by `${ref}\n${sorted ids}`.
    #cache = new Map();

    constructor(client) {
        this.#client = client;
    }

    /**
     * Picks the calling BPMN files from a list of normalised search hits:
     * keeps BPMN files, drops the current file itself, and de-duplicates by path.
     * @returns {{filePath: string, fileName: string}[]}
     */
    static selectCallers(items, selfFilePath) {
        if (!Array.isArray(items)) {
            return [];
        }
        const seen = new Set();
        const callers = [];
        for (const item of items) {
            if (!item || !CallActivityLocator.isBpmnFile(item.path)) {
                continue;
            }
            if (item.path === selfFilePath || seen.has(item.path)) {
                continue;
            }
            seen.add(item.path);
            callers.push({ filePath: item.path, fileName: getFileNameFromPath(item.path) });
        }
        return callers;
    }

    /**
     * Resolves the BPMN files that call any of the given decision ids at a ref.
     * The result (the deduplicated union across ids) is cached per ref+ids.
     * Returns [] when nothing references the decision (a top-level decision);
     * THROWS when the search itself fails, so the two cases stay distinguishable.
     * @returns {Promise<{filePath: string, fileName: string}[]>}
     */
    async resolveCallers(decisionIds, ref, selfFilePath) {
        const ids = (decisionIds || []).filter(Boolean);
        if (ids.length === 0 || !ref) {
            return [];
        }
        const cacheKey = `${ref}\n${[...ids].sort().join(',')}`;
        if (this.#cache.has(cacheKey)) {
            return this.#cache.get(cacheKey);
        }

        const byPath = new Map();
        for (const id of ids) {
            const items = await this.#client.searchCode(ref, `decisionRef="${id}"`);
            for (const caller of DecisionCallerLocator.selectCallers(items, selfFilePath)) {
                byPath.set(caller.filePath, caller);
            }
        }
        const callers = [...byPath.values()];
        this.#cache.set(cacheKey, callers);
        return callers;
    }

    /**
     * Human-facing code-search page URL for the callers of a decision id within
     * the project at a ref. Exposed so the UI can offer a "search in the repo"
     * link when the lookup fails (e.g. search disabled on the instance).
     */
    blobSearchPageUrl(decisionId, ref) {
        return this.#client.searchPageUrl(`decisionRef="${decisionId}"`, ref);
    }
}
