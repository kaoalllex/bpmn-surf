// GitHub provider that reads the pull request from the page (REFAC-0004):
// no API request, so no quota, and private repositories work wherever the
// user can see them — the same model as GitLab's cookie session. Content is
// loaded same-origin by the differ (GitHubPlatformClient). When the page's
// refs cannot be read, init() fails and the chain tries GitHubApiRepoProvider.
class GitHubRepoProvider extends GitHubRepoProviderBase {
    #fetched = new Map(); // page path → Promise<refs|null>

    async resolvePull({ number }) {
        const refs = this.domScraper.pullRefs(document, number) || await this.#refetch(number);
        return refs ? { number, ...refs } : null;
    }

    // A soft navigation (Conversation → Files changed) leaves the previous
    // route's payload embedded; the same page fetched again (same origin, the
    // session cookie — not the API) carries the current one. Once per path:
    // init() runs on every click.
    #refetch(number) {
        if (!/\/pull\/\d+\/changes\/?$/.test(location.pathname)) {
            return Promise.resolve(null);
        }
        const key = location.pathname;
        if (!this.#fetched.has(key)) {
            this.#fetched.set(key, this.loadContent(location.origin + key, false)
                .then(html => html && this.domScraper.pullRefs(new DOMParser().parseFromString(html, 'text/html'), number))
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
