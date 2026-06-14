// Orchestrates the BPMN differ page: wires the view, the bpmn-js modeler,
// the diagram versions and the diff highlighting together
class BpmnDiffer {
    static MSG_ID = 'msg_bpmn_71e23e639965407fb9c87f100a56c898';

    #rawParams;
    #params = null;
    #versions = null;
    #branchIndicator = null;
    #view = null;

    #bpmnJS = null;
    #elementRegistry = null;
    #selection = null;
    #viewport = null;
    #selectedElementId = null;

    #xmlComparator = null;
    #diffHighlighter = null;
    #changesTableView = null;
    #propertiesPanelHighlighter = null;
    #processFileIndex = null;
    #callActivityLocator = null;
    #callActivityNavigator = null;
    #handlerLocator = null;
    #handlerNavigator = null;

    constructor(rawParams) {
        this.#rawParams = rawParams;
    }

    async show() {
        console.debug('diff params: ', this.#rawParams);
        this.#init();
        console.debug('init done');

        this.#view.build();
        // console.debug('bpmn div created');
        this.#viewport = this.#view.viewport;
        this.#changesTableView = this.#view.changesTableView;

        this.#bpmnJS = this.#createModeler();
        // console.debug('bpmn js created');

        const bpmnJSCanvas = this.#bpmnJS.get('canvas');
        this.#elementRegistry = this.#bpmnJS.get('elementRegistry');
        const bpmnJSModeling = this.#bpmnJS.get('modeling');
        this.#selection = this.#bpmnJS.get('selection');
        const bpmnJSEventBus = this.#bpmnJS.get('eventBus');
        const bpmnJSOverlays = this.#bpmnJS.get('overlays');

        this.#viewport.setBpmnCanvas(bpmnJSCanvas);
        this.#diffHighlighter = new DiffHighlighter(bpmnJSCanvas, this.#elementRegistry, bpmnJSModeling);
        if (this.#changesTableView) {
            this.#changesTableView.init(this.#elementRegistry, this.#diffHighlighter);
        }
        this.#propertiesPanelHighlighter.init(this.#elementRegistry);
        this.#callActivityNavigator = new CallActivityNavigator(
            bpmnJSOverlays,
            this.#elementRegistry,
            this.#callActivityLocator,
            () => this.#selectedElementId,
            () => this.#getShownRef(),
            (processFilePath, processFileName) => this.#openCallActivityDiffer(processFilePath, processFileName),
            (url) => window.open(url, '_blank')
        );
        this.#handlerNavigator = new HandlerNavigator(
            bpmnJSOverlays,
            this.#elementRegistry,
            this.#handlerLocator,
            this.#params.changeRequestId,
            () => this.#selectedElementId,
            () => this.#getShownRef(),
            (url) => window.open(url, '_blank'),
            (url) => this.#navigateOpenerTab(url)
        );

        bpmnJSEventBus.on('selection.changed', (event) => {
            if (event.newSelection.length !== 1) {
                return;
            }
            this.#onSelectedElementChanged(event.newSelection[0].id);
        });

        this.#hideModelerPalleteAndPoweredByLabel();

        await this.#loadVersions();

        if (!this.#versions.branchXml && !this.#versions.mrXml) {
            // Nothing to show; the detailed error has been logged by #loadVersions()
            return;
        }

        await this.#loadChangedHandlers();

        if (this.#versions.mrXml) {
            await this.#showMr();
        } else {
            await this.#showBranch();
        }

        // Show canvas after the differ is completely rendered
        this.#view.showCanvas();

        // Set max-height of the properties panel container to enable scrollbar display when needed
        await this.#setPropertiesPanelContainerMaxHeight();

        console.debug('ready!');
    }

    #init() {
        this.#params = new DifferParams(this.#rawParams);
        this.#params.requirePlatformInfo();

        this.#versions = new DiagramVersions(this.#params);
        this.#branchIndicator = new BranchIndicator(this.#params.targetRef, this.#params.sourceBranchName);
        this.#xmlComparator = new BpmnXmlComparator();
        // ProcessFileIndex is kept only as the fallback path of CallActivityLocator
        // (full repository tree walk); the primary path is a targeted blob-search.
        this.#processFileIndex = new ProcessFileIndex(
            this.#params.platform.projectUrl,
            this.#params.platform.hostUrl,
            this.#params.platform.projectId,
            this.#params.targetRef
        );
        this.#callActivityLocator = new CallActivityLocator(
            this.#params.platform.projectUrl,
            this.#params.platform.hostUrl,
            this.#params.platform.projectId,
            this.#processFileIndex
        );
        this.#handlerLocator = new ExternalTaskHandlerLocator(
            this.#params.platform.projectUrl,
            this.#params.platform.hostUrl,
            this.#params.platform.projectId
        );
        this.#propertiesPanelHighlighter = new PropertiesPanelHighlighter(
            new ConditionFormatter(),
            () => this.#branchIndicator.isTargetBranchShown()
        );
        this.#view = new BpmnDifferView(this.#params, this.#branchIndicator, {
            onDownload: () => this.#downloadShownBranchFile(),
            onSwitchBranch: () => this.#switchBranch(),
            onToggleHighlight: () => this.#toggleHighlight()
        });
    }

    #createModeler() {
        return new BpmnJS({
            container: '#' + BpmnDifferView.CANVAS_ID,
            keyboard: {
                bindTo: window
            },
            propertiesPanel: {
                parent: '#' + BpmnDifferView.PROPS_ID
            },
            additionalModules: [
                window.BpmnJSPropertiesPanel.BpmnPropertiesPanelModule,
                window.BpmnJSPropertiesPanel.BpmnPropertiesProviderModule,
                window.BpmnJSPropertiesPanel.CamundaPlatformPropertiesProviderModule,
            ],
            moddleExtensions: {
                camunda: this.#params.camundaBpmnModdle
            }
        });
    }

    async #loadVersions() {
        console.debug('loading branch bpmn xml...');
        await this.#versions.loadBranchXml();

        if (this.#params.sourceRef) {
            console.debug('loading mr bpmn xml...');
            await this.#versions.loadMrXml();
        } else if (this.#params.localFileContent) {
            console.debug('using local file context as mr');
            this.#versions.useLocalFileContentAsMr();
        } else {
            console.debug('mr commit id or localFileContent is undefined');
        }

        if (!this.#versions.branchXml && !this.#versions.mrXml) {
            console.error(
                'bpmn file is unavailable in both versions;',
                `target branch url: ${this.#params.rawFileUrl(this.#params.targetRef)};`,
                `mr url: ${this.#params.sourceRef ? this.#params.rawFileUrl(this.#params.sourceRef) : '<no sourceRef>'}`
            );
        }
    }

    #downloadShownBranchFile() {
        if (this.#branchIndicator.isTargetBranchShown()) {
            this.#versions.download(this.#versions.branchXml, this.#params.targetRef);
        } else {
            this.#versions.download(this.#versions.mrXml, this.#params.sourceBranchName);
        }
    }

    #switchBranch() {
        if (this.#branchIndicator.isTargetBranchShown()) { // Current branch - switch to MR
            if (this.#versions.mrXml) {
                this.#showMr();
            } else {
                // File may have been removed
                this.#versions.alertFileNotExistInBranch(this.#params.sourceBranchName);
            }
        } else { // Current MR - try to switch to branch
            if (this.#versions.branchXml) {
                this.#showBranch();
            } else {
                // File may be new
                this.#versions.alertFileNotExistInBranch(this.#params.targetRef);
            }
        }
    }

    #toggleHighlight() {
        this.#diffHighlighter.setEnabled(!this.#diffHighlighter.enabled);
        return this.#diffHighlighter.enabled;
    }

    async #showBranch() {
        console.debug('showing branch bpmn xml file...');
        const branchXml = requireDefined(this.#versions.branchXml, 'branchBpmnXml');
        await this.#showXml(branchXml);
        this.#branchIndicator.setBranchName(this.#params.targetRef);

        if (this.#versions.mrXml) {
            this.#highlightDiffs(branchXml, this.#versions.mrXml, DiffType.REMOVE);
        } else {
            console.debug('file not exists in MR branch');
        }
    }

    async #showMr() {
        console.debug('showing mr bpmn xml file...');
        const mrXml = requireDefined(this.#versions.mrXml, 'mrBpmnXml');
        await this.#showXml(mrXml);
        this.#branchIndicator.setBranchName(this.#params.sourceBranchName);

        if (this.#versions.branchXml) {
            this.#highlightDiffs(mrXml, this.#versions.branchXml, DiffType.ADD);
        } else {
            console.debug('file not exists in target branch');
        }
    }

    async #showXml(bpmnXml) {
        const currentSelectedElemId = this.#getCurrentSelectedElementId();

        await this.#importXml(bpmnXml);

        if (currentSelectedElemId) {
            this.#selectedElementId = currentSelectedElemId;
        }
        this.#selectElementById();

        // Overlays are dropped on import, so re-add the persistent "changed
        // handler" badges for the freshly imported diagram version.
        this.#handlerNavigator.refreshChangedBadges();
    }

    async #importXml(bpmnXml) {
        try {
            const result = await this.#bpmnJS.importXML(bpmnXml);
            // const { warnings } = result;
            // console.debug('bpmn schema loaded succesfully', warnings);
        } catch (err) {
            console.error('bpmn schema loading error', err);
            return;
        }

        this.#viewport.fit();
    }

    #getCurrentSelectedElementId() {
        const selectedItems = this.#selection.get();
        if (selectedItems.length !== 1) {
            return null;
        }
        return selectedItems[0].id;
    }

    #selectElementById() {
        if (!this.#selectedElementId) {
            return;
        }
        const elem = this.#elementRegistry.get(this.#selectedElementId);
        if (elem) {
            this.#selection.select(elem);
        }
    }

    #highlightDiffs(myXml, otherXml, diffTypeForMissing) {
        const diff = this.#xmlComparator.compare(myXml, otherXml);
        // console.debug('diff result', diff);

        this.#propertiesPanelHighlighter.setDiffData(diff.nodeIdToDiffsMap, diff.nodeIdToConditions);
        this.#diffHighlighter.setDiffElementIds([
            ...diff.missingShapeIds, ...diff.missingRowIds,
            ...diff.changedShapeIds, ...diff.changedRowIds
        ]);

        this.#diffHighlighter.paint(diffTypeForMissing, diff.missingShapeIds, diff.missingRowIds);
        this.#diffHighlighter.paint(DiffType.CHANGE, diff.changedShapeIds, diff.changedRowIds);

        this.#changesTableView.fill(
            diff.processNode,
            diffTypeForMissing,
            diff.missingShapeIds,
            diff.missingRowIds,
            diff.changedShapeIds,
            diff.changedRowIds
        );

        this.#diffHighlighter.applyIfEnabled();
    }

    async #onSelectedElementChanged(elemId) {
        this.#selectedElementId = elemId.replace(/_label$/, "");
        await this.#hideSchemaEditorControls();
        if (!this.#selectedElementId) {
            return;
        }
        this.#propertiesPanelHighlighter.highlightDiffPropGroups(this.#selectedElementId);
        this.#propertiesPanelHighlighter.showConditionExpression(this.#selectedElementId);
        this.#callActivityNavigator.showDiveInOverlay();
        this.#handlerNavigator.showOverlayForSelectedElement();
    }

    // Loads the handlers (topic -> file) changed in this MR.
    // Only meaningful in MR mode; branch-view leaves the map empty (the delegate
    // badge then only serves as a link to the handler code).
    async #loadChangedHandlers() {
        if (!this.#params.sourceRef || !this.#params.changeRequestId) {
            return;
        }
        try {
            const changedHandlers = await this.#handlerLocator.findChangedHandlers(
                this.#params.changeRequestId,
                this.#params.sourceRef,
                this.#params.targetRef
            );
            this.#handlerNavigator.setChangedHandlers(changedHandlers);
        } catch (error) {
            console.warn('cannot determine changed handlers', error);
        }
    }

    // Navigates the tab that opened this differ (the originating MR tab) to the
    // given URL and brings it to the foreground, so opening a handler's MR diff
    // returns to the already-open MR instead of spawning another tab. Returns
    // false when no such tab is available (then the caller falls back to a new tab).
    #navigateOpenerTab(url) {
        const opener = window.opener;
        if (!opener || opener.closed) {
            return false;
        }
        try {
            // opener.focus() alone does not reliably switch the active tab in
            // Chrome. Opening the URL with the opener's window name as the target
            // reuses that tab, navigates it AND brings it to the front. The name
            // is set transiently and restored, so GitLab's tab keeps its own
            // window.name (it survives the navigation as a browsing-context prop).
            const TARGET = 'gl-bpmn-diff-opener-tab';
            const prevName = opener.name;
            opener.name = TARGET;
            window.open(url, TARGET);
            opener.name = prevName;
        } catch (error) {
            // Cross-origin opener: cannot use the named-target trick; navigate
            // directly (the tab may not come to the front, but the URL opens).
            console.warn('cannot focus opener tab via named target; navigating directly', error);
            opener.location.href = url;
            opener.focus();
        }
        return true;
    }

    // Commit/ref of the diagram version currently shown (for opening handler code
    // and for resolving a Call Activity's called process file).
    #getShownRef() {
        return this.#branchIndicator.isTargetBranchShown()
            ? this.#params.targetRef
            : this.#params.sourceRef;
    }

    async #openCallActivityDiffer(processFilePath, processFileName) {
        const params = this.#params.toNestedDifferParams(processFilePath, processFileName);
        await openDiffer(
            params,
            null,
            BpmnDiffer.MSG_ID,
            // Find href in the head of this document
            // because chrome.runtime.getURL not working in this new tab
            (resourceName) => this.#getLinkOrScriptHref(resourceName)
        );
    }

    #getLinkOrScriptHref(resourceName) {
        for (const script of document.scripts) {
            if (script.src.endsWith(resourceName)) {
                return script.src;
            }
        }
        for (const styleSheet of document.styleSheets) {
            if (styleSheet.href.endsWith(resourceName)) {
                return styleSheet.href;
            }
        }
        console.error('cannot find url of link or style sheet: ' + resourceName);
        return null;
    }

    async #hideSchemaEditorControls() {
        document.querySelector('.djs-context-pad').style.display = 'none';
        // Sometimes controls appear with delay
        // so hide controls again after some delay
        await delay(100);
        document.querySelector('.djs-context-pad').style.display = 'none';
    }

    #hideModelerPalleteAndPoweredByLabel() {
        try {
            document.getElementsByClassName('djs-palette')[0].style.display = 'none';
        } catch (error) {
            console.warn('modeler pallete not found', error);
        }
        try {
            document.querySelector('.bjs-powered-by').style.display = 'none';
        } catch (error) {
            console.warn('powered by label not found', error);
        }
    }

    async #setPropertiesPanelContainerMaxHeight() {
        const panelContainer = await doWithAttempts(function () {
            return document.querySelector('.bio-properties-panel-scroll-container');
        });
        if (!panelContainer) {
            console.warn('cannot find properties panel container');
            return;
        }
        panelContainer.style.maxHeight = panelContainer.offsetHeight;
    }
}

function main() {
    appendTimeToConsoleLogs();

    window.addEventListener('message', async function (msg) {
        // console.debug('message received', msg);
        if (msg.origin !== window.origin || msg.data.id !== BpmnDiffer.MSG_ID) {
            console.debug(`skip message: msg.origin = ${msg.origin}; msg.data.id = ${msg.data.id}`);
            return;
        }
        console.debug('showing bpmn differ...');
        await new BpmnDiffer(msg.data.params).show();
    });
}

main();
