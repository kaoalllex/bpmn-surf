/**
 * Common GitLab provider base: the "keeper" logic shared by both the DOM/
 * heuristic provider (GitLabRepoProvider) and the API provider
 * (GitLabApiRepoProvider) — page/URL detection, project-id resolution and the
 * selected-file/branch-file lookups that have no API equivalent.
 *
 * It deliberately does NOT implement the change-info / commit-resolution
 * methods: those differ between the DOM and API paths and are provided by the
 * concrete subclasses.
 *
 * Collaborators (urlParser, domScraper, projectInfo, mergeRequestInfo) are
 * plain fields, not #private, so subclasses can use them directly (JS has no
 * `protected`). loadContent is injected (defaults to loadFileContent) for tests.
 */
class GitLabRepoProviderBase extends RepoProvider {
    // Cache for init result
    #initCache = new SingleEntryCache();

    /**
     * @param {function} loadContent loader for file/URL content (DI for tests)
     */
    constructor(loadContent = loadFileContent) {
        super();
        this.loadContent = loadContent;
        this.projectInfo = new ProjectInfo();
        this.mergeRequestInfo = new MergeRequestInfo();
        this.urlParser = new GitLabUrlParser();
        this.domScraper = new GitLabDomScraper();
    }

    isAvailable() {
        return window.location.href.includes('gitlab');
    }

    async init() {
        console.debug('initializing repo provider...');

        // Create cache key based on URL
        const href = window.location.href;
        const cacheKey = href;

        // Check if we have cached result for the same URL
        const cachedInit = this.#initCache.get(cacheKey);
        if (cachedInit) {
            console.debug('Using cached init result');
            // Restore project info from cache
            Object.assign(this.projectInfo, cachedInit.projectInfo);
            return cachedInit.result;
        }

        const parsed = this.urlParser.parseProject(href);
        if (!parsed) {
            // Cache the result
            this.#initCache.set(cacheKey, { projectInfo: { ...this.projectInfo }, result: false });
            return false;
        }
        this.projectInfo.url = parsed.url;
        this.projectInfo.groupName = parsed.groupName;
        this.projectInfo.name = parsed.name;
        this.projectInfo.hostUrl = parsed.hostUrl;

        this.projectInfo.id = await this.#getProjectId();
        if (!this.projectInfo.id) {
            console.warn('cannot get project id');
            // Cache the result
            this.#initCache.set(cacheKey, { projectInfo: { ...this.projectInfo }, result: false });
            return false;
        }

        this.projectInfo.logDebug();

        // Cache the result
        this.#initCache.set(cacheKey, { projectInfo: { ...this.projectInfo }, result: true });
        return true;
    }

    getProjectInfo() {
        return this.projectInfo;
    }

    getChangeInfo() {
        return this.mergeRequestInfo;
    }

    async isChangeViewActive() {
        await delay(200);
        return this.urlParser.isMrDiffPage(window.location.href);
    }

    async getBranchFileType() {
        await delay(200);
        return this.urlParser.getBranchFileType(window.location.href);
    }

    async findSelectedFilePath() {
        return await this.domScraper.findSelectedFilePath();
    }

    extractBranchCommitIdAndFilePath() {
        const branchCommitId = this.domScraper.findBranchCommitIdText();
        return this.urlParser.extractBranchCommitIdAndFilePath(
            window.location.href, this.projectInfo.name, branchCommitId);
    }

    // A whole-change diff is labelled by the MR branch names. Subclasses that
    // support narrower diffs (e.g. a single selected commit) override this.
    getDiffSideLabels(/* sourceRef, targetRef */) {
        const names = this.getChangeBranchNames();
        return {
            sourceLabel: names ? names.sourceBranchName : null,
            targetLabel: names ? names.targetBranchName : null
        };
    }

    // ==== Private fields and methods ====

    async #getProjectId() {
        const url = this.projectInfo.hostUrl + '/api/v4/projects/?simple=true&per_page=100&search=' + this.projectInfo.name;
        const content = await this.loadContent(url, true);
        const protectInfoArr = JSON.parse(content);

        const pathWithNs = this.projectInfo.groupName + '/' + this.projectInfo.name;
        const protectInfo = protectInfoArr.find(i => i.path_with_namespace === pathWithNs);
        if (!protectInfo) {
            return null;
        }

        return protectInfo.id;
    }
}
