const BUTTON_ID = 'btn_77844bf3d4e842caa0d88194431197c0';
const MSG_ID = 'msg_71e23e639965407fb9c87f100a56c898';

let camundaBpmnModdle = null;


async function isDiffsTabActive() {
    // wait for the href will updated
    await delay(200);
    // console.debug('href: ' + window.location.href);
    return window.location.href.includes('/diffs');
}

function getProjectUrl() {
    const href = window.location.href;
    const res = href.substring(0, href.indexOf('/-/'));
    return res;
}

async function findDataPathElements() {
    return await findElementWithDelay(function () {
        const res = document.querySelectorAll('[data-path]');
        if (res && res.length > 0) {
            return res;
        } else {
            return null;
        }
    });
}

function findSelectedFilePath(dataPathElems) {
    let filePath;
    for (const elem of dataPathElems) {
        if (elem.classList.contains('is-active')) {
            filePath = elem.getAttribute('data-path');
            if (filePath) {
                break;
            }
        }
    }
    if (!filePath) {
        console.log('cannot get file path from data-path element');
        return null;
    }
    if (!filePath.endsWith('.bpmn')) {
        console.debug('selected file is not bpmn');
        return null;
    }
    return filePath;
}

function findDiffHeadSha() {
    const elem = document.getElementById('js-vue-mr-discussions');
    if (!elem) {
        return null;
    }
    const data = elem.getAttribute('data-noteable-data');
    const matches = /"diff_head_sha":"([0-9a-f]+)"/g.exec(data);
    if (matches && matches.length >= 2) {
        const res = matches[1];
        return res;
    }
}

function addButtonToPage(onButtonClickFunc) {
    // removing the button again because sometimes two buttons appear
    removeElement(BUTTON_ID);

    const button = document.createElement('button');
    button.id = BUTTON_ID + '-btn';
    button.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    button.textContent = 'Show diff';
    button.addEventListener('mouseup', onButtonClickFunc);

    const buttonContainer = document.createElement('div');
    buttonContainer.id = BUTTON_ID
    buttonContainer.className = 'gl-display-flex';
    buttonContainer.appendChild(button);

    const parentContainer = document.querySelector('#content-body > div.merge-request > div.merge-request-details.issuable-details > div.merge-request-tabs-holder.js-tabs-affix > div > div');
    parentContainer.appendChild(buttonContainer);
}

async function addStylesheet(fileName, doc) {
    return new Promise((resolve, reject) => {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL(fileName);
        doc.head.appendChild(link);
        link.onload = () => { resolve(link); };
        link.onerror = () => { reject(new Error(`Loading failed: ${fileName}`)); };
    });
}

async function addScript(fileName, doc) {
    return new Promise((resolve, reject) => {
        const script = doc.createElement('script');
        script.src = chrome.runtime.getURL(fileName);
        doc.head.appendChild(script);
        script.onload = () => { resolve(script); };
        script.onerror = () => { reject(new Error(`Loading failed: ${fileName}`)); };
    });
}

async function loadScripts(doc) {
    // modeler
    await addStylesheet('libs/bpmn-js/assets/bpmn-js.css', doc);
    await addStylesheet('libs/bpmn-js/assets/diagram-js.css', doc);
    await addStylesheet('libs/bpmn-js/assets/bpmn-font/css/bpmn.css', doc);
    await addScript('libs/bpmn-js/bpmn-modeler.production.min.js', doc);
    // await addScript('libs/bpmn-js/bpmn-modeler.development.js', doc);

    // properties panel
    await addStylesheet('libs/bpmn-js-properties-panel/assets/element-templates.css', doc);
    await addStylesheet('libs/bpmn-js-properties-panel/assets/properties-panel.css', doc);
    await addScript('libs/bpmn-js-properties-panel/bpmn-js-properties-panel.umd.js', doc);

    await addScript('utils.js', doc);
    await addScript('differ.js', doc);
}

async function loadCamundaBpmnModdle() {
    if (camundaBpmnModdle) {
        // skip loading if already loaded 
        return;
    }
    const moddlePath = chrome.runtime.getURL('libs/camunda-bpmn-moddle/resources/camunda.json');
    const moddleContent = await loadFileContent(moddlePath, true);
    camundaBpmnModdle = JSON.parse(moddleContent);
}

function getTitle(fileName) {
    return fileName.replace(/(.{31})/g, "$1 ");
}

async function openDiff(params) {
    console.debug('opening diff...');
    const newWindow = window.open('about:blank');
    console.debug('setting title...');
    newWindow.document.title = getTitle(params.fileName);
    console.debug('loading scripts...');
    await loadScripts(newWindow.document);
    console.debug('loading scripts...done');
    const msg = {
        id: MSG_ID,
        params: params
    }
    console.debug('sending message', msg);
    newWindow.postMessage(msg, '*');
    console.debug('opening diff...done');
}

async function main(event) {
    console.debug('start...');
    if (event.target.id && event.target.id.startsWith(BUTTON_ID)) {
        console.debug('click on the diff button is ignored');
        return;
    }
    removeElement(BUTTON_ID);

    const tabActive = await isDiffsTabActive();
    if (!tabActive) {
        console.debug('diff tab is not active');
        return;
    }

    const projectUrl = getProjectUrl();
    if (projectUrl == null) {
        console.error('projectUrl not found');
        return;
    }

    const dataPathElems = await findDataPathElements();
    if (!dataPathElems) {
        console.log('cannot find data-path element!');
        // TODO: re-send event?
        return;
    }

    const filePath = findSelectedFilePath(dataPathElems);
    if (filePath == null) {
        console.debug('bpmn file not selected');
        return;
    }
    const fileName = getFileNameFromPath(filePath);

    const diffHeadSha = findDiffHeadSha();
    if (diffHeadSha == null) {
        console.log('diff-head-sha not found');
        // Sometimes, when opening the MR for the first time,
        // the element that holds the diff hash is not loaded in the DOM
        // and cannot be found. But reloading the page helps!
        location.reload();
        return;
    }

    await loadCamundaBpmnModdle();

    const params = {
        projectUrl: projectUrl,
        diffHeadSha: diffHeadSha,
        filePath: filePath,
        fileName: fileName,
        camundaBpmnModdle: camundaBpmnModdle
    };

    addButtonToPage(() => openDiff(params));
}

window.onload = main;
// catches 'mouseup' rather than 'click' because 
// the click event sometimes doesn't appear when clicking on a tab
document.body.addEventListener('mouseup', main);
