// Builds the differ-scope PlatformClient for a parsed platform descriptor,
// chosen by platform.kind (REFAC-0004) — the differ mirror of the content
// scope's repo-provider-factory.js. change = { changeId, headRef } of the shown
// PR (empty outside one): GitHub searches the PR's own files with it.
function createPlatformClient(platform, change = {}) {
    switch (platform && platform.kind) {
        case 'gitlab':
            return new GitLabPlatformClient(platform);
        case 'github':
            // Content, search and links via the github.com (or GHES) session.
            return new GitHubPlatformClient(platform, loadFileContent, change);
        default:
            throw new Error(`unsupported platform kind: ${platform && platform.kind}`);
    }
}
