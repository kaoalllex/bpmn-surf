const MSG_DMN_ID = 'msg_dmn_71e23e639965407fb9c87f100a56c898';

const DMN_DIV_ID = 'dmnDiv_12345bf3d4e842caa0d88194431197c0';
const DMN_CANVAS_ID = 'dmnCanvas_12345bf3d4e842caa0d88194431197c0';

const DMN_OLD_VERSION_XMLNS = "http://www.omg.org/spec/DMN/20151101/dmn.xsd";
const DMN_NEW_VERSION_XMLNS = "https://www.omg.org/spec/DMN/20191111/MODEL/";

let dmnJS = null;
let currentZoom = null

let masterDmnXml = null;
let mrDmnXml = null;

const MIN_DMN_VIEWPORT_ZOOM = 10;
const MAX_DMN_VIEWPORT_ZOOM = 300;


function createDmnDiv() {
    const dmnDiv = document.createElement('div');
    dmnDiv.id = DMN_DIV_ID
    dmnDiv.style.border = '5px solid black';
    dmnDiv.style.position = 'fixed';
    dmnDiv.style.top = '0';
    dmnDiv.style.left = '0';
    dmnDiv.style.width = '100vw';
    dmnDiv.style.height = '100vh';
    dmnDiv.style.paddingRight = '20px';
    dmnDiv.style.backgroundColor = 'rgba(255, 255, 255, 1)';

    dmnDiv.style.zIndex = '9999';
    document.body.appendChild(dmnDiv);

    //-----------------------------------------------------
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
    createDmnHeader(headerCell);

    //--- canvas
    const canvasCell = document.createElement('td');
    canvasCell.id = DMN_CANVAS_ID;
    canvasCell.style.height = '100%';
    canvasCell.style.width = '100%';
    canvasCell.style.visibility = 'hidden'; // initially the canvas is hidden
    tableCanvasPropsRow.appendChild(canvasCell);
    canvasElem = canvasCell;
}

function createDmnHeader(parentElem) {
    const table = document.createElement('table');
    // table.border = 3;
    table.style.width = '100%';
    parentElem.appendChild(table);

    const row = document.createElement('tr');
    table.appendChild(row);

    // file name
    const cellFileName = document.createElement('td');
    row.appendChild(cellFileName);

    const fileNameSpan = document.createElement('span');
    fileNameSpan.style.fontSize = '18px';
    fileNameSpan.style.fontWeight = 'bold';
    fileNameSpan.appendChild(document.createTextNode(fileName));
    cellFileName.appendChild(fileNameSpan);

    // download file button
    const cellDownloadButton = document.createElement('td');
    cellDownloadButton.style.width = '100%';
    row.appendChild(cellDownloadButton);

    const downloadButton = document.createElement('button');
    downloadButton.style.width = '90px';
    downloadButton.textContent = 'Download';
    downloadButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    downloadButton.style.margin = '3px';
    downloadButton.addEventListener('click', (event) => {
        if (branchNameTextElement.textContent === MASTER_BRANCH_NAME) {
            downloadBranchFile(masterDmnXml, MASTER_BRANCH_NAME);
        } else {
            downloadBranchFile(mrDmnXml, MR_BRANCH_NAME);
        }
    });
    cellDownloadButton.appendChild(downloadButton);

    // branch name
    const cellBranchName = document.createElement('td');
    cellBranchName.style.minWidth = '130px';
    row.appendChild(cellBranchName);

    branchNameTextElement = document.createTextNode(MR_BRANCH_NAME);
    branchNameSpanElement = document.createElement('span');
    branchNameSpanElement.style.fontSize = '20px';
    branchNameSpanElement.style.fontWeight = 'bold';
    branchNameSpanElement.style.color = MR_BRANCH_COLOR;
    branchNameSpanElement.appendChild(branchNameTextElement);

    cellBranchName.appendChild(document.createTextNode('Branch: '));
    cellBranchName.appendChild(branchNameSpanElement);

    // switch branch button
    const cellBranchButton = document.createElement('td');
    cellBranchButton.style.minWidth = '70px';
    row.appendChild(cellBranchButton);

    // show the switch branch button only if MR hash is defined
    if (mrCommitId) {
        const switchButton = document.createElement('button');
        switchButton.style.width = '90px';
        switchButton.textContent = 'Switch';
        switchButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        switchButton.style.margin = '3px';
        switchButton.addEventListener('click', (event) => {
            if (branchNameTextElement.textContent === MASTER_BRANCH_NAME) { // current Master - switch to MR
                if (mrDmnXml) {
                    showDmnMr();
                } else {
                    // may be this file was removed
                    alertFileNotExistInBranch(MR_BRANCH_NAME);
                }
            } else { // current MR - try to switch to Master
                if (masterDmnXml) {
                    showDmnMaster();
                } else {
                    // may be this file is new
                    alertFileNotExistInBranch(MASTER_BRANCH_NAME);
                }
            }
        });
        cellBranchButton.appendChild(switchButton);
    }

    // View
    const cellView = document.createElement('td');
    cellView.style.minWidth = '450px';
    cellView.style.textAlign = "right";
    row.appendChild(cellView);

    cellView.appendChild(document.createTextNode('View: '));

    const fullyVisibleButton = document.createElement('button');
    fullyVisibleButton.style.width = '80px';
    fullyVisibleButton.textContent = 'Show full';
    fullyVisibleButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    fullyVisibleButton.style.margin = '3px';
    fullyVisibleButton.addEventListener('click', (event) => {
        setDmnViewportFullyVisible();
    });
    cellView.appendChild(fullyVisibleButton);

    const fitButton = document.createElement('button');
    fitButton.style.width = '90px';
    fitButton.textContent = 'Zoom 100';
    fitButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    fitButton.style.margin = '3px';
    fitButton.addEventListener('click', (event) => {
        setZoom(100);
    });
    cellView.appendChild(fitButton);

    const zoomInButton = document.createElement('button');
    zoomInButton.style.width = '90px';
    zoomInButton.textContent = 'Zoom In';
    zoomInButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    zoomInButton.style.margin = '3px';
    zoomInButton.addEventListener('click', (event) => {
        changeDmnViewportZoom(IN_OUT_DELTA_VIEWPORT_ZOOM);
    });
    cellView.appendChild(zoomInButton);

    const zoomOutButton = document.createElement('button');
    zoomOutButton.style.width = '90px';
    zoomOutButton.textContent = 'Zoom Out';
    zoomOutButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    zoomOutButton.style.margin = '3px';
    zoomOutButton.addEventListener('click', (event) => {
        changeDmnViewportZoom(-IN_OUT_DELTA_VIEWPORT_ZOOM);
    });
    cellView.appendChild(zoomOutButton);

    // const highlightButton = document.createElement('button');
    // highlightButton.style.width = '110px';
    // highlightButton.textContent = 'Highlight On';
    // highlightButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    // highlightButton.style.margin = '3px';
    // highlightButton.addEventListener('click', (event) => {
    //     if (isHighlightEnabled) {
    //         highlightButton.textContent = 'Highlight On';
    //         isHighlightEnabled = false;
    //     } else {
    //         highlightButton.textContent = 'Highlight Off';
    //         isHighlightEnabled = true;
    //     }
    //     switchHighlighting();
    // });
    // cellView.appendChild(highlightButton);
}

let dmnTableContainer = null;
let dmnTable = null;

function fitDmnViewport() {
    if (!dmnTableContainer) {
        const container = document.getElementsByClassName('tjs-container')[0];
        container.style.width = window.innerWidth - 10;
        container.style.height = window.innerHeight - 40;

        dmnTableContainer = container.getElementsByClassName('tjs-table-container')[0];
        dmnTableContainer.style.overflow = 'scroll';

        dmnTable = dmnTableContainer.getElementsByClassName('tjs-table')[0];
        dmnTable.style.width = '100%';
        dmnTable.style.height = '100%';

        dmnTableContainer.addEventListener('wheel', handleTableContainerWheelEvent);
    }
    if (!currentZoom) {
        currentZoom = 100;
    }
    setZoom(currentZoom);
}

function handleTableContainerWheelEvent(event) {
    if (event.ctrlKey) {
        const delta = event.deltaY > 0 ? -WHEEL_DELTA_VIEWPORT_ZOOM : WHEEL_DELTA_VIEWPORT_ZOOM;
        changeDmnViewportZoom(delta);
        event.preventDefault();
    }
}

function setDmnViewportFullyVisible() {
    setZoom(MAX_DMN_VIEWPORT_ZOOM);

    while (!isFullyVisible()) {
        changeDmnViewportZoom(-IN_OUT_DELTA_VIEWPORT_ZOOM);
    }
}

function changeDmnViewportZoom(delta) {
    console.debug('current zoom = ' + currentZoom + '; delta = ' + delta);
    let newZoom = Math.round(currentZoom * (1 + delta));

    if (newZoom < MIN_DMN_VIEWPORT_ZOOM) {
        console.debug('min');
        newZoom = MIN_DMN_VIEWPORT_ZOOM;
    }
    else if (newZoom > MAX_DMN_VIEWPORT_ZOOM) {
        console.debug('max');
        newZoom = MAX_DMN_VIEWPORT_ZOOM;
    }

    setZoom(newZoom);
}

function setZoom(zoom) {
    dmnTableContainer.style.zoom = zoom + '%';
    currentZoom = zoom;
    console.debug('new zoom = ' + zoom);
}

function isFullyVisible() {
    const containerHeight = dmnTableContainer.getBoundingClientRect().height;
    const tableHeight = dmnTable.getBoundingClientRect().height;
    const res = tableHeight <= containerHeight;
    console.debug('isFullyVisible = ' + res);
    return res;
}

function initDmnDiff(params) {
    projectUrl = requireDefined(params.projectUrl, 'projectUrl');
    mrCommitId = params.mrCommitId; // may be undefined when showing schema from master
    masterCommitId = requireDefined(params.masterCommitId, 'masterCommitId');
    filePath = requireDefined(params.filePath, 'filePath');
    fileName = requireDefined(params.fileName, 'fileName');
}

async function showDmnDiff(params) {
    console.debug('diff params: ', params);
    initDmnDiff(params);
    console.debug('init done');

    createDmnDiv();
    console.debug('dmn div created');

    dmnJS = new DmnJS({
        container: '#' + DMN_CANVAS_ID,
        keyboard: {
            bindTo: window
        }
    });
    console.debug('dmn js created');

    console.debug('loading master dmn xml...');
    masterDmnXml = null;
    masterDmnXml = await loadDmnXml(masterCommitId);

    console.debug('loading mr dmn xml...');
    mrDmnXml = null;
    if (mrCommitId) {
        mrDmnXml = await loadDmnXml(mrCommitId);
    } else {
        console.debug('mr commit id is undefined');
    }

    if (mrDmnXml) {
        await showDmnMr();
    } else {
        await showDmnMaster();
    }

    console.debug('making canvas visible...');
    canvasElem.style.visibility = 'visible';

    console.debug('ready!');
}

async function loadDmnXml(commitId) {
    const fileUrl = `${projectUrl}/-/raw/${commitId}/${filePath}`;
    console.debug('loading dmn xml from: ' + fileUrl);
    return await loadFileContent(fileUrl, false);
}

async function showDmnMr() {
    console.debug('showing mr dmn xml file...');
    requireDefined(mrDmnXml, 'mrDmnXml');
    await showDmn(mrDmnXml);
    setBranchName(MR_BRANCH_NAME);

    // if (masterBpmnXml) {
    //     highlightDiffs(mrBpmnXml, masterBpmnXml, DiffType.ADD);
    // } else {
    //     console.debug('bpmn not exists in Master branch');
    // }
}

async function showDmnMaster() {
    console.debug('showing master dmn xml file...');
    requireDefined(masterDmnXml, 'masterDmnXml');
    await showDmn(masterDmnXml);
    setBranchName(MASTER_BRANCH_NAME);

    // if (mrBpmnXml) {
    //     highlightDiffs(masterBpmnXml, mrBpmnXml, DiffType.DELETE);
    // } else {
    //     console.debug('bpmn not exists in MR branch');
    // }
}

async function showDmn(dmnXml) {
    const scrollTop = dmnTableContainer ? dmnTableContainer.scrollTop : 0;
    console.debug('scroll top: ' + scrollTop);

    dmnTableContainer = null;
    dmnTable = null;
    try {
        // replace xmlns because the viewer dont want to show the old versions of dmn
        const fixedXml = dmnXml.replace(DMN_OLD_VERSION_XMLNS, DMN_NEW_VERSION_XMLNS);
        const result = await dmnJS.importXML(fixedXml);
        // const { warnings } = result;
        // console.debug('dmn schema loaded succesfully', warnings);
    } catch (err) {
        console.error('dmn loading error', err);
        return;
    }
    fitDmnViewport();
    dmnTableContainer.scrollTop = scrollTop;
}

function main() {
    appendTimeToConsoleLogs();

    window.addEventListener('message', async function (msg) {
        console.debug('message received', msg);
        if (msg.origin !== window.origin || msg.data.id !== MSG_DMN_ID) {
            console.debug(`skip message: msg.origin = ${msg.origin}; msg.data.id = ${msg.data.id}`);
            return;
        }
        console.debug('showing dmn differ...');
        await showDmnDiff(msg.data.params);
    });
}

main();
