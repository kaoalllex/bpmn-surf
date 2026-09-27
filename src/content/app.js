/**
 * Main application class for BPMN/DMN diff
 */
class App {
    static MESSAGES = {
        BPMN_ID: 'msg_bpmn_71e23e639965407fb9c87f100a56c898',
        DMN_ID: 'msg_dmn_71e23e639965407fb9c87f100a56c898'
    };

    // Debounce window (ms) for re-running after GitLab finishes rendering a diff.
    static #DOM_RETRIGGER_DELAY_MS = 300;

    #isStartHandling = false;
    #domRetriggerTimer = null;
    // The MR diffs view the per-file buttons were built for: its URL key and the
    // refs every button's diff uses. Null until resolved, or when not on one.
    #changeView = null;
    // Set when the URL moved on while a change view was being resolved: the
    // flow runs once more for the new URL as soon as the current run ends.
    #rerunRequested = false;

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
        this.#diffParamsBuilder = new DiffParamsBuilder(chrome.runtime.getManifest().version);
    }

    /**
     * Initializes the application
     */
    init() {
        ConsoleLog.install();

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

        this.#observeDomChanges();
    }

    /**
     * Keeps the buttons in step with what GitLab renders.
     *
     * On an MR diffs view whose refs are resolved, every mutation batch re-syncs
     * the per-file buttons at once: GitLab mounts file blocks lazily (and the
     * legacy UI unmounts them again as the reader scrolls). The sync is a no-op
     * when every block already has its button, so our own insertions cannot keep
     * the observer firing.
     *
     * Anywhere else the full flow is re-run once the DOM goes quiet, which also
     * catches a late render of the blob view (BUG-0003).
     * @private
     */
    #observeDomChanges() {
        const observer = new MutationObserver(() => {
            if (this.#isChangeViewCurrent()) {
                this.#syncFileButtons();
                return;
            }
            if (this.#domRetriggerTimer) {
                clearTimeout(this.#domRetriggerTimer);
            }
            this.#domRetriggerTimer = setTimeout(() => {
                this.#domRetriggerTimer = null;
                if (this.#isButtonUpToDate()) {
                    return;
                }
                this.#handleStart(null, 'after dom change');
            }, App.#DOM_RETRIGGER_DELAY_MS);
        });
        observer.observe(document.body, { childList: true, subtree: true });
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
        if (this.#rerunRequested) {
            this.#rerunRequested = false;
            this.#handleStart(null, 'url changed while resolving');
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

        try {
            const isProviderInitialized = await this.#repoProvider.init();
            if (!isProviderInitialized) {
                this.#uiRepoProvider.reset();
                return;
            }

            const changeViewHandled = await this.#handleChangeView();
            if (!changeViewHandled && !(await this.#handleBranchView())) {
                this.#uiRepoProvider.reset();
            }
        } catch (error) {
            // Reloading the extension orphans the content scripts already running
            // in open tabs: chrome.runtime dies and the next chrome.* call throws
            // "Extension context invalidated". #openDiffer already recognises that
            // on click; here it used to surface as a bare stack trace in the log,
            // which reads like a defect in the page flow rather than a stale tab.
            if (!chrome.runtime?.id) {
                console.info('bpmn-surf was reloaded; this tab still runs the old ' +
                    'content script. Refresh the page (F5) to get the buttons back.');
                return;
            }
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
        if (!this.#isChangeViewCurrent()) {
            // The buttons carry the refs of the view they were built for; another
            // MR, version or commit selection needs every one rebuilt.
            const key = App.#changeViewKey();
            this.#changeView = null;
            this.#uiRepoProvider.removeFileButtons();
            await this.#repoProvider.initChangeInfo();
            const changeView = await this.#resolveChangeView(key);
            if (key !== App.#changeViewKey()) {
                // The providers read the URL at every step, so refs resolved
                // across a URL change may mix both views: resolve again.
                this.#rerunRequested = true;
                return true;
            }
            this.#changeView = changeView;
        }
        if (this.#changeView) {
            this.#syncFileButtons();
        }
        return true;
    }

    // Whether the branch-view button still belongs to the file on screen. A
    // button that stayed after switching files was BUG-0036.
    #isButtonUpToDate() {
        if (!this.#uiRepoProvider.isButtonPresent()) {
            return false;
        }
        const shownPath = this.#branchFilePath();
        return !!shownPath && shownPath === this.#uiRepoProvider.buttonFilePath();
    }

    // The blob path the branch view shows, or null when it cannot be told
    // (including before a successful provider init, where the getter throws).
    #branchFilePath() {
        try {
            const branchFile = this.#repoProvider.extractBranchCommitIdAndFilePath();
            return branchFile ? branchFile.filePath : null;
        } catch (error) {
            return null;
        }
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

    // The URL a resolved change view belongs to. The hash is left out: the legacy
    // UI writes the picked file there, which changes no refs.
    static #changeViewKey() {
        return window.location.origin + window.location.pathname + window.location.search;
    }

    #isChangeViewCurrent() {
        return !!this.#changeView && this.#changeView.key === App.#changeViewKey();
    }

    /**
     * Resolves what every file's diff shares: the refs and side labels.
     * @param {string} key the change view URL the resolution started for
     * @returns {Promise<Object|null>} null when the source commit is not known yet
     *     (a page reload is attempted, as before)
     * @private
     */
    async #resolveChangeView(key) {
        const sourceCommitId = await this.#repoProvider.getSourceCommitId();
        if (!sourceCommitId) {
            this.#pageReloader.attemptReload();
            return null;
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

        // The params are built on click; loading the moddle there the first time
        // would delay the differ tab, so warm its cache now.
        await this.#moddleManager.load();

        return { key, sourceCommitId, targetCommitId, diffSideLabels };
    }

    #syncFileButtons() {
        const changeView = this.#changeView;
        this.#uiRepoProvider.syncFileButtons(filePath => {
            const fileType = this.#fileTypeDetector.detect(filePath);
            if (!fileType) {
                return null;
            }
            return {
                fileType: fileType,
                onButtonClickFunc: () => this.#openFileDiff(changeView, filePath, fileType)
            };
        });
    }

    async #openFileDiff(changeView, filePath, fileType) {
        if (this.#extensionWasReloaded()) {
            return;
        }
        // The URL can change in place (a commit picked) without touching the
        // DOM, so no re-sync has rebuilt this button yet: its refs are the old
        // view's. Rebuild instead of opening them.
        if (changeView.key !== App.#changeViewKey()) {
            console.debug('stale change view on click, rebuilding the buttons');
            this.#handleStart(null, 'click on a stale change view');
            return;
        }
        try {
            const params = await this.#buildDiffParams(
                filePath,
                getFileNameFromPath(filePath),
                changeView.sourceCommitId,
                changeView.targetCommitId,
                changeView.diffSideLabels
            );
            await this.#openDiffer(UI_BUTTON_TYPE.DIFF, params, null, this.#getMessageId(fileType));
        } catch (error) {
            console.error('cannot open the diff of ' + filePath, error);
        }
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
        if (filePath === this.#uiRepoProvider.buttonFilePath()) {
            console.debug('button already belongs to ' + filePath);
            return;
        }
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
        const msgId = this.#getMessageId(fileType);
        this.#uiRepoProvider.addButton({
            fileType: fileType,
            filePath: filePath,
            onButtonClickFunc: (extParams) => this.#openDiffer(UI_BUTTON_TYPE.BRANCH, params, extParams, msgId)
        });
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
            camundaBpmnModdle: camundaBpmnModdle,
            handlerAnnotations: await loadHandlerAnnotations()
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
            camundaBpmnModdle: camundaBpmnModdle,
            handlerAnnotations: await loadHandlerAnnotations()
        });
    }

    // After the extension is reloaded/updated, content scripts injected into
    // already-open tabs are orphaned: chrome.runtime is dead and any chrome.*
    // call (e.g. getURL) throws "Extension context invalidated". The orphaned
    // script cannot revive itself, so ask the user to reload the page (a fresh
    // content script then gets a valid context).
    #extensionWasReloaded() {
        if (chrome.runtime?.id) {
            return false;
        }
        alert('bpmn-surf was updated or reloaded. Please refresh this page (F5) to continue.');
        return true;
    }

    /**
     * Opens differ window
     * @private
     */
    async #openDiffer(buttonType, params, extParams, msgId) {
        if (this.#extensionWasReloaded()) {
            return;
        }

        // The branch button carries a closure over the blob it was built for, and
        // GitLab can switch the blob before our debounced re-check rebuilds it. A
        // per-file MR button cannot be stale: it lives inside its own file's block.
        if (buttonType === UI_BUTTON_TYPE.BRANCH) {
            const shownPath = this.#branchFilePath();
            if (shownPath && shownPath !== params.filePath) {
                console.debug(`stale button click ignored: page now shows ${shownPath}, button was for ${params.filePath}`);
                return;
            }
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
