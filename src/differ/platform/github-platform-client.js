// GitHub implementation of PlatformClient (REFAC-0004). Content is fetched
// same-origin from github.com/{o}/{r}/raw/…: the differ tab runs on the
// github.com origin, so the session cookie authorises private repositories
// exactly as it does on the page, and GitHub redirects to its raw host
// (allowed by the CSP the tab inherits). Code search goes through GitHub's
// own search page, which answers JSON to a same-origin request and sees what
// the session sees; it indexes the default branch only, so inside a PR the
// files the PR changes are also read at its head. The PR file list comes from the PR page's embedded
// payload (signed in, private repositories included); the anonymous REST API
// only serves a signed-out user, who gets the classic page without it.
class GitHubPlatformClient extends PlatformClient {
    // 100 files a page; three pages keep a huge PR from eating the 60/h quota.
    static #MAX_FILE_PAGES = 3;
    // ponytail: a PR changing more files than this is searched on the default
    // branch only; raise it if large PRs miss their own handlers in practice.
    static #MAX_SCANNED_FILES = 100;
    static #BINARY = /\.(png|jpe?g|gif|ico|webp|bmp|pdf|zip|gz|jar|war|class|woff2?|ttf|otf|eot|exe|dll|so|bin)$/i;

    #projectUrl;
    #repoSlug;
    #hostUrl;
    #load;
    #fetch;
    #change;
    #prFiles = null; // Promise<{changedPaths: Set<string>, files: Array<{path, text}>}|null>

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

    // The default-branch index cannot know what the PR itself adds or edits, so
    // the files the PR changes are read at the PR head and searched here; web
    // hits on those paths are stale and dropped.
    async searchCode(ref, term) {
        const [web, pr] = await Promise.all([this.#webSearch(term), this.#prSide(ref)]);
        if (!pr) {
            return web;
        }
        const own = pr.files.flatMap(({ path, text }) => GitHubPlatformClient.#grep(path, text, term));
        return [...own, ...web.filter(hit => !pr.changedPaths.has(hit.path))];
    }

    #prSide(ref) {
        const { changeId, headRef } = this.#change;
        if (!changeId || !headRef || ref !== headRef) {
            return Promise.resolve(null);
        }
        if (!this.#prFiles) {
            this.#prFiles = this.#loadPrFiles(changeId, headRef).catch(error => {
                console.debug(`bpmn-surf: cannot read PR #${changeId}'s files for search`, error);
                return null;
            });
        }
        return this.#prFiles;
    }

    async #loadPrFiles(changeId, headRef) {
        const changed = await this.prChangedFiles(changeId);
        const changedPaths = new Set(changed.flatMap(file => [file.path, file.oldPath].filter(Boolean)));
        const present = changed.filter(file => file.status !== 'removed' && !GitHubPlatformClient.#BINARY.test(file.path));
        if (present.length > GitHubPlatformClient.#MAX_SCANNED_FILES) {
            console.info(`bpmn-surf: PR #${changeId} changes ${present.length} files — searching GitHub's default branch only`);
            return null;
        }
        const texts = await Promise.all(present.map(file =>
            this.#load(this.rawFileUrl(headRef, file.path), false).catch(() => null)));
        return { changedPaths, files: present.map((file, i) => ({ path: file.path, text: texts[i] })).filter(file => file.text) };
    }

    // One hit per matching line, two lines of context either side — the shape a
    // GitLab blob-search chunk has, so the locators' line arithmetic holds.
    static #grep(path, text, term) {
        const lines = text.split('\n');
        const hits = [];
        lines.forEach((line, i) => {
            if (line.includes(term)) {
                const start = Math.max(0, i - 2);
                hits.push({ path, line: start + 1, snippet: lines.slice(start, i + 3).join('\n') });
            }
        });
        return hits;
    }

    // GitHub's code search page answers JSON to a same-origin request that asks
    // for it: no token, the session cookie decides what is visible. Signed out it
    // finds nothing; it indexes the default branch only, so the ref is not sent.
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
