// Builds the DOM of the DMN differ page (layout, header)
// and wires its buttons to the provided callbacks
class DmnDifferView {
    static DIV_ID = 'dmnDiv_12345bf3d4e842caa0d88194431197c0';
    static CANVAS_ID = 'dmnCanvas_12345bf3d4e842caa0d88194431197c0';

    // GitLab's native button classes — kept so buttons match the host UI;
    // sizing/margins are layered on top via the .differ-btn* classes.
    // FEAT-0024: the 💬 button's two states — the plain invitation, and the
    // nudge after this tab hit a failure the user may not have noticed.
    static FEEDBACK_TITLE = 'Report a problem or send feedback';
    static FEEDBACK_ALERT_TITLE = 'Something went wrong — report it';

    static BTN_CLASS = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';

    // U+200E LEFT-TO-RIGHT MARK — prefixed to the file path so the bidi algorithm
    // keeps the LTR path order inside the rtl left-truncating element (FEAT-0026).
    static LRM = '‎';

    #params;
    #branchIndicator;
    #viewport;
    #callbacks;

    #canvasCell = null;
    #downloadButton = null;
    #filePathElement = null;
    #emptyState = null;
    #loadingOverlay = new DifferLoadingOverlay();
    #backNavigator = null;
    #feedbackButton = null;

    // callbacks: { onDownload, onSwitchBranch, onFeedback }
    constructor(params, branchIndicator, viewport, callbacks) {
        this.#params = params;
        this.#branchIndicator = branchIndicator;
        this.#viewport = viewport;
        this.#callbacks = callbacks;
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
        // table-layout:fixed (with width:100%) caps the single column at the viewport
        // so the toolbar's flex-shrink truncates the file path instead of the header
        // cell growing to the toolbar's max-content and pushing the right-side buttons
        // off-screen (BUG-0022). See the matching comment in bpmn-differ-view.js#build().
        table.style.width = '100%';
        table.style.tableLayout = 'fixed';
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

    // Updates the file shown in the header (FEAT-0026): the path text (truncated
    // from the left via CSS, full path in the tooltip) and the link target for the
    // currently shown side. The two sides can differ when the file was renamed in
    // the MR: target keeps the old name/path (BUG-0002). A null/empty url (local
    // file or a side with no repo ref) renders an inactive, non-link path.
    setShownFile({ path, fileName, url }) {
        if (!this.#filePathElement) {
            return;
        }
        const text = path || fileName || '';
        // LRM prefix keeps the LTR path readable inside the rtl (left-truncating)
        // element, so the slashes are not reordered (FEAT-0026).
        this.#filePathElement.textContent = DmnDifferView.LRM + text;
        this.#filePathElement.title = text;
        if (url) {
            this.#filePathElement.setAttribute('href', url);
            this.#filePathElement.classList.remove('differ-file-path-inactive');
        } else {
            this.#filePathElement.removeAttribute('href');
            this.#filePathElement.classList.add('differ-file-path-inactive');
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

    // opts: { text, icon, title, ariaLabel, danger, strong, minWidth, disabled, onClick }
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
        // An icon button's text content is a glyph, so it needs a spelled-out
        // accessible name of its own.
        if (opts.ariaLabel) {
            button.setAttribute('aria-label', opts.ariaLabel);
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

        //--- file group (FEAT-0026): clickable, left-truncating file path; the
        //    group can shrink so the path makes room for the rest of the toolbar.
        //    No "File:" label — the path itself (next to the download button) is
        //    self-explanatory and the saved width goes to the path.
        const fileGroup = this.#group();
        fileGroup.classList.add('differ-file-group');

        // Download stays first (left), at a stable position by the bar's edge, so it
        // does not drift with the path length; the path is truncated after it.
        this.#downloadButton = this.#button({
            icon: '↓', title: 'Download the file as shown for the current branch',
            onClick: () => this.#callbacks.onDownload()
        });
        fileGroup.appendChild(this.#downloadButton);

        // A real <a> so ctrl/middle-click and plain click (target=_blank) all open
        // the file in GitLab in a new tab. href/text are set per shown side via
        // setShownFile(); no href = an inactive, non-link path.
        this.#filePathElement = document.createElement('a');
        this.#filePathElement.className = 'differ-file-path';
        this.#filePathElement.target = '_blank';
        this.#filePathElement.rel = 'noopener noreferrer';
        fileGroup.appendChild(this.#filePathElement);
        toolbar.appendChild(fileGroup);

        //--- branch indicator group (left side). No "Branch:" label — the
        //    indicator shows the branch name(s) and "Switch branch" is right there.
        const branchGroup = this.#group();
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

        //--- back navigation (FEAT-0005), only when there is somewhere to go back
        this.#appendBackNavigator(toolbar);

        //--- feedback (FEAT-0024): report this exact diff, context prefilled
        const feedbackGroup = this.#group();
        this.#feedbackButton = this.#button({
            icon: '💬',
            title: DmnDifferView.FEEDBACK_TITLE,
            ariaLabel: DmnDifferView.FEEDBACK_TITLE,
            onClick: () => this.#callbacks.onFeedback()
        });
        feedbackGroup.appendChild(this.#feedbackButton);
        toolbar.appendChild(feedbackGroup);

        // Uncaught failures are the ones the user may never see in the console —
        // badge the button so the report happens at the moment of friction. Not
        // console.error: dmn-js emits one on every load (INFRA-0001).
        const flagFailure = () => {
            this.#feedbackButton.classList.add('differ-feedback-alert');
            this.#feedbackButton.title = DmnDifferView.FEEDBACK_ALERT_TITLE;
            this.#feedbackButton.setAttribute('aria-label', DmnDifferView.FEEDBACK_ALERT_TITLE);
        };
        window.addEventListener('error', flagFailure);
        window.addEventListener('unhandledrejection', flagFailure);

        //--- close group (destructive, separated)
        const closeGroup = this.#group();
        closeGroup.appendChild(this.#button({
            icon: '✕', title: 'Close', danger: true,
            onClick: () => window.close()
        }));
        toolbar.appendChild(closeGroup);
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
