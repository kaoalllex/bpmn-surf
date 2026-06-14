/**
 * GitLab provider that resolves everything through the GitLab MR API
 * (GET /api/v4/projects/{id}/merge_requests/{iid}) instead of parsing HTML and
 * applying DOM heuristics.
 *
 * SEAM ONLY — not implemented yet. This is the place where REFAC-0001 plugs the
 * API-based resolution in. It is already wired into the provider chain
 * (repo-provider-factory.js) ahead of the DOM-based GitLabRepoProvider, but
 * isAvailable() returns false, so the chain skips it and behavior is unchanged
 * until the methods below are implemented and isAvailable() is enabled.
 *
 * TODO (REFAC-0001): implement the methods via the MR API and enable
 * isAvailable(); the DOM-based GitLabRepoProvider then stays only as a fallback.
 */
class GitLabApiRepoProvider extends RepoProvider {
    isAvailable() {
        // Disabled until the API-based resolution is implemented (REFAC-0001).
        return false;
    }

    async init() {
        throw new Error('GitLabApiRepoProvider.init() is not implemented yet (REFAC-0001)');
    }
}
