// GitHub provider that reads the pull request from the page (REFAC-0004):
// no API request, so no quota, and private repositories work wherever the
// user can see them — the same model as GitLab's cookie session. Content is
// loaded same-origin by the differ (GitHubPlatformClient). When the page's
// refs cannot be read, init() fails and the chain tries GitHubApiRepoProvider.
class GitHubRepoProvider extends GitHubRepoProviderBase {
    #fetched = new Map(); // page path → Promise<refs|null>
    #diffEntries = new Map(); // page data URL → Promise<entries|null>
    #fetch;

    constructor(loadContent, domScraper, fetchFn = (...args) => fetch(...args)) {
        super(loadContent, domScraper);
        this.#fetch = fetchFn;
    }

    async resolvePull(pr) {
        const refs = await this.#refsOf(document, pr) || await this.#refetch(pr);
        return refs ? { number: pr.number, ...refs } : null;
    }

    async #refsOf(doc, { owner, repo, number, range }) {
        const refs = this.domScraper.pullRefs(doc, number, null, range);
        const lazy = !refs && this.domScraper.lazyDiffEntry(doc, number, range);
        const entries = lazy && await this.#loadDiffEntries(`${this.projectInfo.url}/pull/${number}`, lazy);
        return refs || (entries ? this.domScraper.pullRefs(doc, number, entries, range) : null);
    }

    // GitHub's own page data for one file of a large PR: same origin and the
    // session cookie, so private repositories work and no API quota is spent.
    // The endpoint answers 406 without the headers GitHub's frontend sends.
    #loadDiffEntries(pullUrl, { path, range }) {
        const url = `${pullUrl}/page_data/diff_entries?paths=${encodeURIComponent(encodeURIComponent(path))}&range=${range}`;
        if (!this.#diffEntries.has(url)) {
            const headers = { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest', 'github-verified-fetch': 'true' };
            this.#diffEntries.set(url, this.#fetch(url, { headers })
                .then(response => {
                    if (!response.ok) {
                        console.debug(`bpmn-surf: GitHub page data answered ${response.status} for ${url}`);
                        return null;
                    }
                    return response.json();
                })
                .catch(() => null));
        }
        return this.#diffEntries.get(url);
    }

    // A soft navigation (Conversation → Files changed) leaves the previous
    // route's payload embedded; the same page fetched again (same origin, the
    // session cookie — not the API) carries the current one. Once per path:
    // init() runs on every click.
    #refetch(pr) {
        if (!/\/pull\/\d+\/changes(?:\/[^/]+)?\/?$/.test(location.pathname)) {
            return Promise.resolve(null);
        }
        const key = location.pathname;
        if (!this.#fetched.has(key)) {
            this.#fetched.set(key, this.loadContent(location.origin + key, false)
                .then(html => html && this.#refsOf(new DOMParser().parseFromString(html, 'text/html'), pr))
                .catch(() => null));
        }
        return this.#fetched.get(key);
    }

    // Read at click time: GitHub renders file blocks progressively.
    getTargetFilePath(filePath) {
        const block = this.domScraper.fileBlocks(document).find(b => b.path === filePath);
        return (block && block.oldPath) || filePath;
    }
}
