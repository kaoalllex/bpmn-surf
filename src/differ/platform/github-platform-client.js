// GitHub implementation of PlatformClient (REFAC-0004). Content is fetched
// same-origin from github.com/{o}/{r}/raw/…: the differ tab runs on the
// github.com origin, so the session cookie authorises private repositories
// exactly as it does on the page, and GitHub redirects to its raw host
// (allowed by the CSP the tab inherits). Code search needs a token
// (subtask 3) — it rejects, and every navigator falls back to its "search
// in repository" link. The PR file list comes from the PR page's embedded
// payload (signed in, private repositories included); the anonymous REST API
// only serves a signed-out user, who gets the classic page without it.
class GitHubPlatformClient extends PlatformClient {
    static NOT_SUPPORTED = 'not supported on GitHub yet';
    // 100 files a page; three pages keep a huge PR from eating the 60/h quota.
    static #MAX_FILE_PAGES = 3;

    #projectUrl;
    #repoSlug;
    #load;

    constructor({ projectUrl }, loadFn = loadFileContent) {
        super();
        this.#projectUrl = projectUrl;
        this.#repoSlug = new URL(projectUrl).pathname.replace(/^\/|\/$/g, '');
        this.#load = loadFn;
    }

    rawFileUrl(ref, filePath) {
        return `${this.#projectUrl}/raw/${GitHubPlatformClient.#encodePath(ref)}/${GitHubPlatformClient.#encodePath(filePath)}`;
    }

    blobFileUrl(ref, filePath, line) {
        const anchor = line ? `#L${line}` : '';
        return `${this.#projectUrl}/blob/${GitHubPlatformClient.#encodePath(ref)}/` +
            `${GitHubPlatformClient.#encodePath(filePath)}${anchor}`;
    }

    // The ref is ignored: GitHub's code search indexes the default branch only.
    searchPageUrl(term /* , ref */) {
        const params = new URLSearchParams({ q: `repo:${this.#repoSlug} ${term}`, type: 'code' });
        return `https://github.com/search?${params}`;
    }

    async searchCode(/* ref, term, options */) {
        throw new Error(`code search is ${GitHubPlatformClient.NOT_SUPPORTED}`);
    }

    async prChangedFiles(changeId) {
        const html = await this.#load(`${this.#projectUrl}/pull/${changeId}/changes`, false);
        const page = html && GitHubChangesPayload.read(new DOMParser().parseFromString(html, 'text/html'), changeId);
        if (page) {
            const oldPaths = new Map((page.changes.diffContents || [])
                .filter(c => c.oldTreeEntry && c.newTreeEntry && c.oldTreeEntry.path !== c.newTreeEntry.path)
                .map(c => [c.newTreeEntry.path, c.oldTreeEntry.path]));
            return (page.changes.diffSummaries || []).map(file => ({
                path: file.path,
                oldPath: oldPaths.get(file.path) || null,
                status: file.changeType === 'ADDED' ? 'added'
                    : file.changeType === 'DELETED' || file.changeType === 'REMOVED' ? 'removed' : 'changed'
            }));
        }
        return this.#prChangedFilesFromApi(changeId);
    }

    async #prChangedFilesFromApi(changeId) {
        const files = [];
        for (let page = 1; page <= GitHubPlatformClient.#MAX_FILE_PAGES; page++) {
            const body = await this.#load(
                `https://api.github.com/repos/${this.#repoSlug}/pulls/${changeId}/files?per_page=100&page=${page}`, false);
            if (body === null) {
                throw new Error(`PR #${changeId}: no page payload and not visible to the anonymous GitHub API`);
            }
            const batch = JSON.parse(body);
            files.push(...batch);
            if (batch.length < 100) {
                break;
            }
        }
        return files.map(file => ({
            path: file.filename,
            oldPath: file.previous_filename || null,
            status: file.status === 'added' ? 'added' : file.status === 'removed' ? 'removed' : 'changed'
        }));
    }

    // Signed-in users are redirected from /files to /changes; the hash survives.
    async prFileDiffUrl(changeId, filePath) {
        return `${this.#projectUrl}/pull/${changeId}/files#diff-${await GitHubPlatformClient.#sha256Hex(filePath)}`;
    }

    static async #sha256Hex(text) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static #encodePath(path) {
        return String(path).split('/').map(encodeURIComponent).join('/');
    }
}
