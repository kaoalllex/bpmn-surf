/**
 * GitLab provider that resolves the merge request parameters through the GitLab
 * MR API (GET /api/v4/projects/{id}/merge_requests/{iid}) instead of parsing
 * HTML and applying DOM heuristics.
 *
 * One request to that endpoint yields, identically for opened and merged MRs:
 *   - diff_refs.head_sha  -> source commit (the exact ref GitLab diffs from);
 *   - diff_refs.base_sha  -> target commit (merge-base, the ref GitLab diffs
 *                            against on the "Changes" tab);
 *   - source_branch / target_branch;
 *   - title / iid / state.
 * Using diff_refs reproduces precisely what GitLab shows in the MR, so the
 * merged-vs-opened branching and the commit-resolution heuristics of the
 * DOM-based provider are not needed here (REFAC-0001).
 *
 * It extends GitLabRepoProviderBase to reuse the genuinely DOM/URL-bound parts
 * that have no API equivalent (project-id resolution, MR-page/branch-view
 * detection, selected-file lookup, branch-file URL parsing) and implements only
 * the MR parameter resolution using the API.
 *
 * Fallback is coarse and lives in the provider chain (FallbackRepoProvider):
 * on an MR page init() probes the API and returns false if it is unavailable or
 * lacks diff_refs, so the chain falls back to the DOM-based GitLabRepoProvider.
 * There is no per-method fallback: once the API answers on init() the cached
 * response feeds every getter.
 */
class GitLabApiRepoProvider extends GitLabRepoProviderBase {
    #mr = null;
    #mrCacheKey = null;

    /**
     * @param {function} loadContent loader for file/URL content (DI for tests)
     */
    constructor(loadContent = loadFileContent) {
        super(loadContent);
    }

    async init() {
        // Reuse the DOM/URL based project-id and url resolution.
        if (!(await super.init())) {
            return false;
        }

        // The MR API is only relevant on the MR diffs page. On other pages
        // (branch file view) we behave exactly like the DOM provider via the
        // inherited methods, so initializing successfully is correct.
        if (!this.urlParser.isMrDiffPage(window.location.href)) {
            return true;
        }

        // Probe the MR API: own this page only if it answers with usable
        // diff_refs; otherwise let the chain fall back to the DOM provider.
        try {
            const mr = await this.#loadMr();
            const valid = !!(mr && mr.diff_refs && mr.diff_refs.head_sha && mr.diff_refs.base_sha);
            if (!valid) {
                console.warn('MR API response has no usable diff_refs; falling back to DOM provider');
            }
            return valid;
        } catch (error) {
            console.warn('MR API probe failed; falling back to DOM provider', error);
            return false;
        }
    }

    async initChangeInfo() {
        console.debug('initializing merge request info (api)...');
        const mr = await this.#loadMr();
        this.mergeRequestInfo.iid = this.urlParser.extractMrIid(window.location.href);
        this.mergeRequestInfo.title = mr ? mr.title : null;
        console.debug('mr title (api): ' + this.mergeRequestInfo.title);
    }

    // getChangeInfo() is inherited: it returns this.mergeRequestInfo populated above.

    getChangeBranchNames() {
        if (!this.#mr) {
            console.warn('MR API info is not loaded yet; cannot get branch names');
            return null;
        }
        return new MergeRequestBranchNames(this.#mr.source_branch, this.#mr.target_branch);
    }

    async getSourceCommitId() {
        const mr = await this.#loadMr();
        return mr?.diff_refs?.head_sha ?? null;
    }

    async getTargetCommitId(/* sourceCommitId, changeTitle, targetBranchName */) {
        const mr = await this.#loadMr();
        return mr?.diff_refs?.base_sha ?? null;
    }

    // ==== Private fields and methods ====

    async #loadMr() {
        const projectInfo = this.getProjectInfo();
        const iid = this.urlParser.extractMrIid(window.location.href);
        if (!projectInfo?.id || !iid) {
            return null;
        }

        const url = `${projectInfo.hostUrl}/api/v4/projects/${projectInfo.id}/merge_requests/${iid}`;
        if (this.#mr && this.#mrCacheKey === url) {
            return this.#mr;
        }

        const content = await this.loadContent(url, true);
        const mr = JSON.parse(content);
        this.#mr = mr;
        this.#mrCacheKey = url;
        return mr;
    }
}
