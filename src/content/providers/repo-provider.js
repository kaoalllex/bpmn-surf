/**
 * Base interface for repository provider
 */
class RepoProvider {
    /**
     * Checks if this provider is available for the current page
     * @returns {boolean} true if the provider can work with the current page
     */
    isAvailable() {
        throw new Error('isAvailable() must be implemented');
    }

    /**
     * Initializes the provider and determines project parameters
     * @returns {Promise<boolean>} true if initialization is successful
     */
    async init() {
        throw new Error('init() must be implemented');
    }

    /**
     * Returns project information
     * @returns {ProjectInfo} object with fields: url, hostUrl, groupName, name, id
     */
    getProjectInfo() {
        throw new Error('getProjectInfo() must be implemented');
    }

    /**
     * Checks if the change (MR/PR) diffs view is active
     * @returns {Promise<boolean>}
     */
    async isChangeViewActive() {
        throw new Error('isChangeViewActive() must be implemented');
    }

    /**
     * Determines file type (bpmn or dmn) if viewing a file in a branch
     * @returns {Promise<FileType|null>} FILE_TYPE_BPMN, FILE_TYPE_DMN or null
     */
    async getBranchFileType() {
        throw new Error('getBranchFileType() must be implemented');
    }

    /**
     * Finds the selected file in MR diff
     * @returns {Promise<string|null>} file path or null
     */
    async findSelectedFilePath() {
        throw new Error('findSelectedFilePath() must be implemented');
    }

    /**
     * Initializes change (MR/PR) information
     * @returns {Promise<void>}
     */
    async initChangeInfo() {
        throw new Error('initChangeInfo() must be implemented');
    }

    /**
     * Gets change (MR/PR) information
     * @returns {MergeRequestInfo|null} object with change information or null if initChangeInfo hasn't been called yet
     */
    getChangeInfo() {
        throw new Error('getChangeInfo() must be implemented');
    }

    /**
     * Gets source and target branch names of the change
     * @returns {MergeRequestBranchNames|null} object with branch information or null
     */
    getChangeBranchNames() {
        throw new Error('getChangeBranchNames() must be implemented');
    }

    /**
     * Gets the latest commit ID on the change's source side
     * @returns {Promise<string|null>}
     */
    async getSourceCommitId() {
        throw new Error('getSourceCommitId() must be implemented');
    }

    /**
     * Gets target commit ID for comparison
     * @param {string} sourceCommitId - source side commit ID
     * @param {string} changeTitle - change (MR/PR) title
     * @param {string} targetBranchName - target branch name
     * @returns {Promise<string>} commit ID or branch name
     */
    async getTargetCommitId(sourceCommitId, changeTitle, targetBranchName) {
        throw new Error('getTargetCommitId() must be implemented');
    }

    /**
     * Human-readable labels for the two compared sides, shown in the differ.
     * The provider owns the semantics (e.g. a whole-change diff is labelled by
     * branch names, while a single selected commit is diffed against its parent
     * and labelled by commit message + short id), so the platform-agnostic differ
     * core only ever receives plain label strings. May be async if the provider
     * needs to fetch commit metadata.
     * @param {string} sourceRef resolved source-side ref (commit id)
     * @param {string} targetRef resolved target-side ref (commit id)
     * @returns {{ sourceLabel: string, targetLabel: string } | Promise<{ sourceLabel: string, targetLabel: string }>}
     */
    getDiffSideLabels(sourceRef, targetRef) {
        throw new Error('getDiffSideLabels() must be implemented');
    }

    /**
     * Extracts commit and file path information from branch view URL
     * @returns {Object|null} object with fields: branchCommitId, filePath or null
     */
    extractBranchCommitIdAndFilePath() {
        throw new Error('extractBranchCommitIdAndFilePath() must be implemented');
    }
}
