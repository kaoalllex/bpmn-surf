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
 * When a single commit is selected in the MR (?commit_id=<sha>), the source is
 * that commit and the target is its first parent — reproducing GitLab's
 * single-commit diff (FEAT-0001). The first MR commit's parent is the branch
 * point on the target branch, so "no upstream commit -> target branch" needs no
 * special case.
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
        // When a single commit is selected in the MR (?commit_id=<sha>), diff
        // that exact commit (FEAT-0001); otherwise the whole-MR head.
        const commitId = this.urlParser.extractCommitId(window.location.href);
        if (commitId) {
            return commitId;
        }
        const mr = await this.#loadMr();
        return mr?.diff_refs?.head_sha ?? null;
    }

    async getTargetCommitId(/* sourceCommitId, changeTitle, targetBranchName */) {
        // For a selected commit, compare against its parent — exactly what GitLab
        // shows for that single commit. The first MR commit's parent is the
        // branch point on the target branch, so the "no upstream commit -> target
        // branch" case falls out for free. Fall back to base_sha if the parent
        // can't be resolved (root commit or request error).
        const commitId = this.urlParser.extractCommitId(window.location.href);
        if (commitId) {
            const parentId = await this.#loadCommitParentId(commitId);
            if (parentId) {
                return parentId;
            }
        }
        const mr = await this.#loadMr();
        return mr?.diff_refs?.base_sha ?? null;
    }

    async getDiffSideLabels(sourceRef, targetRef) {
        // A selected single commit is diffed against its parent commit, not the
        // target branch (FEAT-0001), so labelling either side by branch name would
        // be misleading — show the commit message + short id instead. The whole-MR
        // case keeps the branch-name labels from the base implementation.
        if (this.urlParser.extractCommitId(window.location.href)) {
            return {
                sourceLabel: await this.#commitLabel(sourceRef),
                targetLabel: await this.#commitLabel(targetRef)
            };
        }
        return super.getDiffSideLabels(sourceRef, targetRef);
    }

    // ==== Private fields and methods ====

    // Commits fetched from the repository commits API, cached per sha for the page
    // lifetime — the selected commit and its parent are reused across files and
    // across getTargetCommitId/getDiffSideLabels.
    #commits = new Map();

    /**
     * Display label for a commit: "<message title> (<short id>)", or just the
     * short id when the commit (or its title) cannot be loaded.
     */
    async #commitLabel(commitId) {
        const shortId = shortenCommitId(commitId);
        const commit = await this.#loadCommit(commitId);
        return commit && commit.title ? `${commit.title} (${shortId})` : shortId;
    }

    /**
     * Resolves the first parent of the given commit. Returns null when the commit
     * has no parent (root commit) or the request fails.
     */
    async #loadCommitParentId(commitId) {
        const commit = await this.#loadCommit(commitId);
        return commit?.parent_ids?.[0] ?? null;
    }

    /**
     * Loads a commit via the repository commits API, cached per sha. Returns null
     * when there is no project id / commit id or the request fails.
     */
    async #loadCommit(commitId) {
        const projectInfo = this.getProjectInfo();
        if (!projectInfo?.id || !commitId) {
            return null;
        }
        if (this.#commits.has(commitId)) {
            return this.#commits.get(commitId);
        }

        const url = `${projectInfo.hostUrl}/api/v4/projects/${projectInfo.id}/repository/commits/${commitId}`;
        try {
            const commit = JSON.parse(await this.loadContent(url, true));
            this.#commits.set(commitId, commit);
            return commit;
        } catch (error) {
            console.warn('cannot load commit ' + commitId, error);
            return null;
        }
    }

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
