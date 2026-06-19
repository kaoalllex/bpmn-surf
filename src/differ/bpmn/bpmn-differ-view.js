// Builds the DOM of the BPMN differ page (layout, header, footer)
// and wires its buttons to the provided callbacks
class BpmnDifferView {
    static DIV_ID = 'bpmnDiv_12345bf3d4e842caa0d88194431197c0';
    static CANVAS_ID = 'bpmnCanvas_12345bf3d4e842caa0d88194431197c0';
    static PROPS_ID = 'bpmnProps_12345bf3d4e842caa0d88194431197c0';

    // GitLab's native button classes — kept so buttons match the host UI;
    // sizing/margins are layered on top via the .differ-btn* classes.
    static BTN_CLASS = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';

    // resizable properties panel (UX-0007)
    static PROPS_WIDTH_KEY = 'bpmnDiffer.propsWidth';
    static PROPS_MIN_WIDTH = 250;
    static PROPS_DEFAULT_WIDTH = 340;

    #params;
    #branchIndicator;
    #callbacks;

    #canvasCell = null;
    #propsCell = null;
    #splitterCell = null;
    #isPropsCellHidden = false;
    #viewport = null;
    #changesTableView = null;
    #downloadButton = null;
    #highlightButton = null;
    #fileNameSpan = null;
    #emptyState = null;
    #loadingOverlay = new DifferLoadingOverlay();
    #updateInfo = null;
    #backNavigator = null;

    // callbacks: { onDownload, onSwitchBranch, onToggleHighlight }
    constructor(params, branchIndicator, callbacks) {
        this.#params = params;
        this.#branchIndicator = branchIndicator;
        this.#callbacks = callbacks;
    }

    // Update notification info { updateAvailable, latestVersion, popupUrl } for
    // the toolbar indicator (FEAT-0012). Set before build(); null = no indicator.
    setUpdateInfo(updateInfo) {
        this.#updateInfo = updateInfo;
    }

    // Back-navigation control (FEAT-0023). Set before build(); null = no control.
    setBackNavigator(backNavigator) {
        this.#backNavigator = backNavigator;
    }

    get viewport() {
        return this.#viewport;
    }

    get changesTableView() {
        return this.#changesTableView;
    }

    // Upper bound for the properties panel width, relative to the window.
    static maxPanelWidth() {
        return Math.round(window.innerWidth * 0.8);
    }

    // Clamps a desired panel width into [min, max]. Pure (no DOM) — unit-tested.
    static clampPanelWidth(desired, min, max) {
        const ceil = Math.max(min, max);
        if (desired < min) return min;
        if (desired > ceil) return ceil;
        return desired;
    }

    build() {
        // Show the render spinner until the diagram is ready (showCanvas).
        this.#loadingOverlay.show('Loading the diagram…');

        const bpmnDiv = document.createElement('div');
        bpmnDiv.id = BpmnDifferView.DIV_ID;
        bpmnDiv.style.position = 'fixed';
        bpmnDiv.style.top = '0';
        bpmnDiv.style.left = '0';
        bpmnDiv.style.width = '100vw';
        bpmnDiv.style.height = '100vh';
        bpmnDiv.style.paddingRight = '20px';
        bpmnDiv.style.backgroundColor = 'rgba(255, 255, 255, 1)';

        bpmnDiv.style.zIndex = '9999';
        document.body.appendChild(bpmnDiv);

        const table = document.createElement('table');
        table.style.height = '100%';

        const row1 = document.createElement('tr');
        const row2 = document.createElement('tr');
        const row3 = document.createElement('tr');
        row2.style.height = '100%';
        table.appendChild(row1);
        table.appendChild(row2);
        table.appendChild(row3);
        bpmnDiv.appendChild(table);

        //--- header
        const headerCell = document.createElement('td');
        row1.appendChild(headerCell);
        this.#createHeader(headerCell);

        //--- canvas & props
        const canvasPropsTable = document.createElement('table');
        canvasPropsTable.style.height = '100%';
        row2.appendChild(canvasPropsTable);
        const tableCanvasPropsRow = document.createElement('tr');
        canvasPropsTable.appendChild(tableCanvasPropsRow);

        //--- canvas
        const canvasCell = document.createElement('td');
        canvasCell.id = BpmnDifferView.CANVAS_ID;
        canvasCell.style.height = '100%';
        // No explicit width: the canvas is the flexible cell and absorbs the
        // slack, so the properties cell's explicit width is honored (otherwise
        // a width:100% canvas would dilute it and the splitter wouldn't resize).
        canvasCell.style.visibility = 'hidden'; // Initially the canvas is hidden
        tableCanvasPropsRow.appendChild(canvasCell);
        this.#canvasCell = canvasCell;
        this.#viewport = new CanvasViewport(canvasCell);
        this.#emptyState = new DifferEmptyState(canvasCell);

        //--- splitter (drag to resize the properties panel)
        this.#splitterCell = document.createElement('td');
        this.#splitterCell.className = 'differ-splitter';
        this.#splitterCell.title = 'Drag to resize the properties panel';
        tableCanvasPropsRow.appendChild(this.#splitterCell);
        this.#wireSplitter();

        //--- properties
        this.#propsCell = document.createElement('td');
        this.#propsCell.id = BpmnDifferView.PROPS_ID;
        this.#propsCell.style.height = '100%';
        this.#propsCell.style.minWidth = BpmnDifferView.PROPS_MIN_WIDTH + 'px';
        this.#propsCell.style.width = BpmnDifferView.PROPS_DEFAULT_WIDTH + 'px';
        tableCanvasPropsRow.appendChild(this.#propsCell);
        this.#restorePropsWidth();

        //--- footer
        if (this.#params.isSourceVersionDefined()) {
            const footerCell = document.createElement('td');
            footerCell.setAttribute('align', 'right');
            row3.appendChild(footerCell);
            this.#createFooter(footerCell);
        }
    }

    showCanvas() {
        this.#canvasCell.style.visibility = 'visible';
        this.#loadingOverlay.hide();
    }

    // Shows a placeholder in the canvas area when the file is absent in both
    // versions (BUG-0001). The toolbar stays usable (Close/Download).
    showEmptyState(message) {
        this.#canvasCell.style.visibility = 'visible';
        this.#emptyState.show(message);
        this.#loadingOverlay.hide();
    }

    // Enables/disables the diff Highlight button — disabled on a side that has
    // no diagram to compare (UX-0003). Switch branch stays enabled.
    setHighlightButtonEnabled(enabled) {
        if (this.#highlightButton) {
            this.#highlightButton.disabled = !enabled;
        }
    }

    // Updates the file name shown in the header. The two sides can differ when
    // the file was renamed in the MR: target keeps the old name (BUG-0002).
    setFileName(fileName) {
        if (this.#fileNameSpan) {
            this.#fileNameSpan.textContent = fileName;
        }
    }

    // Enables/disables the Download button — disabled on a side with no file to
    // download (new/deleted schema, or absent in both versions) (UX-0003).
    setDownloadButtonEnabled(enabled) {
        if (this.#downloadButton) {
            this.#downloadButton.disabled = !enabled;
        }
    }

    // Restores the last drag-saved panel width (clamped to the current window).
    #restorePropsWidth() {
        const saved = parseInt(localStorage.getItem(BpmnDifferView.PROPS_WIDTH_KEY), 10);
        if (Number.isFinite(saved)) {
            const width = BpmnDifferView.clampPanelWidth(
                saved, BpmnDifferView.PROPS_MIN_WIDTH, BpmnDifferView.maxPanelWidth());
            this.#propsCell.style.width = width + 'px';
        }
    }

    // mousedown on the splitter → track mousemove on document → resize the
    // panel; mouseup ends the drag, persists the width and refits the canvas.
    #wireSplitter() {
        const onMove = (event) => {
            const desired = window.innerWidth - event.clientX;
            const width = BpmnDifferView.clampPanelWidth(
                desired, BpmnDifferView.PROPS_MIN_WIDTH, BpmnDifferView.maxPanelWidth());
            this.#propsCell.style.width = width + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            const width = parseInt(this.#propsCell.style.width, 10);
            if (Number.isFinite(width)) {
                localStorage.setItem(BpmnDifferView.PROPS_WIDTH_KEY, width);
            }
            this.#viewport.fit(true);
        };
        this.#splitterCell.addEventListener('mousedown', (event) => {
            event.preventDefault();
            // Drop any stale pair in case a previous mousedown never saw its
            // mouseup (e.g. another mouse button pressed mid-drag).
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    #group() {
        const group = document.createElement('div');
        group.className = 'differ-btn-group';
        return group;
    }

    // opts: { text, icon, title, danger, strong, minWidth, disabled, onClick }
    #button(opts) {
        const button = document.createElement('button');
        button.className = BpmnDifferView.BTN_CLASS + ' differ-btn'
            + (opts.icon ? ' differ-icon-btn' : '')
            + (opts.strong ? ' differ-btn-strong' : '')
            + (opts.danger ? ' differ-btn-danger' : '');
        button.textContent = opts.icon || opts.text;
        if (opts.title) {
            button.title = opts.title;
        }
        if (opts.minWidth) {
            button.style.minWidth = opts.minWidth + 'px';
        }
        if (opts.disabled) {
            button.disabled = true;
        }
        button.addEventListener('click', opts.onClick);
        return button;
    }

    #createHeader(parentElem) {
        const toolbar = document.createElement('div');
        toolbar.className = 'differ-toolbar';
        parentElem.appendChild(toolbar);

        //--- file group
        const fileGroup = this.#group();
        const fileLabel = document.createElement('span');
        fileLabel.className = 'differ-label';
        fileLabel.textContent = 'File:';
        fileGroup.appendChild(fileLabel);

        this.#fileNameSpan = document.createElement('span');
        this.#fileNameSpan.className = 'differ-file-name';
        this.#fileNameSpan.textContent = this.#params.fileName;
        fileGroup.appendChild(this.#fileNameSpan);

        this.#downloadButton = this.#button({
            icon: '↓', title: 'Download the file as shown for the current branch',
            onClick: () => this.#callbacks.onDownload()
        });
        fileGroup.appendChild(this.#downloadButton);
        toolbar.appendChild(fileGroup);

        //--- branch indicator group (left side)
        const branchGroup = this.#group();
        const branchLabel = document.createElement('span');
        branchLabel.className = 'differ-label';
        branchLabel.textContent = 'Branch:';
        branchGroup.appendChild(branchLabel);
        branchGroup.appendChild(this.#branchIndicator.createElement());
        toolbar.appendChild(branchGroup);

        //--- switch branch — own group, pinned to the right edge so it stays
        //    put regardless of the branch name length (the primary action)
        const switchGroup = this.#group();
        switchGroup.classList.add('differ-toolbar-spacer');
        switchGroup.appendChild(this.#button({
            text: 'Switch branch',
            strong: true,
            disabled: !this.#params.isSourceVersionDefined(),
            onClick: () => this.#callbacks.onSwitchBranch()
        }));
        toolbar.appendChild(switchGroup);

        //--- view group
        const viewGroup = this.#group();
        viewGroup.appendChild(this.#button({
            icon: '+', title: 'Zoom in',
            onClick: () => this.#viewport.zoomIn()
        }));
        viewGroup.appendChild(this.#button({
            icon: '−', title: 'Zoom out',
            onClick: () => this.#viewport.zoomOut()
        }));
        viewGroup.appendChild(this.#button({
            icon: '⤢', title: 'Fit view',
            onClick: () => this.#viewport.fit(true)
        }));

        const highlightButton = this.#button({
            icon: '☼',
            title: 'Turn diff highlight on',
            disabled: !this.#params.isSourceVersionDefined(),
            onClick: () => {
                const enabled = this.#callbacks.onToggleHighlight();
                highlightButton.textContent = enabled ? '☀' : '☼';
                highlightButton.title = enabled ? 'Turn diff highlight off' : 'Turn diff highlight on';
            }
        });
        this.#highlightButton = highlightButton;
        viewGroup.appendChild(highlightButton);
        viewGroup.appendChild(this.#createHidePropsButton());
        toolbar.appendChild(viewGroup);

        //--- update indicator (FEAT-0012), only when an update is available
        this.#appendUpdateIndicator(toolbar);

        //--- back navigation (FEAT-0023), only when there is somewhere to go back
        this.#appendBackNavigator(toolbar);

        //--- close group (destructive, separated)
        const closeGroup = this.#group();
        closeGroup.appendChild(this.#button({
            icon: '✕', title: 'Close', danger: true,
            onClick: () => window.close()
        }));
        toolbar.appendChild(closeGroup);
    }

    // The differ page is a plain web context (no chrome.*): the indicator just
    // opens the popup page (passed as a chrome-extension:// URL by the content
    // script) in a new tab, where the rich update UI runs (FEAT-0012).
    #appendUpdateIndicator(toolbar) {
        const indicator = new UpdateIndicator(this.#updateInfo);
        const element = indicator.createElement(() => {
            if (this.#updateInfo && this.#updateInfo.popupUrl) {
                window.open(this.#updateInfo.popupUrl, '_blank');
            }
        });
        if (element) {
            const group = this.#group();
            group.appendChild(element);
            toolbar.appendChild(group);
        }
    }

    // The control builds its own group (split ⤴ + ▾ + menu) or returns null when
    // there is nothing to offer (opened directly with no callers to list).
    #appendBackNavigator(toolbar) {
        if (!this.#backNavigator) {
            return;
        }
        const element = this.#backNavigator.createElement();
        if (element) {
            toolbar.appendChild(element);
        }
    }

    #createHidePropsButton() {
        const button = this.#button({
            text: 'Hide properties',
            minWidth: 140,
            onClick: () => {
                if (this.#isPropsCellHidden) {
                    button.textContent = 'Hide properties';
                    this.#propsCell.style.display = '';
                    this.#splitterCell.style.display = '';
                    this.#isPropsCellHidden = false;
                } else {
                    button.textContent = 'Show properties';
                    this.#propsCell.style.display = 'none';
                    this.#splitterCell.style.display = 'none';
                    this.#isPropsCellHidden = true;
                }
                // Doesn't always work the first time, so call fit twice
                this.#viewport.fit(true);
                this.#viewport.fit(true);
            }
        });
        return button;
    }

    #createFooter(parentElem) {
        const table = document.createElement('table');
        parentElem.appendChild(table);

        const row1 = document.createElement('tr');
        table.appendChild(row1);
        const row2 = document.createElement('tr');
        table.appendChild(row2);

        //------ header
        const cellChangedLabel = document.createElement('td');
        cellChangedLabel.style.minWidth = '70px';
        cellChangedLabel.style.height = '32px';
        cellChangedLabel.style.textAlign = 'right';
        cellChangedLabel.appendChild(document.createTextNode('Changed:'));
        row1.appendChild(cellChangedLabel);

        const changedTextElement = document.createTextNode('');
        const cellChanged = document.createElement('td');
        cellChanged.style.minWidth = '200px';
        cellChanged.style.height = '32px';
        cellChanged.appendChild(changedTextElement);
        row1.appendChild(cellChanged);

        const addedRemovedLabelElement = document.createTextNode('');
        const cellAddedRemovedLabel = document.createElement('td');
        cellAddedRemovedLabel.style.minWidth = '75px';
        cellAddedRemovedLabel.style.height = '32px';
        cellAddedRemovedLabel.style.textAlign = 'right';
        cellAddedRemovedLabel.appendChild(addedRemovedLabelElement);
        row1.appendChild(cellAddedRemovedLabel);

        const addedRemovedTextElement = document.createTextNode('');
        const cellAddedRemoved = document.createElement('td');
        cellAddedRemoved.style.minWidth = '200px';
        cellAddedRemoved.style.height = '32px';
        cellAddedRemoved.appendChild(addedRemovedTextElement);
        row1.appendChild(cellAddedRemoved);

        //----- body
        const cellBody = document.createElement('td');
        cellBody.setAttribute("colspan", "5");
        const changesTableDiv = document.createElement('div');
        changesTableDiv.style.maxHeight = 250;
        changesTableDiv.style.overflowY = 'auto';
        cellBody.appendChild(changesTableDiv);
        row2.appendChild(cellBody);

        const changesTable = document.createElement('table');
        changesTable.className = 'table-fixed-header changes-table';
        changesTableDiv.appendChild(changesTable);

        this.#changesTableView = new ChangesTableView(
            changedTextElement,
            addedRemovedLabelElement,
            addedRemovedTextElement,
            changesTable
        );

        // button
        const cellShowChangesButton = document.createElement('td');
        cellShowChangesButton.style.width = '100%';
        cellShowChangesButton.style.textAlign = 'right';
        row1.appendChild(cellShowChangesButton);

        changesTableDiv.style.display = 'none';
        const showChangesButton = this.#button({
            text: 'Show changes',
            minWidth: 124,
            onClick: () => {
                if (changesTableDiv.style.display === 'block') {
                    showChangesButton.textContent = 'Show changes';
                    changesTableDiv.style.display = 'none';
                    this.#changesTableView.resetSelection();
                } else {
                    showChangesButton.textContent = 'Hide changes';
                    changesTableDiv.style.display = 'block';
                }
                // Doesn't always work the first time, so call fit twice
                this.#viewport.fit(true);
                this.#viewport.fit(true);
            }
        });
        cellShowChangesButton.appendChild(showChangesButton);
    }
}
