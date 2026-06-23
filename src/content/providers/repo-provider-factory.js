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
    // Host-based selection (REFAC-0004): GitHub pages get the GitHub UI provider,
    // everything else keeps GitLab as the default — so nothing changes off
    // github.com. The GitHub branch is inert until subtask 2 (the GitHub UI
    // provider is a safe no-op, and github.com is not yet in content_scripts).
    if (window.location.hostname === 'github.com') {
        return new GitHubUIRepoProvider();
    }
    return new GitLabUIRepoProvider();
}
