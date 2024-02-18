const MSG_DMN_ID = 'msg_dmn_71e23e639965407fb9c87f100a56c898';

const DMN_DIV_ID = 'dmnDiv_12345bf3d4e842caa0d88194431197c0';
const DMN_CANVAS_ID = 'dmnCanvas_12345bf3d4e842caa0d88194431197c0';

const DMN_OLD_VERSION_XMLNS = "http://www.omg.org/spec/DMN/20151101/dmn.xsd";
const DMN_NEW_VERSION_XMLNS = "https://www.omg.org/spec/DMN/20191111/MODEL/";

let dmnJS = null;
let currentZoom = null

let branchDmnXml = null;
let mrDmnXml = null;

const MIN_DMN_VIEWPORT_ZOOM = 10;
const MAX_DMN_VIEWPORT_ZOOM = 300;


function createDmnDiv() {
    const dmnDiv = document.createElement('div');
    dmnDiv.id = DMN_DIV_ID
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
    fileNameSpan.appendChild(document.createTextNode(fileName));
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
    downloadButton.addEventListener('click', (event) => {
        if (branchNameTextElement.textContent === targetBranchName) {
            downloadBranchFile(branchDmnXml, targetBranchName);
        } else {
            downloadBranchFile(mrDmnXml, mrBranchName);
        }
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

    branchNameTextElement = document.createTextNode('');
    branchNameSpanElement = document.createElement('span');
    branchNameSpanElement.style.fontSize = '20px';
    branchNameSpanElement.style.fontWeight = 'bold';
    branchNameSpanElement.style.color = MR_BRANCH_COLOR;
    branchNameSpanElement.style.whiteSpace = 'nowrap';
    branchNameSpanElement.appendChild(branchNameTextElement);
    cellBranchName.appendChild(branchNameSpanElement);

    // switch branch button
    const cellBranchButton = document.createElement('td');
    cellBranchButton.style.minWidth = '70px';
    cellBranchButton.style.textAlign = 'right';
    row2.appendChild(cellBranchButton);

    // show the switch branch button only if MR or Local file is defined
    if (mrCommitId || localFileContent) {
        const switchButton = document.createElement('button');
        switchButton.style.width = '120px';
        switchButton.textContent = 'Switch branch';
        switchButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        switchButton.style.margin = '3px';
        switchButton.addEventListener('click', (event) => {
            if (branchNameTextElement.textContent === targetBranchName) { // current Branch - switch to MR
                if (mrDmnXml) {
                    showDmnMr();
                } else {
                    // may be this file was removed
                    alertFileNotExistInBranch(mrBranchName);
                }
            } else { // current MR - try to switch to Branch
                if (branchDmnXml) {
                    showDmnBranch();
                } else {
                    // may be this file is new
                    alertFileNotExistInBranch(targetBranchName);
                }
            }
        });
        cellBranchButton.appendChild(switchButton);
    }

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

    const fitButton = document.createElement('button');
    fitButton.style.width = '90px';
    fitButton.textContent = 'Fit view';
    fitButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    fitButton.style.margin = '3px';
    fitButton.addEventListener('click', (event) => {
        setZoom(100);
    });
    cellView.appendChild(fitButton);

    const fullyVisibleButton = document.createElement('button');
    fullyVisibleButton.style.width = '120px';
    fullyVisibleButton.textContent = 'Show full';
    fullyVisibleButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    fullyVisibleButton.style.margin = '3px';
    fullyVisibleButton.addEventListener('click', (event) => {
        setDmnViewportFullyVisible();
    });
    cellView.appendChild(fullyVisibleButton);

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
    closeButton.addEventListener('click', (event) => {
        window.close();
    });
    cellCloseButton.appendChild(closeButton);

    // TODO: hide/show props button
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
    // console.debug('current zoom = ' + currentZoom + '; delta = ' + delta);
    let newZoom = Math.round(currentZoom * (1 + delta));

    if (newZoom < MIN_DMN_VIEWPORT_ZOOM) {
        // console.debug('min');
        newZoom = MIN_DMN_VIEWPORT_ZOOM;
    }
    else if (newZoom > MAX_DMN_VIEWPORT_ZOOM) {
        // console.debug('max');
        newZoom = MAX_DMN_VIEWPORT_ZOOM;
    }

    setZoom(newZoom);
}

function setZoom(zoom) {
    dmnTableContainer.style.zoom = zoom + '%';
    currentZoom = zoom;
    // console.debug('new zoom = ' + zoom);
}

function isFullyVisible() {
    const containerHeight = dmnTableContainer.getBoundingClientRect().height;
    const tableHeight = dmnTable.getBoundingClientRect().height;
    const res = tableHeight <= containerHeight;
    // console.debug('isFullyVisible = ' + res);
    return res;
}

function initDmnDiff(params) {
    projectUrl = requireDefined(params.projectUrl, 'projectUrl');
    mrCommitId = params.mrCommitId; // may be undefined when showing schema from branch only
    localFileContent = params.localFileContent;
    if (mrCommitId && localFileContent) {
        console.error('Only one of these parameters must be defined: mrCommitId or localFileContent');
        return;
    }
    if (localFileContent) {
        mrBranchName = 'local';
    }
    branchCommitId = requireDefined(params.branchCommitId, 'branchCommitId');
    targetBranchName = branchCommitId;
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

    console.debug('loading branch dmn xml...');
    branchDmnXml = null;
    branchDmnXml = await loadDmnXml(branchCommitId);

    mrDmnXml = null;
    if (mrCommitId) {
        console.debug('loading mr dmn xml...');
        mrDmnXml = await loadDmnXml(mrCommitId);
    } else if (localFileContent) {
        console.debug('using local file context as mr');
        mrDmnXml = localFileContent;
    } else {
        console.debug('mr commit id is undefined');
    }

    if (mrDmnXml) {
        await showDmnMr();
    } else {
        await showDmnBranch();
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
    setBranchName(mrBranchName);

    if (branchDmnXml) {
        highlightDmnDiffs(mrDmnXml, branchDmnXml, DiffType.ADD);
    } else {
        console.debug('file not exists in target branch');
    }
}

async function showDmnBranch() {
    console.debug('showing branch dmn xml file...');
    requireDefined(branchDmnXml, 'branchDmnXml');
    await showDmn(branchDmnXml);
    setBranchName(targetBranchName);

    if (mrDmnXml) {
        highlightDmnDiffs(branchDmnXml, mrDmnXml, DiffType.DELETE);
    } else {
        console.debug('file not exists in MR branch');
    }
}

async function showDmn(dmnXml) {
    const scrollTop = dmnTableContainer ? dmnTableContainer.scrollTop : 0;
    // console.debug('scroll top: ' + scrollTop);

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

function highlightDmnDiffs(myXml, otherXml, diffTypeForMissing) {
    console.debug('highlight diffs...');

    const myDoc = parseXml(myXml);
    const otherDoc = parseXml(otherXml);

    const myDecisionNode = myDoc.getElementsByTagName('decision')[0];
    const myDecisionTableNode = myDecisionNode.getElementsByTagName('decisionTable')[0];

    // analize diffs in header
    compareHeaders(diffTypeForMissing, myDecisionNode, myDecisionTableNode, otherDoc);

    // analize diffs in rules
    compareRules(diffTypeForMissing, myDecisionTableNode, otherDoc);
}

function compareHeaders(diffTypeForMissing, myDecisionNode, myDecisionTableNode, otherDoc) {
    const otherDecisionNode = otherDoc.getElementsByTagName('decision')[0];
    const otherDecisionTableNode = otherDecisionNode.getElementsByTagName('decisionTable')[0];

    // header
    const headerDiffs = []; // will contains html-elem class name
    if (myDecisionNode.getAttribute('name') !== otherDecisionNode.getAttribute('name')) {
        headerDiffs.push("div.decision-table-name");
    }
    if (myDecisionTableNode.getAttribute('hitPolicy') !== otherDecisionTableNode.getAttribute('hitPolicy')) {
        headerDiffs.push("span.hit-policy-value");
    }
    paintDmnHeaderDiffs(headerDiffs);

    // inputs
    const missingInputIds = [];
    const changedInputIds = [];
    const myInputNodes = myDecisionTableNode.getElementsByTagName('input');
    for (const myInputNode of myInputNodes) {
        const id = myInputNode.getAttribute('id');
        const otherInputNode = otherDoc.getElementById(id);

        if (!otherInputNode) {
            missingInputIds.push(id);
        }
        else {
            if (myInputNode.outerHTML !== otherInputNode.outerHTML) {
                changedInputIds.push(id);
            }
        }
    }
    paintDmnInputDiffs(diffTypeForMissing, missingInputIds, changedInputIds);

    //outputs
    // TODO: used labels instead of ids because html does not contain id attr for outputs
    const missingOutputLabels = [];
    const changedOutputLabels = [];
    const myOutputNodes = myDecisionTableNode.getElementsByTagName('output');
    for (const myOutputNode of myOutputNodes) {
        const id = myOutputNode.getAttribute('id');
        const label = myOutputNode.getAttribute('label');
        const otherOutputNode = otherDoc.getElementById(id);

        if (!otherOutputNode) {
            missingOutputLabels.push(label);
        }
        else {
            if (myOutputNode.outerHTML !== otherOutputNode.outerHTML) {
                changedOutputLabels.push(label);
            }
        }
    }
    paintDmnOutputDiffs(diffTypeForMissing, missingOutputLabels, changedOutputLabels);
}

function paintDmnHeaderDiffs(headerDiffs) {
    if (headerDiffs.length === 0) {
        return;
    }

    // console.debug(`header have diffs: ` + headerDiffs);
    for (const headerDiff of headerDiffs) {
        const cell = document.querySelector(headerDiff);
        if (cell) {
            cell.style.backgroundColor = DiffType.CHANGE.shapeColor;
        }
    }
}

function paintDmnInputDiffs(diffTypeForMissing, missingInputIds, changedInputIds) {
    if (missingInputIds.length > 0) {
        // console.debug('missingInputIds', missingInputIds);
        for (const missingInputId of missingInputIds) {
            const cell = document.querySelector(`.input-cell[data-col-id="${missingInputId}"]`);
            if (cell) {
                cell.style.backgroundColor = diffTypeForMissing.shapeColor;
            }
        }
    }

    if (changedInputIds.length > 0) {
        // console.debug('changedInputIds', changedInputIds);
        for (const changedInputId of changedInputIds) {
            const cell = document.querySelector(`.input-cell[data-col-id="${changedInputId}"]`);
            if (cell) {
                cell.style.backgroundColor = DiffType.CHANGE.shapeColor;
            }
        }
    }
}

function paintDmnOutputDiffs(diffTypeForMissing, missingOutputLabels, changedOutputLabels) {
    const outputLabelElems = Array.from(document.querySelectorAll('.output-label'));

    if (missingOutputLabels.length > 0) {
        console.debug('missingOutputLabels', missingOutputLabels);
        for (const missingOutputLabel of missingOutputLabels) {
            const cell = outputLabelElems.find(e => e.textContent === missingOutputLabel);
            if (cell && cell.parentElement) {
                cell.parentElement.style.backgroundColor = diffTypeForMissing.shapeColor;
            }
        }
    }

    if (changedOutputLabels.length > 0) {
        console.debug('changedOutputLabels', changedOutputLabels);
        for (const changedOutputLabel of changedOutputLabels) {
            const cell = outputLabelElems.find(e => e.textContent === changedOutputLabel);
            if (cell && cell.parentElement) {
                cell.parentElement.style.backgroundColor = DiffType.CHANGE.shapeColor;
            }
        }
    }
}

function compareRules(diffTypeForMissing, myDecisionTableNode, otherDoc) {
    const missingRuleIds = [];
    const changedRuleIdToDiffsMap = new Map();
    const myRuleNodes = myDecisionTableNode.getElementsByTagName('rule');

    for (const myRuleNode of myRuleNodes) {
        const id = myRuleNode.getAttribute('id');
        const otherRuleNode = otherDoc.getElementById(id);

        if (!otherRuleNode) {
            missingRuleIds.push(id);
        }
        else {
            const diffs = compareRuleNodes(myRuleNode, otherRuleNode);
            if (diffs) {
                // console.debug(`rule nodes with id '${id}' have diffs: `, diffs);
                changedRuleIdToDiffsMap.set(id, diffs);
            }
        }
    }

    paintDmnRulesDiffs(diffTypeForMissing, missingRuleIds, changedRuleIdToDiffsMap);
}

function compareRuleNodes(ruleNodeA, ruleNodeB) {
    const diffs = [];

    for (const childA of ruleNodeA.childNodes) {
        const tagChildA = childA.tagName;
        if (tagChildA === 'description') {
            const descrB = ruleNodeB.querySelector('description');
            if (descrB && childA.textContent !== descrB.textContent) {
                diffs.push('description');
            }
        } else if (tagChildA === 'inputEntry' || tagChildA === 'outputEntry') {
            const entryId = childA.getAttribute('id');
            const entryB = ruleNodeB.querySelector(`[id="${entryId}"]`);
            if (entryB && childA.outerHTML !== entryB.outerHTML) {
                diffs.push(entryId);
            }
        }
    }

    if (diffs.length > 0) {
        return diffs;
    } else {
        return null;
    }
}

function paintDmnRulesDiffs(diffTypeForMissing, missingRuleIds, changedRuleIdToDiffsMap) {
    if (missingRuleIds.length > 0) {
        // console.debug('missingRuleIds', missingRuleIds);

        for (const missingRuleId of missingRuleIds) {
            const ruleRow = findRuleRowElem(missingRuleId);
            if (ruleRow) {
                ruleRow.style.backgroundColor = diffTypeForMissing.shapeColor;
            }
        }
    }
    if (changedRuleIdToDiffsMap.size > 0) {
        // console.debug('changedRuleIdToDiffsMap', changedRuleIdToDiffsMap);

        for (const [ruleId, diffs] of changedRuleIdToDiffsMap) {
            const ruleRow = findRuleRowElem(ruleId);
            if (ruleRow) {
                for (const diff of diffs) {
                    const diffCell = findDiffCell(ruleRow, diff);
                    if (diffCell) {
                        diffCell.style.backgroundColor = DiffType.CHANGE.shapeColor;
                    } else {
                        console.info(`cannot find diff cell '${diff}' of rule with id '${ruleId}'`);
                    }
                }
            }
        }
    }
}

function findDiffCell(ruleRow, diff) {
    if (diff === 'description') {
        return ruleRow.querySelector(`.cell.annotation`);
    } else { // inputEntry/outputEntry id
        return ruleRow.querySelector(`[data-element-id="${diff}"]`);
    }
}

function findRuleRowElem(ruleId) {
    const ruleIndexCell = document.querySelector(`.rule-index[data-row-id="${ruleId}"]`);
    if (ruleIndexCell && ruleIndexCell.parentElement) {
        return ruleIndexCell.parentElement;
    } else {
        console.info('cannot find rule row elem by rule id: ' + ruleId);
        return null;
    }
}

function main() {
    appendTimeToConsoleLogs();

    window.addEventListener('message', async function (msg) {
        // console.debug('message received', msg);
        if (msg.origin !== window.origin || msg.data.id !== MSG_DMN_ID) {
            console.debug(`skip message: msg.origin = ${msg.origin}; msg.data.id = ${msg.data.id}`);
            return;
        }
        console.debug('showing dmn differ...');
        await showDmnDiff(msg.data.params);
    });
}

main();
