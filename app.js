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

    constructor() {
        this.#repoProvider = new GitLabRepoProvider();
        this.#uiRepoProvider = new GitLabUIRepoProvider();
        this.#moddleManager = new CamundaBpmnModdleManager();
        this.#pageReloader = new PageReloader();
        this.#fileTypeDetector = new FileTypeDetector();
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

            const diffsTabHandled = await this.#handleDiffsTab();
            if (!diffsTabHandled) {
                await this.#handleBranchView();
            }
        } catch (error) {
            console.error('Error in #handleStart:', error);
        }
    }

    /**
     * Handles Merge Request diffs tab
     * @returns {Promise<boolean>} true if button was successfully added, false otherwise
     */
    async #handleDiffsTab() {
        const diffsTabActive = await this.#repoProvider.isDiffsTabActive();
        if (!diffsTabActive) {
            console.debug('diffs tab is not active');
            return false;
        }

        console.debug('diffs tab is active');
        await this.#repoProvider.initMergeRequestInfo();
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
        const mrCommitId = await this.#repoProvider.getMergeRequestCommitId();
        if (!mrCommitId) {
            this.#pageReloader.attemptReload();
            return;
        }

        console.debug('mr commit id: ' + mrCommitId);
        this.#pageReloader.reset();

        const mrInfo = this.#repoProvider.getMergeRequestInfo();
        const mrBranchNames = this.#repoProvider.getMergeRequestBranchNames();
        console.debug('mr branch names', mrBranchNames);

        const targetCommitId = await this.#repoProvider.getTargetCommitId(
            mrCommitId,
            mrInfo.title,
            mrBranchNames.targetBranchName
        );

        if (!targetCommitId) {
            console.info('target commit id not found!');
            // Go on: will use latest master commit in differ
        }

        const params = await this.#buildDiffParams(
            filePath,
            fileName,
            mrCommitId,
            targetCommitId,
            mrBranchNames
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
    async #buildDiffParams(filePath, fileName, mrCommitId, targetCommitId, mrBranchNames) {
        const projectInfo = this.#repoProvider.getProjectInfo();
        const camundaBpmnModdle = await this.#moddleManager.load();
        return {
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
    }

    /**
     * Creates parameters for branch mode
     * @private
     */
    async #buildBranchParams(branchCommitId, filePath, fileName) {
        const projectInfo = this.#repoProvider.getProjectInfo();
        const camundaBpmnModdle = await this.#moddleManager.load();
        return {
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
            onButtonClickFunc: (extParams) => this.#openDiffer(params, extParams, msgId)
        });
    }

    /**
     * Opens differ window
     * @private
     */
    #openDiffer(params, extParams, msgId) {
        const finalParams = extParams ? { ...params, ...extParams } : params;
        return openDiffer(
            finalParams,
            null,
            msgId,
            (resourceName) => chrome.runtime.getURL(resourceName)
        );
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
