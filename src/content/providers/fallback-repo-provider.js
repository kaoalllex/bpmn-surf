/**
 * Composes several RepoProvider implementations into a primary/fallback chain.
 *
 * The intended use (REFAC-0001 / REFAC-0004): put the GitLab MR API provider
 * first and the DOM/heuristic provider after it. On init() the chain picks the
 * first provider that is available for the current page and initializes
 * successfully ("whole-provider" fallback); every subsequent call is delegated
 * to that single chosen provider. When the API path proves reliable the DOM
 * provider can simply be dropped from the chain and deleted.
 *
 * All methods except isAvailable() and init() require a successful init() first
 * (they delegate to the chosen provider); calling them before that throws.
 */
class FallbackRepoProvider extends RepoProvider {
    #providers;
    #active = null;

    /**
     * @param {RepoProvider[]} providers ordered by priority (primary first)
     */
    constructor(providers) {
        super();
        this.#providers = providers;
    }

    isAvailable() {
        return this.#providers.some(p => p.isAvailable());
    }

    async init() {
        this.#active = null;
        for (const provider of this.#providers) {
            if (!provider.isAvailable()) {
                continue;
            }
            try {
                if (await provider.init()) {
                    this.#active = provider;
                    return true;
                }
            } catch (error) {
                console.warn('repo provider init failed, trying next one', error);
            }
        }
        console.debug('no repo provider could initialize for current page');
        return false;
    }

    getProjectInfo() {
        return this.#requireActive().getProjectInfo();
    }

    async isChangeViewActive() {
        return await this.#requireActive().isChangeViewActive();
    }

    async getBranchFileType() {
        return await this.#requireActive().getBranchFileType();
    }

    async findSelectedFilePath() {
        return await this.#requireActive().findSelectedFilePath();
    }

    async initChangeInfo() {
        return await this.#requireActive().initChangeInfo();
    }

    getChangeInfo() {
        return this.#requireActive().getChangeInfo();
    }

    getChangeBranchNames() {
        return this.#requireActive().getChangeBranchNames();
    }

    async getSourceCommitId() {
        return await this.#requireActive().getSourceCommitId();
    }

    async getTargetCommitId(sourceCommitId, changeTitle, targetBranchName) {
        return await this.#requireActive().getTargetCommitId(sourceCommitId, changeTitle, targetBranchName);
    }

    extractBranchCommitIdAndFilePath() {
        return this.#requireActive().extractBranchCommitIdAndFilePath();
    }

    #requireActive() {
        if (!this.#active) {
            throw new Error('FallbackRepoProvider: no active provider; init() must succeed first');
        }
        return this.#active;
    }
}
