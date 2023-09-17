const MSG_ID = 'msg_71e23e639965407fb9c87f100a56c898';

const BPMN_DIV_ID = 'bpmnDiv_12345bf3d4e842caa0d88194431197c0'
const BPMN_CANVAS_ID = 'bpmnCanvas_12345bf3d4e842caa0d88194431197c0'
const BPMN_PROPS_ID = 'bpmnProps_12345bf3d4e842caa0d88194431197c0'

const MASTER_BRANCH_NAME = 'Master';
const MR_BRANCH_NAME = 'MR';
const MASTER_BRANCH_COLOR = 'darkred';
const MR_BRANCH_COLOR = 'darkblue';

let projectUrl = null;
let diffHeadSha = null;
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

let canvasElem = null;
let canvasMousePosition = null;

let masterBpmnXml = null;
let mrBpmnXml = null;

let branchNameTextElement = null;
let branchNameSpanElement = null;

let changedShapeIds = [];
let changedRowIds = [];

let selectedElementId = null;

let nodeIdToDiffsMap = new Map();
let highlightedPropGroups = null;
let highlightedPropGroupElems = null;


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
    table.appendChild(row1);
    table.appendChild(row2);
    bpmnDiv.appendChild(table);

    //--- header
    const cell11 = document.createElement('td');
    cell11.setAttribute('align', 'right');
    row1.appendChild(cell11);
    createHeader(cell11);

    //--- buttons
    const cell12 = document.createElement('td');
    cell12.setAttribute('align', 'right');
    row1.appendChild(cell12);
    createButtonClose(cell12);

    //--- canvas
    const cell21 = document.createElement('td');
    cell21.id = BPMN_CANVAS_ID;
    cell21.style.height = '100%';
    cell21.style.visibility = 'hidden'; // initially the canvas is hidden
    row2.appendChild(cell21);
    canvasElem = cell21;
    addCanvasEventHandlers(canvasElem);

    //--- properties
    const cell22 = document.createElement('td');
    cell22.id = BPMN_PROPS_ID;
    cell22.style.height = '100%';
    cell22.style.width = '300px';
    row2.appendChild(cell22);
}

function createButtonClose(parentElem) {
    const btnClose = document.createElement('button');
    btnClose.textContent = 'Close';
    btnClose.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    btnClose.addEventListener('click', () => {
        window.close();
    });
    btnClose.style.margin = '5px';
    parentElem.appendChild(btnClose);
}

function createHeader(parentElem) {
    const table = document.createElement('table');
    // table.border = 5;
    table.style.width = '100%';
    parentElem.appendChild(table);

    const row = document.createElement('tr');
    table.appendChild(row);

    // file name
    const cellFileName = document.createElement('td');
    cellFileName.style.width = '100%';
    row.appendChild(cellFileName);

    const fileNameSpan = document.createElement('span');
    fileNameSpan.style.fontSize = '18px';
    fileNameSpan.style.fontWeight = 'bold';
    fileNameSpan.appendChild(document.createTextNode(fileName));
    cellFileName.appendChild(fileNameSpan);

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
    cellBranchButton.style.minWidth = '130px';
    row.appendChild(cellBranchButton);

    const switchButton = document.createElement('button');
    switchButton.textContent = 'Switch branch';
    switchButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    switchButton.style.margin = '5px';
    switchButton.addEventListener('click', (event) => {
        if (branchNameTextElement.textContent === MASTER_BRANCH_NAME) { // current Master - switch to MR
            if (mrBpmnXml) {
                showBpmnMr();
            } else {
                // may be this bpmn-schema was removed
                alertBpmnSchemaNotExist(MR_BRANCH_NAME);
            }
        } else { // current MR - try to switch to Master
            if (masterBpmnXml) {
                showBpmnMaster();
            } else {
                // may be this bpmn-schema is new
                alertBpmnSchemaNotExist(MASTER_BRANCH_NAME);
            }
        }
    });
    cellBranchButton.appendChild(switchButton);

    // fit viewport button
    const cellFitViewportButton = document.createElement('td');
    cellFitViewportButton.style.minWidth = '110px';
    row.appendChild(cellFitViewportButton);

    const fitViewportButton = document.createElement('button');
    fitViewportButton.textContent = 'Fit viewport';
    fitViewportButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    fitViewportButton.style.margin = '5px';
    fitViewportButton.addEventListener('click', (event) => {
        fitViewport(true);
    });
    cellFitViewportButton.appendChild(fitViewportButton);

    // download file button
    const cellDownloadButton = document.createElement('td');
    row.appendChild(cellDownloadButton);

    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Download';
    downloadButton.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    downloadButton.style.margin = '5px';
    downloadButton.addEventListener('click', (event) => {
        if (branchNameTextElement.textContent === MASTER_BRANCH_NAME) {
            downloadBpmnFile(masterBpmnXml, MASTER_BRANCH_NAME);
        } else {
            downloadBpmnFile(mrBpmnXml, MR_BRANCH_NAME);
        }
    });
    cellDownloadButton.appendChild(downloadButton);
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

function alertBpmnSchemaNotExist(branchName) {
    alert(`BPMN schema does not exist in the ${branchName} branch`);
}

function downloadBpmnFile(fileContent, branchName) {
    if (!fileContent) {
        alertBpmnSchemaNotExist(branchName);
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
    canvas.addEventListener('wheel', handleCanvasWheelEvent);
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
}

function handleCanvasWheelEvent(event) {
    if (event.ctrlKey) {
        const delta = event.deltaY > 0 ? -0.05 : 0.05;
        const zoomLevel = bpmnJSCanvas.zoom() + delta;
        if (zoomLevel > 0) {
            bpmnJSCanvas.zoom(zoomLevel);
        }
        event.preventDefault();
    }
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

function fitViewport(force = false) {
    const viewbox = bpmnJSCanvas.viewbox();
    // console.debug(viewbox);
    const needToFit = viewbox.inner.width > viewbox.outer.width;

    if (needToFit && !isViewportAlreadyFitted() || force) {
        bpmnJSCanvas.zoom('fit-viewport');
        if (needToFit) {
            const deltaY = 100 * bpmnJSCanvas.zoom();
            bpmnJSCanvas.scroll({ dy: deltaY });
        }
    }
    canvasElem.setAttribute('fitted', 'true');
}

function isViewportAlreadyFitted() {
    return canvasElem.hasAttribute('fitted');
}

async function showBpmnInternal(bpmnXml) {
    try {
        const result = await bpmnJS.importXML(bpmnXml);
        // const { warnings } = result;
        // console.debug('Bpmn-schema loaded succesfully', warnings);
    } catch (err) {
        console.error('Bpmn-schema loading error', err);
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
    await showBpmn(masterBpmnXml);
    setBranchName(MASTER_BRANCH_NAME);

    if (mrBpmnXml) {
        highlightDiffs(masterBpmnXml, mrBpmnXml, DiffType.DELETE);
    } else {
        console.debug('bpmn not exists in MR branch');
    }
}

async function showBpmnMr() {
    await showBpmn(mrBpmnXml);
    setBranchName(MR_BRANCH_NAME);

    if (masterBpmnXml) {
        highlightDiffs(mrBpmnXml, masterBpmnXml, DiffType.ADD);
    } else {
        console.debug('bpmn not exists in Master branch');
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

    ['bpmn:conditionExpression', 'Condition'],
    ['camunda:variableName', 'Condition'],
    ['bpmn:condition', 'Condition'],

    ['camunda:in', 'In mappings'],
    ['camunda:out', 'Out mappings'],

    ['camunda:inputParameter', 'Inputs'],
    ['camunda:outputParameter', 'Outputs'],

    ['camunda:executionListener', 'Execution listeners'],

    ['bpmn:timeDuration', 'Timer'],

    ['calledElement', 'Called element'],

    ['camunda:jobPriority', 'Job execution'],
    ['camunda:failedJobRetryTimeCycle', 'Job execution'],

    ['camunda:properties', 'Extension properties'],

    ['messageRef', 'Message'],

    ['bpmn:documentation', 'Documentation'],

    // properties to be ignored
    // because there is no property group to highlight
    ['bpmn:terminateEventDefinition', IGNORED_DIFF_PROPERTY_GROUP]
]);

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

    const missingShapeIds = [];
    const missingRowIds = [];
    changedShapeIds = [];
    changedRowIds = [];
    nodeIdToDiffsMap.clear();

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
                    const diffPropGroup = DIFF_TO_PROPERTY_GROUP_MAP.get(diff);
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

    paintDiffs(diffTypeForMissing, missingShapeIds, missingRowIds);
    paintDiffs(DiffType.CHANGE, changedShapeIds, changedRowIds);
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
        return diffs;
    }

    if (nodeA.childNodes.length !== nodeB.childNodes.length) {
        const childrenDiffs = findChildrenDiffs(nodeA, nodeB);
        if (childrenDiffs) {
            if (diffs) {
                diffs = diffs.concat(childrenDiffs);
            } else {
                diffs = childrenDiffs;
            }
        }
    } else {
        for (let i = 0; i < nodeA.childNodes.length; i++) {
            const childA = nodeA.childNodes[i];
            const childB = nodeB.childNodes[i];
            const nodeDiffs = compareNodes(nodeA, childA, childB);
            if (nodeDiffs) {
                if (diffs) {
                    diffs = diffs.concat(nodeDiffs);
                } else {
                    diffs = nodeDiffs;
                }
            }
        }
    }

    return diffs;
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

    getAttributesDiffs(diffs, nodeAAttrs, nodeBAttrs);
    getAttributesDiffs(diffs, nodeBAttrs, nodeAAttrs);

    if (diffs.length > 0) {
        return diffs;
    } else {
        return null;
    }
}

function getAttributesDiffs(diffs, nodeAAttrs, nodeBAttrs) {
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
                diffs.push(attName);
            }
        }
    }
}

function parseXml(xml) {
    const parser = new DOMParser();
    return parser.parseFromString(xml, 'text/xml');
}

function paintDiffs(diffType, shapeIdList, rowIdList) {
    if (shapeIdList.length > 0) {
        const shapes = shapeIdList.map(id => bpmnJSElementRegistry.get(id));
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
        const rows = rowIdList.map(id => bpmnJSElementRegistry.get(id));
        bpmnJSModeling.setColor(rows, { stroke: diffType.rowColor });
    }
}

async function onSelectedElementChanged(elemId) {
    selectedElementId = elemId.replace(/_label$/, "");
    await hideSchemaEditorControls();
    highlightDiffPropGroup();
}

async function hideSchemaEditorControls() {
    document.querySelector('.djs-context-pad').style.display = 'none';
    // sometimes controls appear with delay
    // so hide controls again after some delay
    await delay(100);
    document.querySelector('.djs-context-pad').style.display = 'none';
}

async function highlightDiffPropGroup() {
    if (!selectedElementId) {
        return;
    }

    resetHighlightedDiffPropGroup();

    const diffPropGroups = nodeIdToDiffsMap.get(selectedElementId);
    if (diffPropGroups) {
        highlightedPropGroups = diffPropGroups;
        highlightedPropGroupElems = [];

        for (const diffPropGroup of highlightedPropGroups) {
            const elem = await findElementWithDelay(function () {
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

async function loadBpmnXml() {
    const masterFileUrl = `${projectUrl}/-/raw/master/${filePath}`;
    masterBpmnXml = null;
    masterBpmnXml = await loadFileContent(masterFileUrl, false);

    const mrFileUrl = `${projectUrl}/-/raw/${diffHeadSha}/${filePath}`;
    mrBpmnXml = null;
    mrBpmnXml = await loadFileContent(mrFileUrl, false);
}

function hideModelerPallete() {
    try {
        document.getElementsByClassName('djs-palette')[0].style.display = 'none';
    } catch (error) {
        console.warn('Modeler pallete not found: ', error);
    }
}

async function setPropertiesPanelContainerMaxHeight() {
    const panelContainer = await findElementWithDelay(function () {
        return document.querySelector('.bio-properties-panel-scroll-container');
    });
    if (!panelContainer) {
        console.warn('cnnot find properties panel container');
        return;
    }
    panelContainer.style.maxHeight = panelContainer.offsetHeight;
}

function initDiff(params) {
    projectUrl = params.projectUrl;
    diffHeadSha = params.diffHeadSha;
    filePath = params.filePath;
    fileName = params.fileName;

    bpmnPropertiesPanelModule = window.BpmnJSPropertiesPanel.BpmnPropertiesPanelModule;
    bpmnPropertiesProviderModule = window.BpmnJSPropertiesPanel.BpmnPropertiesProviderModule;
    camundaPlatformPropertiesProviderModule = window.BpmnJSPropertiesPanel.CamundaPlatformPropertiesProviderModule;
    camundaBpmnModdle = params.camundaBpmnModdle;
}

async function showDiff(params) {
    console.debug('diff params: ', params);
    initDiff(params);
    console.debug('show diff: init done');

    createBpmnDiv();
    console.debug('show diff: bpmn div created');

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
    console.debug('show diff: bpmn js created');

    bpmnJSCanvas = bpmnJS.get('canvas');
    bpmnJSElementRegistry = bpmnJS.get('elementRegistry');
    bpmnJSModeling = bpmnJS.get('modeling');
    bpmnJSSelection = bpmnJS.get('selection');
    bpmnJSEventBus = bpmnJS.get('eventBus');

    bpmnJSEventBus.on('selection.changed', function (event) {
        if (event.newSelection.length !== 1) {
            return;
        }
        onSelectedElementChanged(event.newSelection[0].id);
    });

    hideModelerPallete();

    console.debug('show diff: loading bpmn xml...');
    await loadBpmnXml();
    console.debug('show diff: showing bpmn xml...');

    if (mrBpmnXml) {
        showBpmnMr();
    } else {
        showBpmnMaster();
    }

    console.debug('show diff: making canvas visible...');
    // show canvas after the differ is completely rendered
    canvasElem.style.visibility = 'visible';

    // set max-height of the properties panel container to enable scrollbar display when needed
    await setPropertiesPanelContainerMaxHeight();

    console.debug('show diff: ready!');
}

window.addEventListener('message', async function (msg) {
    console.debug('message received', msg);
    if (msg.origin !== window.origin || msg.data.id !== MSG_ID) {
        console.debug(`skip message: msg.origin = ${msg.origin}; msg.data.id = ${msg.data.id}`);
        return;
    }
    console.debug('showing diff...');
    await showDiff(msg.data.params);
});
