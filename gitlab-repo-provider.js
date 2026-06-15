/**
 * GitLab provider, DOM/heuristic path (the "doomed" fallback; see REFAC-0001).
 *
 * Resolves MR change info, source commit and target commit by scraping the page
 * and applying commit heuristics, without the GitLab MR API. It extends
 * GitLabRepoProviderBase for the page/URL detection and project-id resolution
 * shared with the API provider, and adds only the change-info / commit
 * resolution on top.
 */
class GitLabRepoProvider extends GitLabRepoProviderBase {
    // Cache for initMergeRequestInfo result
    #initMergeRequestInfoCache = new SingleEntryCache();
    #mergedMrCommitResolver;

    /**
     * @param {function} loadContent loader for file/URL content (DI for tests)
     */
    constructor(loadContent = loadFileContent) {
        super(loadContent);
        // projectInfo is shared by reference: init() fills the same instance the
        // resolver (and MasterCommitManager) capture here, before any of their
        // methods run.
        this.#mergedMrCommitResolver = new MergedMrCommitResolver(
            this.projectInfo,
            this.domScraper,
            new MasterCommitManager(this.projectInfo),
            this.loadContent
        );
    }

    async initChangeInfo() {
        console.debug('initializing merge request info...')

        // Create cache key based on URL
        const cacheKey = window.location.href;

        // Check if we have cached result for the same URL
        const cachedMrInfo = this.#initMergeRequestInfoCache.get(cacheKey);
        if (cachedMrInfo) {
            console.debug('Using cached merge request info');
            // Restore merge request info from cache
            Object.assign(this.mergeRequestInfo, cachedMrInfo);
            return;
        }

        this.mergeRequestInfo.iid = this.urlParser.extractMrIid(window.location.href);
        this.mergeRequestInfo.infoUrl = this.urlParser.buildMrApiUrl(this.projectInfo, this.mergeRequestInfo.iid);

        // Load title during initialization
        try {
            const content = await this.loadContent(this.mergeRequestInfo.infoUrl, true);
            const mrInfo = JSON.parse(content);
            this.mergeRequestInfo.title = mrInfo.title;
            console.debug('mr title: ' + this.mergeRequestInfo.title);
        } catch (error) {
            console.warn('cannot load MR title', error);
            this.mergeRequestInfo.title = null;
        }

        this.mergeRequestInfo.logDebug();

        // Cache the result
        this.#initMergeRequestInfoCache.set(cacheKey, { ...this.mergeRequestInfo });
    }

    getChangeBranchNames() {
        return this.domScraper.getMergeRequestBranchNames();
    }

    async getSourceCommitId() {
        const commitId = await this.#getMrLastCommitId();
        if (commitId) {
            return commitId;
        }

        const diffHeadSha = this.domScraper.findDiffHeadSha();
        if (diffHeadSha) {
            return diffHeadSha;
        }

        return null;
    }

    async getTargetCommitId(sourceCommitId, changeTitle, targetBranchName) {
        return await this.#mergedMrCommitResolver.resolveTargetCommitId(
            sourceCommitId, changeTitle, targetBranchName, this.mergeRequestInfo.infoUrl);
    }

    // ==== Private fields and methods ====

    async #getMrLastCommitId() {
        console.debug('getting mr last commit id...');

        if (this.mergeRequestInfo.lastCommitId) {
            return this.mergeRequestInfo.lastCommitId;
        }

        const href = window.location.href;
        const getMrCommitInfoUrl = href.substring(0, href.indexOf('/diffs')) + '/commits.json';

        const mrCommitInfo = await this.loadContent(getMrCommitInfoUrl, true);

        const regex = /commit_id=([a-fA-F0-9]+)/;
        const match = mrCommitInfo.match(regex);
        if (!match || match.length < 2) {
            console.warn('cannot find mr last commit id in commits info!', mrCommitInfo);
            return null;
        }
        this.mergeRequestInfo.lastCommitId = match[1];
        return this.mergeRequestInfo.lastCommitId;
    }
}
