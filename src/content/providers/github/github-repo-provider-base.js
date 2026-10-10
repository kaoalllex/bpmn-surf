// Shared GitHub provider logic (REFAC-0004): project info, the blob view and
// every getter over a resolved pull. Subclasses decide where the pull comes
// from — the page (GitHubRepoProvider) or the REST API
// (GitHubApiRepoProvider) — by implementing resolvePull().
//
// init() fails whenever the pull cannot be resolved: returning true with no
// refs would send App down its "commit not known yet" path, which reloads the
// page. Collaborators are plain fields so subclasses can use them (JS has no
// `protected`), as in GitLabRepoProviderBase.
class GitHubRepoProviderBase extends RepoProvider {
    constructor(loadContent = loadFileContent, domScraper = new GitHubDomScraper()) {
        super();
        this.loadContent = loadContent;
        this.domScraper = domScraper;
        this.urlParser = new GitHubUrlParser();
        this.projectInfo = new ProjectInfo();
        this.changeInfo = new MergeRequestInfo();
        this.pull = null;
    }

    isAvailable(platformKind) {
        return platformKind === PLATFORM_KIND.GITHUB;
    }

    async init() {
        this.pull = null;
        const href = window.location.href;
        const pr = this.urlParser.parsePullFiles(href);
        const page = pr || this.urlParser.parseBlob(href);
        if (!page) {
            return false;
        }
        const origin = window.location.origin;
        Object.assign(this.projectInfo, {
            url: `${origin}/${page.owner}/${page.repo}`,
            hostUrl: origin,
            groupName: page.owner,
            name: page.repo,
            id: `${page.owner}/${page.repo}`
        });
        if (!pr) {
            return true;
        }
        this.pull = await this.resolvePull(pr);
        return !!this.pull;
    }

    /** @returns {Promise<{number, title, headSha, mergeBaseSha, headRef, baseRef, headLabel?, baseLabel?}|null>} */
    async resolvePull(/* {owner, repo, number, range} */) {
        throw new Error('resolvePull() must be implemented');
    }

    getProjectInfo() { return this.projectInfo; }

    async isChangeViewActive() {
        return !!this.urlParser.parsePullFiles(window.location.href);
    }

    async getBranchFileType() {
        return this.urlParser.getBranchFileType(window.location.href);
    }

    async initChangeInfo() {
        this.changeInfo.iid = this.pull ? this.pull.number : null;
        this.changeInfo.title = this.pull ? this.pull.title : null;
    }

    getChangeInfo() { return this.changeInfo; }

    getChangeBranchNames() {
        return this.pull ? new MergeRequestBranchNames(this.pull.headRef, this.pull.baseRef) : null;
    }

    async getSourceCommitId() { return this.pull ? this.pull.headSha : null; }

    async getTargetCommitId() { return this.pull ? this.pull.mergeBaseSha : null; }

    getDiffSideLabels() {
        if (!this.pull) {
            return { sourceLabel: null, targetLabel: null };
        }
        return {
            sourceLabel: this.pull.headLabel || this.pull.headRef || shortenCommitId(this.pull.headSha),
            targetLabel: this.pull.baseLabel || this.pull.baseRef || shortenCommitId(this.pull.mergeBaseSha)
        };
    }

    async extractBranchCommitIdAndFilePath() {
        const blob = this.urlParser.parseBlob(window.location.href);
        if (!blob) {
            return null;
        }
        const ref = this.domScraper.findBlobRef(document, blob.owner, blob.repo);
        const filePath = ref && this.urlParser.splitRefAndPath(blob.refAndPath, ref);
        return filePath ? { branchCommitId: ref, filePath } : null;
    }
}
