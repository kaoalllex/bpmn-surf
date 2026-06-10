// Parsed and validated parameters of a differ page,
// received via postMessage from the GitLab page
class DifferParams {
    constructor(params) {
        this.projectUrl = requireDefined(params.projectUrl, 'projectUrl');
        this.mrCommitId = params.mrCommitId; // may be undefined when showing schema from branch only
        this.localFileContent = params.localFileContent;
        if (this.mrCommitId && this.localFileContent) {
            console.error('Only one of these parameters must be defined: mrCommitId or localFileContent');
        }
        this.mrBranchName = params.mrBranchName;
        this.branchCommitId = requireDefined(params.branchCommitId, 'branchCommitId');
        this.targetBranchName = this.branchCommitId;
        this.filePath = requireDefined(params.filePath, 'filePath');
        this.fileName = requireDefined(params.fileName, 'fileName');

        // BPMN-only parameters, validated by requireProjectInfo()
        this.projectHostUrl = params.projectHostUrl;
        this.projectId = params.projectId;
        this.camundaBpmnModdle = params.camundaBpmnModdle;
    }

    requireProjectInfo() {
        requireDefined(this.projectHostUrl, 'projectHostUrl');
        requireDefined(this.projectId, 'projectId');
    }

    isMrBranchDefined() {
        return this.mrCommitId || this.localFileContent;
    }

    rawFileUrl(commitId) {
        return `${this.projectUrl}/-/raw/${commitId}/${this.filePath}`;
    }
}
