const BUTTON_ID = 'btn_77844bf3d4e842caa0d88194431197c0';
const MSG_ID = 'msg_71e23e639965407fb9c87f100a56c898';
const DEFAULT_MASTER_COMMIT_ID = 'master';

const SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTOR = '#content-body > div.merge-request > div.merge-request-details.issuable-details > div.merge-request-tabs-holder.js-tabs-affix > div > div';
const SHOW_MASTER_BTN_PARENT_CONTAINER_SELECTOR = 'div.gl-display-flex.gl-flex-wrap.file-actions';

let camundaBpmnModdle = null;

let mrLastCommitId = null;
let masterCommitEntries = null;


async function isDiffsTabActive() {
    // wait for the href will updated
    await delay(200);
    const href = window.location.href;
    // console.debug('href: ' + href);
    return href.includes('/-/merge_requests/') && href.includes('/diffs');
}

async function isMasterBpmnFileShowing() {
    // wait for the href will updated
    await delay(200);
    const href = window.location.href;
    // console.debug('href: ' + href);
    return href.includes('/-/blob/') && href.endsWith('.bpmn');
}

function getProjectUrl() {
    const href = window.location.href;
    const res = href.substring(0, href.indexOf('/-/'));
    // console.debug('project url: ' + res);
    return res;
}

async function findDataPathElements() {
    return await doWithAttempts(function () {
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
        console.debug('cannot get file path from data-path element');
        return null;
    }
    if (!filePath.endsWith('.bpmn')) {
        console.debug('selected file is not bpmn');
        return null;
    }
    return filePath;
}

function findDiffHeadSha() {
    console.debug('finding diff head sha...');

    const elem = document.getElementById('js-vue-mr-discussions');
    if (!elem) {
        console.debug('js-vue-mr-discussions not found');
        return null;
    }
    const data = elem.getAttribute('data-noteable-data');
    if (!data) {
        console.debug('att data-noteable-data not found');
        return null;
    }
    const matches = /"diff_head_sha":"([0-9a-f]+)"/g.exec(data);
    if (matches && matches.length >= 2) {
        const res = matches[1];
        console.debug('diffHeadSha: ' + res);
        return res;
    } else {
        console.debug('diffHeadSha not found by regex');
        return null;
    }
}

function addButtonToPage(buttonText, parentContainerSelector, appendAtTheEnd, onButtonClickFunc) {
    // removing the button again because sometimes two buttons appear
    removeElement(BUTTON_ID);

    const button = document.createElement('button');
    button.id = BUTTON_ID + '-btn';
    button.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    button.textContent = buttonText;
    button.addEventListener('mouseup', onButtonClickFunc);

    const buttonContainer = document.createElement('div');
    buttonContainer.id = BUTTON_ID
    buttonContainer.className = 'gl-display-flex';
    buttonContainer.appendChild(button);

    const parentContainer = document.querySelector(parentContainerSelector);
    if (!parentContainer) {
        console.error('Cannot find button parent container by selector', parentContainerSelector);
        return;
    }
    if (appendAtTheEnd) {
        parentContainer.appendChild(buttonContainer);
    } else {
        parentContainer.prepend(buttonContainer);
    }
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

    await addStylesheet('styles.css', doc);
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

async function openDiffer(params) {
    console.debug('opening differ...');
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
    console.debug('opening differ...done');
}

async function addShowDiffButton(projectUrl) {
    console.debug('adding show diff button...');

    const dataPathElems = await findDataPathElements();
    if (!dataPathElems) {
        console.info('cannot find data-path element');
        // TODO: re-send event?
        return;
    }

    const filePath = findSelectedFilePath(dataPathElems);
    if (filePath == null) {
        console.debug('bpmn file not selected');
        return;
    }
    const fileName = getFileNameFromPath(filePath);

    const mrCommitId = await getMrCommitId();
    if (mrCommitId) {
        console.debug('mr commit id: ' + mrCommitId);
    }
    else {
        console.info('mr commit id not found');
        // Sometimes, when opening the MR for the first time,
        // the element that holds the diff hash (mrCommitId) is not loaded in the DOM
        // and cannot be found. But reloading the page helps (sometimes)
        location.reload();
        return;
    }

    const masterCommitId = await getMasterCommitId(projectUrl, mrCommitId);
    if (!masterCommitId) {
        console.info('master commit id not found!');
        // go on: will use lastest master commit in differ
    }

    await loadCamundaBpmnModdle();

    const params = {
        projectUrl: projectUrl,
        mrCommitId: mrCommitId,
        masterCommitId: masterCommitId,
        filePath: filePath,
        fileName: fileName,
        camundaBpmnModdle: camundaBpmnModdle
    };
    addButtonToPage(
        'Show schema diff',
        SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTOR,
        true,
        () => openDiffer(params)
    );
}

async function getMasterCommitId(projectUrl, mrCommitId) {
    console.debug('getting master commit id...');

    await loadMasterCommitInfo(projectUrl);
    const mrCommitEntryIndex = findMasterCommitEntryById(mrCommitId);
    if (mrCommitEntryIndex === -1) {
        console.debug('MR is not merged');
        return DEFAULT_MASTER_COMMIT_ID;
    }

    console.debug('MR is already merged!');

    const masterCommitEntryIndex = mrCommitEntryIndex + 1;
    if (masterCommitEntryIndex >= masterCommitEntries.length) {
        console.warn('masterCommitEntryIndex is out of range! array length: ' + masterCommitEntries.length);
        return null;
    }

    const masterCommitEntry = masterCommitEntries[masterCommitEntryIndex];
    const masterCommitEntryIdElemText = masterCommitEntry.querySelector('id').textContent;

    const masterCommitId = masterCommitEntryIdElemText.substring(masterCommitEntryIdElemText.lastIndexOf('/') + 1);
    console.debug('master commit id: ' + masterCommitId);

    return masterCommitId;
}

async function loadMasterCommitInfo(projectUrl) {
    console.debug('loading master commit entries...');
    if (masterCommitEntries) {
        console.debug('loading master commit entries...done (use cache)');
        return;
    }

    const getMasterCommitInfoUrl = projectUrl + '/-/commits/master?format=atom&limit=100';
    // console.debug('master commit info url: ' + getMasterCommitInfoUrl);

    const masterCommitInfo = await loadFileContent(getMasterCommitInfoUrl, true);

    // find MR commit id among master's commits
    const parser = new DOMParser();
    const masterCommitInfoDoc = parser.parseFromString(masterCommitInfo, 'text/xml');
    masterCommitEntries = Array.from(masterCommitInfoDoc.getElementsByTagName('entry'));
    console.debug('loading master commit entries...done');
}

function findMasterCommitEntryById(commitId) {
    if (!masterCommitEntries) {
        console.warn('master commit entries is undefined');
        return -1;
    }
    return masterCommitEntries.findIndex(entry => {
        const idElement = entry.querySelector('id');
        return idElement && idElement.textContent.includes(commitId);
    });
}

/**
 * Getting mrCommitId by different strategies
 */
async function getMrCommitId() {
    const commitId = await getMrLastCommitId();
    if (commitId) {
        return commitId;
    }

    const diffHeadSha = findDiffHeadSha();
    if (diffHeadSha) {
        return diffHeadSha;
    }

    // maybe some another strategy...

    return null;
}

async function getMrLastCommitId() {
    console.debug('getting mr last commit id...');

    if (mrLastCommitId) {
        console.debug('mr last commit id (from cache): ' + mrLastCommitId);
        return mrLastCommitId;
    }

    // get url for loading MR commits info
    // the url format is: <projectUrl>/-/merge_requests/<MR number>/commits.json
    // but now the current href is <projectUrl>/-/merge_requests/<MR number>/diffs[#hash]
    const href = window.location.href;
    const getMrCommitInfoUrl = href.substring(0, href.indexOf('/diffs')) + '/commits.json';
    // console.debug('mr commit info url: ' + getMrCommitInfoUrl);

    const mrCommitInfo = await loadFileContent(getMrCommitInfoUrl, true);

    // find the first occurance of 'commit_id=' substring
    // this will be the hash of the latest commit in this branch (the number of commits can be more than one)
    const regex = /commit_id=([a-fA-F0-9]+)/;
    const match = mrCommitInfo.match(regex);
    if (!match || match.length < 2) {
        console.warn('cannot find mr last commit id in commits info!', mrCommitInfo);
        return null;
    }
    mrLastCommitId = match[1];
    console.debug('mr last commit id: ' + mrLastCommitId);
    return mrLastCommitId;
}

async function addShowMasterButton(projectUrl) {
    console.debug('adding show master button...');

    const regex = /\/-\/blob\/([a-f0-9]+|master)\/(.*)/;
    const match = window.location.href.match(regex);
    console.debug('match: ', match);
    if (!match || match.length < 3) {
        console.warn('cannot get master commit id and bpmn file path from url', window.location.href);
        return;
    }
    const masterCommitId = match[1];
    const filePath = match[2];
    const fileName = getFileNameFromPath(filePath);

    console.debug('masterCommitId: ' + masterCommitId);
    console.debug('filePath: ' + filePath);
    console.debug('fileName: ' + fileName);

    await loadCamundaBpmnModdle();

    const params = {
        projectUrl: projectUrl,
        mrCommitId: null,
        masterCommitId: masterCommitId,
        filePath: filePath,
        fileName: fileName,
        camundaBpmnModdle: camundaBpmnModdle
    };
    addButtonToPage(
        'Show schema',
        SHOW_MASTER_BTN_PARENT_CONTAINER_SELECTOR,
        false,
        () => openDiffer(params)
    );
}

async function start(event) {
    console.debug('start...');
    if (!window.location.href.includes('gitlab')) {
        console.debug('it is not gitlab page');
        return;
    }

    if (event && event.target.id && event.target.id.startsWith(BUTTON_ID)) {
        console.debug('click on the plugin button is ignored');
        return;
    }
    removeElement(BUTTON_ID);

    const projectUrl = getProjectUrl();
    if (projectUrl == null) {
        console.error('cannot get project url');
        return;
    }

    const diffsTabActive = await isDiffsTabActive();
    if (diffsTabActive) {
        console.debug('diffs tab is active');
        await addShowDiffButton(projectUrl);
        return;
    }
    console.debug('diffs tab is not active');

    const masterBpmnFileShowing = await isMasterBpmnFileShowing();
    if (masterBpmnFileShowing) {
        await addShowMasterButton(projectUrl);
        return;
    }
    console.debug('master bpmn file is not showing');

}

function main() {
    appendTimeToConsoleLogs();

    window.onload = start;

    // catches 'mouseup' rather than 'click' because 
    // the click event sometimes doesn't appear when clicking on a tab
    document.body.addEventListener('mouseup', start);
}

main();
