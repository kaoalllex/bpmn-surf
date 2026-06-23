// Builds the differ-scope PlatformClient for a parsed platform descriptor,
// chosen by platform.kind (REFAC-0004) — the differ mirror of the content
// scope's repo-provider-factory.js. The GitHub case is added in a later subtask.
function createPlatformClient(platform) {
    switch (platform && platform.kind) {
        case 'gitlab':
            return new GitLabPlatformClient(platform);
        default:
            throw new Error(`unsupported platform kind: ${platform && platform.kind}`);
    }
}
