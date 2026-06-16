// Locates the BPMN file that defines a given process, for the Call Activity
// "dive in" navigation.
//
// A Call Activity references its called process by id (calledElement). The file
// defining that process is found by a targeted GitLab blob-search for the
// `<bpmn:process id="...">` declaration, so only the matching file is fetched —
// no project-wide repository walk. Resolution is cached per ref+processId.
//
// If blob-search is unavailable or finds nothing, resolution falls back to the
// legacy ProcessFileIndex (full repository tree listing + filename heuristics +
// deep content parsing). The fallback is intentionally kept behind this locator
// so it can be removed in one place once blob-search proves reliable (see the
// "remove the old mechanism" task).
class CallActivityLocator {
    static #BPMN_FILE_EXTENSION = '.bpmn';

    #projectUrl;
    #projectHostUrl;
    #projectId;
    #fallbackIndex;

    // Cache of resolveProcessFile() results, keyed by `${ref}\n${processId}`.
    #cache = new Map();

    constructor(projectUrl, projectHostUrl, projectId, fallbackIndex) {
        this.#projectUrl = projectUrl;
        this.#projectHostUrl = projectHostUrl;
        this.#projectId = projectId;
        this.#fallbackIndex = fallbackIndex;
    }

    /**
     * Whether the given repository path is a BPMN file.
     */
    static isBpmnFile(filePath) {
        return !!filePath && filePath.endsWith(CallActivityLocator.#BPMN_FILE_EXTENSION);
    }

    /**
     * Picks the BPMN file that defines the given process from a list of GitLab
     * blob-search items. Prefers a hit whose snippet shows the actual
     * `process id="<processId>"` declaration (so a file that merely references
     * the process via calledElement="<processId>" is not chosen by mistake);
     * otherwise falls back to the first BPMN hit.
     * @returns {{filePath: string, fileName: string}|null}
     */
    static selectProcessFile(items, processId) {
        if (!Array.isArray(items)) {
            return null;
        }
        const bpmnItems = items.filter(i => i && CallActivityLocator.isBpmnFile(i.path));
        if (bpmnItems.length === 0) {
            return null;
        }

        const declaration = `process id="${processId}"`;
        const declaring = bpmnItems.find(i => i.data && i.data.includes(declaration));
        const item = declaring || bpmnItems[0];

        return {
            filePath: item.path,
            fileName: getFileNameFromPath(item.path)
        };
    }

    /**
     * Resolves the BPMN file defining the process referenced by a Call Activity.
     * Primary path: GitLab blob-search; fallback: the legacy ProcessFileIndex.
     * The result (including null) is cached per ref+processId.
     * @returns {Promise<{filePath: string, fileName: string}|null>}
     */
    async resolveProcessFile(processId, ref) {
        if (!processId) {
            return null;
        }
        const cacheKey = `${ref}\n${processId}`;
        if (this.#cache.has(cacheKey)) {
            return this.#cache.get(cacheKey);
        }

        let result = null;
        try {
            result = await this.#searchProcessFile(processId, ref);
        } catch (error) {
            console.warn(`cannot blob-search the process file for '${processId}'`, error);
        }

        if (!result && this.#fallbackIndex) {
            console.debug(`blob-search missed process '${processId}', falling back to the project index`);
            try {
                result = await this.#fallbackIndex.findProcessFileParams(processId, ref);
            } catch (error) {
                console.warn(`fallback process index failed for '${processId}'`, error);
            }
        }

        this.#cache.set(cacheKey, result);
        return result;
    }

    /**
     * Blob-search GitLab URL for the process id within the project at a ref.
     * Exposed so the UI can offer a "search in GitLab" fallback when resolution
     * fails (e.g. blob search disabled on the instance).
     */
    blobSearchPageUrl(processId, ref) {
        return `${this.#projectUrl}/-/search?search=${encodeURIComponent(processId)}` +
            `&scope=blobs&ref=${encodeURIComponent(ref)}`;
    }

    async #searchProcessFile(processId, ref) {
        if (!ref) {
            return null;
        }
        const term = `process id="${processId}"`;
        const items = await this.#searchBlobs(term, ref);
        return CallActivityLocator.selectProcessFile(items, processId);
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
