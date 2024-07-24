const BUTTON_ID = 'btn_77844bf3d4e842caa0d88194431197c0';

const MSG_BPMN_ID = 'msg_bpmn_71e23e639965407fb9c87f100a56c898';
const MSG_DMN_ID = 'msg_dmn_71e23e639965407fb9c87f100a56c898';

const SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTOR = '#content-body > div.merge-request > div.merge-request-details.issuable-details > div.merge-request-tabs-holder.js-tabs-affix > div > div';
const SHOW_BRANCH_BTN_PARENT_CONTAINER_SELECTOR = 'div.gl-display-flex.gl-flex-wrap.file-actions';

const BPMN_FILE_EXT = '.bpmn';
const DMN_FILE_EXT = '.dmn';

const BPMN_FILE_TYPE = 'bpmn';
const DMN_FILE_TYPE = 'dmn';

const INDEX_NOT_FOUND = -1;

let projectUrl = null;
let projectHostUrl = null;
let projectGroupName = null;
let projectName = null;
let projectId = null;

let mrIid = null;
let mrInfoUrl = null;

let camundaBpmnModdle = null;

let mrLastCommitId = null;
let masterCommitEntries = null;
let filteredByTitleMasterCommitEntries = null;


async function isDiffsTabActive() {
    // wait for the href will updated
    await delay(200);
    const href = window.location.href;
    // console.debug('href: ' + href);
    return href.includes('/-/merge_requests/') && href.includes('/diffs');
}

async function getBranchBpmnOrDmnShowingFileType() {
    // wait for the href will updated
    await delay(200);
    const href = window.location.href;
    // console.debug('href: ' + href);
    if (!href.includes('/-/blob/')) {
        return null;
    }
    const hrefWithoutParams = href.split('?')[0]
    if (hrefWithoutParams.endsWith(BPMN_FILE_EXT)) {
        return BPMN_FILE_TYPE;
    }
    if (hrefWithoutParams.endsWith(DMN_FILE_EXT)) {
        return DMN_FILE_TYPE;
    }
    return null;
}

/**
 * init project url, host url, name, group name and id
 */
async function initProjectParams() {
    const href = window.location.href;
    projectUrl = href.substring(0, href.indexOf('/-/'));
    if (!projectUrl) {
        // it is not error - maybe current url is root of the project page
        console.debug('cannot get project url');
        return false;
    }
    const parts = projectUrl.split('/');
    if (parts.length < 3) {
        console.error('cannot get project group name and name from url: ' + projectUrl);
        return false;
    }
    projectGroupName = parts[parts.length - 2];
    projectName = parts[parts.length - 1];

    parts.pop();
    parts.pop();
    projectHostUrl = parts.join('/');

    projectId = await getProjectId(projectHostUrl, projectGroupName, projectName);
    if (!projectId) {
        console.debug('cannot get project id');
        return false;
    }

    console.debug(`project params: 
        url: ${projectUrl}; 
        host url: ${projectHostUrl}; 
        group name: ${projectGroupName}; 
        name: ${projectName}; 
        id = ${projectId}`
    );
    return true;
}

async function getProjectId(projectHostUrl, projectGroupName, projectName) {
    // 1) load all projects info by name: https://<gitlab-host>/api/v4/projects/?simple=true&search=<project name>
    // 2) find by field "path_with_namespace" == <project-group-name>/<projct name>
    // 3) get "id" field value

    const url = projectHostUrl + '/api/v4/projects/?simple=true&search=' + projectName;
    const content = await loadFileContent(url, true);
    const protectInfoArr = JSON.parse(content);

    const pathWithNs = projectGroupName + '/' + projectName;
    const protectInfo = protectInfoArr.find(i => i.path_with_namespace === pathWithNs);
    if (!protectInfo) {
        return null;
    }

    return protectInfo.id;
}

function initMrIidAndInfoUrl() {
    // MR info url has format:
    //   https://<gitlab-host>/api/v4/projects/<project-group-name>%2F<project name>/merge_requests/<mr iid>
    // Project url has format:
    //   https://<gitlab-host>/<project-group-name>/<project name>
    // but now the current href has format:
    //   <projectUrl>/-/merge_requests/<MR iid>/diffs[#hash]

    const beforeIidLen = projectUrl.length + '/-/merge_requests/'.length;
    mrIid = window.location.href.substring(beforeIidLen);

    let slashIndex = mrIid.indexOf('/');
    if (slashIndex !== -1) {
        mrIid = mrIid.substring(0, slashIndex);
    }
    // console.debug('mrIid: ' + mrIid);

    mrInfoUrl = projectUrl.substring(0, projectUrl.length - projectName.length - 1);
    slashIndex = mrInfoUrl.lastIndexOf('/');
    mrInfoUrl = mrInfoUrl.substring(0, slashIndex) + '/api/v4/projects/' + mrInfoUrl.substring(slashIndex + 1) +
        '%2F' + projectName + '/merge_requests/' + mrIid;
    // console.debug('mrInfoUrl: ' + mrInfoUrl);
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
        if (elem.classList.contains('diff-file')) {
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

function addButtonToPage(
    fileType,
    buttonText,
    parentContainerSelector,
    appendAtTheEnd,
    onButtonClickFunc,
    needToSelectLocalFile
) {
    // removing the button again because sometimes two buttons appear
    removeElement(BUTTON_ID);

    const buttonContainer = document.createElement('div');
    buttonContainer.id = BUTTON_ID
    buttonContainer.className = 'gl-display-flex';

    const button = document.createElement('button');
    button.id = BUTTON_ID + '-btn';
    button.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
    button.textContent = buttonText;
    button.addEventListener('mouseup', onButtonClickFunc);
    buttonContainer.appendChild(button);

    if (needToSelectLocalFile) {
        const fileInput = document.createElement('input');
        fileInput.id = BUTTON_ID + '-input';
        fileInput.type = 'file';
        fileInput.accept = fileType === BPMN_FILE_TYPE ? '.bpmn' : '.dmn';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (event) => localFileSelected(event, onButtonClickFunc));
        buttonContainer.appendChild(fileInput);

        const button2 = document.createElement('button');
        button2.id = BUTTON_ID + '-btn2';
        button2.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50';
        button2.textContent = 'Show diff with local';
        button2.addEventListener('mouseup', () => { fileInput.click(); });
        buttonContainer.appendChild(button2);
    }

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

function localFileSelected(event, onButtonClickFunc) {
    const file = event.target.files[0];
    if (!file) {
        console.error('Cannot select local file');
        return;
    }
    console.debug('Selected local file: ' + file.name);

    // reset input-element value to catch change-event next time
    // even if the same value will selected
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        console.debug('Selected local file has been read');
        const extParams = {
            localFileContent: content,
            mrBranchName: 'local file',
        };
        onButtonClickFunc(extParams);
    };
    reader.onerror = function (e) {
        console.error('Error while reading local file ' + file.name, e.target.error);
    };
    reader.readAsText(file);
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

async function addShowDiffButton() {
    console.debug('adding show diff button...');

    const dataPathElems = await findDataPathElements();
    if (!dataPathElems) {
        console.info('cannot find data-path element');
        // TODO: re-send event?
        return;
    }

    const filePath = findSelectedFilePath(dataPathElems);
    // console.debug('filePath = ' + filePath, dataPathElems);
    if (filePath == null) {
        console.debug('file not selected');
        return;
    }

    let fileType = null;
    if (filePath.endsWith(BPMN_FILE_EXT)) {
        fileType = BPMN_FILE_TYPE;
        console.debug('selected file is bpmn');
    } else if (filePath.endsWith(DMN_FILE_EXT)) {
        fileType = DMN_FILE_TYPE;
        console.debug('selected file is dmn');
    } else {
        console.debug('selected file is neither bpmn nor dmn');
        return null;
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

    const mrCommitTitle = await getMrCommitTitle();
    const mrBranchNames = getMrSourceAndTargetBranchName();
    console.debug('mr branch names', mrBranchNames);

    const targetCommitId = await getTargetCommitId(mrCommitId, mrCommitTitle, mrBranchNames.targetBranchName);
    if (!targetCommitId) {
        console.info('target commit id not found!');
        // go on: will use lastest master commit in differ
    }

    await loadCamundaBpmnModdle();

    const params = {
        projectUrl: projectUrl,
        projectHostUrl: projectHostUrl,
        projectId: projectId,
        mrCommitId: mrCommitId,
        mrBranchName: mrBranchNames.sourceBranchName,
        branchCommitId: targetCommitId,
        filePath: filePath,
        fileName: fileName,
        camundaBpmnModdle: camundaBpmnModdle
    };
    const buttonName = fileType === BPMN_FILE_TYPE ? 'Show schema diff' : 'Show decision diff';
    const msgId = fileType === BPMN_FILE_TYPE ? MSG_BPMN_ID : MSG_DMN_ID;

    addButtonToPage(
        fileType,
        buttonName,
        SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTOR,
        true,
        () => openDiffer(
            params,
            null,
            msgId,
            (resourceName) => chrome.runtime.getURL(resourceName)
        ),
        false
    );
}

async function getMrCommitTitle() {
    const content = await loadFileContent(mrInfoUrl, true);
    const mrInfo = JSON.parse(content);
    console.debug('mr title: ' + mrInfo.title);
    return mrInfo.title;
}

async function getTargetCommitId(mrCommitId, mrCommitTitle, mrTargetBranchName) {
    // getting the target commit (and its id) algorithm:
    // 1) if MR is not merged - get the latest commit from the target branch
    //      and it is mrTargetBranchName
    // 2) when MR is already merged - try to find a commit that comes immediately before 
    //      the commit that resulted from the merge of this MR
    console.debug('getting target commit id...');

    // TODO: when MR contained several commits and was merged by squashing,
    //  findTargetBranchPreviousCommitId will fail to find targetCommitId
    //  because mrCommitId will not be among the commits of the target branch
    let targetCommitId = await findTargetBranchPreviousCommitId(mrCommitId);
    if (!targetCommitId) {
        // try to find commit id resulting as a merge MR by squashing
        // it will be different from mrCommitId (this function parameter)
        const actualMrCommitId = await findTargetBranchCommitIdByTitle(mrCommitTitle);
        if (actualMrCommitId) {
            // and try to find prev commit by by this actual mr commit id
            targetCommitId = await findTargetBranchPreviousCommitId(actualMrCommitId);
        }
    }

    if (!targetCommitId) {
        console.debug('MR is not merged. Target commit id is target branch name: ' + mrTargetBranchName);
        return mrTargetBranchName;
    }
    console.debug('MR is already merged. Target commit id is previous before the merged MR commit: ' + targetCommitId);
    return targetCommitId;
}

function getMrSourceAndTargetBranchName() {
    const pageDescrElem = document.querySelector('div.detail-page-description');
    if (!pageDescrElem) {
        console.warn('Cannot get MR detail page description element');
        return null;
    }

    // assume that the page description element has the structure:
    // <div>
    //     <span>...</span>
    //     <a >...</a> requested to merge <a >...</a>
    //     <button>...</button> into <a>...</a>
    //     <time >...</time>
    // </div>
    // and try to find <a> which comes immediately before and after the text "into"
    let srcBranchName = null;
    let trgBranchName = null;
    let isNextATargetBranchName = false;
    for (node of pageDescrElem.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('into')) {
            isNextATargetBranchName = true;
            continue;
        }
        if (node.tagName === 'A') {
            if (isNextATargetBranchName) {
                trgBranchName = node.textContent;
                break;
            } else {
                srcBranchName = node.textContent;
            }
        }
    }
    return {
        sourceBranchName: srcBranchName,
        targetBranchName: trgBranchName
    };
}

async function loadMasterCommitEntries() {
    console.debug('loading master commit entries...');
    if (masterCommitEntries) {
        console.debug('loading master commit entries...done (used cache)');
        return;
    }

    // TODO: this approach does not guarantee that we will load a sufficient number of commits
    const [page1, page2, page3, page4, page5] = await Promise.all([
        loadMasterCommitEntriesPage(1),
        loadMasterCommitEntriesPage(2),
        loadMasterCommitEntriesPage(3),
        loadMasterCommitEntriesPage(4),
        loadMasterCommitEntriesPage(5),
    ]);
    masterCommitEntries = [...page1, ...page2, ...page3, ...page4, ...page5];

    console.debug('loading master commit entries...done');
}

async function loadMasterCommitEntriesPage(pageNumber) {
    const offset = (pageNumber - 1) * 100;
    const url = projectUrl + '/-/commits/' + MASTER_BRANCH_NAME + '?format=atom&limit=100&offset=' + offset;
    // console.debug('url: ' + url);
    const content = await loadFileContent(url, true);
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    return Array.from(doc.getElementsByTagName('entry'));
}

async function loadFilteredByTitleMasterCommitEntries(commitTitle) {
    console.debug('loading master commit entries filtered by title...');
    if (filteredByTitleMasterCommitEntries) {
        console.debug('loading master commit entries filtered by title...done (used cache)');
        return;
    }

    const url = projectUrl + '/-/commits/' + MASTER_BRANCH_NAME + '?format=atom&search=' + encodeURIComponent(commitTitle);
    // console.debug('url: ' + url);
    const content = await loadFileContent(url, true);
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    filteredByTitleMasterCommitEntries = Array.from(doc.getElementsByTagName('entry'));

    console.debug('loading master commit entries filtered by title...done');
}

async function findTargetBranchPreviousCommitId(commitId) {
    // TODO: now Target branch is always Master

    // loads master commit entries, find entry with requested commit id, 
    // gets next (earlier) entry and returns its id
    console.debug('try to find target branch previous commit id for commit id: ' + commitId);

    await loadMasterCommitEntries();

    const index = masterCommitEntries.findIndex(entry => {
        const idElement = entry.querySelector('id');
        return idElement && idElement.textContent.includes(commitId);
    });
    if (index == INDEX_NOT_FOUND) {
        // console.debug('entry not found');
        return null;
    }
    // console.debug('found entry index: ' + index);

    const nextIndex = index + 1;
    if (nextIndex >= masterCommitEntries.length) {
        console.warn('next index is out of range! array length: ' + masterCommitEntries.length);
        return null;
    }

    const entry = masterCommitEntries[nextIndex];
    const idElemText = entry.querySelector('id').textContent;
    const foundCommitId = idElemText.substring(idElemText.lastIndexOf('/') + 1);
    // console.debug('found commit id: ' + foundCommitId);
    return foundCommitId;
}

async function findTargetBranchCommitIdByTitle(commitTitle) {
    console.debug('try to find target branch commit id by title: ' + commitTitle);

    await loadFilteredByTitleMasterCommitEntries(commitTitle);

    const index = filteredByTitleMasterCommitEntries.findIndex(entry => {
        const titleElement = entry.querySelector('title');
        return titleElement && titleElement.textContent.includes(commitTitle);
    });
    if (index == INDEX_NOT_FOUND) {
        // console.debug('entry not found');
        return null;
    }
    // console.debug('found entry index: ' + index);

    const entry = filteredByTitleMasterCommitEntries[index];
    const idElemText = entry.querySelector('id').textContent;
    const foundCommitId = idElemText.substring(idElemText.lastIndexOf('/') + 1);
    // console.debug('found commit id: ' + foundCommitId);
    return foundCommitId;
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
        // console.debug('mr last commit id (from cache): ' + mrLastCommitId);
        return mrLastCommitId;
    }

    // get url for loading MR commits info
    // the url format is: <projectUrl>/-/merge_requests/<MR iid>/commits.json
    // but now the current href is <projectUrl>/-/merge_requests/<MR iid>/diffs[#hash]
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
    // console.debug('mr last commit id: ' + mrLastCommitId);
    return mrLastCommitId;
}

async function addShowBranchButton(fileType) {
    console.debug(`adding show branch ${fileType} button...`);

    const res = extractBranchCommitIdAndFilePath();
    if (!res) {
        return;
    }
    console.debug('extracted BranchCommitIdAndFilePath res: ', res);

    const branchCommitId = res.branchCommitId;
    const filePath = res.filePath;
    const fileName = getFileNameFromPath(filePath);

    console.debug('branchCommitId: ' + branchCommitId);
    console.debug('filePath: ' + filePath);
    console.debug('fileName: ' + fileName);

    await loadCamundaBpmnModdle();

    const params = {
        projectUrl: projectUrl,
        projectHostUrl: projectHostUrl,
        projectId: projectId,
        mrCommitId: null,
        mrBranchName: null,
        branchCommitId: branchCommitId,
        filePath: filePath,
        fileName: fileName,
        camundaBpmnModdle: camundaBpmnModdle
    };
    const buttonName = fileType === BPMN_FILE_TYPE ? 'Show schema' : 'Show decision';
    const msgId = fileType === BPMN_FILE_TYPE ? MSG_BPMN_ID : MSG_DMN_ID;

    addButtonToPage(
        fileType,
        buttonName,
        SHOW_BRANCH_BTN_PARENT_CONTAINER_SELECTOR,
        false,
        (extParams) => openDiffer(
            params,
            extParams,
            msgId,
            (resourceName) => chrome.runtime.getURL(resourceName)
        ),
        true
    );
}

function extractBranchCommitIdAndFilePath() {
    let branchCommitId = extractBranchCommitIdByDocSelectorCase1();
    if (!branchCommitId) {
        branchCommitId = extractBranchCommitIdByDocSelectorCase2();
    }
    return extractBranchCommitIdAndFilePathByRegex(branchCommitId);
}

function extractBranchCommitIdByDocSelectorCase1() {
    let elem = document.querySelector('div.ref-selector');
    if (!elem) {
        console.debug('cannot extract branch commit id and bpmn file path by doc selector case 1: ref-selector not found');
        return null;
    }
    
    elem = elem.querySelector('.gl-dropdown-button-text');
    if (!elem) {
        console.debug('cannot extract branch commit id and bpmn file path by doc selector case 1: gl-dropdown-button-text not found');
        return null;
    }

    return elem.innerText;
}

function extractBranchCommitIdByDocSelectorCase2() {
    let elem = document.querySelector('button.js-project-refs-dropdown');
    if (!elem) {
        console.debug('cannot extract branch commit id and bpmn file path by doc selector case 2: refs-dropdown not found');
        return null;
    }

    elem = elem.querySelector('.dropdown-toggle-text');
    if (!elem) {
        console.debug('cannot extract branch commit id and bpmn file path by doc selector case 2: dropdown-toggle-text not found');
        return null;
    }

    return elem.innerText;
}

function extractBranchCommitIdAndFilePathByRegex(branchCommitId) {
    const href = window.location.href;

    // TODO: not working for all cases: need to get filename from gitlab api
    let regex = `\/-\/blob\/([0-9a-zA-Z-_./]+)\/(${projectName}\/.*)`;
    let match = href.match(regex);
    // console.debug('match: ', match);
    if (!match || match.length < 3) {
        if (!branchCommitId) {
            branchCommitId = 'master|develop|feature\/[0-9a-zA-Z-_.]+|bugfix\/[0-9a-zA-Z-_.]+|[0-9a-zA-Z-_./]+';
        }
        regex = `\/-\/blob\/(` + branchCommitId + `)\/(.*)`;
        match = href.match(regex);
        // console.debug('match: ', match);
        if (!match || match.length < 3) {
            console.warn('cannot extract branch commit id and bpmn file path by regex from url: ' + href);
            return null;
        }
    }

    // remove url params
    const filePath = match[2].split('?')[0];

    return {
        branchCommitId: match[1],
        filePath: filePath
    };
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

    const projectParamsDone = await initProjectParams();
    if (!projectParamsDone) {
        return;
    }

    initMrIidAndInfoUrl(); // todo: do not call when it is not MR

    const diffsTabActive = await isDiffsTabActive();
    if (diffsTabActive) {
        console.debug('diffs tab is active');
        await addShowDiffButton();
        return;
    }
    console.debug('diffs tab is not active');

    const branchBpmnOrDmnShowingFileType = await getBranchBpmnOrDmnShowingFileType();
    if (branchBpmnOrDmnShowingFileType === BPMN_FILE_TYPE) {
        await addShowBranchButton(BPMN_FILE_TYPE);
        return;
    } else if (branchBpmnOrDmnShowingFileType === DMN_FILE_TYPE) {
        await addShowBranchButton(DMN_FILE_TYPE);
        return;
    } else {
        console.debug('branch bpmn or dmn file is not showing');
    }
}

function main() {
    appendTimeToConsoleLogs();

    window.onload = start;

    // catches 'mouseup' rather than 'click' because 
    // the click event sometimes doesn't appear when clicking on a tab
    document.body.addEventListener('mouseup', start);
}

main();
