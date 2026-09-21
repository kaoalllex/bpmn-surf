// Orchestrates the BPMN differ page: wires the view, the bpmn-js modeler,
// the diagram versions and the diff highlighting together
class BpmnDiffer {
    static MSG_ID = 'msg_bpmn_71e23e639965407fb9c87f100a56c898';

    // BUG-0011: the differ renders BPMN through the full BpmnJS Modeler (needed by
    // diff highlighting via `modeling.setColor` and the properties panel), so it
    // stays editable unless we veto the edit interactions. These are the cancelable
    // bpmn-js events; a high-priority listener returning false aborts the action
    // before the default editing handlers run. Viewing (click/selection, hover,
    // overlays, zoom/pan) is untouched.
    //
    // BUG-0015: `element.dblclick`/`directEditing.activate` are deliberately NOT
    // vetoed — double-click opens the contenteditable label overlay, the only way
    // to select & copy a label/comment text on the canvas. The overlay's edits are
    // blocked separately via a `beforeinput` veto (see show()), keeping it read-only
    // while preserving copy.
    static EDIT_EVENTS = [
        'shape.move.start', 'bendpoint.move.start', 'connectionSegment.move.start',
        'resize.start', 'connect.start', 'global-connect.start'
    ];

    // FEAT-0023: re-asserting the dive-out auto-selection until the properties
    // panel (which subscribes to selection.changed only after its async mount)
    // reflects it. Bounded so a panel that never confirms cannot loop forever.
    static PANEL_SELECT_MAX_ATTEMPTS = 15;
    static PANEL_SELECT_RETRY_MS = 120;

    #rawParams;
    #params = null;
    #platformClient = null;
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
    #propertiesGroupExpander = null;
    #processFileIndex = null;
    #callActivityLocator = null;
    #callActivityNavigator = null;
    #decisionLocator = null;
    #decisionNavigator = null;
    #callerLocator = null;
    #backNavigator = null;
    #tabNavigator = null;
    #handlerLocator = null;
    #handlerNavigator = null;
    #correlationLocator = null;
    #correlationNavigator = null;
    #elementSearcher = null;
    #searchPanel = null;
    #editSession = null;

    // platformClient (the differ-scope PlatformClient seam, REFAC-0004) is built
    // by the bootstrap main() and injected here — the orchestrator no longer
    // chooses the client, mirroring content-scope App + repo-provider-factory.
    constructor(rawParams, platformClient) {
        this.#rawParams = rawParams;
        this.#platformClient = platformClient;
    }

    async show() {
        console.debug('diff params:', describeDifferParams(this.#rawParams));
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
        this.#keepOutlinesRendered(bpmnJSEventBus, this.#bpmnJS.get('outline'));

        this.#viewport.setBpmnCanvas(bpmnJSCanvas);
        this.#diffHighlighter = new DiffHighlighter(bpmnJSCanvas, this.#elementRegistry, bpmnJSModeling);
        if (this.#changesTableView) {
            this.#changesTableView.init(this.#elementRegistry, this.#diffHighlighter);
        }
        this.#propertiesPanelHighlighter.init(this.#elementRegistry);
        this.#propertiesGroupExpander.init(this.#elementRegistry);
        this.#callActivityNavigator = new CallActivityNavigator(
            bpmnJSOverlays,
            this.#elementRegistry,
            this.#callActivityLocator,
            () => this.#selectedElementId,
            () => this.#getShownRef(),
            (processFilePath, processFileName) => this.#diveIntoCalledDiffer(processFilePath, processFileName),
            (url) => window.open(url, '_blank')
        );
        this.#decisionNavigator = new DecisionNavigator(
            bpmnJSOverlays,
            this.#elementRegistry,
            this.#decisionLocator,
            () => this.#selectedElementId,
            () => this.#getShownRef(),
            (decisionFilePath, decisionFileName) => this.#diveIntoCalledDiffer(decisionFilePath, decisionFileName),
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
            (url) => this.#tabNavigator.navigateOpenerTab(url)
        );
        this.#correlationNavigator = new CorrelationNavigator(
            bpmnJSOverlays,
            this.#elementRegistry,
            this.#correlationLocator,
            () => this.#selectedElementId,
            () => this.#getShownRef(),
            (url) => window.open(url, '_blank')
        );

        this.#elementSearcher = new ElementSearcher();
        this.#searchPanel = new SearchPanel(
            bpmnJSCanvas,
            this.#elementRegistry,
            this.#selection,
            this.#elementSearcher
        );
        this.#searchPanel.attach();

        if (this.#isEditMode()) {
            // No keyboard.bind() call: diagram-js binds Keyboard implicitly on
            // canvas.init (to the canvas SVG, which carries tabindex), so undo/redo,
            // Delete and copy/paste are live as soon as the canvas has focus. Passing
            // an explicit node is unsupported since diagram-js 15 and only logs an
            // error. Focus-scoped is what we want anyway: keystrokes in the
            // properties panel never reach the canvas bindings.
            // Mute 4 (palette + context pad) is CSS — see the body class below.
            document.body.classList.add('differ-edit-mode');
        } else {
            // BUG-0011: veto edit interactions on the canvas. High priority so the
            // veto fires before the default editing handlers; returning false aborts
            // the action so no command is created.
            bpmnJSEventBus.on(BpmnDiffer.EDIT_EVENTS, 2000, () => false);

            // BUG-0014: keep the panel's text fields (input/textarea) selectable and
            // copyable while still blocking edits. BUG-0011 disabled them via CSS
            // `pointer-events: none`, which also killed click/select/copy. Instead veto
            // value mutations with a delegated capture-phase `beforeinput` listener:
            // it cancels typing, delete, paste and drop, while Ctrl/Cmd+C and selection
            // never fire `beforeinput`, so copying keeps working. Delegating on the
            // stable panel container (preact re-renders `.bio-properties-panel` inside
            // it) survives re-renders without re-binding. Non-text controls (toggles,
            // buttons, select, contenteditable/FEEL) stay disabled via CSS — see styles.css.
            //
            // BUG-0015: keep canvas label/comment text selectable and copyable while
            // blocking edits. Double-click opens bpmn-js' contenteditable overlay
            // (.djs-direct-editing-content) — the only way to copy SVG label text — but
            // it must stay read-only. Same trick as the panel above: a delegated
            // capture-phase `beforeinput` veto cancels typing, delete, paste and drop,
            // while Ctrl/Cmd+C and selection never fire `beforeinput`, so copying keeps
            // working. Delegating on the stable canvas container survives the lazy
            // re-creation of the overlay without polling/MutationObserver.
            for (const containerId of [BpmnDifferView.PROPS_ID, BpmnDifferView.CANVAS_ID]) {
                const container = document.getElementById(containerId);
                if (container) {
                    container.addEventListener('beforeinput', (event) => event.preventDefault(), true);
                }
            }
        }

        bpmnJSEventBus.on('selection.changed', (event) => {
            if (event.newSelection.length !== 1) {
                // The panel now shows the root (or a multi-selection), so the id must
                // follow it: anything that later reads it — the edit recompute's
                // repaint, the navigators, the post-import re-select — would otherwise
                // act on an element the user no longer has selected, and paint the
                // previous element's groups into whatever panel is on screen.
                this.#selectedElementId = null;
                this.#propertiesPanelHighlighter.resetHighlighting();
                return;
            }
            this.#onSelectedElementChanged(event.newSelection[0].id);
        });

        this.#hideModelerPalleteAndPoweredByLabel();

        if (this.#isEditMode()) {
            this.#editSession = new EditSession({
                modeler: this.#bpmnJS,
                comparator: this.#xmlComparator,
                painter: new EditDiffPainter(bpmnJSCanvas, this.#elementRegistry),
                propertiesPanelHighlighter: this.#propertiesPanelHighlighter,
                onColoringPaused: (paused) => this.#view.setEditColoringPaused(paused),
                onDiffUpdated: () => this.#propertiesPanelHighlighter
                    .highlightDiffPropGroups(this.#selectedElementId)
            });

            // A manual colour changes which elements count as "explicitly coloured",
            // so the diff layer must be re-resolved — setColor is a command, so the
            // session's own commandStack.changed listener already does it.
            const colorControl = new EditColorControl(bpmnJSModeling, this.#selection);
            this.#view.editGroup.appendChild(colorControl.createElement());
            colorControl.registerContextPad(this.#bpmnJS.get('contextPad'));
            bpmnJSEventBus.on('selection.changed', (event) =>
                colorControl.setEnabled(event.newSelection.length > 0));

            // ↶/↷ mirror the stack, so they are honest about what they will do and
            // together they show whether the session has unsaved work.
            const commandStack = this.#bpmnJS.get('commandStack');
            bpmnJSEventBus.on('commandStack.changed', () =>
                this.#view.setHistoryEnabled(commandStack.canUndo(), commandStack.canRedo()));
        }

        await this.#loadVersions();

        if (!this.#versions.branchXml && !this.#versions.mrXml) {
            // File absent in both versions (BUG-0001): show a placeholder instead
            // of a blank page. The detailed error is logged by #loadVersions().
            this.#view.showEmptyState('File does not exist in either version');
            this.#view.setDownloadButtonEnabled(false);
            return;
        }

        // Kick off the changed-handler scan in the background instead of awaiting
        // it: on large MRs it fetches dozens of handler files and used to delay
        // the first render by seconds. The diagram renders immediately; the scan
        // refreshes the badges once it completes (see #loadChangedHandlers).
        this.#loadChangedHandlers();

        if (this.#isEditMode()) {
            // Only the edited side is imported; the other one still feeds colour
            // layer 3 (the MR diff) through #paintDiffs.
            if (this.#params.editSide === DifferParams.EDIT_SIDE_TARGET) {
                await this.#showBranch();
            } else {
                await this.#showMr();
            }
        } else if (this.#versions.mrXml) {
            await this.#showMr();
        } else {
            await this.#showBranch();
        }

        if (this.#editSession) {
            // The baseline must be taken from the freshly imported model, before the
            // user can touch anything.
            await this.#editSession.start();
        }

        // Show canvas after the differ is completely rendered
        this.#view.showCanvas();

        // Wait until the properties panel has mounted before the initial selection
        // below. BUG-0023: this used to also set the panel's `max-height` from its
        // offsetHeight here, but when the panel loads hidden (display:none, see
        // [BUG-0018]) that height is 0, producing `max-height: 0` that stays on the
        // scroll container and collapses the panel to empty when later shown.
        // Scrolling is owned by the panel cell's inner div ([BUG-0021]), so the
        // max-height was redundant when visible and harmful when hidden — dropped.
        await this.#awaitPropertiesPanelMounted();

        // Dive-out (FEAT-0023): if opened by stepping up to a caller, select the
        // Call Activity from which it calls the diagram we came from, so the call
        // site is highlighted (and its dive-in arrow is right there to go back).
        // Runs AFTER the properties panel has mounted (the await above waits for
        // its container): the panel renders the selection only from selection.changed
        // events it receives once subscribed, so selecting earlier — before its
        // async first mount — leaves the panel blank until the user clicks again.
        this.#applyInitialCallActivitySelection();

        if (this.#isEditMode()) {
            // Test seam (FEAT-0031): the e2e suite asserts the command stack is
            // untouched by our own painting. Edit mode only.
            window.__bpmnDifferModeler = this.#bpmnJS;
        }

        console.debug('ready!');
    }

    #init() {
        this.#params = new DifferParams(this.#rawParams);
        this.#params.requirePlatformInfo();

        this.#versions = new DiagramVersions(this.#params, this.#platformClient);
        this.#branchIndicator = new BranchIndicator(
            this.#params.targetLabel, this.#params.sourceLabel, !!this.#params.localFileContent);
        this.#xmlComparator = new BpmnXmlComparator();
        // ProcessFileIndex is kept only as the fallback path of CallActivityLocator
        // (full repository tree walk); the primary path is a targeted code search.
        // It stays GitLab-specific by design — the "doomed" fallback is not ported
        // to other platforms (REFAC-0004 / REFAC-0007), so it still reads the
        // platform descriptor's GitLab fields directly rather than the client.
        this.#processFileIndex = new ProcessFileIndex(
            this.#params.platform.projectUrl,
            this.#params.platform.hostUrl,
            this.#params.platform.projectId,
            this.#params.targetRef
        );
        this.#callActivityLocator = new CallActivityLocator(this.#platformClient, this.#processFileIndex);
        // FEAT-0005: resolve the DMN file called from a Business Rule Task
        // (decisionRef → defining .dmn) by a targeted code search; no fallback.
        this.#decisionLocator = new DecisionLocator(this.#platformClient);
        this.#callerLocator = new CallerLocator(this.#platformClient);
        // Shared opener-tab navigation (open a nested differ, step back to the
        // opener) used by both the dive-in and dive-out paths (FEAT-0005).
        this.#tabNavigator = new DifferTabNavigator();
        // Register this tab in the cross-tab registry so any other tab navigating
        // to the same diagram reuses it instead of opening a duplicate (BUG-0017).
        this.#tabNavigator.registerTab(this.#params.identityKey());
        this.#handlerLocator = new HandlerLocator(this.#platformClient);
        // FEAT-0027: locate where a message-catching element is woken up in code,
        // by the message name (correlateMessage / publishMessage).
        this.#correlationLocator = new CorrelationLocator(this.#platformClient);
        this.#propertiesPanelHighlighter = new PropertiesPanelHighlighter(
            new ConditionFormatter(),
            // In edit mode the panel always shows the newer version: the diff is the
            // user's own edits against the baseline taken at import, so an entry that
            // exists only here was added, whichever side is being edited.
            () => !this.#isEditMode() && this.#branchIndicator.isTargetBranchShown()
        );
        // FEAT-0029: auto-expand the property groups relevant to the selected element.
        this.#propertiesGroupExpander = new PropertiesGroupExpander();
        this.#view = new BpmnDifferView(this.#params, this.#branchIndicator, {
            onDownload: () => this.#isEditMode()
                ? this.#downloadEditedFile()
                : this.#downloadShownBranchFile(),
            onSwitchBranch: () => this.#switchBranch(),
            onToggleHighlight: () => this.#toggleHighlight(),
            onOpenEditor: () => this.#openEditor(),
            onFeedback: () => this.#openFeedbackIssue(),
            onUndo: () => this.#bpmnJS.get('commandStack').undo(),
            onRedo: () => this.#bpmnJS.get('commandStack').redo(),
            onToggleEditColoring: () => this.#editSession.setColoringEnabled(
                !this.#editSession.coloringEnabled)
        });
        // Back navigation (FEAT-0023): default back to where we came from, plus a
        // picker of any diagram that calls this one (reverse blob-search, lazy).
        this.#backNavigator = new BackNavigator({
            callerLocator: this.#callerLocator,
            divedInFrom: this.#params.divedInFrom,
            getProcessIdsFunc: () => this.#getCurrentProcessIds(),
            getCurrentRefFunc: () => this.#getShownRef(),
            currentFilePath: this.#params.filePath,
            onDiveOutToOpener: () => this.#diveOutToOpener(),
            onOpenCaller: (filePath, fileName) => this.#diveOutToCallerDiffer(filePath, fileName),
            onOpenUrl: (url) => window.open(url, '_blank')
        });
        this.#view.setBackNavigator(this.#backNavigator);
    }

    // Every outline-based marker we paint (the ☼ diff highlight, search matches,
    // the edit-mode diff) is styled through the .djs-outline child of the element.
    // Since the diagram-js 15.17 → 15.24 bump (bpmn-js 18.25) that child is created
    // lazily, only when an element is hovered or selected, so the markers landed on
    // elements that had nothing to style and the user saw no effect (BUG-0030).
    // Restore the eager creation diagram-js did on render until then.
    #keepOutlinesRendered(eventBus, outline) {
        eventBus.on(['shape.added', 'connection.added'], ({ element }) => {
            if (element.parent) {
                outline.createOutline(element);
            }
        });
    }

    #createModeler() {
        return new BpmnJS({
            container: '#' + BpmnDifferView.CANVAS_ID,
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
                `target branch url: ${this.#platformClient.rawFileUrl(this.#params.targetRef, this.#params.filePath)};`,
                `mr url: ${this.#params.sourceRef ? this.#platformClient.rawFileUrl(this.#params.sourceRef, this.#params.filePath) : '<no sourceRef>'}`
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

    // FEAT-0031: export the edited model and re-apply the diff colours onto the
    // XML string. They are not in the model on purpose (see EditDiffPainter), so
    // this is where they enter the file — and where the "colour the edits" toggle
    // decides whether they do, since it governs the very map used here.
    async #downloadEditedFile() {
        const xml = await this.#editSession.currentXml();
        const colored = EditXmlColorizer.apply(xml, this.#editSession.currentColorMap());
        // The edited side names the download: target keeps its own (possibly
        // renamed, BUG-0002) name, mirroring #downloadShownBranchFile.
        const editedFileName = this.#params.editSide === DifferParams.EDIT_SIDE_TARGET
            ? this.#params.targetFileName
            : this.#params.fileName;
        downloadTextFile(colored, EditSession.editedFileName(editedFileName));
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

    // Switches to a side where the file does not exist: empties the canvas,
    // marks the absence in the branch label and drops the now-meaningless diff
    // highlight, table and selection (UX-0003). The highlight state itself is
    // kept so it re-applies when switching back to the side that has a diagram.
    #showAbsentSide(targetSide) {
        this.#bpmnJS.clear();
        this.#selectedElementId = null;
        this.#view.setShownFile(this.#shownFileFor(targetSide));
        this.#branchIndicator.setAbsentLabel(targetSide);
        this.#diffHighlighter.setDiffElementIds([]);
        if (this.#changesTableView) {
            this.#changesTableView.clear();
        }
        this.#view.setHighlightButtonEnabled(false);
        this.#view.setDownloadButtonEnabled(false);
        this.#view.setEditButtonEnabled(false);
    }

    #toggleHighlight() {
        this.#diffHighlighter.setEnabled(!this.#diffHighlighter.enabled);
        return this.#diffHighlighter.enabled;
    }

    async #showBranch() {
        console.debug('showing branch bpmn xml file...');
        const branchXml = requireDefined(this.#versions.branchXml, 'branchBpmnXml');
        // Publish the diff to the properties-panel highlighter BEFORE importing.
        // #showXml re-selects the element, firing selection.changed → panel
        // highlight; it must read the current direction's diff data, not the
        // previously shown one (BUG-0011 — switching branches dropped list-entry
        // colors because the highlight ran against the stale, opposite direction).
        const diff = this.#versions.mrXml
            ? this.#prepareDiffData(branchXml, this.#versions.mrXml)
            : null;

        await this.#showXml(branchXml);
        this.#view.setShownFile(this.#shownFileFor(true));
        this.#branchIndicator.setShownLabel(this.#params.targetLabel);

        if (diff) {
            this.#paintDiffs(diff, DiffType.REMOVE);
        } else {
            console.debug('file not exists in MR branch');
        }
    }

    async #showMr() {
        console.debug('showing mr bpmn xml file...');
        const mrXml = requireDefined(this.#versions.mrXml, 'mrBpmnXml');
        // See #showBranch: set the diff data before the import-time re-selection
        // so the panel highlight uses the current direction (BUG-0011).
        const diff = this.#versions.branchXml
            ? this.#prepareDiffData(mrXml, this.#versions.branchXml)
            : null;

        await this.#showXml(mrXml);
        this.#view.setShownFile(this.#shownFileFor(false));
        this.#branchIndicator.setShownLabel(this.#params.sourceLabel);

        if (diff) {
            this.#paintDiffs(diff, DiffType.ADD);
        } else {
            console.debug('file not exists in target branch');
        }
    }

    async #showXml(bpmnXml) {
        // This side has a diagram/file — re-enable Download, and re-enable the
        // Highlight button only when there is a source version to diff against
        // (BUG-0025: in branch-only mode there is no diff, so ☼ stays disabled —
        // matching how the view constructs it, which #showXml used to override).
        this.#view.setHighlightButtonEnabled(this.#params.isSourceVersionDefined());
        this.#view.setDownloadButtonEnabled(true);
        this.#view.setEditButtonEnabled(true);

        const currentSelectedElemId = this.#getCurrentSelectedElementId();

        await this.#importXml(bpmnXml);

        // The elementRegistry is recreated on every import, so re-index the
        // freshly shown version for the search panel.
        this.#searchPanel.rebuildIndex();

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

    // Computes the diff and publishes the properties-panel diff data. Split from
    // the canvas/table painting (#paintDiffs) so it can run before the import: the
    // import re-selects the element and the resulting panel highlight must see the
    // current direction's data (BUG-0011).
    #prepareDiffData(myXml, otherXml) {
        const diff = this.#xmlComparator.compare(myXml, otherXml);
        // console.debug('diff result', diff);

        this.#propertiesPanelHighlighter.setDiffData(
            diff.nodeIdToDiffsMap, diff.nodeIdToConditions, diff.nodeIdToMappingChanges,
            diff.typeChangedIds);
        this.#propertiesGroupExpander.setDiffData(diff.nodeIdToDiffsMap);
        return diff;
    }

    // Paints the diff onto the (already imported) canvas and fills the changes table.
    #paintDiffs(diff, diffTypeForMissing) {
        if (this.#editSession) {
            // FEAT-0031: in edit mode the MR diff becomes colour layer 3, painted as
            // markers. Nothing below may run here: DiffHighlighter.paint is
            // modeling.setColor (it would poison the undo stack and the dirty flag)
            // and there is no changes table to fill.
            this.#editSession.setMrDiff(diff, diffTypeForMissing);
            return;
        }
        this.#diffHighlighter.setDiffElementIds([
            ...diff.missingShapeIds, ...diff.missingRowIds,
            ...diff.changedShapeIds, ...diff.changedRowIds
        ]);

        this.#diffHighlighter.paint(diffTypeForMissing, diff.missingShapeIds, diff.missingRowIds);
        this.#diffHighlighter.paint(DiffType.CHANGE, diff.changedShapeIds, diff.changedRowIds);

        // FEAT-0031: edit mode renders no changes table (see BpmnDifferView#build),
        // but the canvas colouring above must still run — it is colour layer 3.
        if (this.#changesTableView) {
            this.#changesTableView.fill(
                diff.processNode,
                diffTypeForMissing,
                diff.missingShapeIds,
                diff.missingRowIds,
                diff.changedShapeIds,
                diff.changedRowIds
            );
        }

        this.#diffHighlighter.applyIfEnabled();
    }

    async #onSelectedElementChanged(elemId) {
        this.#selectedElementId = elemId.replace(/_label$/, "");
        if (!this.#selectedElementId) {
            return;
        }
        this.#propertiesPanelHighlighter.highlightDiffPropGroups(this.#selectedElementId);
        if (!this.#isEditMode()) {
            // The formatted block replaces the native condition field, which in edit
            // mode is the only place the condition can be changed. The Condition group
            // header still turns blue when the user edits it.
            this.#propertiesPanelHighlighter.showConditionExpression(this.#selectedElementId);
        }
        this.#propertiesGroupExpander.expandRelevantGroups(this.#selectedElementId);
        this.#callActivityNavigator.showDiveInOverlay();
        this.#decisionNavigator.showDiveInOverlay();
        this.#handlerNavigator.showOverlayForSelectedElement();
        this.#correlationNavigator.showOverlayForSelectedElement();
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
            // This scan runs in the background, so the diagram may already be
            // rendered with no badges; refresh them now that the handlers are
            // known. (A still-pending import will re-add them itself via #showXml.)
            this.#handlerNavigator.refreshChangedBadges();
        } catch (error) {
            console.warn('cannot determine changed handlers', error);
        }
    }

    // Header file descriptor for a side (FEAT-0026): its path + display name plus
    // the GitLab blob URL built from that side's ref, so the clickable path opens
    // the file in the exact shown version. A side with no repo ref (local file
    // used as the source), or where the file is absent (new/deleted in the MR),
    // yields url:null → an inactive, non-link path (the blob URL would 404 there).
    // FEAT-0024: open a GitHub issue prefilled with this diff's context and the
    // tail of this tab's console. Nothing is sent — the user sees the whole body
    // in GitHub's own form and edits or abandons it there.
    #openFeedbackIssue() {
        const url = FeedbackReport.buildUrl(FEEDBACK_URL, {
            extensionVersion: this.#params.extensionVersion,
            platformKind: this.#params.platform.kind,
            hostUrl: this.#params.platform.hostUrl,
            changeRequestId: this.#params.changeRequestId,
            fileName: this.#params.fileName,
            fileType: 'BPMN',
            sourceLabel: this.#params.sourceLabel,
            sourceUrl: this.#shownFileFor(false).url,
            targetLabel: this.#params.targetLabel,
            targetUrl: this.#shownFileFor(true).url
        }, getConsoleLogTail());
        window.open(url, '_blank', 'noopener');
    }

    #shownFileFor(targetSide) {
        const ref = targetSide ? this.#params.targetRef : this.#params.sourceRef;
        const path = targetSide ? this.#params.targetFilePath : this.#params.filePath;
        const fileName = targetSide ? this.#params.targetFileName : this.#params.fileName;
        const exists = targetSide ? this.#versions.branchXml : this.#versions.mrXml;
        return { path, fileName, url: ref && exists ? this.#platformClient.blobFileUrl(ref, path) : null };
    }

    // Commit/ref of the diagram version currently shown (for opening handler code
    // and for resolving a Call Activity's called process file).
    #getShownRef() {
        return this.#branchIndicator.isTargetBranchShown()
            ? this.#params.targetRef
            : this.#params.sourceRef;
    }

    // FEAT-0031: edit mode lifts the BUG-0011/0014/0015 mutes for THIS tab only.
    #isEditMode() {
        return this.#params.mode === DifferParams.MODE_EDIT;
    }

    // FEAT-0031: open THIS diagram, in the version currently on screen, in an edit
    // tab. A second press focuses the editor that is already open (BUG-0017
    // machinery) rather than starting a second session over the same baseline.
    async #openEditor() {
        const editSide = this.#branchIndicator.isTargetBranchShown()
            ? DifferParams.EDIT_SIDE_TARGET
            : DifferParams.EDIT_SIDE_SOURCE;
        if (await this.#tabNavigator.focusExistingDifferTab(this.#params.editIdentityKey(editSide))) {
            return;
        }
        await this.#tabNavigator.openNestedDiffer(
            this.#params.toEditDifferParams(editSide), this.#params.fileName);
    }

    // Opens another diagram's differ in a new tab, carrying the platform/refs
    // plus the FEAT-0023 navigation hints in `extra` (direction-specific). The
    // differ kind (BPMN vs DMN) is chosen by extension, so diving into a called
    // DMN decision opens the DMN differ (FEAT-0005).
    // If that diagram is already open in any tab, reuse it (BUG-0017): bring it to
    // the front instead of opening a duplicate — regardless of how the user got
    // there (diving in, stepping up to a caller, or a sibling tab). Only when no
    // such tab exists do we open a fresh one.
    async #openDifferForFile(filePath, fileName, extra) {
        // The key must be computed from the params the nested tab will actually
        // publish, not from this tab's own params: in edit mode this.#params
        // carries mode/editSide, but toNestedDifferParams() deliberately drops
        // them (the nested tab is a view tab) — computing from this.#params would
        // defeat the dedup for every dive-in/out and caller step taken from an
        // editor.
        const params = this.#params.toNestedDifferParams(filePath, fileName, extra);
        if (await this.#tabNavigator.focusExistingDifferTab(
                DifferParams.identityKeyFor(params, filePath))) {
            return;
        }
        await this.#tabNavigator.openNestedDiffer(params, fileName);
    }

    // Dive IN (down): open the called process file, recording THIS diagram as the
    // one we dived in from — so the called diagram can dive back out to it.
    #diveIntoCalledDiffer(filePath, fileName) {
        return this.#openDifferForFile(filePath, fileName, {
            divedInFrom: { filePath: this.#params.filePath, fileName: this.#params.fileName }
        });
    }

    // Dive OUT (up): open a calling diagram, asking it to auto-select the Call
    // Activity from which it calls this diagram — so the call site is highlighted.
    #diveOutToCallerDiffer(filePath, fileName) {
        return this.#openDifferForFile(filePath, fileName, {
            selectCalledProcessIds: this.#getCurrentProcessIds()
        });
    }

    // Dive out to the diagram we dived in FROM (FEAT-0023): its tab is still open
    // and untouched, so its state (viewport/selection — including the Call Activity
    // we dived from) is preserved for free; we just bring it to the front and close
    // this tab. If that tab was already closed, reopen it as a caller (up) instead.
    #diveOutToOpener() {
        if (this.#tabNavigator.focusOpenerAndClose()) {
            return;
        }
        if (this.#params.divedInFrom) {
            this.#diveOutToCallerDiffer(
                this.#params.divedInFrom.filePath, this.#params.divedInFrom.fileName);
        }
    }

    // Selects the call site for one of the given ids, when the page was opened by
    // diving out to a caller. The id namespace tells the direction apart without
    // colliding: a Call Activity's calledElement (a process id, FEAT-0023) or a
    // Business Rule Task's decisionRef (a decision id, FEAT-0005). Selecting drives
    // the properties panel and the dive-in overlay, so the call site is highlighted.
    #applyInitialCallActivitySelection() {
        const ids = this.#params.selectCalledProcessIds;
        if (!ids || ids.length === 0) {
            return;
        }
        const wanted = new Set(ids);
        const match = this.#elementRegistry.getAll().find((element) => {
            const businessObject = element.businessObject;
            if (!businessObject) {
                return false;
            }
            if (element.type === 'bpmn:CallActivity') {
                return wanted.has(businessObject.calledElement);
            }
            if (element.type === 'bpmn:BusinessRuleTask') {
                return wanted.has(businessObject.decisionRef);
            }
            return false;
        });
        if (!match) {
            return;
        }
        try {
            this.#bpmnJS.get('canvas').scrollToElement(match);
        } catch (error) {
            // Older canvas without scrollToElement, or element without bounds.
        }
        this.#selectIntoPropertiesPanel(match);
    }

    // Selects an element AND makes sure the properties panel reflects it.
    //
    // The bpmn-js properties panel subscribes to selection.changed only in a
    // post-mount effect, and after an import it shows the root regardless of the
    // canvas selection (it re-renders the root via root.added, fires no update of
    // its own). So a single early select() lands before the panel is listening
    // and is lost — the canvas shows the element selected while the panel still
    // shows the whole diagram, until the user clicks the element again.
    //
    // We can't observe when that effect subscribes, so we re-assert the selection
    // until the panel confirms (via propertiesPanel.updated) that it shows the
    // element — capped so we never loop forever, and abandoned if the user
    // selects something else meanwhile. Selecting an already-selected element
    // fires no event, so we clear first to force a fresh selection.changed.
    #selectIntoPropertiesPanel(match) {
        const eventBus = this.#bpmnJS.get('eventBus');
        let settled = false;
        let attempts = 0;

        const onPanelUpdated = (event) => {
            if (event && event.element && event.element.id === match.id) {
                settled = true;
                eventBus.off('propertiesPanel.updated', onPanelUpdated);
            }
        };
        eventBus.on('propertiesPanel.updated', onPanelUpdated);

        const assertSelection = () => {
            if (settled) {
                return;
            }
            // The user moved on, or we have tried long enough — give up quietly.
            if (attempts > 0 && this.#getCurrentSelectedElementId() !== match.id) {
                eventBus.off('propertiesPanel.updated', onPanelUpdated);
                return;
            }
            if (attempts >= BpmnDiffer.PANEL_SELECT_MAX_ATTEMPTS) {
                eventBus.off('propertiesPanel.updated', onPanelUpdated);
                return;
            }
            attempts++;
            try {
                if (this.#getCurrentSelectedElementId() === match.id) {
                    this.#selection.select(null);
                }
                this.#selection.select(match);
            } catch (error) {
                console.warn('cannot select the call activity', error);
            }
            setTimeout(assertSelection, BpmnDiffer.PANEL_SELECT_RETRY_MS);
        };
        assertSelection();
    }

    // Process ids defined by the diagram currently rendered — the ids a Call
    // Activity in another file would reference (calledElement), so the reverse
    // search can find this diagram's callers (FEAT-0023). Read lazily (after
    // import), since the modeler is created during show().
    #getCurrentProcessIds() {
        try {
            const definitions = this.#bpmnJS.getDefinitions();
            if (!definitions || !definitions.rootElements) {
                return [];
            }
            return definitions.rootElements
                .filter((element) => element.$type === 'bpmn:Process' && element.id)
                .map((element) => element.id);
        } catch (error) {
            console.warn('cannot read process ids from the current diagram', error);
            return [];
        }
    }

    #hideModelerPalleteAndPoweredByLabel() {
        if (!this.#isEditMode()) {
            try {
                document.getElementsByClassName('djs-palette')[0].style.display = 'none';
            } catch (error) {
                console.warn('modeler pallete not found', error);
            }
        }
        // BUG-0011: the context-pad (edit-only actions, vetoed via EDIT_EVENTS) is
        // created lazily on first selection, so it is hidden via CSS (.djs-context-pad)
        // rather than here — see styles.css. FEAT-0031 re-shows it via the
        // .differ-edit-mode body class.
    }

    // Polls until the bpmn-js properties panel has mounted its scroll container, so
    // callers that select an element right after (the FEAT-0023 dive-out selection)
    // render into a live panel instead of a not-yet-mounted one. The container is
    // in the DOM even when the panel loads hidden, so this resolves regardless of
    // the panel's visibility.
    async #awaitPropertiesPanelMounted() {
        const panelContainer = await doWithAttempts(function () {
            return document.querySelector('.bio-properties-panel-scroll-container');
        });
        if (!panelContainer) {
            console.warn('cannot find properties panel container');
        }
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
        const rawParams = msg.data.params;
        const platformClient = createPlatformClient(rawParams.platform);
        await new BpmnDiffer(rawParams, platformClient).show();
    });
}

main();
