// Builds the DOM of the DMN differ page (layout, header)
// and wires its buttons to the provided callbacks
class DmnDifferView {
    static DIV_ID = 'dmnDiv_12345bf3d4e842caa0d88194431197c0';
    static CANVAS_ID = 'dmnCanvas_12345bf3d4e842caa0d88194431197c0';

    // GitLab's native button classes — kept so buttons match the host UI;
    // sizing/margins are layered on top via the .differ-btn* classes.
    static BTN_CLASS = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';

    #params;
    #branchIndicator;
    #viewport;
    #callbacks;

    #canvasCell = null;
    #downloadButton = null;
    #fileNameSpan = null;
    #emptyState = null;
    #loadingOverlay = new DifferLoadingOverlay();
    #updateInfo = null;
    #backNavigator = null;

    // callbacks: { onDownload, onSwitchBranch }
    constructor(params, branchIndicator, viewport, callbacks) {
        this.#params = params;
        this.#branchIndicator = branchIndicator;
        this.#viewport = viewport;
        this.#callbacks = callbacks;
    }

    // Update notification info { updateAvailable, latestVersion, popupUrl } for
    // the toolbar indicator (FEAT-0012). Set before build(); null = no indicator.
    setUpdateInfo(updateInfo) {
        this.#updateInfo = updateInfo;
    }

    // Back-navigation control (FEAT-0005). Set before build(); null = no control.
    setBackNavigator(backNavigator) {
        this.#backNavigator = backNavigator;
    }

    build() {
        // Show the render spinner until the diagram is ready (showCanvas).
        this.#loadingOverlay.show('Loading the diagram…');

        const dmnDiv = document.createElement('div');
        dmnDiv.id = DmnDifferView.DIV_ID;
        dmnDiv.style.position = 'fixed';
        dmnDiv.style.top = '0';
        dmnDiv.style.left = '0';
        dmnDiv.style.width = '100vw';
        dmnDiv.style.height = '100vh';
        dmnDiv.style.paddingRight = '20px';
        dmnDiv.style.backgroundColor = 'rgba(255, 255, 255, 1)';

        dmnDiv.style.zIndex = '9999';
        document.body.appendChild(dmnDiv);

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.height = '100%';

        const headerRow = document.createElement('tr');
        const tableCanvasPropsRow = document.createElement('tr');
        tableCanvasPropsRow.style.height = '100%';
        table.appendChild(headerRow);
        table.appendChild(tableCanvasPropsRow);
        dmnDiv.appendChild(table);

        //--- header
        const headerCell = document.createElement('td');
        headerRow.appendChild(headerCell);
        this.#createHeader(headerCell);

        //--- canvas
        const canvasCell = document.createElement('td');
        canvasCell.id = DmnDifferView.CANVAS_ID;
        canvasCell.style.height = '100%';
        canvasCell.style.width = '100%';
        canvasCell.style.visibility = 'hidden'; // Initially the canvas is hidden
        tableCanvasPropsRow.appendChild(canvasCell);
        this.#canvasCell = canvasCell;
        this.#emptyState = new DifferEmptyState(canvasCell);
    }

    showCanvas() {
        this.#canvasCell.style.visibility = 'visible';
        this.#loadingOverlay.hide();
    }

    // Shows a placeholder over the canvas: a blank cover when switching to an
    // absent side (dmn-js has no clear(); the absence is shown in the label),
    // or a message when the file is absent in both versions (UX-0003 / BUG-0001).
    showEmptyState(message) {
        this.#canvasCell.style.visibility = 'visible';
        this.#emptyState.show(message);
        this.#loadingOverlay.hide();
    }

    hideEmptyState() {
        this.#emptyState.hide();
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

    #group() {
        const group = document.createElement('div');
        group.className = 'differ-btn-group';
        return group;
    }

    // opts: { text, icon, title, danger, strong, minWidth, disabled, onClick }
    #button(opts) {
        const button = document.createElement('button');
        button.className = DmnDifferView.BTN_CLASS + ' differ-btn'
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
            onClick: () => this.#viewport.setZoom(100)
        }));
        viewGroup.appendChild(this.#button({
            text: 'Show full',
            onClick: () => this.#viewport.showFull()
        }));
        toolbar.appendChild(viewGroup);

        //--- update indicator (FEAT-0012), only when an update is available
        this.#appendUpdateIndicator(toolbar);

        //--- back navigation (FEAT-0005), only when there is somewhere to go back
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
}
