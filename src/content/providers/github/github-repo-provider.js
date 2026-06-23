// Inert GitHub data/detection provider (REFAC-0004 step 1.3). It is registered
// in the FallbackRepoProvider chain (repo-provider-factory.js) but is a
// guaranteed no-op until subtask 2 fills it in: isAvailable() returns false, so
// FallbackRepoProvider always skips it (it only initializes available providers)
// and none of the throwing methods below can be reached. github.com is not yet
// in manifest#content_scripts.matches either, so this never even loads on a
// GitHub page. Subtask 2 will flip isAvailable() to detect github.com and
// implement the rest; until then GitLab behaviour is unchanged.
class GitHubRepoProvider extends RepoProvider {
    isAvailable(/* platformKind */) {
        // Inert: ignores the detected kind and never claims a page (the 'github'
        // matcher stays dormant). Subtask 2 flips this to
        // `platformKind === PLATFORM_KIND.GITHUB` with no factory change.
        return false;
    }

    async init() { this.#notImplemented(); }
    getProjectInfo() { this.#notImplemented(); }
    async isChangeViewActive() { this.#notImplemented(); }
    async getBranchFileType() { this.#notImplemented(); }
    async findSelectedFilePath() { this.#notImplemented(); }
    async initChangeInfo() { this.#notImplemented(); }
    getChangeInfo() { this.#notImplemented(); }
    getChangeBranchNames() { this.#notImplemented(); }
    async getSourceCommitId() { this.#notImplemented(); }
    async getTargetCommitId() { this.#notImplemented(); }
    getDiffSideLabels() { this.#notImplemented(); }
    extractBranchCommitIdAndFilePath() { this.#notImplemented(); }

    #notImplemented() {
        throw new Error('GitHubRepoProvider: not implemented yet (REFAC-0004 subtask 2)');
    }
}
