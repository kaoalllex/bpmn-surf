// GitLab implementation of PlatformClient (REFAC-0004). Holds verbatim the
// GitLab URL / search / changes construction that used to live inline in
// DifferParams and the navigation locators, so GitLab behaviour is unchanged.
//
// Constructed from the platform descriptor's { projectUrl, hostUrl, projectId }
// (today's locator constructor args). Fetching still goes through the global
// loadFileContent (ambient cookie session); promoting that to an auth-aware
// loadFile is deferred to the GitHub work (REFAC-0004 subtask 3).
class GitLabPlatformClient extends PlatformClient {
    static #SEARCH_PAGE_SIZE = 100; // GitLab's maximum per_page

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

    // GitLab's project-scoped search lives at <host>/search with a project_id,
    // NOT at <project>/-/search — that path 404s for a signed-in user, which
    // made every "search in the repository" fallback a dead end (BUG-0038). The
    // ref parameter is called repository_ref there.
    searchPageUrl(term, ref) {
        const params = new URLSearchParams({
            search: term,
            project_id: String(this.#projectId),
            scope: 'blobs'
        });
        if (ref) {
            params.set('repository_ref', ref);
        }
        return `${this.#projectHostUrl}/search?${params}`;
    }

    // GitLab Advanced Search (blobs) at a ref. The response items
    // ({ path, startline, data }) are normalised to { path, line, snippet } so
    // the locators never see GitLab's field names.
    //
    // One page only, GitLab's maximum by default: the search is tokenised, so
    // unrelated files can fill the default page of 20 and push the exact match
    // the locators filter for onto a page that is never read.
    async searchCode(ref, term, options = {}) {
        const url = `${this.#projectHostUrl}/api/v4/projects/${this.#projectId}/search` +
            `?scope=blobs&ref=${encodeURIComponent(ref)}&search=${encodeURIComponent(term)}` +
            `&per_page=${options.perPage || GitLabPlatformClient.#SEARCH_PAGE_SIZE}`;
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

    /**
     * Repository-UI URL of the MR diffs tab anchored to a given file, so a
     * handler changed in this MR opens showing exactly what changed (as if the
     * file was clicked in the changes list). Built the way GitLab's own file tree
     * links are: `?file_path=` picks the file in "one file at a time" mode, which
     * ignores a bare anchor (BUG-0048), and the anchor — the SHA-1 of the path,
     * GitLab's diff-file element id — scrolls to it when all files are shown.
     * @returns {Promise<string>}
     */
    async prFileDiffUrl(changeId, filePath) {
        const base = `${this.#projectUrl}/-/merge_requests/${changeId}/diffs?file_path=${encodeURIComponent(filePath)}`;
        const anchor = await GitLabPlatformClient.#sha1Hex(filePath);
        return anchor ? `${base}#${anchor}` : base;
    }

    static async #sha1Hex(text) {
        try {
            const bytes = new TextEncoder().encode(text);
            const digest = await crypto.subtle.digest('SHA-1', bytes);
            return Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        } catch (error) {
            console.warn('cannot compute sha1 for MR diff anchor', error);
            return null;
        }
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
