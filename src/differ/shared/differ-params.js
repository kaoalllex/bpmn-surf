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

        // FEAT-0023, dive-in (down): the calling diagram we dived in FROM, whose
        // tab is still open above us — { filePath, fileName } or null. Set only
        // when opened by diving into a Call Activity, NOT when stepping up to a
        // caller (there the opener is a callee, below us). It lets "dive out"
        // jump straight up to that already-open caller (focus its tab, no reload)
        // and marks it among the listed callers.
        this.divedInFrom = params.divedInFrom || null;

        // Dive-out (up): the ids whose call site should be auto-selected once
        // this diagram renders — used when stepping up to a caller, so the element
        // from which it calls the diagram we came from is highlighted. The id
        // namespace tells the direction apart without colliding: process ids for a
        // Call Activity's calledElement (FEAT-0023) or decision ids for a Business
        // Rule Task's decisionRef (FEAT-0005). null/empty = no auto-select.
        this.selectCalledProcessIds = params.selectCalledProcessIds || null;
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

    // A stable string identifying WHICH diagram diff this tab shows, so a tab that
    // is about to open a nested differ can first check whether that exact diagram
    // is already open in an ancestor tab (the window.opener chain) and focus it
    // instead of opening a duplicate (FEAT-0023 follow-up). The key combines the
    // refs (project + MR/branch versions) with the file path, so the same file in
    // a different MR/commit is a different key. Nested differs share all refs and
    // differ only by file path, so `identityKeyFor(thisParams, targetFilePath)`
    // computed before the dive equals the key the target tab will publish.
    identityKey() {
        return DifferParams.identityKeyFor(this, this.filePath);
    }

    static identityKeyFor(params, filePath) {
        return [
            params.platform.projectUrl,
            params.changeRequestId || '',
            params.sourceRef || '',
            params.targetRef,
            filePath
        ].join('\n');
    }

    // Wire params for a nested differ (e.g. diving into a Call Activity's called
    // process file) on the same platform and refs, but a different file.
    // localFileContent is intentionally not carried over: a nested differ loads
    // both versions from the platform and has no local file context.
    // `extra` carries the FEAT-0023 navigation hints, which differ by direction:
    // diving in (down) passes `divedInFrom` (this diagram), stepping up to a
    // caller passes `selectCalledProcessIds` (so the caller highlights its call).
    toNestedDifferParams(filePath, fileName, extra = {}) {
        return {
            platform: this.platform,
            sourceRef: this.sourceRef,
            sourceLabel: this.sourceLabel,
            changeRequestId: this.changeRequestId,
            targetRef: this.targetRef,
            targetLabel: this.targetLabel,
            filePath: filePath,
            fileName: fileName,
            camundaBpmnModdle: this.camundaBpmnModdle,
            ...extra
        };
    }
}
