// GitHub implementation of PlatformClient (REFAC-0004). Content is fetched
// same-origin from github.com/{o}/{r}/raw/…: the differ tab runs on the
// github.com origin, so the session cookie authorises private repositories
// exactly as it does on the page, and GitHub redirects to its raw host
// (allowed by the CSP the tab inherits). Code search goes through GitHub's
// own search page, which answers JSON to a same-origin request and sees what
// the session sees; it indexes the default branch only. The PR file list comes from the PR page's embedded
// payload (signed in, private repositories included); the anonymous REST API
// only serves a signed-out user, who gets the classic page without it.
class GitHubPlatformClient extends PlatformClient {
    // 100 files a page; three pages keep a huge PR from eating the 60/h quota.
    static #MAX_FILE_PAGES = 3;

    #projectUrl;
    #repoSlug;
    #hostUrl;
    #load;
    #fetch;
    #change;

    constructor({ projectUrl, hostUrl }, loadFn = loadFileContent, { fetchFn = (...args) => fetch(...args), changeId = null, headRef = null } = {}) {
        super();
        this.#projectUrl = projectUrl;
        this.#hostUrl = hostUrl || new URL(projectUrl).origin;
        this.#repoSlug = new URL(projectUrl).pathname.replace(/^\/|\/$/g, '');
        this.#load = loadFn;
        this.#fetch = fetchFn;
        this.#change = { changeId, headRef };
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
        return `${this.#hostUrl}/search?${params}`;
    }

    // GitHub's code search page answers JSON to a same-origin request that asks
    // for it: no token, the session cookie decides what is visible. Signed out it
    // finds nothing; it indexes the default branch only, so the ref is not sent.
    async searchCode(ref, term) {
        return this.#webSearch(term);
    }

    async #webSearch(term) {
        const params = new URLSearchParams({ q: `repo:${this.#repoSlug} ${GitHubPlatformClient.#exact(term)}`, type: 'code' });
        let route = null;
        try {
            const response = await this.#fetch(`${this.#hostUrl}/search?${params}`, { headers: { accept: 'application/json' } });
            route = response.ok ? ((await response.json()).payload || {}).blackbirdSearchRoute : null;
        } catch (error) {
            route = null;
        }
        if (!route || !route.logged_in || (route.errors || []).length) {
            console.debug(`blob search for '${term}' on GitHub: no answer (signed out, rate limited or not indexed)`);
            return [];
        }
        const hits = (route.results || []).flatMap(result => (result.snippets || []).map(snippet => ({
            path: result.path,
            line: snippet.starting_line_number,
            snippet: (snippet.lines || []).map(GitHubPlatformClient.#plainText).join('\n')
        })));
        console.debug(`blob search for '${term}' on GitHub's default branch: ${hits.length} hit(s)`);
        return hits;
    }

    // Snippet lines are highlighted HTML with entities; the locators gate on plain text. <pre> keeps the leading indentation the body would drop.
    static #plainText(html) {
        return new DOMParser().parseFromString(`<pre>${html}</pre>`, 'text/html').body.textContent;
    }

    static #exact(term) {
        return `"${String(term).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }

    // github.com's REST API lives on its own host; GitHub Enterprise Server serves it under /api/v3.
    #apiBase() {
        return this.#hostUrl === 'https://github.com' ? 'https://api.github.com' : `${this.#hostUrl}/api/v3`;
    }

    async prChangedFiles(changeId) {
        const html = await this.#load(`${this.#projectUrl}/pull/${changeId}/changes`, false);
        const page = html && GitHubChangesPayload.read(new DOMParser().parseFromString(`<pre>${html}</pre>`, 'text/html'), changeId);
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
        console.debug('bpmn-surf: no changes payload on the PR page — listing changed files via the GitHub API');
        return this.#prChangedFilesFromApi(changeId);
    }

    async #prChangedFilesFromApi(changeId) {
        const files = [];
        for (let page = 1; page <= GitHubPlatformClient.#MAX_FILE_PAGES; page++) {
            const body = await this.#load(
                `${this.#apiBase()}/repos/${this.#repoSlug}/pulls/${changeId}/files?per_page=100&page=${page}`, false);
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
