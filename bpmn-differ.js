const MSG_BPMN_ID = 'msg_bpmn_71e23e639965407fb9c87f100a56c898';
const DEFAULT_MASTER_COMMIT_ID = 'master';

const BPMN_DIV_ID = 'bpmnDiv_12345bf3d4e842caa0d88194431197c0';
const BPMN_CANVAS_ID = 'bpmnCanvas_12345bf3d4e842caa0d88194431197c0';
const BPMN_PROPS_ID = 'bpmnProps_12345bf3d4e842caa0d88194431197c0';
const BPMN_PROPS_CONDITION_ID = 'bpmnPropsCondition_12345bf3d4e842caa0d88194431197c0';

let bpmnPropsCell = null;
let isBpmnPropsCellHidden = false;

let isHighlightEnabled = false;

const MASTER_BRANCH_NAME = 'Master';
const MR_BRANCH_NAME = 'MR';
const MASTER_BRANCH_COLOR = 'darkred';
const MR_BRANCH_COLOR = 'darkblue';

const MIN_VIEWPORT_ZOOM = 0.1;
const MAX_VIEWPORT_ZOOM = 3.0;
const IN_OUT_DELTA_VIEWPORT_ZOOM = 0.15;
const WHEEL_DELTA_VIEWPORT_ZOOM = 0.03;

let projectUrl = null;
let mrCommitId = null;
let masterCommitId = null;
let filePath = null;
let fileName = null;

let bpmnPropertiesPanelModule = null;
let bpmnPropertiesProviderModule = null;
let camundaPlatformPropertiesProviderModule = null;
let camundaBpmnModdle = null;

let bpmnJS = null;
let bpmnJSCanvas = null;
let bpmnJSElementRegistry = null;
let bpmnJSModeling = null;
let bpmnJSSelection = null;
let bpmnJSEventBus = null;
let bpmnJSOverlays = null;

let canvasElem = null;
let canvasMousePosition = null;

let masterBpmnXml = null;
let mrBpmnXml = null;

let branchNameTextElement = null;
let branchNameSpanElement = null;

let missingShapeIds = [];
let missingRowIds = [];
let changedShapeIds = [];
let changedRowIds = [];

let selectedElementId = null;

let nodeIdToDiffsMap = new Map();
let highlightedPropGroups = null;
let highlightedPropGroupElems = null;

// map: elem id -> [current branch condition, other branch condition]
let nodeIdToConditions = new Map();

function createBpmnDiv() {
    const bpmnDiv = document.createElement('div');
    bpmnDiv.id = BPMN_DIV_ID
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

    //-----------------------------------------------------
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.height = '100%';
    // table.border = 5;

    const row1 = document.createElement('tr');
    const row2 = document.createElement('tr');
    row2.style.height = '100%';
    table.appendChild(row1);
    table.appendChild(row2);
    bpmnDiv.appendChild(table);

    //--- header
    const headerCell = document.createElement('td');
    headerCell.setAttribute('align', 'right');
    row1.appendChild(headerCell);
    createHeader(headerCell);

    //--- canvas & props
    const canvasPropsTable = document.createElement('table');
    canvasPropsTable.style.width = '100%';
    canvasPropsTable.style.height = '100%';
    row2.appendChild(canvasPropsTable);
    const tableCanvasPropsRow = document.createElement('tr');
    canvasPropsTable.appendChild(tableCanvasPropsRow);

    //--- canvas
    const canvasCell = document.createElement('td');
    canvasCell.id = BPMN_CANVAS_ID;
    canvasCell.style.height = '100%';
    canvasCell.style.width = '100%';
    canvasCell.style.visibility = 'hidden'; // initially the canvas is hidden
    tableCanvasPropsRow.appendChild(canvasCell);
    canvasElem = canvasCell;
    addCanvasEventHandlers(canvasElem);

    //--- properties
    bpmnPropsCell = document.createElement('td');
    bpmnPropsCell.id = BPMN_PROPS_ID;
    bpmnPropsCell.style.height = '100%';
    bpmnPropsCell.style.minWidth = '300px';
    bpmnPropsCell.style.maxWidth = '600px';
    tableCanvasPropsRow.appendChild(bpmnPropsCell);
}

function createHeader(parentElem) {
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
            downloadBranchFile(masterBpmnXml, MASTER_BRANCH_NAME);
        } else {
            downloadBranchFile(mrBpmnXml, MR_BRANCH_NAME);
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
                if (mrBpmnXml) {
                    showBpmnMr();
                } else {
                    // may be this file was removed
                    alertFileNotExistInBranch(MR_BRANCH_NAME);
                }
            } else { // current MR - try to switch to Master
                if (masterBpmnXml) {
                    showBpmnMaster();
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

    const fitButton = document.createElement('button');
    fitButton.style.width = '80px';
    fitButton.textContent = 'Fit';
    fitButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    fitButton.style.margin = '3px';
    fitButton.addEventListener('click', (event) => {
        fitViewport(true);
    });
    cellView.appendChild(fitButton);

    const zoomInButton = document.createElement('button');
    zoomInButton.style.width = '90px';
    zoomInButton.textContent = 'Zoom In';
    zoomInButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    zoomInButton.style.margin = '3px';
    zoomInButton.addEventListener('click', (event) => {
        changeViewportZoom(IN_OUT_DELTA_VIEWPORT_ZOOM);
    });
    cellView.appendChild(zoomInButton);

    const zoomOutButton = document.createElement('button');
    zoomOutButton.style.width = '90px';
    zoomOutButton.textContent = 'Zoom Out';
    zoomOutButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    zoomOutButton.style.margin = '3px';
    zoomOutButton.addEventListener('click', (event) => {
        changeViewportZoom(-IN_OUT_DELTA_VIEWPORT_ZOOM);
    });
    cellView.appendChild(zoomOutButton);

    const highlightButton = document.createElement('button');
    highlightButton.style.width = '110px';
    highlightButton.textContent = 'Highlight On';
    highlightButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    highlightButton.style.margin = '3px';
    highlightButton.addEventListener('click', (event) => {
        if (isHighlightEnabled) {
            highlightButton.textContent = 'Highlight On';
            isHighlightEnabled = false;
        } else {
            highlightButton.textContent = 'Highlight Off';
            isHighlightEnabled = true;
        }
        switchHighlighting();
    });
    cellView.appendChild(highlightButton);

    // hide/show props button
    const cellHideShowPropsButton = document.createElement('td');
    cellHideShowPropsButton.style.minWidth = '300px';
    cellHideShowPropsButton.style.textAlign = 'right';
    row.appendChild(cellHideShowPropsButton);

    const hideShowPropsButton = document.createElement('button');
    hideShowPropsButton.textContent = 'Hide properties';
    hideShowPropsButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    hideShowPropsButton.style.width = '130px';
    hideShowPropsButton.style.margin = '3px';
    hideShowPropsButton.addEventListener('click', () => {
        if (isBpmnPropsCellHidden) {
            hideShowPropsButton.textContent = 'Hide properties';
            bpmnPropsCell.style.display = 'block';
            isBpmnPropsCellHidden = false;
        } else {
            hideShowPropsButton.textContent = 'Show properties';
            bpmnPropsCell.style.display = 'none';
            isBpmnPropsCellHidden = true;
        }
        // doesn't always work the first time so call fitViewport twice
        fitViewport(true);
        fitViewport(true);
    });
    cellHideShowPropsButton.appendChild(hideShowPropsButton);
}

function setBranchName(branchName) {
    if (branchName === MASTER_BRANCH_NAME) {
        branchNameTextElement.textContent = MASTER_BRANCH_NAME;
        branchNameSpanElement.style.color = MASTER_BRANCH_COLOR;
    } else {
        branchNameTextElement.textContent = MR_BRANCH_NAME;
        branchNameSpanElement.style.color = MR_BRANCH_COLOR;
    }
}

function alertFileNotExistInBranch(branchName) {
    alert(`File does not exist in the ${branchName} branch`);
}

function downloadBranchFile(fileContent, branchName) {
    if (!fileContent) {
        alertFileNotExistInBranch(branchName);
        return;
    }
    const blob = new Blob([fileContent], { type: 'application/octet-stream' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${branchName}-${fileName}`;
    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function addCanvasEventHandlers(canvas) {
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('wheel', handleCanvasWheelEvent);
}

function handleCanvasMouseDown(event) {
    if (event.button === 0) {
        canvasMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }
}

function handleCanvasMouseUp(event) {
    if (event.button === 0) {
        canvasMousePosition = null;
    }
}

function handleCanvasMouseMove(event) {
    if (canvasMousePosition !== null) {
        const deltaX = event.clientX - canvasMousePosition.x;
        const deltaY = event.clientY - canvasMousePosition.y;
        bpmnJSCanvas.scroll({ dx: deltaX, dy: deltaY });

        canvasMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }
}

function handleCanvasWheelEvent(event) {
    if (event.ctrlKey) {
        const delta = event.deltaY > 0 ? -WHEEL_DELTA_VIEWPORT_ZOOM : WHEEL_DELTA_VIEWPORT_ZOOM;
        changeViewportZoom(delta);
        event.preventDefault();
    }
}

function fitViewport(force = false) {
    const viewbox = bpmnJSCanvas.viewbox();
    // console.debug(viewbox);
    const needToFit = viewbox.inner.width > viewbox.outer.width;

    if (needToFit && !isViewportAlreadyFitted() || force) {
        bpmnJSCanvas.zoom('fit-viewport');
        if (needToFit) {
            const deltaY = 100 * bpmnJSCanvas.zoom() - 20;
            bpmnJSCanvas.scroll({ dy: deltaY });
            changeViewportZoom(-0.005);
        }
    }
    canvasElem.setAttribute('fitted', 'true');
}

function isViewportAlreadyFitted() {
    return canvasElem.hasAttribute('fitted');
}

function changeViewportZoom(delta) {
    const currentZoom = bpmnJSCanvas.zoom();
    // console.debug('current zoom = ' + currentZoom + '; delta = ' + delta);
    let newZoom = currentZoom + delta;
    if (newZoom < MIN_VIEWPORT_ZOOM) {
        newZoom = MIN_VIEWPORT_ZOOM;
    }
    else if (newZoom > MAX_VIEWPORT_ZOOM) {
        newZoom = MAX_VIEWPORT_ZOOM;
    }
    // console.debug('new zoom = ' + newZoom);
    bpmnJSCanvas.zoom(newZoom);
}

async function showBpmnInternal(bpmnXml) {
    try {
        const result = await bpmnJS.importXML(bpmnXml);
        // const { warnings } = result;
        // console.debug('bpmn schema loaded succesfully', warnings);
    } catch (err) {
        console.error('bpmn schema loading error', err);
        return;
    }

    fitViewport();
}

async function showBpmn(bpmnXml) {
    const currentSelectedElemId = getCurrentSelectedElementId();

    await showBpmnInternal(bpmnXml);

    if (currentSelectedElemId) {
        selectedElementId = currentSelectedElemId;
    }
    selectElementById();
}

function getCurrentSelectedElementId() {
    const selectedItems = bpmnJSSelection.get();
    if (selectedItems.length !== 1) {
        return null;
    }
    return selectedItems[0].id;
}

function selectElementById() {
    if (!selectedElementId) {
        return;
    }
    const elem = bpmnJSElementRegistry.get(selectedElementId);
    if (elem) {
        bpmnJSSelection.select(elem);
    }
}

async function showBpmnMaster() {
    console.debug('showing master bpmn xml file...');
    requireDefined(masterBpmnXml, 'masterBpmnXml');
    await showBpmn(masterBpmnXml);
    setBranchName(MASTER_BRANCH_NAME);

    if (mrBpmnXml) {
        highlightDiffs(masterBpmnXml, mrBpmnXml, DiffType.DELETE);
    } else {
        console.debug('file not exists in MR branch');
    }
}

async function showBpmnMr() {
    console.debug('showing mr bpmn xml file...');
    requireDefined(mrBpmnXml, 'mrBpmnXml');
    await showBpmn(mrBpmnXml);
    setBranchName(MR_BRANCH_NAME);

    if (masterBpmnXml) {
        highlightDiffs(mrBpmnXml, masterBpmnXml, DiffType.ADD);
    } else {
        console.debug('file not exists in Master branch');
    }
}

class DiffType {
    static ADD = {
        shapeColor: '#88ff88',
        rowColor: '#00aa00'
    }
    static CHANGE = {
        shapeColor: '#8888ff',
        rowColor: '#0000aa'
    }
    static DELETE = {
        shapeColor: '#ff8888',
        rowColor: '#aa0000'
    }
}

const PROCESS_TAG_NAME = 'bpmn:process';
const SUBPROCESS_TAG_NAME = 'bpmn:subProcess';

const ROW_TAG_NAMES = [
    'bpmn:sequenceFlow',
    'bpmn:messageFlow',
    'bpmn:associatio'
];

const CONNECTOR_TAG_NAMES = [
    'bpmn:incoming',
    'bpmn:outgoing'
];

const IGNORED_DIFF_PROPERTY_GROUP = '_ignored_';

/**
 * key: diff name mask
 * value: property group name
 */
const DIFF_TO_PROPERTY_GROUP_MAP = new Map([
    ['name', 'General'],

    // the textAnnotation's child elem
    ['bpmn:text', 'General'],

    ['camunda:exclusive', 'Asynchronous continuations'],
    ['camunda:asyncBefore', 'Asynchronous continuations'],
    ['camunda:asyncAfter', 'Asynchronous continuations'],

    ['camunda:collection', 'Multi-instance'],
    ['camunda:elementVariable', 'Multi-instance'],
    ['bpmn:loopCardinality', 'Multi-instance'],
    ['bpmn:completionCondition', 'Multi-instance'],
    // TODO: failedJobRetryTimeCycle uses for two groups and now only one group is supported
    //['camunda:failedJobRetryTimeCycle', 'Multi-instance'],

    ['camunda:delegateExpression', 'Implementation'],
    ['camunda:expression', 'Implementation'],
    ['camunda:type', 'Implementation'],
    ['camunda:topic', 'Implementation'],

    ['bpmn:conditionExpression', 'Condition'],
    ['camunda:variableName', 'Condition'],
    ['bpmn:condition', 'Condition'],
    ['bpmn:conditionalEventDefinition', 'Condition'],

    ['camunda:in', 'In mappings'],
    ['camunda:in/source', 'In mappings'],
    ['camunda:in/target', 'In mappings'],
    ['camunda:in/sourceExpression', 'In mappings'],

    ['camunda:out', 'Out mappings'],
    ['camunda:out/source', 'Out mappings'],
    ['camunda:out/target', 'Out mappings'],
    ['camunda:out/sourceExpression', 'Out mappings'],

    ['camunda:inputParameter', 'Inputs'],
    ['camunda:outputParameter', 'Outputs'],

    ['bpmn:escalationEventDefinition', 'Escalation'],

    ['camunda:executionListener', 'Execution listeners'],

    ['bpmn:timeDuration', 'Timer'],

    ['calledElement', 'Called element'],
    ['businessKey', 'Called element'],

    ['camunda:jobPriority', 'Job execution'],
    ['camunda:failedJobRetryTimeCycle', 'Job execution'],

    ['camunda:properties', 'Extension properties'],

    ['camunda:formField', 'Form fields'],
    ['camunda:formField/label', 'Form fields'],

    ['messageRef', 'Message'],
    ['bpmn:messageEventDefinition', 'Message'],

    ['bpmn:documentation', 'Documentation'],

    // properties to be ignored
    // because there is no property group to highlight
    ['bpmn:terminateEventDefinition', IGNORED_DIFF_PROPERTY_GROUP],

    // TODO: select the title of the properties panel
    ['bpmn:startEvent/isInterrupting', IGNORED_DIFF_PROPERTY_GROUP],
]);

function findDiffPropertyGroup(diff) {
    const res = DIFF_TO_PROPERTY_GROUP_MAP.get(diff);
    if (res) {
        return res;
    }

    const diffShort = diff.slice(diff.indexOf("/") + 1);
    return DIFF_TO_PROPERTY_GROUP_MAP.get(diffShort);
}

function isNodeRow(node) {
    return ROW_TAG_NAMES.includes(node.tagName);
}

function isNodeConnector(node) {
    return CONNECTOR_TAG_NAMES.includes(node.tagName);
}

function isSubProcess(node) {
    return node.tagName === SUBPROCESS_TAG_NAME;
}

function isFormFieldProperty(node) {
    return node.tagName === 'camunda:property';
}

function highlightDiffs(myXml, otherXml, diffTypeForMissing) {
    const myDoc = parseXml(myXml);
    const myPocessNode = myDoc.getElementsByTagName(PROCESS_TAG_NAME)[0];
    const myNodesWithIdAttr = myPocessNode.querySelectorAll('[id]');

    const otherDoc = parseXml(otherXml);

    missingShapeIds = [];
    missingRowIds = [];
    changedShapeIds = [];
    changedRowIds = [];
    nodeIdToDiffsMap.clear();
    nodeIdToConditions.clear();

    for (const myNode of myNodesWithIdAttr) {
        if (isFormFieldProperty(myNode)) {
            // will compare form-field-properties as parts of bpmn:userTask nodes
            continue;
        }

        const id = myNode.getAttribute('id');
        const otherNode = otherDoc.getElementById(id);
        if (!otherNode) {
            if (isNodeRow(myNode)) {
                missingRowIds.push(id);
            } else {
                missingShapeIds.push(id);
            }
        } else {
            const diffs = compareNodes(null, myNode, otherNode);
            if (diffs) {
                // console.debug(`nodes with id '${id}' have diffs: `, diffs);
                for (const diff of diffs) {
                    const diffPropGroup = findDiffPropertyGroup(diff);
                    if (diffPropGroup) {
                        if (diffPropGroup === IGNORED_DIFF_PROPERTY_GROUP) {
                            continue;
                        }
                        const diffsInMap = nodeIdToDiffsMap.get(id);
                        if (diffsInMap) {
                            nodeIdToDiffsMap.set(id, diffsInMap.concat(diffPropGroup));
                        } else {
                            nodeIdToDiffsMap.set(id, [diffPropGroup]);
                        }
                    } else {
                        console.warn(`nodes with id '${id}': property group not found for diff: ${diff}`);
                    }
                }

                if (isNodeRow(myNode)) {
                    changedRowIds.push(id);

                    if (myNode.tagName === 'bpmn:sequenceFlow' &&
                        myNode.childNodes.length > 1 &&
                        otherNode.childNodes.length > 1) {
                        nodeIdToConditions.set(
                            id,
                            [myNode.childNodes[1].textContent, otherNode.childNodes[1].textContent]
                        );
                    }
                } else {
                    changedShapeIds.push(id);
                }
            }
        }
    }
    // console.debug('nodes with diffs to prop groups', nodeIdToDiffsMap);
    // console.debug('missingShapeIds', missingShapeIds);
    // console.debug('missingRowIds', missingRowIds);
    // console.debug('changedShapeIds', changedShapeIds);
    // console.debug('changedRowIds', changedRowIds);
    // console.debug('nodeIdToConditions', nodeIdToConditions);

    paintDiffs(diffTypeForMissing, missingShapeIds, missingRowIds);
    paintDiffs(DiffType.CHANGE, changedShapeIds, changedRowIds);

    highlightShapesAndRows();
}

/**
 * Compare nodes A and B
 * @returns null if the nodes are equal, 
 * otherwise an array of property names that differ 
 * or empty array if nodes are not equal but different properties are not defined
 */
function compareNodes(parentNode, nodeA, nodeB) {
    // console.debug('compare nodes...', parentNode, nodeA, nodeB);

    if (nodeA.nodeType === Node.TEXT_NODE) {
        if (nodeB.nodeType === Node.TEXT_NODE) {
            if (nodeA.textContent === nodeB.textContent) {
                return null;
            } else {
                return [parentNode.tagName];
            }
        }
        return []; // A is text but B is not text
    } else if (nodeB.nodeType === Node.TEXT_NODE) {
        return []; // A is not text but B is text
    }

    if (nodeA.tagName !== nodeB.tagName) {
        return []; // nodes have different type
    }

    if (isNodeConnector(nodeA)) {
        // do not compare connectors
        return null;
    }

    let diffs = compareNodesAttributes(nodeA, nodeB);

    if (isSubProcess(nodeA)) {
        // do not compare children of subprocesses (they will be compared separately)
        // except 'multiInstanceLoopCharacteristics' and 'extensionElements' nodes
        const milcDiffs = compareChildNodesWithTagName(nodeA, nodeB, 'bpmn:multiInstanceLoopCharacteristics');
        diffs = concatDiffs(diffs, milcDiffs);
        const extDiffs = compareChildNodesWithTagName(nodeA, nodeB, 'bpmn:extensionElements');
        diffs = concatDiffs(diffs, extDiffs);
        return diffs;
    }

    if (nodeA.childNodes.length !== nodeB.childNodes.length) {
        const childrenDiffs = findChildrenDiffs(nodeA, nodeB);
        diffs = concatDiffs(diffs, childrenDiffs);
    } else {
        for (let i = 0; i < nodeA.childNodes.length; i++) {
            const childA = nodeA.childNodes[i];
            const childB = nodeB.childNodes[i];
            const nodeDiffs = compareNodes(nodeA, childA, childB);
            diffs = concatDiffs(diffs, nodeDiffs);
        }
    }

    return diffs;
}

function concatDiffs(diffs, newDiffs) {
    if (!newDiffs) {
        return diffs;
    }
    if (diffs) {
        return diffs.concat(newDiffs);
    }
    return newDiffs;
}

function compareChildNodesWithTagName(nodeA, nodeB, tagName) {
    const childA = findChildNodeByTagName(nodeA, tagName);
    const childB = findChildNodeByTagName(nodeB, tagName);
    if (childA && childB) {
        return compareNodes(nodeA, childA, childB);
    }
    if (childA) {
        return nodeToDiffs(childA);
    }
    if (childB) {
        return nodeToDiffs(childB);
    }
    return null;
}

function findChildNodeByTagName(node, tagName) {
    for (child of node.childNodes) {
        if (child.tagName === tagName) {
            return child;
        }
    }
    return null;
}

function findChildrenDiffs(nodeA, nodeB) {
    const diffChildren = findDifferentChilder(nodeA.childNodes, nodeB.childNodes);
    if (!diffChildren) {
        return null;
    }

    let diffs = [];
    for (let diffChild of diffChildren) {
        diffs = diffs.concat(nodeToDiffs(diffChild));
    }

    return diffs;
}

function nodeToDiffs(node) {
    if (node.tagName === 'bpmn:extensionElements' || node.tagName === 'camunda:inputOutput') {
        const children = getAllNotTextChildren(node);
        let res = [];
        for (const child of children) {
            res = res.concat(nodeToDiffs(child));
        }
        return res;
    }
    return [node.tagName];
}

function getAllNotTextChildren(node) {
    const res = [];
    for (child of node.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE) {
            res.push(child);
        }
    }
    if (res.length > 0) {
        return res;
    }
    console.warn('not text child not found');
    return [node];
}

function findDifferentChilder(childrenA, childrenB) {
    let diffNodes = [];
    pushOuterDiff(diffNodes, childrenA, childrenB);
    pushOuterDiff(diffNodes, childrenB, childrenA);

    if (diffNodes.length > 0) {
        return diffNodes;
    }
    return null;
}

function pushOuterDiff(diffNodes, findForNodes, findWhereNodes) {
    for (const findForNode of findForNodes) {
        if (findForNode.nodeType === Node.TEXT_NODE || isNodeConnector(findForNode)) {
            continue;
        }
        const findForNodeText = findForNode.outerHTML;
        let found = false;
        for (const findWhereNode of findWhereNodes) {
            const findWhereNodeText = findWhereNode.outerHTML;
            if (findForNodeText === findWhereNodeText) {
                found = true;
                break;
            }
        }
        if (!found && !diffNodes.includes(findForNode)) {
            diffNodes.push(findForNode);
        }
    }
}

function compareNodesAttributes(nodeA, nodeB) {
    const nodeAAttrs = Array.from(nodeA.attributes);
    const nodeBAttrs = Array.from(nodeB.attributes);
    const diffs = [];

    getAttributesDiffs(diffs, nodeA.tagName, nodeAAttrs, nodeBAttrs);
    getAttributesDiffs(diffs, nodeB.tagName, nodeBAttrs, nodeAAttrs);

    if (diffs.length > 0) {
        return diffs;
    } else {
        return null;
    }
}

function getAttributesDiffs(diffs, nodeATagName, nodeAAttrs, nodeBAttrs) {
    // checks that all attributes of nodeA exist in nodeB and have the same value
    for (const attrA of nodeAAttrs) {
        const attName = attrA.name;
        // skip:
        // - connectors attributes
        // - gateway's 'default' att
        // - 'id' att (it can belong to the messageEventDefinition elem)
        if (
            attName === 'targetRef' || attName === 'sourceRef' ||
            attName === 'default' ||
            attName === 'id'
        ) {
            continue;
        }

        // node.getAttribute(attName) not working and returns null so uses method 'find'
        const attrB = nodeBAttrs.find(a => a.name === attName);
        if (!attrB || attrA.value !== attrB.value) {
            if (!diffs.includes(attName)) {
                diffs.push(nodeATagName + "/" + attName);
            }
        }
    }
}

function paintDiffs(diffType, shapeIdList, rowIdList) {
    if (shapeIdList.length > 0) {
        const shapes = shapeIdList
            .map(id => bpmnJSElementRegistry.get(id))
            .filter(item => item);
        bpmnJSModeling.setColor(shapes, { fill: diffType.shapeColor });

        // paint the TextAnnotation elements because setColor() does not work for them
        for (const shape of shapes) {
            try {
                if (shape.type === 'bpmn:TextAnnotation') {
                    document
                        .querySelector(`[data-element-id="${shape.id}"]`)
                        .querySelector('.djs-visual')
                        .querySelector('rect')
                        .style.fill = diffType.shapeColor;
                }
            } catch (error) {
                // maybe the shape does not have the type property 
                // or the element to set the style cannot be found
                // so, ignore it
            }
        }
    }
    if (rowIdList.length > 0) {
        const rows = rowIdList
            .map(id => bpmnJSElementRegistry.get(id))
            .filter(item => item);
        bpmnJSModeling.setColor(rows, { stroke: diffType.rowColor });
    }
}

let highlightingTimeoutId = null;

const HIGHLIGHTING_MARKER = 'highlight-diff';
const BIG_HIGHLIGHTING_MARKER = 'highlight-diff-big';

function switchHighlighting() {
    // console.debug('isHighlightEnabled = ' + isHighlightEnabled);

    const elems = getShapesAndRowsElementsForHighlighting();

    if (isHighlightEnabled) {
        elems.forEach(elem => addElementMarker(elem, BIG_HIGHLIGHTING_MARKER));
        highlightingTimeoutId = setTimeout(() => {
            elems.forEach(elem => {
                removeElementMarker(elem, BIG_HIGHLIGHTING_MARKER);
                addElementMarker(elem, HIGHLIGHTING_MARKER);
            });
        }, 2000);
    } else {
        if (highlightingTimeoutId) {
            clearTimeout(highlightingTimeoutId);
        }
        elems.forEach(elem => {
            removeElementMarker(elem, BIG_HIGHLIGHTING_MARKER);
            removeElementMarker(elem, HIGHLIGHTING_MARKER);
        });
    }
}

function highlightShapesAndRows() {
    if (!isHighlightEnabled) {
        return;
    }

    const elems = getShapesAndRowsElementsForHighlighting();
    elems.forEach(elem => addElementMarker(elem, HIGHLIGHTING_MARKER));
}

function getShapesAndRowsElementsForHighlighting() {
    return [...missingShapeIds, ...missingRowIds, ...changedShapeIds, ...changedRowIds]
        .map(id => bpmnJSElementRegistry.get(id))
        .filter(elem => elem && elem.type !== 'bpmn:Association');
}

function addElementMarker(element, marker) {
    try {
        bpmnJSCanvas.addMarker(element, marker);
    } catch (error) {
        // some elements does not have property `id` so addMarker() throw error
    }
}

function removeElementMarker(element, marker) {
    try {
        bpmnJSCanvas.removeMarker(element, marker);
    } catch (error) {
        // some elements does not have property `id` so addMarker() throw error
    }
}

async function onSelectedElementChanged(elemId) {
    selectedElementId = elemId.replace(/_label$/, "");
    await hideSchemaEditorControls();
    if (!selectedElementId) {
        return;
    }
    highlightDiffPropGroup();
    showConditionExpression();
    // addCallActivityOverlay();
}

let currentOverlayId = null;

function addCallActivityOverlay() {
    if (currentOverlayId) {
        bpmnJSOverlays.remove(currentOverlayId);
        currentOverlayId = null;
    }

    const elem = bpmnJSElementRegistry.get(selectedElementId);
    if (elem.type !== 'bpmn:CallActivity') {
        return;
    }
    const processId = getCallActivityProcessId(elem);
    if (!processId) {
        return;
    }

    currentOverlayId = bpmnJSOverlays.add(selectedElementId, 'note', {
        position: {
            bottom: 0,
            right: 0
        },
        html: '<div class="dive-in-call-activity">Dive in</div>'
    });

    const overlayElem = document.querySelector(`.djs-overlay.djs-overlay-note[data-overlay-id="${currentOverlayId}"]`);
    if (overlayElem) {
        overlayElem.addEventListener('click', (event) => openProcessBpmn(processId));
    } else {
        console.warn('cannot find overlay element by id: ' + currentOverlayId);
    }
}

function getCallActivityProcessId(callActivityElement) {
    try {
        return callActivityElement.businessObject.calledElement;
    } catch (error) {
        console.warn('cannot get calledElement for call activity element', error);
        return null;
    }
}

function openProcessBpmn(processId) {
    console.info('openProcessBpmn: ' + processId);
    // TODO: how to find bpmn-file by processId?
    //  file may has different name not equals to processId...
    //      how many bpmn-files have a name different from the processId?
    //  file may be in another folder...

    // как можно обойти все дерево файлов проекта:
    // 1) найти ИД проекта (для SE - это Project ID: 9169)
    // - выполнить запрос https://gitlab.example.com/api/v4/projects/?search=example-service&simple=true
    // - в полученном списке выбрать тот, у которого 
    //  "path_with_namespace": "example-group/example-service"
    //      где "example-group/example-service" взять из текущего урла проекта
    //  тк могут быть клоны нашего проекта
    // ! ну или искать ИД на странице
    //  
    // 2) рекурсивно выполнять запрос:
    // - сначала файлы в корне: https://gitlab.example.com/api/v4/projects/9169/repository/tree?&per_page=100&path=configMap
    // - среди них выбираем только те, у которых type=tree
    // - для каждого такого выполняем запрос (например, path=configMap):
    //  https://gitlab.example.com/api/v4/projects/9169/repository/tree?&per_page=100&path=configMap
    // - если внутри тоже есть папки (tree), то продолжаем углубляться:
    //  https://gitlab.example.com/api/v4/projects/9169/repository/tree?recursive=false&per_page=100&path=configMap/features
    // - просто файлы будут иметь type=blob
}

function showConditionExpression() {
    const elem = bpmnJSElementRegistry.get(selectedElementId);
    if (elem.type !== 'bpmn:SequenceFlow') {
        return;
    }
    const conditionExpressionElem = document.querySelector('#bio-properties-panel-conditionExpression');
    if (!conditionExpressionElem) {
        return;
    }
    // hide native expression container
    conditionExpressionElem.style.display = 'none';

    // add new expression container, previously delete a possible duplicate
    removeElement(BPMN_PROPS_CONDITION_ID);

    const div = document.createElement('div');
    div.id = BPMN_PROPS_CONDITION_ID;
    div.className = 'properties-condition';
    conditionExpressionElem.parentElement.appendChild(div);
    drawFormattedCondition(div, conditionExpressionElem);
}

function drawFormattedCondition(parentElem, conditionExpressionElem) {
    const conditions = nodeIdToConditions.get(selectedElementId);
    if (conditions) { // when comparing master and mr branches
        const myCondParts = formatCondition(conditions[0]);
        const otherCondParts = formatCondition(conditions[1]);

        for (const part of myCondParts) {
            const exists = otherCondParts.includes(part);
            drawConditionPart(parentElem, part, exists);
        }
    } else { // when viewing master branch only
        const myCondParts = formatCondition(conditionExpressionElem.value);
        for (const part of myCondParts) {
            drawConditionPart(parentElem, part, true);
        }
    }
}

function drawConditionPart(parentElem, part, exists) {
    const elem = document.createElement('div');
    elem.style.whiteSpace = 'pre';
    elem.textContent = part;
    if (!exists) {
        let color = null;
        if (branchNameTextElement.textContent === MASTER_BRANCH_NAME) {
            color = '#ff8888'; // the 'delete' color for master
        } else {
            color = '#88ff88'; // the 'add' color for mr
        }
        elem.style.backgroundColor = color;
    }
    parentElem.appendChild(elem);
}

function formatCondition(condition) {
    // console.debug('formatCondition', condition);

    // TODO: extract this logic to separate class
    const resultArr = [];
    const symbolArr = [];
    let indentSize = 0;
    let andOpStarted = false;
    let orOpStarted = false;
    let starting = true;
    let funcParenthesis = false;
    let insideString = false;
    let escapeFound = false;

    for (let i = 0; i < condition.length; i++) {
        const symbol = condition[i];

        if (insideString && symbol !== '"' && symbol !== '\\') {
            symbolArr.push(symbol);
            continue;
        }

        switch (symbol) {
            case '{':
                symbolArr.push(symbol);
                indentSize += 1;
                flushString(resultArr, symbolArr, indentSize);
                starting = true;
                break;

            case '}':
                indentSize -= 1;
                flushString(resultArr, symbolArr, indentSize);
                starting = true;
                symbolArr.push(symbol);
                starting = false;
                break;

            case '(':
                symbolArr.push(symbol);
                if (starting) {
                    indentSize += 1;
                    flushString(resultArr, symbolArr, indentSize);
                    starting = true;
                } else {
                    funcParenthesis = true;
                }
                break;

            case ')':
                if (funcParenthesis) {
                    symbolArr.push(symbol);
                    funcParenthesis = false;
                } else {
                    indentSize -= 1;
                    flushString(resultArr, symbolArr, indentSize);
                    starting = true;
                    symbolArr.push(symbol);
                    starting = false;
                }
                break;

            case '&':
                symbolArr.push(symbol);
                if (andOpStarted) { // second &
                    flushString(resultArr, symbolArr, indentSize);
                    starting = true;
                    andOpStarted = false;
                } else { // first &
                    andOpStarted = true;
                }
                break;

            case '|':
                symbolArr.push(symbol);
                if (orOpStarted) { // second |
                    flushString(resultArr, symbolArr, indentSize);
                    starting = true;
                    orOpStarted = false;
                } else { // first |
                    orOpStarted = true;
                }
                break;

            case '"':
                symbolArr.push(symbol);
                if (escapeFound) {
                    escapeFound = false;
                } else {
                    if (insideString) {
                        insideString = false;
                    } else {
                        insideString = true;
                    }
                }
                break;

            case '\\':
                symbolArr.push(symbol);
                if (escapeFound) {
                    escapeFound = false;
                } else {
                    escapeFound = true;
                }
                break;

            case ' ':
                if (starting) {
                    break;
                }
            // else no break and go to default branch

            default:
                symbolArr.push(symbol);
                andOpStarted = false;
                orOpStarted = false;
                starting = false;
                escapeFound = false;
        }
    }
    if (symbolArr.length > 0) {
        flushString(resultArr, symbolArr, indentSize);
    }

    return resultArr;
}

function flushString(resultArr, symbolArr, indentSize) {
    resultArr.push(symbolArr.join(''));

    symbolArr.length = 0;
    for (let i = 0; i < indentSize; i++) {
        symbolArr.push(...'  ');
    }
}

async function hideSchemaEditorControls() {
    document.querySelector('.djs-context-pad').style.display = 'none';
    // sometimes controls appear with delay
    // so hide controls again after some delay
    await delay(100);
    document.querySelector('.djs-context-pad').style.display = 'none';
}

async function highlightDiffPropGroup() {
    resetHighlightedDiffPropGroup();

    const diffPropGroups = nodeIdToDiffsMap.get(selectedElementId);
    if (diffPropGroups) {
        highlightedPropGroups = diffPropGroups;
        highlightedPropGroupElems = [];

        for (const diffPropGroup of highlightedPropGroups) {
            const elem = await doWithAttempts(function () {
                const e = document.querySelector(`.bio-properties-panel-group-header-title[title="${diffPropGroup}"]`);
                if (!e) {
                    return null;
                }
                return e.parentElement;
            });
            if (elem) {
                highlightedPropGroupElems.push(elem);
                elem.style.backgroundColor = '#8888ff';
            }
        }
    }
}

function resetHighlightedDiffPropGroup() {
    highlightedPropGroups = null;
    if (highlightedPropGroupElems) {
        for (const elem of highlightedPropGroupElems) {
            elem.style.backgroundColor = null;
        }
        highlightedPropGroupElems = null;
    }
}

async function loadBpmnXml(commitId) {
    const fileUrl = `${projectUrl}/-/raw/${commitId}/${filePath}`;
    console.debug('loading bpmn xml from: ' + fileUrl);
    return await loadFileContent(fileUrl, false);
}

function hideModelerPallete() {
    try {
        document.getElementsByClassName('djs-palette')[0].style.display = 'none';
    } catch (error) {
        console.warn('modeler pallete not found', error);
    }
}

async function setPropertiesPanelContainerMaxHeight() {
    const panelContainer = await doWithAttempts(function () {
        return document.querySelector('.bio-properties-panel-scroll-container');
    });
    if (!panelContainer) {
        console.warn('cannot find properties panel container');
        return;
    }
    panelContainer.style.maxHeight = panelContainer.offsetHeight;
}

function initBpmnDiff(params) {
    projectUrl = requireDefined(params.projectUrl, 'projectUrl');
    mrCommitId = params.mrCommitId; // may be undefined when showing schema from master
    masterCommitId = requireDefined(params.masterCommitId, 'masterCommitId');
    filePath = requireDefined(params.filePath, 'filePath');
    fileName = requireDefined(params.fileName, 'fileName');

    bpmnPropertiesPanelModule = window.BpmnJSPropertiesPanel.BpmnPropertiesPanelModule;
    bpmnPropertiesProviderModule = window.BpmnJSPropertiesPanel.BpmnPropertiesProviderModule;
    camundaPlatformPropertiesProviderModule = window.BpmnJSPropertiesPanel.CamundaPlatformPropertiesProviderModule;
    camundaBpmnModdle = params.camundaBpmnModdle;
}

async function showBpmnDiff(params) {
    console.debug('diff params: ', params);
    initBpmnDiff(params);
    console.debug('init done');

    createBpmnDiv();
    console.debug('bpmn div created');

    bpmnJS = new BpmnJS({
        container: '#' + BPMN_CANVAS_ID,
        keyboard: {
            bindTo: window
        },
        propertiesPanel: {
            parent: '#' + BPMN_PROPS_ID
        },
        additionalModules: [
            bpmnPropertiesPanelModule,
            bpmnPropertiesProviderModule,
            camundaPlatformPropertiesProviderModule,
        ],
        moddleExtensions: {
            camunda: camundaBpmnModdle
        }
    });
    console.debug('bpmn js created');

    bpmnJSCanvas = bpmnJS.get('canvas');
    bpmnJSElementRegistry = bpmnJS.get('elementRegistry');
    bpmnJSModeling = bpmnJS.get('modeling');
    bpmnJSSelection = bpmnJS.get('selection');
    bpmnJSEventBus = bpmnJS.get('eventBus');
    bpmnJSOverlays = bpmnJS.get('overlays');

    bpmnJSEventBus.on('selection.changed', function (event) {
        if (event.newSelection.length !== 1) {
            return;
        }
        onSelectedElementChanged(event.newSelection[0].id);
    });

    hideModelerPallete();

    console.debug('loading master bpmn xml...');
    masterBpmnXml = null;
    masterBpmnXml = await loadBpmnXml(masterCommitId);

    console.debug('loading mr bpmn xml...');
    mrBpmnXml = null;
    if (mrCommitId) {
        mrBpmnXml = await loadBpmnXml(mrCommitId);
    } else {
        console.debug('mr commit id is undefined');
    }

    if (mrBpmnXml) {
        await showBpmnMr();
    } else {
        await showBpmnMaster();
    }

    // show canvas after the differ is completely rendered
    console.debug('making canvas visible...');
    canvasElem.style.visibility = 'visible';

    // set max-height of the properties panel container to enable scrollbar display when needed
    await setPropertiesPanelContainerMaxHeight();

    console.debug('ready!');
}

function main() {
    appendTimeToConsoleLogs();

    window.addEventListener('message', async function (msg) {
        console.debug('message received', msg);
        if (msg.origin !== window.origin || msg.data.id !== MSG_BPMN_ID) {
            console.debug(`skip message: msg.origin = ${msg.origin}; msg.data.id = ${msg.data.id}`);
            return;
        }
        console.debug('showing bpmn differ...');
        await showBpmnDiff(msg.data.params);
    });
}

main();
