/**
 * Heuristic resolution of the target commit id for a merged MR (the "doomed"
 * DOM/heuristic path; see REFAC-0001). For an opened MR the target is simply the
 * target branch name; for a merged one GitLab no longer diffs against a branch,
 * so the commit that precedes the merge on the target branch is reconstructed:
 *   - first by the previous-commit lookup against the source commit id;
 *   - then, failing that, by locating the merged commit by the MR title and
 *     taking the commit before it.
 * The master-commit history and the atom feed filtered by title back these
 * lookups. All of this disappears once the API path (GitLabApiRepoProvider) is
 * trusted.
 */
class MergedMrCommitResolver {
    #projectInfo;
    #domScraper;
    #masterCommitManager;
    #loadContent;

    #targetCommitIdCache = new SingleEntryCache();
    #filteredByTitleMasterCommitEntries = null;

    /**
     * @param {ProjectInfo} projectInfo resolved project info
     * @param {GitLabDomScraper} domScraper page DOM reader (merged badge)
     * @param {MasterCommitManager} masterCommitManager target-branch commit history
     * @param {function} loadContent loader for file/URL content
     */
    constructor(projectInfo, domScraper, masterCommitManager, loadContent) {
        this.#projectInfo = projectInfo;
        this.#domScraper = domScraper;
        this.#masterCommitManager = masterCommitManager;
        this.#loadContent = loadContent;
    }

    /**
     * @param {string} sourceCommitId source side commit id
     * @param {string} changeTitle MR title
     * @param {string} targetBranchName target branch name
     * @param {string|null} mrInfoUrl MR-info API URL (for the merged-state check)
     * @returns {Promise<string>} commit id (merged) or target branch name (opened)
     */
    async resolveTargetCommitId(sourceCommitId, changeTitle, targetBranchName, mrInfoUrl) {
        console.debug('getting target commit id...');

        const cacheKey = `${sourceCommitId}-${changeTitle}-${targetBranchName}`;

        const cachedTargetCommitId = this.#targetCommitIdCache.get(cacheKey);
        if (cachedTargetCommitId) {
            console.debug('Using cached target commit id: ' + cachedTargetCommitId);
            return cachedTargetCommitId;
        }

        // First check if MR is merged to avoid expensive operations when it's not
        const isMerged = await this.#isMerged(mrInfoUrl);

        // Only do expensive operations if MR is likely merged
        let targetCommitId = null;
        if (isMerged) {
            console.debug('MR is likely merged. Trying to find target commit id by MR commit id...');
            targetCommitId = await this.#findPreviousCommitId(sourceCommitId);
            if (!targetCommitId) {
                const actualMrCommitId = await this.#findCommitIdByTitle(changeTitle);
                if (actualMrCommitId) {
                    targetCommitId = await this.#findPreviousCommitId(actualMrCommitId);
                }
            }
        }

        if (!targetCommitId) {
            console.debug('MR is not merged. Target commit id is target branch name: ' + targetBranchName);
            targetCommitId = targetBranchName;
        } else {
            console.debug('MR is already merged. Target commit id is previous before the merged MR commit: ' + targetCommitId);
        }

        this.#targetCommitIdCache.set(cacheKey, targetCommitId);

        return targetCommitId;
    }

    // ==== Private methods ====

    async #isMerged(mrInfoUrl) {
        // checking through DOM is faster than API call
        if (this.#domScraper.isMergedByBadge()) {
            return true;
        }

        if (mrInfoUrl) {
            const content = await this.#loadContent(mrInfoUrl, false);
            if (content) {
                const mrInfo = JSON.parse(content);
                return !!(mrInfo.merged_at || mrInfo.state === 'merged');
            }
        }
        return false;
    }

    async #findPreviousCommitId(commitId) {
        console.debug('try to find target branch previous commit id for commit id: ' + commitId);
        return await this.#masterCommitManager.findPreviousCommitId(commitId);
    }

    async #findCommitIdByTitle(commitTitle) {
        console.debug('try to find target branch commit id by title: ' + commitTitle);

        await this.#loadFilteredEntries(commitTitle);

        const index = this.#filteredByTitleMasterCommitEntries.findIndex(entry => {
            const titleElement = entry.querySelector('title');
            return titleElement && titleElement.textContent.includes(commitTitle);
        });
        if (index === -1) {
            return null;
        }

        const entry = this.#filteredByTitleMasterCommitEntries[index];
        const idElemText = entry.querySelector('id').textContent;
        const foundCommitId = idElemText.substring(idElemText.lastIndexOf('/') + 1);
        return foundCommitId;
    }

    async #loadFilteredEntries(commitTitle) {
        console.debug('loading master commit entries filtered by title...');
        if (this.#filteredByTitleMasterCommitEntries) {
            console.debug('loading master commit entries filtered by title...done (used cache)');
            return;
        }

        const url = this.#projectInfo.url + '/-/commits/' + MASTER_BRANCH_NAME + '?format=atom&search=' + encodeURIComponent(commitTitle);
        const content = await this.#loadContent(url, true);
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        this.#filteredByTitleMasterCommitEntries = Array.from(doc.getElementsByTagName('entry'));

        console.debug('loading master commit entries filtered by title...done');
    }
}
