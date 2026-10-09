// Builds the differ-scope PlatformClient for a parsed platform descriptor,
// chosen by platform.kind (REFAC-0004) — the differ mirror of the content
// scope's repo-provider-factory.js.
function createPlatformClient(platform) {
    switch (platform && platform.kind) {
        case 'gitlab':
            return new GitLabPlatformClient(platform);
        case 'github':
            // Content and links via the github.com session; search rejects until subtask 3.
            return new GitHubPlatformClient(platform);
        default:
            throw new Error(`unsupported platform kind: ${platform && platform.kind}`);
    }
}
