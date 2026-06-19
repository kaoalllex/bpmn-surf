// Locates the DMN file that defines a given decision, for the Business Rule Task
// "dive in" navigation (FEAT-0005). The mirror of CallActivityLocator: a Business
// Rule Task references its decision by id (camunda:decisionRef), and the file
// defining that decision is found by a targeted GitLab blob-search for the
// `decision id="..."` declaration, so only the matching file is fetched — no
// project-wide repository walk. Resolution is cached per ref+decisionId.
//
// Unlike CallActivityLocator there is no legacy ProcessFileIndex fallback: the
// decision direction never had one (it postdates the blob-search switch).
class DecisionLocator {
    static #DMN_FILE_EXTENSION = '.dmn';

    #projectUrl;
    #projectHostUrl;
    #projectId;

    // Cache of resolveDecisionFile() results, keyed by `${ref}\n${decisionId}`.
    #cache = new Map();

    constructor(projectUrl, projectHostUrl, projectId) {
        this.#projectUrl = projectUrl;
        this.#projectHostUrl = projectHostUrl;
        this.#projectId = projectId;
    }

    /**
     * Whether the given repository path is a DMN file.
     */
    static isDmnFile(filePath) {
        return !!filePath && filePath.endsWith(DecisionLocator.#DMN_FILE_EXTENSION);
    }

    /**
     * Picks the DMN file that defines the given decision from a list of GitLab
     * blob-search items. Prefers a hit whose snippet shows the actual
     * `decision id="<decisionId>"` declaration (so a file that merely references
     * the decision via decisionRef="<decisionId>" is not chosen by mistake);
     * otherwise falls back to the first DMN hit.
     * @returns {{filePath: string, fileName: string}|null}
     */
    static selectDecisionFile(items, decisionId) {
        if (!Array.isArray(items)) {
            return null;
        }
        const dmnItems = items.filter(i => i && DecisionLocator.isDmnFile(i.path));
        if (dmnItems.length === 0) {
            return null;
        }

        const declaration = `decision id="${decisionId}"`;
        const declaring = dmnItems.find(i => i.data && i.data.includes(declaration));
        const item = declaring || dmnItems[0];

        return {
            filePath: item.path,
            fileName: getFileNameFromPath(item.path)
        };
    }

    /**
     * Resolves the DMN file defining the decision referenced by a Business Rule
     * Task via a targeted GitLab blob-search. The result (including null) is
     * cached per ref+decisionId.
     * @returns {Promise<{filePath: string, fileName: string}|null>}
     */
    async resolveDecisionFile(decisionId, ref) {
        if (!decisionId) {
            return null;
        }
        const cacheKey = `${ref}\n${decisionId}`;
        if (this.#cache.has(cacheKey)) {
            return this.#cache.get(cacheKey);
        }

        let result = null;
        try {
            result = await this.#searchDecisionFile(decisionId, ref);
        } catch (error) {
            console.warn(`cannot blob-search the decision file for '${decisionId}'`, error);
        }

        this.#cache.set(cacheKey, result);
        return result;
    }

    /**
     * Blob-search GitLab URL for the decision id within the project at a ref.
     * Exposed so the UI can offer a "search in GitLab" fallback when resolution
     * fails (e.g. blob search disabled on the instance, or a decisionRef
     * expression `${…}` that is not blob-searchable).
     */
    blobSearchPageUrl(decisionId, ref) {
        return `${this.#projectUrl}/-/search?search=${encodeURIComponent(decisionId)}` +
            `&scope=blobs&ref=${encodeURIComponent(ref)}`;
    }

    async #searchDecisionFile(decisionId, ref) {
        if (!ref) {
            return null;
        }
        const term = `decision id="${decisionId}"`;
        const items = await this.#searchBlobs(term, ref);
        return DecisionLocator.selectDecisionFile(items, decisionId);
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
