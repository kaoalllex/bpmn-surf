// GitLab implementation of PlatformClient (REFAC-0004). Holds verbatim the
// GitLab URL / search / changes construction that used to live inline in
// DifferParams and the navigation locators, so GitLab behaviour is unchanged.
//
// Constructed from the platform descriptor's { projectUrl, hostUrl, projectId }
// (today's locator constructor args). Fetching still goes through the global
// loadFileContent (ambient cookie session); promoting that to an auth-aware
// loadFile is deferred to the GitHub work (REFAC-0004 subtask 3).
class GitLabPlatformClient extends PlatformClient {
    #projectUrl;
    #projectHostUrl;
    #projectId;
    #load;

    // `loadFn` (the content loader) is injectable for tests; production uses the
    // global cookie-session loadFileContent (mirrors GitLabApiRepoProvider's DI).
    constructor({ projectUrl, hostUrl, projectId }, loadFn = loadFileContent) {
        super();
        this.#projectUrl = projectUrl;
        this.#projectHostUrl = hostUrl;
        this.#projectId = projectId;
        this.#load = loadFn;
    }

    rawFileUrl(ref, filePath) {
        return `${this.#projectUrl}/-/raw/${ref}/${filePath}`;
    }

    // Built from the ref (sha), so it shows the file exactly as in the MR head /
    // selected commit / branch — one universal construction correct in all modes.
    blobFileUrl(ref, filePath, line) {
        const anchor = line ? `#L${line}` : '';
        return `${this.#projectUrl}/-/blob/${ref}/${filePath}${anchor}`;
    }

    searchPageUrl(term, ref) {
        return `${this.#projectUrl}/-/search?search=${encodeURIComponent(term)}` +
            `&scope=blobs&ref=${encodeURIComponent(ref)}`;
    }

    // GitLab Advanced Search (blobs) at a ref. The response items
    // ({ path, startline, data }) are normalised to { path, line, snippet } so
    // the locators never see GitLab's field names.
    async searchCode(ref, term, options = {}) {
        let url = `${this.#projectHostUrl}/api/v4/projects/${this.#projectId}/search` +
            `?scope=blobs&ref=${encodeURIComponent(ref)}&search=${encodeURIComponent(term)}`;
        if (options.perPage) {
            url += `&per_page=${options.perPage}`;
        }
        const content = await this.#load(url, false);
        if (!content) {
            console.debug(`blob search for '${term}' at ref '${ref}': no response`);
            return [];
        }
        const items = JSON.parse(content).map(item => ({
            path: item.path,
            line: item.startline,
            snippet: item.data
        }));
        // The count and the ref together separate "nothing matches" from "the ref
        // is wrong" — an empty result otherwise looks the same either way, and
        // every locator above reports only that it found nothing.
        console.debug(`blob search for '${term}' at ref '${ref}': ${items.length} hit(s)`);
        return items;
    }

    prDiffsUrl(changeId) {
        return `${this.#projectUrl}/-/merge_requests/${changeId}/diffs`;
    }

    // GitLab MR `changes` API, normalised. For added/modified files the path is
    // in new_path; for deleted files it lives in old_path; renames are treated as
    // changes (new_path holds the current path, old_path the previous one).
    async prChangedFiles(changeId) {
        const url = `${this.#projectHostUrl}/api/v4/projects/${this.#projectId}/merge_requests/${changeId}/changes`;
        const content = await this.#load(url, false);
        if (!content) {
            console.warn('cannot load MR changes: ' + url);
            return [];
        }
        const response = JSON.parse(content);
        const changes = (response && response.changes) || [];
        return changes.map(change => {
            if (change.new_file) {
                return { path: change.new_path, oldPath: change.old_path, status: 'added' };
            }
            if (change.deleted_file) {
                return { path: change.old_path, oldPath: change.old_path, status: 'removed' };
            }
            return { path: change.new_path || change.old_path, oldPath: change.old_path, status: 'changed' };
        });
    }
}
