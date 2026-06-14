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
        // Primary path once implemented (REFAC-0001); currently disabled, so the
        // chain falls through to the DOM/heuristic provider below.
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
