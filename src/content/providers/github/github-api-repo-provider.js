// Fallback GitHub provider (REFAC-0004): the anonymous REST API, public
// repositories only, 60 requests an hour per IP. Used only when the page has
// rendered its files but GitHubRepoProvider could not read the refs (GitHub
// changed its markup) — never while the page is still loading.
//
// Two requests per PR: the pull, then compare base...head, whose merge base is
// what "Files changed" diffs against and whose files carry renames. The result
// — or the failure — is kept for the page's lifetime: App re-runs init() on
// every click.
class GitHubApiRepoProvider extends GitHubRepoProviderBase {
    #pulls = new Map(); // "owner/repo#number" → Promise<pull>
    #renames = new Map();

    async resolvePull(pr) {
        if (this.domScraper.fileBlocks(document).length === 0) {
            return null;
        }
        try {
            const pull = await this.#loadPull(pr);
            this.#renames = pull.renames;
            return pull;
        } catch (error) {
            return null;
        }
    }

    getTargetFilePath(filePath) {
        return this.#renames.get(filePath) || filePath;
    }

    #loadPull({ owner, repo, number }) {
        const key = `${owner}/${repo}#${number}`;
        if (!this.#pulls.has(key)) {
            const loading = this.#fetchPull(owner, repo, number);
            loading.catch((error) => console.info(
                `bpmn-surf: no diff buttons on GitHub PR ${key}: ${GitHubApiRepoProvider.#reason(error)}`));
            this.#pulls.set(key, loading);
        }
        return this.#pulls.get(key);
    }

    async #fetchPull(owner, repo, number) {
        const pullBody = await this.loadContent(this.urlParser.pullApiUrl(owner, repo, number), false);
        if (!pullBody) {
            throw new Error('not found (404)');
        }
        const pull = JSON.parse(pullBody);
        const compare = JSON.parse(await this.loadContent(
            this.urlParser.compareApiUrl(owner, repo, pull.base.sha, pull.head.sha), true));
        return {
            number,
            title: pull.title,
            headSha: pull.head.sha,
            headRef: pull.head.ref,
            baseRef: pull.base.ref,
            mergeBaseSha: compare.merge_base_commit.sha,
            renames: new Map((compare.files || [])
                .filter(file => file.status === 'renamed' && file.previous_filename)
                .map(file => [file.filename, file.previous_filename]))
        };
    }

    // loadFileContent folds the status into its message ("unexpected status 403").
    static #reason(error) {
        const message = String((error && error.message) || error);
        if (/not found \(404\)/.test(message)) {
            return 'the page could not be read and the anonymous GitHub API cannot see this pull request';
        }
        if (/status (403|429)/.test(message)) {
            return 'the page could not be read and the GitHub API rate limit is reached (60 requests an hour without sign-in)';
        }
        return message;
    }
}
