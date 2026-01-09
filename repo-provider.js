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
     * Checks if the MR diffs tab is active
     * @returns {Promise<boolean>}
     */
    async isDiffsTabActive() {
        throw new Error('isDiffsTabActive() must be implemented');
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
     * Initializes MR information
     * @returns {Promise<void>}
     */
    async initMergeRequestInfo() {
        throw new Error('initMergeRequestInfo() must be implemented');
    }

    /**
     * Gets MR information
     * @returns {MergeRequestInfo|null} object with MR information or null if initMergeRequestInfo hasn't been called yet
     */
    getMergeRequestInfo() {
        throw new Error('getMergeRequestInfo() must be implemented');
    }

    /**
     * Gets source and target branch names of MR
     * @returns {MergeRequestBranchNames|null} object with branch information or null
     */
    getMergeRequestBranchNames() {
        throw new Error('getMergeRequestBranchNames() must be implemented');
    }

    /**
     * Gets the last commit ID in MR
     * @returns {Promise<string|null>}
     */
    async getMergeRequestCommitId() {
        throw new Error('getMergeRequestCommitId() must be implemented');
    }

    /**
     * Gets target commit ID for comparison
     * @param {string} mrCommitId - MR commit ID
     * @param {string} mrTitle - MR title
     * @param {string} targetBranchName - target branch name
     * @returns {Promise<string>} commit ID or branch name
     */
    async getTargetCommitId(mrCommitId, mrTitle, targetBranchName) {
        throw new Error('getTargetCommitId() must be implemented');
    }

    /**
     * Extracts commit and file path information from branch view URL
     * @returns {Object|null} object with fields: branchCommitId, filePath or null
     */
    extractBranchCommitIdAndFilePath() {
        throw new Error('extractBranchCommitIdAndFilePath() must be implemented');
    }
}
