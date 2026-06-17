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

    /**
     * Resolves the path the target (base) side of the MR must be loaded from.
     * The path shown on the diffs page is the file's new_path; when the file was
     * renamed in the MR the target commit still holds it under its old_path, so
     * loading the new_path from the base ref 404s and no diff is built (BUG-0002).
     * Looks the rename up in the MR `changes` API and returns the old_path for a
     * rename. With no MR iid (branch view), no rename, or any error, returns
     * filePath unchanged — keeping the previous behaviour byte-for-byte.
     * @param {string} filePath path as shown on the MR diffs page (new_path)
     * @returns {Promise<string>}
     */
    async getTargetFilePath(filePath) {
        const iid = this.urlParser.extractMrIid(window.location.href);
        if (!iid) {
            return filePath;
        }
        try {
            const renameMap = await this.#loadRenameMap(iid);
            return renameMap.get(filePath) || filePath;
        } catch (error) {
            console.warn('cannot resolve target file path; using filePath as target', error);
            return filePath;
        }
    }

    /**
     * Builds a Map(new_path -> old_path) of renamed files from an MR `changes`
     * API response. Only rename entries are kept: `renamed_file`, or any change
     * with differing old/new paths that is not a new/deleted file. Mirror of
     * HandlerLocator.extractHandlerFileChanges.
     * @returns {Map<string, string>}
     */
    static extractRenameMap(changesResponse) {
        const changes = (changesResponse && changesResponse.changes) || [];
        const renameMap = new Map();
        for (const change of changes) {
            if (change.new_file || change.deleted_file) {
                continue;
            }
            const renamed = change.renamed_file
                || (change.new_path && change.old_path && change.new_path !== change.old_path);
            if (renamed) {
                renameMap.set(change.new_path, change.old_path);
            }
        }
        return renameMap;
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

    // Rename maps from the MR `changes` API, cached per URL for the page
    // lifetime so repeated clicks on the same file don't re-fetch.
    #renameMaps = new Map();

    async #loadRenameMap(iid) {
        const url = `${this.projectInfo.hostUrl}/api/v4/projects/${this.projectInfo.id}/merge_requests/${iid}/changes`;
        if (this.#renameMaps.has(url)) {
            return this.#renameMaps.get(url);
        }
        const content = await this.loadContent(url, true);
        const renameMap = GitLabRepoProviderBase.extractRenameMap(JSON.parse(content));
        this.#renameMaps.set(url, renameMap);
        return renameMap;
    }

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
