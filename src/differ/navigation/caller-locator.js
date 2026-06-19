// Locates the BPMN files that CALL a given process — the reverse of
// CallActivityLocator (which resolves a called process id to its defining file,
// for "diving in"). Here we go the other way: given the process(es) defined by
// the diagram currently shown, find every BPMN file that references one of them
// via a Call Activity (`calledElement="<processId>"`). These are the diagrams
// from which the user could have arrived here, offered by the "back" navigation
// (FEAT-0023) so they can step out to a caller — even one not opened yet.
//
// Resolution is a targeted GitLab blob-search per process id (only matching
// files are touched), unioned and cached per ref+ids. Unlike CallActivityLocator
// there is no legacy fallback index: the reverse direction never had one.
//
// resolveCallers throws on a search/transport error so the UI can tell
// "no callers" (an empty array — a root diagram) from "could not check"
// (a thrown error — search disabled/unreachable), which read very differently.
class CallerLocator {
    #projectUrl;
    #projectHostUrl;
    #projectId;

    // Cache of resolveCallers() results, keyed by `${ref}\n${sorted ids}`.
    #cache = new Map();

    constructor(projectUrl, projectHostUrl, projectId) {
        this.#projectUrl = projectUrl;
        this.#projectHostUrl = projectHostUrl;
        this.#projectId = projectId;
    }

    /**
     * Picks the calling BPMN files from a list of GitLab blob-search items:
     * keeps BPMN files, drops the current file itself (a diagram may both
     * define and reference a process), and de-duplicates by path.
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
     * Resolves the BPMN files that call any of the given process ids at a ref.
     * The result (the deduplicated union across ids) is cached per ref+ids.
     * Returns [] when nothing references the process (a root diagram);
     * THROWS when the search itself fails, so the two cases stay distinguishable.
     * @returns {Promise<{filePath: string, fileName: string}[]>}
     */
    async resolveCallers(processIds, ref, selfFilePath) {
        const ids = (processIds || []).filter(Boolean);
        if (ids.length === 0 || !ref) {
            return [];
        }
        const cacheKey = `${ref}\n${[...ids].sort().join(',')}`;
        if (this.#cache.has(cacheKey)) {
            return this.#cache.get(cacheKey);
        }

        const byPath = new Map();
        for (const id of ids) {
            const items = await this.#searchBlobs(`calledElement="${id}"`, ref);
            for (const caller of CallerLocator.selectCallers(items, selfFilePath)) {
                byPath.set(caller.filePath, caller);
            }
        }
        const callers = [...byPath.values()];
        this.#cache.set(cacheKey, callers);
        return callers;
    }

    /**
     * Blob-search GitLab URL for the callers of a process id within the project
     * at a ref. Exposed so the UI can offer a "search in GitLab" link when the
     * lookup fails (e.g. blob search disabled on the instance).
     */
    blobSearchPageUrl(processId, ref) {
        const term = `calledElement="${processId}"`;
        return `${this.#projectUrl}/-/search?search=${encodeURIComponent(term)}` +
            `&scope=blobs&ref=${encodeURIComponent(ref)}`;
    }

    async #searchBlobs(term, ref) {
        const url = `${this.#projectHostUrl}/api/v4/projects/${this.#projectId}/search` +
            `?scope=blobs&ref=${encodeURIComponent(ref)}&search=${encodeURIComponent(term)}`;
        const content = await loadFileContent(url, false);
        if (!content) {
            return [];
        }
        return JSON.parse(content);
    }
}
