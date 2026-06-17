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
        this.sourceLabel = params.sourceLabel; // human-readable label of the MR/source side
        this.changeRequestId = params.changeRequestId; // MR/PR number; undefined in branch-view mode
        this.targetRef = requireDefined(params.targetRef, 'targetRef');
        // Human-readable label of the target side for display. It is platform-
        // neutral: the producing provider decides whether it is a branch name
        // (whole-change diff) or a short commit id (single selected commit), since
        // for a merged MR targetRef holds a commit id. Falls back to targetRef when
        // not provided (branch mode, nested differ).
        this.targetLabel = params.targetLabel || params.targetRef;
        this.filePath = requireDefined(params.filePath, 'filePath');
        // Path the target (base) side loads from. Differs from filePath only when
        // the file was renamed in the MR (BUG-0002); defaults to filePath, so the
        // no-rename and nested-differ paths are unchanged.
        this.targetFilePath = params.targetFilePath || this.filePath;
        this.fileName = requireDefined(params.fileName, 'fileName');
        // Display/download name of the target side. Equals fileName unless the
        // file was renamed in the MR, where the target side keeps its old name
        // (BUG-0002). Derived from targetFilePath, so it needs no extra wire field.
        this.targetFileName = getFileNameFromPath(this.targetFilePath);

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

    rawFileUrl(ref, filePath = this.filePath) {
        return `${this.platform.projectUrl}/-/raw/${ref}/${filePath}`;
    }

    // Wire params for a nested differ (e.g. diving into a Call Activity's called
    // process file) on the same platform and refs, but a different file.
    // localFileContent is intentionally not carried over: a nested differ loads
    // both versions from the platform and has no local file context.
    toNestedDifferParams(filePath, fileName) {
        return {
            platform: this.platform,
            sourceRef: this.sourceRef,
            sourceLabel: this.sourceLabel,
            changeRequestId: this.changeRequestId,
            targetRef: this.targetRef,
            targetLabel: this.targetLabel,
            filePath: filePath,
            fileName: fileName,
            camundaBpmnModdle: this.camundaBpmnModdle
        };
    }
}
