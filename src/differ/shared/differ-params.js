// Parsed and validated parameters of a differ page, received via postMessage.
//
// Naming is platform-neutral: the differ core works with abstract refs and a
// `platform` descriptor (discriminated by `platform.kind`) that carries the
// platform-specific data still needed on this page (GitLab API access, raw
// file URLs). See diff-params-builder.js for the producing side.
class DifferParams {
    constructor(params) {
        this.platform = requireDefined(params.platform, 'platform');
        requireDefined(this.platform.projectUrl, 'platform.projectUrl');

        this.sourceRef = params.sourceRef; // may be undefined when showing from branch only
        this.localFileContent = params.localFileContent;
        if (this.sourceRef && this.localFileContent) {
            console.error('Only one of these parameters must be defined: sourceRef or localFileContent');
        }
        this.sourceBranchName = params.sourceBranchName;
        this.changeRequestId = params.changeRequestId; // MR/PR number; undefined in branch-view mode
        this.targetRef = requireDefined(params.targetRef, 'targetRef');
        this.filePath = requireDefined(params.filePath, 'filePath');
        this.fileName = requireDefined(params.fileName, 'fileName');

        this.camundaBpmnModdle = params.camundaBpmnModdle;
    }

    // Required by the BPMN-only features (Call Activity / handler navigation)
    // that call the platform API; validated by requirePlatformInfo().
    requirePlatformInfo() {
        requireDefined(this.platform.hostUrl, 'platform.hostUrl');
        requireDefined(this.platform.projectId, 'platform.projectId');
    }

    isSourceVersionDefined() {
        return this.sourceRef || this.localFileContent;
    }

    rawFileUrl(ref) {
        return `${this.platform.projectUrl}/-/raw/${ref}/${this.filePath}`;
    }

    // Wire params for a nested differ (e.g. diving into a Call Activity's called
    // process file) on the same platform and refs, but a different file.
    // localFileContent is intentionally not carried over: a nested differ loads
    // both versions from the platform and has no local file context.
    toNestedDifferParams(filePath, fileName) {
        return {
            platform: this.platform,
            sourceRef: this.sourceRef,
            sourceBranchName: this.sourceBranchName,
            changeRequestId: this.changeRequestId,
            targetRef: this.targetRef,
            filePath: filePath,
            fileName: fileName,
            camundaBpmnModdle: this.camundaBpmnModdle
        };
    }
}
