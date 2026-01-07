const BUTTON_ID = 'btn_77844bf3d4e842caa0d88194431197c0';

const MSG_BPMN_ID = 'msg_bpmn_71e23e639965407fb9c87f100a56c898';
const MSG_DMN_ID = 'msg_dmn_71e23e639965407fb9c87f100a56c898';

const SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTOR = '#content-body > div.merge-request > div.merge-request-details.issuable-details > div.merge-request-tabs-holder.js-tabs-affix > div > div';
const SHOW_BRANCH_BTN_PARENT_CONTAINER_SELECTOR = 'div.gl-display-flex.gl-flex-wrap.file-actions';

const BPMN_FILE_EXT = '.bpmn';
const DMN_FILE_EXT = '.dmn';

const BPMN_FILE_TYPE = 'bpmn';
const DMN_FILE_TYPE = 'dmn';

const repoProvider = new GitLabRepoProvider();

let camundaBpmnModdle = null;


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

// Константы для управления перезагрузкой
const RELOAD_ATTEMPTS_KEY = 'bpmn_diff_reload_attempts';
const MAX_RELOAD_ATTEMPTS = 3;

/**
 * Функция для управления перезагрузкой страницы с ограничением по количеству попыток
 */
function attemptReloadWithLimit() {
    // Получаем текущее количество попыток из sessionStorage
    let attempts = parseInt(sessionStorage.getItem(RELOAD_ATTEMPTS_KEY)) || 0;
    
    // Увеличиваем счетчик попыток
    attempts++;
    
    // Сохраняем новое значение в sessionStorage
    sessionStorage.setItem(RELOAD_ATTEMPTS_KEY, attempts.toString());
    
    if (attempts <= MAX_RELOAD_ATTEMPTS) {
        console.info(`mr commit id not found. Reloading page, attempt ${attempts}/${MAX_RELOAD_ATTEMPTS}`);
        // Sometimes, when opening the MR for the first time,
        // the element that holds the diff hash (mrCommitId) is not loaded in the DOM
        // and cannot be found. But reloading the page helps (sometimes)
        location.reload();
    } else {
        console.error('Max reload attempts reached. Stopping to prevent infinite loop.');
        // Сбрасываем счетчик попыток
        sessionStorage.removeItem(RELOAD_ATTEMPTS_KEY);
        // Здесь можно добавить отображение сообщения пользователю об ошибке
        alert('Не удалось загрузить данные для сравнения. Попробуйте обновить страницу вручную.');
    }
}

async function addShowDiffButton() {
    console.debug('adding show diff button...');

    const filePath = await repoProvider.findSelectedFilePath();
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

    const mrCommitId = await repoProvider.getMergeRequestCommitId();
    if (mrCommitId) {
        console.debug('mr commit id: ' + mrCommitId);
        // Сбрасываем счетчик попыток при успешном получении mrCommitId
        sessionStorage.removeItem(RELOAD_ATTEMPTS_KEY);
    }
    else {
        attemptReloadWithLimit();
        return;
    }

    const projectInfo = repoProvider.getProjectInfo();
    const mrCommitTitle = repoProvider.getMergeRequestTitle();
    const mrBranchNames = repoProvider.getMergeRequestBranchNames();
    console.debug('mr branch names', mrBranchNames);

    const targetCommitId = await repoProvider.getTargetCommitId(mrCommitId, mrCommitTitle, mrBranchNames.targetBranchName);
    if (!targetCommitId) {
        console.info('target commit id not found!');
        // go on: will use lastest master commit in differ
    }

    await loadCamundaBpmnModdle();

    const params = {
        projectUrl: projectInfo.url,
        projectHostUrl: projectInfo.hostUrl,
        projectId: projectInfo.id,
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

async function addShowBranchButton(fileType) {
    console.debug(`adding show branch ${fileType} button...`);

    const res = repoProvider.extractBranchCommitIdAndFilePath();
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

    const projectInfo = repoProvider.getProjectInfo();
    const params = {
        projectUrl: projectInfo.url,
        projectHostUrl: projectInfo.hostUrl,
        projectId: projectInfo.id,
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

async function start(event) {
    console.debug('start...');
    if (!repoProvider.isAvailable()) {
        console.debug('provider is not available for current page');
        return;
    }

    if (event && event.target.id && event.target.id.startsWith(BUTTON_ID)) {
        console.debug('click on the plugin button is ignored');
        return;
    }
    removeElement(BUTTON_ID);

    const isProviderInitialized = await repoProvider.init();
    if (!isProviderInitialized) {
        return;
    }

    const diffsTabActive = await repoProvider.isDiffsTabActive();
    if (diffsTabActive) {
        console.debug('diffs tab is active');
        await repoProvider.initMergeRequestInfo();
        await addShowDiffButton();
        return;
    }
    console.debug('diffs tab is not active');

    const branchBpmnOrDmnShowingFileType = await repoProvider.getBranchFileType();
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
