// Orchestrates the DMN differ page: wires the view, the dmn-js viewer,
// the diagram versions and the decision table diff highlighting together
class DmnDiffer {
    static MSG_ID = 'msg_dmn_71e23e639965407fb9c87f100a56c898';

    static OLD_VERSION_XMLNS = "http://www.omg.org/spec/DMN/20151101/dmn.xsd";
    static NEW_VERSION_XMLNS = "https://www.omg.org/spec/DMN/20191111/MODEL/";

    #rawParams;
    #params = null;
    #versions = null;
    #branchIndicator = null;
    #viewport = null;
    #view = null;

    #dmnJS = null;
    #xmlComparator = null;
    #diffPainter = null;
    #decisionCallerLocator = null;
    #backNavigator = null;
    #tabNavigator = null;

    constructor(rawParams) {
        this.#rawParams = rawParams;
    }

    async show() {
        console.debug('diff params: ', this.#rawParams);
        this.#init();
        console.debug('init done');

        this.#view.build();
        // console.debug('dmn div created');

        this.#dmnJS = new DmnJS({
            container: '#' + DmnDifferView.CANVAS_ID
        });
        // console.debug('dmn js created');

        await this.#loadVersions();

        if (!this.#versions.branchXml && !this.#versions.mrXml) {
            // File absent in both versions (BUG-0001): show a placeholder instead
            // of a blank page. The detailed error is logged by #loadVersions().
            this.#view.showEmptyState('File does not exist in either version');
            this.#view.setDownloadButtonEnabled(false);
            return;
        }

        if (this.#versions.mrXml) {
            await this.#showMr();
        } else {
            await this.#showBranch();
        }

        // console.debug('making canvas visible...');
        this.#view.showCanvas();

        console.debug('ready!');
    }

    #init() {
        this.#params = new DifferParams(this.#rawParams);
        // The back navigation (FEAT-0005) calls the platform API to find callers.
        this.#params.requirePlatformInfo();

        this.#versions = new DiagramVersions(this.#params);
        this.#branchIndicator = new BranchIndicator(
            this.#params.targetLabel, this.#params.sourceLabel, !!this.#params.localFileContent);
        this.#viewport = new DmnTableViewport();
        this.#xmlComparator = new DmnXmlComparator();
        this.#diffPainter = new DmnDiffPainter();
        // FEAT-0005: reverse search for the BPMN files whose Business Rule Task
        // calls this decision (decisionRef="<id>"), for the back navigation.
        this.#decisionCallerLocator = new DecisionCallerLocator(
            this.#params.platform.projectUrl,
            this.#params.platform.hostUrl,
            this.#params.platform.projectId
        );
        // Shared opener-tab navigation (open a nested differ, step back up).
        this.#tabNavigator = new DifferTabNavigator();
        // Register this tab in the cross-tab registry so any other tab navigating
        // to the same DMN decision reuses it instead of opening a duplicate
        // (BUG-0017; e.g. a BPMN Business Rule Task → DMN, FEAT-0005).
        this.#tabNavigator.registerTab(this.#params.identityKey());
        this.#view = new DmnDifferView(this.#params, this.#branchIndicator, this.#viewport, {
            onDownload: () => this.#downloadShownBranchFile(),
            onSwitchBranch: () => this.#switchBranch()
        });
        // Update notification (FEAT-0012): info comes raw in params from the
        // content script (which read it from the service worker's state).
        this.#view.setUpdateInfo(this.#rawParams.updateInfo);

        // Back navigation (FEAT-0005, the DMN direction of FEAT-0023): dive out to
        // the diagram we came from, plus a picker of any BPMN diagram that calls
        // this decision (reverse blob-search, lazy). Stepping up to a caller asks
        // it to auto-select the Business Rule Task that calls one of our decisions.
        this.#backNavigator = new BackNavigator({
            callerLocator: this.#decisionCallerLocator,
            divedInFrom: this.#params.divedInFrom,
            getProcessIdsFunc: () => this.#getCurrentDecisionIds(),
            getCurrentRefFunc: () => this.#getShownRef(),
            currentFilePath: this.#params.filePath,
            onDiveOutToOpener: () => this.#diveOutToOpener(),
            onOpenCaller: (filePath, fileName) => this.#diveOutToCallerDiffer(filePath, fileName),
            onOpenUrl: (url) => window.open(url, '_blank')
        });
        this.#view.setBackNavigator(this.#backNavigator);
    }

    async #loadVersions() {
        console.debug('loading branch dmn xml...');
        await this.#versions.loadBranchXml();

        if (this.#params.sourceRef) {
            console.debug('loading mr dmn xml...');
            await this.#versions.loadMrXml();
        } else if (this.#params.localFileContent) {
            console.debug('using local file context as mr');
            this.#versions.useLocalFileContentAsMr();
        } else {
            console.debug('mr commit id is undefined');
        }

        if (!this.#versions.branchXml && !this.#versions.mrXml) {
            console.error(
                'dmn file is unavailable in both versions;',
                `target branch url: ${this.#params.rawFileUrl(this.#params.targetRef)};`,
                `mr url: ${this.#params.sourceRef ? this.#params.rawFileUrl(this.#params.sourceRef) : '<no sourceRef>'}`
            );
        }
    }

    #downloadShownBranchFile() {
        if (this.#branchIndicator.isTargetBranchShown()) {
            this.#versions.download(this.#versions.branchXml, this.#params.targetLabel, this.#params.targetFileName);
        } else {
            this.#versions.download(this.#versions.mrXml, this.#params.sourceLabel, this.#params.fileName);
        }
    }

    #switchBranch() {
        if (this.#branchIndicator.isTargetBranchShown()) { // Current branch - switch to MR
            if (this.#versions.mrXml) {
                this.#showMr();
            } else {
                // File is absent in the MR/source version (deleted in this MR)
                this.#showAbsentSide(false);
            }
        } else { // Current MR - try to switch to branch
            if (this.#versions.branchXml) {
                this.#showBranch();
            } else {
                // File is absent in the target version (new file in this MR)
                this.#showAbsentSide(true);
            }
        }
    }

    // Switches to a side where the file does not exist: marks the absence in the
    // branch label and covers the canvas with a blank placeholder (dmn-js has no
    // clear()), keeping the toolbar usable to switch back (UX-0003).
    #showAbsentSide(targetSide) {
        this.#view.setShownFile(this.#shownFileFor(targetSide));
        this.#branchIndicator.setAbsentLabel(targetSide);
        this.#view.showEmptyState('');
        this.#view.setDownloadButtonEnabled(false);
    }

    async #showMr() {
        console.debug('showing mr dmn xml file...');
        const mrXml = requireDefined(this.#versions.mrXml, 'mrDmnXml');
        await this.#showXml(mrXml);
        this.#view.setShownFile(this.#shownFileFor(false));
        this.#branchIndicator.setShownLabel(this.#params.sourceLabel);

        if (this.#versions.branchXml) {
            this.#highlightDiffs(mrXml, this.#versions.branchXml, DiffType.ADD);
        } else {
            console.debug('file not exists in target branch');
        }
    }

    async #showBranch() {
        console.debug('showing branch dmn xml file...');
        const branchXml = requireDefined(this.#versions.branchXml, 'branchDmnXml');
        await this.#showXml(branchXml);
        this.#view.setShownFile(this.#shownFileFor(true));
        this.#branchIndicator.setShownLabel(this.#params.targetLabel);

        if (this.#versions.mrXml) {
            this.#highlightDiffs(branchXml, this.#versions.mrXml, DiffType.REMOVE);
        } else {
            console.debug('file not exists in MR branch');
        }
    }

    async #showXml(dmnXml) {
        // This side has a diagram/file — hide the absent-side placeholder and
        // re-enable Download (disabled while an absent side is shown).
        this.#view.hideEmptyState();
        this.#view.setDownloadButtonEnabled(true);

        const scrollTop = this.#viewport.scrollTop;
        // console.debug('scroll top: ' + scrollTop);

        this.#viewport.reset();
        try {
            // replace xmlns because the viewer dont want to show the old versions of dmn
            const fixedXml = dmnXml.replace(DmnDiffer.OLD_VERSION_XMLNS, DmnDiffer.NEW_VERSION_XMLNS);
            const result = await this.#dmnJS.importXML(fixedXml);
            // const { warnings } = result;
            // console.debug('dmn schema loaded succesfully', warnings);
        } catch (err) {
            console.error('dmn loading error', err);
            return;
        }
        this.#switchToViewTableMode();
        this.#hidePoweredByLabel();
        this.#viewport.fit();
        this.#viewport.scrollTop = scrollTop;
    }

    #highlightDiffs(myXml, otherXml, diffTypeForMissing) {
        // console.debug('highlight diffs...');
        const diff = this.#xmlComparator.compare(myXml, otherXml);
        this.#diffPainter.paint(diff, diffTypeForMissing);
    }

    // Header file descriptor for a side (FEAT-0026): its path + display name plus
    // the GitLab blob URL built from that side's ref, so the clickable path opens
    // the file in the exact shown version. A side with no repo ref (local file
    // used as the source), or where the file is absent (new/deleted in the MR),
    // yields url:null → an inactive, non-link path (the blob URL would 404 there).
    #shownFileFor(targetSide) {
        const ref = targetSide ? this.#params.targetRef : this.#params.sourceRef;
        const path = targetSide ? this.#params.targetFilePath : this.#params.filePath;
        const fileName = targetSide ? this.#params.targetFileName : this.#params.fileName;
        const exists = targetSide ? this.#versions.branchXml : this.#versions.mrXml;
        return { path, fileName, url: ref && exists ? this.#params.blobFileUrl(ref, path) : null };
    }

    // Commit/ref of the decision version currently shown (for resolving the BPMN
    // files that call this decision, FEAT-0005).
    #getShownRef() {
        return this.#branchIndicator.isTargetBranchShown()
            ? this.#params.targetRef
            : this.#params.sourceRef;
    }

    // The DMN XML of the version currently shown.
    #getShownXml() {
        return this.#branchIndicator.isTargetBranchShown()
            ? this.#versions.branchXml
            : this.#versions.mrXml;
    }

    // Decision ids defined by the DMN currently shown — the ids a Business Rule
    // Task in a BPMN file would reference (decisionRef), so the reverse search can
    // find this decision's callers (FEAT-0005). Read from the shown XML rather
    // than the viewer (which renders only the first decision, see DmnXmlComparator).
    #getCurrentDecisionIds() {
        const xml = this.#getShownXml();
        if (!xml) {
            return [];
        }
        try {
            const doc = parseXml(xml);
            return Array.from(doc.getElementsByTagName('decision'))
                .map((node) => node.getAttribute('id'))
                .filter(Boolean);
        } catch (error) {
            console.warn('cannot read decision ids from the current dmn', error);
            return [];
        }
    }

    // Opens another diagram's differ in a new tab, carrying the platform/refs plus
    // the navigation hints in `extra`. The differ kind is chosen by extension, so
    // stepping up to a BPMN caller opens the BPMN differ (FEAT-0005). If that
    // diagram is already open in any tab, reuse it instead of opening a duplicate
    // (BUG-0017).
    async #openDifferForFile(filePath, fileName, extra) {
        const identityKey = DifferParams.identityKeyFor(this.#params, filePath);
        if (await this.#tabNavigator.focusExistingDifferTab(identityKey)) {
            return;
        }
        const params = this.#params.toNestedDifferParams(filePath, fileName, extra);
        await this.#tabNavigator.openNestedDiffer(params, fileName);
    }

    // Dive OUT (up): open a calling BPMN diagram, asking it to auto-select the
    // Business Rule Task from which it calls this decision — so the call site is
    // highlighted (the BPMN side matches by decisionRef, FEAT-0005).
    #diveOutToCallerDiffer(filePath, fileName) {
        return this.#openDifferForFile(filePath, fileName, {
            selectCalledProcessIds: this.#getCurrentDecisionIds()
        });
    }

    // Dive out to the diagram we dived in FROM (FEAT-0023): its tab is still open
    // and untouched, so its state is preserved for free; we just bring it to the
    // front and close this tab. If that tab was already closed, reopen it as a
    // caller (up) instead.
    #diveOutToOpener() {
        if (this.#tabNavigator.focusOpenerAndClose()) {
            return;
        }
        if (this.#params.divedInFrom) {
            this.#diveOutToCallerDiffer(
                this.#params.divedInFrom.filePath, this.#params.divedInFrom.fileName);
        }
    }

    #hidePoweredByLabel() {
        try {
            document.querySelector('.bjs-powered-by').style.display = 'none';
        } catch (error) {
            console.warn('powered by label not found', error);
        }
    }

    async #switchToViewTableMode() {
        const switchToTableButton = document.querySelector('.dmn-icon-decision-table');
        if (switchToTableButton) {
            switchToTableButton.click();
        }

        const viewDrdButton = await doWithAttempts(function () {
            return document.querySelector('.view-drd');
        }, 2, 50);
        if (viewDrdButton) {
            viewDrdButton.style.display = 'none';
        }
    }
}

function main() {
    appendTimeToConsoleLogs();

    window.addEventListener('message', async function (msg) {
        // console.debug('message received', msg);
        if (msg.origin !== window.origin || msg.data.id !== DmnDiffer.MSG_ID) {
            console.debug(`skip message: msg.origin = ${msg.origin}; msg.data.id = ${msg.data.id}`);
            return;
        }
        console.debug('showing dmn differ...');
        await new DmnDiffer(msg.data.params).show();
    });
}

main();
