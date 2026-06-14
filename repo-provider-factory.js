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
        new GitLabRepoProvider()
    ]);
}

/**
 * @returns {UIRepoProvider} a provider that injects the plugin's buttons
 */
function createUIRepoProvider() {
    return new GitLabUIRepoProvider();
}
