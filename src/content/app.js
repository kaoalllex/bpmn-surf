/**
 * Main application class for BPMN/DMN diff
 */
class App {
    static MESSAGES = {
        BPMN_ID: 'msg_bpmn_71e23e639965407fb9c87f100a56c898',
        DMN_ID: 'msg_dmn_71e23e639965407fb9c87f100a56c898'
    };

    #isStartHandling = false;

    #repoProvider;
    #uiRepoProvider;
    #moddleManager;
    #pageReloader;
    #fileTypeDetector;
    #diffParamsBuilder;

    constructor(repoProvider = createRepoProvider(), uiRepoProvider = createUIRepoProvider()) {
        this.#repoProvider = repoProvider;
        this.#uiRepoProvider = uiRepoProvider;
        this.#moddleManager = new CamundaBpmnModdleManager();
        this.#pageReloader = new PageReloader();
        this.#fileTypeDetector = new FileTypeDetector();
        this.#diffParamsBuilder = new DiffParamsBuilder();
    }

    /**
     * Initializes the application
     */
    init() {
        appendTimeToConsoleLogs();

        // try to start immediately (in case of direct page load)
        this.#handleStart(null, 'immediately');

        // listen for mouseup events to switch tabs in GitLab
        // use bind to avoid losing context, or arrow function
        document.body.addEventListener(
            'mouseup',
            (event) => this.#handleStart(event, 'after mouseup')
        );

        // listen for popstate events to handle navigation
        window.addEventListener(
            'popstate',
            () => this.#handleStart(null, 'after popstate')
        );
    }

    async #handleStart(event, reason) {
        if (this.#isStartHandling) {
            console.debug('skip start, already running:', reason);
            return;
        }

        this.#isStartHandling = true;
        try {
            console.debug('starting...', reason);
            await this.#doStart(event);
        } finally {
            this.#isStartHandling = false;
        }
    }

    async #doStart(event) {
        console.debug('do start...');

        if (!this.#repoProvider.isAvailable()) {
            console.debug('provider is not available for current page');
            return;
        }

        if (this.#uiRepoProvider.isOwnButtonClick(event)) {
            console.debug('click on the plugin button is ignored');
            return;
        }

        this.#uiRepoProvider.reset();

        try {
            const isProviderInitialized = await this.#repoProvider.init();
            if (!isProviderInitialized) {
                return;
            }

            const changeViewHandled = await this.#handleChangeView();
            if (!changeViewHandled) {
                await this.#handleBranchView();
            }
        } catch (error) {
            console.error('Error in #handleStart:', error);
        }
    }

    /**
     * Handles the change (MR/PR) diffs view
     * @returns {Promise<boolean>} true if button was successfully added, false otherwise
     */
    async #handleChangeView() {
        const changeViewActive = await this.#repoProvider.isChangeViewActive();
        if (!changeViewActive) {
            console.debug('diffs tab is not active');
            return false;
        }

        console.debug('diffs tab is active');
        await this.#repoProvider.initChangeInfo();
        await this.#addDiffButton();
        return true;
    }

    /**
     * Handles branch file view
     * @returns {Promise<boolean>} true if button was successfully added, false otherwise
     */
    async #handleBranchView() {
        const branchFileType = await this.#repoProvider.getBranchFileType();
        if (!branchFileType) {
            console.debug('branch bpmn or dmn file is not showing');
            return false;
        }

        await this.#addBranchButton(branchFileType);
        return true;
    }

    /**
     * Adds button to display diff in Merge Request
     */
    async #addDiffButton() {
        console.debug('adding show diff button...');

        const filePath = await this.#repoProvider.findSelectedFilePath();
        if (!filePath) {
            console.debug('file not selected');
            return;
        }

        const fileType = this.#fileTypeDetector.detect(filePath);
        if (!fileType) {
            console.debug('selected file is neither bpmn nor dmn');
            return;
        }
        console.debug(`selected file is ${fileType.name}`);

        const fileName = getFileNameFromPath(filePath);
        const sourceCommitId = await this.#repoProvider.getSourceCommitId();
        if (!sourceCommitId) {
            this.#pageReloader.attemptReload();
            return;
        }

        console.debug('mr commit id: ' + sourceCommitId);
        this.#pageReloader.reset();

        const changeInfo = this.#repoProvider.getChangeInfo();
        const changeBranchNames = this.#repoProvider.getChangeBranchNames();
        console.debug('mr branch names', changeBranchNames);

        const targetCommitId = await this.#repoProvider.getTargetCommitId(
            sourceCommitId,
            changeInfo.title,
            changeBranchNames.targetBranchName
        );

        if (!targetCommitId) {
            console.info('target commit id not found!');
            // Go on: will use latest master commit in differ
        }

        const diffSideLabels = await this.#repoProvider.getDiffSideLabels(sourceCommitId, targetCommitId);

        const params = await this.#buildDiffParams(
            filePath,
            fileName,
            sourceCommitId,
            targetCommitId,
            diffSideLabels
        );

        this.#addButton(fileType, UI_BUTTON_TYPE.DIFF, params, false);
    }

    /**
     * Adds button to display branch file
     * @param {FileType} fileType file type
     */
    async #addBranchButton(fileType) {
        console.debug(`adding show branch ${fileType.name} button...`);

        const res = this.#repoProvider.extractBranchCommitIdAndFilePath();
        if (!res) {
            return;
        }

        const { branchCommitId, filePath } = res;
        const fileName = getFileNameFromPath(filePath);

        console.debug(
            'extracted BranchCommitIdAndFilePath res: ', res,
            'branchCommitId: ' + branchCommitId,
            'filePath: ' + filePath,
            'fileName: ' + fileName);

        const params = await this.#buildBranchParams(
            branchCommitId,
            filePath,
            fileName
        );
        this.#addButton(fileType, UI_BUTTON_TYPE.BRANCH, params, true);
    }

    /**
     * Creates parameters for diff mode (Merge Request)
     * @private
     */
    async #buildDiffParams(filePath, fileName, sourceCommitId, targetCommitId, diffSideLabels) {
        const projectInfo = this.#repoProvider.getProjectInfo();
        const camundaBpmnModdle = await this.#moddleManager.load();
        return this.#diffParamsBuilder.buildDiffParams({
            projectInfo: projectInfo,
            sourceRef: sourceCommitId,
            sourceLabel: diffSideLabels.sourceLabel,
            targetRef: targetCommitId,
            targetLabel: diffSideLabels.targetLabel,
            changeRequestId: this.#repoProvider.getChangeInfo().iid,
            filePath: filePath,
            fileName: fileName,
            camundaBpmnModdle: camundaBpmnModdle
        });
    }

    /**
     * Creates parameters for branch mode
     * @private
     */
    async #buildBranchParams(branchCommitId, filePath, fileName) {
        const projectInfo = this.#repoProvider.getProjectInfo();
        const camundaBpmnModdle = await this.#moddleManager.load();
        return this.#diffParamsBuilder.buildBranchParams({
            projectInfo: projectInfo,
            targetRef: branchCommitId,
            filePath: filePath,
            fileName: fileName,
            camundaBpmnModdle: camundaBpmnModdle
        });
    }

    /**
     * Adds button via UI provider
     * @private
     */
    #addButton(fileType, buttonType, params, needToSelectLocalFile) {
        const msgId = this.#getMessageId(fileType);
        this.#uiRepoProvider.addButton({
            fileType: fileType,
            buttonType: buttonType,
            needToSelectLocalFile: needToSelectLocalFile,
            onButtonClickFunc: (extParams) => this.#openDiffer(buttonType, params, extParams, msgId)
        });
    }

    /**
     * Opens differ window
     * @private
     */
    async #openDiffer(buttonType, params, extParams, msgId) {
        // After the extension is reloaded/updated, content scripts injected into
        // already-open tabs are orphaned: chrome.runtime is dead and any chrome.*
        // call below (e.g. getURL) throws "Extension context invalidated". The
        // orphaned script cannot revive itself, so detect the dead context up front
        // and ask the user to reload the page (a fresh content script then gets a
        // valid context).
        if (!chrome.runtime?.id) {
            alert('BPMN Diff was updated or reloaded. Please refresh this page (F5) to continue.');
            return;
        }

        let finalParams = extParams ? { ...params, ...extParams } : params;

        // Renamed schema: the target (base) commit still holds the file under its
        // old path, so resolve the target-side path lazily here (off the mouseup
        // hot-path) and pass it to the differ. Only relevant in MR diff mode;
        // when unchanged the params stay byte-for-byte the same (BUG-0002).
        if (buttonType === UI_BUTTON_TYPE.DIFF) {
            const targetFilePath = await this.#repoProvider.getTargetFilePath(params.filePath);
            if (targetFilePath !== params.filePath) {
                finalParams = { ...finalParams, targetFilePath: targetFilePath };
            }
        }

        // Update notification (FEAT-0012): the differ page is a plain web context
        // without chrome.*, so the content script reads the update state here and
        // passes it (plus the popup URL) into the differ via params.
        const updateInfo = await this.#getUpdateInfo();
        if (updateInfo) {
            finalParams = { ...finalParams, updateInfo: updateInfo };
        }

        return openDiffer(
            finalParams,
            null,
            msgId,
            (resourceName) => chrome.runtime.getURL(resourceName)
        );
    }

    /**
     * Asks the update service worker for the current state and builds the
     * differ-toolbar indicator payload. Best-effort: never blocks or breaks
     * opening the differ if the SW is unavailable or the feature is inert.
     * @private
     */
    async #getUpdateInfo() {
        try {
            const state = await chrome.runtime.sendMessage({ type: 'update:getState' });
            const result = state && state.lastResult;
            if (!state || !state.enabled || !result || !result.updateAvailable) {
                return null;
            }
            return {
                updateAvailable: true,
                latestVersion: result.latestVersion,
                popupUrl: chrome.runtime.getURL('src/popup/popup.html')
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Gets message ID for file type
     * @private
     */
    #getMessageId(fileType) {
        return fileType === FILE_TYPE_BPMN
            ? App.MESSAGES.BPMN_ID
            : App.MESSAGES.DMN_ID;
    }
}
