// Builds the DOM of the BPMN differ page (layout, header, footer)
// and wires its buttons to the provided callbacks
class BpmnDifferView {
    static DIV_ID = 'bpmnDiv_12345bf3d4e842caa0d88194431197c0';
    static CANVAS_ID = 'bpmnCanvas_12345bf3d4e842caa0d88194431197c0';
    static PROPS_ID = 'bpmnProps_12345bf3d4e842caa0d88194431197c0';

    #params;
    #branchIndicator;
    #callbacks;

    #canvasCell = null;
    #propsCell = null;
    #isPropsCellHidden = false;
    #viewport = null;
    #changesTableView = null;

    // callbacks: { onDownload, onSwitchBranch, onToggleHighlight }
    constructor(params, branchIndicator, callbacks) {
        this.#params = params;
        this.#branchIndicator = branchIndicator;
        this.#callbacks = callbacks;
    }

    get viewport() {
        return this.#viewport;
    }

    get changesTableView() {
        return this.#changesTableView;
    }

    build() {
        const bpmnDiv = document.createElement('div');
        bpmnDiv.id = BpmnDifferView.DIV_ID;
        // bpmnDiv.style.border = '5px solid black';
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
        // table.border = 5;

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
        headerCell.setAttribute('align', 'right');
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
        canvasCell.style.width = '100%';
        canvasCell.style.visibility = 'hidden'; // Initially the canvas is hidden
        tableCanvasPropsRow.appendChild(canvasCell);
        this.#canvasCell = canvasCell;
        this.#viewport = new CanvasViewport(canvasCell);

        //--- properties
        this.#propsCell = document.createElement('td');
        this.#propsCell.id = BpmnDifferView.PROPS_ID;
        this.#propsCell.style.height = '100%';
        this.#propsCell.style.minWidth = '300px';
        this.#propsCell.style.maxWidth = '600px';
        tableCanvasPropsRow.appendChild(this.#propsCell);

        //--- footer
        if (this.#params.isMrBranchDefined()) {
            const footerCell = document.createElement('td');
            footerCell.setAttribute('align', 'right');
            row3.appendChild(footerCell);
            this.#createFooter(footerCell);
        }
    }

    showCanvas() {
        this.#canvasCell.style.visibility = 'visible';
    }

    #createHeader(parentElem) {
        const table = document.createElement('table');
        // table.border = 3;
        parentElem.appendChild(table);

        const row1 = document.createElement('tr');
        table.appendChild(row1);
        const row2 = document.createElement('tr');
        table.appendChild(row2);

        // file label
        const cellFileLabel = document.createElement('td');
        cellFileLabel.style.minWidth = '60px';
        cellFileLabel.style.height = '32px';
        cellFileLabel.appendChild(document.createTextNode('File:'));
        row1.appendChild(cellFileLabel);

        // file name
        const cellFileName = document.createElement('td');
        row1.appendChild(cellFileName);

        const fileNameSpan = document.createElement('span');
        fileNameSpan.appendChild(document.createTextNode(this.#params.fileName));
        fileNameSpan.style.fontSize = '20px';
        fileNameSpan.style.fontWeight = 'bold';
        fileNameSpan.style.whiteSpace = 'nowrap';
        cellFileName.appendChild(fileNameSpan);

        const cellDownloadButton = document.createElement('td');
        cellDownloadButton.style.width = '100%';
        row1.appendChild(cellDownloadButton);

        const downloadButton = document.createElement('button');
        downloadButton.style.width = '90px';
        downloadButton.textContent = 'Download';
        downloadButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        downloadButton.style.margin = '3px';
        downloadButton.addEventListener('click', () => {
            this.#callbacks.onDownload();
        });
        cellDownloadButton.appendChild(downloadButton);

        // branch label
        const cellBranchLabel = document.createElement('td');
        cellBranchLabel.style.height = '32px';
        cellBranchLabel.appendChild(document.createTextNode('Branch:'));
        row2.appendChild(cellBranchLabel);

        // branch name
        const cellBranchName = document.createElement('td');
        cellBranchName.style.width = '100%';
        cellBranchName.setAttribute("colspan", "2");
        row2.appendChild(cellBranchName);
        cellBranchName.appendChild(this.#branchIndicator.createElement());

        // switch branch button
        const cellBranchButton = document.createElement('td');
        cellBranchButton.style.minWidth = '70px';
        cellBranchButton.style.textAlign = 'right';
        row2.appendChild(cellBranchButton);

        const switchButton = document.createElement('button');
        switchButton.disabled = !this.#params.isMrBranchDefined();
        switchButton.style.width = '120px';
        switchButton.textContent = 'Switch branch';
        switchButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        switchButton.style.margin = '3px';
        switchButton.addEventListener('click', () => {
            this.#callbacks.onSwitchBranch();
        });
        cellBranchButton.appendChild(switchButton);

        // View
        const cellView = document.createElement('td');
        cellView.style.whiteSpace = 'nowrap';
        cellView.style.textAlign = "right";
        row1.appendChild(cellView);

        const zoomInButton = document.createElement('button');
        zoomInButton.style.width = '90px';
        zoomInButton.textContent = 'Zoom In';
        zoomInButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        zoomInButton.style.margin = '3px';
        zoomInButton.addEventListener('click', () => {
            this.#viewport.zoomIn();
        });
        cellView.appendChild(zoomInButton);

        const zoomOutButton = document.createElement('button');
        zoomOutButton.style.width = '90px';
        zoomOutButton.textContent = 'Zoom Out';
        zoomOutButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        zoomOutButton.style.margin = '3px';
        zoomOutButton.addEventListener('click', () => {
            this.#viewport.zoomOut();
        });
        cellView.appendChild(zoomOutButton);

        const fitButton = document.createElement('button');
        fitButton.style.width = '90px';
        fitButton.textContent = 'Fit view';
        fitButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        fitButton.style.margin = '3px';
        fitButton.addEventListener('click', () => {
            this.#viewport.fit(true);
        });
        cellView.appendChild(fitButton);

        const highlightButton = document.createElement('button');
        highlightButton.disabled = !this.#params.isMrBranchDefined();
        highlightButton.style.width = '120px';
        highlightButton.textContent = 'Highlight On';
        highlightButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        highlightButton.style.margin = '3px';
        highlightButton.addEventListener('click', () => {
            const enabled = this.#callbacks.onToggleHighlight();
            highlightButton.textContent = enabled ? 'Highlight Off' : 'Highlight On';
        });
        cellView.appendChild(highlightButton);

        // close button
        const cellCloseButton = document.createElement('td');
        cellCloseButton.style.textAlign = 'right';
        row1.appendChild(cellCloseButton);

        const closeButton = document.createElement('button');
        closeButton.style.width = '90px';
        closeButton.textContent = 'Close';
        closeButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        closeButton.style.margin = '3px';
        closeButton.addEventListener('click', () => {
            window.close();
        });
        cellCloseButton.appendChild(closeButton);

        // hide/show props button
        const cellHideShowPropsButton = document.createElement('td');
        cellHideShowPropsButton.style.minWidth = '300px';
        cellHideShowPropsButton.style.textAlign = 'right';
        row2.appendChild(cellHideShowPropsButton);

        const hideShowPropsButton = document.createElement('button');
        hideShowPropsButton.textContent = 'Hide properties';
        hideShowPropsButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        hideShowPropsButton.style.width = '130px';
        hideShowPropsButton.style.margin = '3px';
        hideShowPropsButton.addEventListener('click', () => {
            if (this.#isPropsCellHidden) {
                hideShowPropsButton.textContent = 'Hide properties';
                this.#propsCell.style.display = 'block';
                this.#isPropsCellHidden = false;
            } else {
                hideShowPropsButton.textContent = 'Show properties';
                this.#propsCell.style.display = 'none';
                this.#isPropsCellHidden = true;
            }
            // Doesn't always work the first time, so call fit twice
            this.#viewport.fit(true);
            this.#viewport.fit(true);
        });
        cellHideShowPropsButton.appendChild(hideShowPropsButton);
    }

    #createFooter(parentElem) {
        const table = document.createElement('table');
        // table.border = 3;
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

        const showChangesButton = document.createElement('button');
        showChangesButton.textContent = 'Show changes';
        changesTableDiv.style.display = 'none';

        showChangesButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        showChangesButton.style.width = '130px';
        showChangesButton.style.margin = '3px';
        showChangesButton.addEventListener('click', () => {
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
        });
        cellShowChangesButton.appendChild(showChangesButton);
    }
}
