// Builds the DOM of the DMN differ page (layout, header)
// and wires its buttons to the provided callbacks
class DmnDifferView {
    static DIV_ID = 'dmnDiv_12345bf3d4e842caa0d88194431197c0';
    static CANVAS_ID = 'dmnCanvas_12345bf3d4e842caa0d88194431197c0';

    #params;
    #branchIndicator;
    #viewport;
    #callbacks;

    #canvasCell = null;

    // callbacks: { onDownload, onSwitchBranch }
    constructor(params, branchIndicator, viewport, callbacks) {
        this.#params = params;
        this.#branchIndicator = branchIndicator;
        this.#viewport = viewport;
        this.#callbacks = callbacks;
    }

    build() {
        const dmnDiv = document.createElement('div');
        dmnDiv.id = DmnDifferView.DIV_ID;
        // dmnDiv.style.border = '5px solid black';
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
        // table.border = 5;

        const headerRow = document.createElement('tr');
        const tableCanvasPropsRow = document.createElement('tr');
        tableCanvasPropsRow.style.height = '100%';
        table.appendChild(headerRow);
        table.appendChild(tableCanvasPropsRow);
        dmnDiv.appendChild(table);

        //--- header
        const headerCell = document.createElement('td');
        headerCell.setAttribute('align', 'right');
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
    }

    showCanvas() {
        this.#canvasCell.style.visibility = 'visible';
    }

    #createHeader(parentElem) {
        const table = document.createElement('table');
        // table.border = 3;
        table.style.width = '100%';
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
        fileNameSpan.style.fontSize = '18px';
        fileNameSpan.style.fontWeight = 'bold';
        fileNameSpan.appendChild(document.createTextNode(this.#params.fileName));
        cellFileName.appendChild(fileNameSpan);

        // download file button
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
            this.#viewport.setZoom(100);
        });
        cellView.appendChild(fitButton);

        const showFullButton = document.createElement('button');
        showFullButton.style.width = '120px';
        showFullButton.textContent = 'Show full';
        showFullButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        showFullButton.style.margin = '3px';
        showFullButton.addEventListener('click', () => {
            this.#viewport.showFull();
        });
        cellView.appendChild(showFullButton);

        // close button
        const cellCloseButton = document.createElement('td');
        cellCloseButton.style.minWidth = '300px';
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
    }
}
