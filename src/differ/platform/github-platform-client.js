// Inert GitHub PlatformClient (REFAC-0004 step 1.3). Built by createPlatformClient
// for platform.kind === 'github', but every method throws until subtask 2 adds the
// public-repo basics (raw/blob URLs) and subtask 3 the rest (search, PR changes,
// auth). It is never reached today: nothing emits kind 'github' yet. GitLab is
// unaffected — GitLabPlatformClient keeps all of today's behaviour.
class GitHubPlatformClient extends PlatformClient {
    rawFileUrl(ref, filePath) { this.#notSupported(); }
    blobFileUrl(ref, filePath, line) { this.#notSupported(); }
    async searchCode(ref, term, options = {}) { this.#notSupported(); }
    searchPageUrl(term, ref) { this.#notSupported(); }
    async prChangedFiles(changeId) { this.#notSupported(); }
    prDiffsUrl(changeId) { this.#notSupported(); }

    #notSupported() {
        throw new Error('GitHubPlatformClient: GitHub not supported yet (REFAC-0004 subtask 2)');
    }
}
