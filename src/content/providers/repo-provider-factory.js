/**
 * Builds the repository providers used by the App.
 *
 * This is the single place that knows which concrete providers exist and in
 * which order they are tried. Adding a new platform (e.g. GitHub) or enabling
 * the GitLab MR API path (REFAC-0001) is a change here only — the App core
 * talks to the RepoProvider / UIRepoProvider interfaces and stays unaware of
 * any platform specifics.
 */

/**
 * @returns {RepoProvider} a data/detection provider for the current page
 */
function createRepoProvider() {
    return new FallbackRepoProvider([
        // Primary path (REFAC-0001): resolves MR params via the GitLab MR API.
        // On an MR page it owns the page only if the API answers with diff_refs;
        // otherwise its init() returns false and the chain falls back below.
        new GitLabApiRepoProvider(),
        // Fallback: the existing DOM- and URL-heuristic based provider.
        new GitLabRepoProvider(),
        // GitHub (REFAC-0004): inert until subtask 2 — isAvailable() returns
        // false, so the chain always skips it and GitLab behaviour is unchanged.
        new GitHubRepoProvider()
    ]);
}

/**
 * @returns {UIRepoProvider} a provider that injects the plugin's buttons
 */
function createUIRepoProvider() {
    // Detect the page's platform once and let each UI provider decide whether it
    // handles it (REFAC-0004): the factory no longer hardcodes the host->provider
    // mapping. The GitHub UI provider is inert (isAvailable() === false) until
    // subtask 2 flips it on — at which point it gets selected here with no factory
    // edit. If nothing matches we throw rather than guessing a provider: a
    // mismatched one could not inject buttons correctly anyway (the content script
    // only runs on matched hosts, so this never fires in practice).
    const platformKind = detectPlatformKind();
    const uiProviders = [new GitHubUIRepoProvider(), new GitLabUIRepoProvider()];
    const uiProvider = uiProviders.find(p => p.isAvailable(platformKind));
    if (!uiProvider) {
        throw new Error(`no UI repo provider for platform kind: ${platformKind}`);
    }
    return uiProvider;
}
