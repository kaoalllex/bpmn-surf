/**
 * Single-entry cache: keeps the last computed value together with its key
 */
class SingleEntryCache {
    #key = null;
    #value = null;

    get(key) {
        if (this.#value && this.#key === key) {
            return this.#value;
        }
        return null;
    }

    set(key, value) {
        this.#key = key;
        this.#value = value;
    }
}

/**
 * GitLab provider implementation
 * Contains all GitLab-specific logic: URL parsing, DOM models, API
 */
class GitLabRepoProvider extends RepoProvider {
    constructor() {
        super();
        this.projectInfo = new ProjectInfo();
        this.mergeRequestInfo = new MergeRequestInfo();
        this.#masterCommitManager = new MasterCommitManager(this.projectInfo);
        this.#filteredByTitleMasterCommitEntries = null;
    }

    isAvailable() {
        return window.location.href.includes('gitlab');
    }

    // Cache for init result
    #initCache = null;
    #initCacheKey = null;

    async init() {
        console.debug('initializing repo provider...');

        // Create cache key based on URL
        const href = window.location.href;
        const cacheKey = href;

        // Check if we have cached result for the same URL
        if (this.#initCache && this.#initCacheKey === cacheKey) {
            console.debug('Using cached init result');
            // Restore project info from cache
            Object.assign(this.projectInfo, this.#initCache.projectInfo);
            return this.#initCache.result;
        }

        this.projectInfo.url = href.substring(0, href.indexOf('/-/'));
        if (!this.projectInfo.url) {
            console.debug('cannot get project url');
            // Cache the result
            this.#initCache = { projectInfo: { ...this.projectInfo }, result: false };
            this.#initCacheKey = cacheKey;
            return false;
        }
        const parts = this.projectInfo.url.split('/');
        if (parts.length < 3) {
            console.error('cannot get project group name and name from url: ' + this.projectInfo.url);
            // Cache the result
            this.#initCache = { projectInfo: { ...this.projectInfo }, result: false };
            this.#initCacheKey = cacheKey;
            return false;
        }
        this.projectInfo.groupName = parts[parts.length - 2];
        this.projectInfo.name = parts[parts.length - 1];

        parts.pop();
        parts.pop();
        this.projectInfo.hostUrl = parts.join('/');

        this.projectInfo.id = await this.#getProjectId();
        if (!this.projectInfo.id) {
            console.warn('cannot get project id');
            // Cache the result
            this.#initCache = { projectInfo: { ...this.projectInfo }, result: false };
            this.#initCacheKey = cacheKey;
            return false;
        }

        this.projectInfo.logDebug();

        // Cache the result
        this.#initCache = { projectInfo: { ...this.projectInfo }, result: true };
        this.#initCacheKey = cacheKey;
        return true;
    }

    getProjectInfo() {
        return this.projectInfo;
    }

    async isChangeViewActive() {
        await delay(200);
        const href = window.location.href;
        return href.includes('/-/merge_requests/') && href.includes('/diffs');
    }

    async getBranchFileType() {
        await delay(200);
        const href = window.location.href;
        if (!href.includes('/-/blob/')) {
            return null;
        }
        const hrefWithoutParams = href.split('?')[0];
        if (hrefWithoutParams.endsWith(FILE_TYPE_BPMN.extension)) {
            return FILE_TYPE_BPMN;
        }
        if (hrefWithoutParams.endsWith(FILE_TYPE_DMN.extension)) {
            return FILE_TYPE_DMN;
        }
        return null;
    }

    async findSelectedFilePath() {
        console.debug('finding selected file path...');

        // Rapid diffs UI (gitlab.com): diff files are <diff-file> custom elements,
        // without [data-path] / .is-active markers. Detect it up front to avoid the
        // ~1.5s doWithAttempts wait the legacy lookup below would otherwise incur.
        if (document.querySelector('diff-file')) {
            return this.#findSelectedFilePathInRapidDiffs();
        }

        return await this.#findSelectedFilePathLegacy();
    }

    async #findSelectedFilePathLegacy() {
        const dataPathElems = await this.#findDataPathElements();
        if (!dataPathElems) {
            console.info('cannot find data-path element');
            return null;
        }

        // console.debug(
        //     'data-path elements (json)',
        //     JSON.stringify(
        //         [...dataPathElems].map(el => ({
        //             tag: el.tagName,
        //             text: el.textContent?.trim(),
        //             dataset: { ...el.dataset },
        //             attributes: Object.fromEntries(
        //                 [...el.attributes].map(a => [a.name, a.value])
        //             )
        //         })),
        //         null,
        //         2
        //     )
        // );

        let filePath;
        for (const elem of dataPathElems) {
            if (elem.classList.contains('is-active') || elem.classList.contains('diff-file-is-active')) {
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
        console.debug('selected file path: ' + filePath);
        return filePath;
    }

    #findSelectedFilePathInRapidDiffs() {
        console.debug('finding selected file path in rapid diffs...');

        const files = [];
        let selectedPath = null;
        const selectedId = window.location.hash ? window.location.hash.substring(1) : null;

        for (const diffFile of document.querySelectorAll('diff-file')) {
            const path = this.#extractRapidDiffFilePath(diffFile);
            if (!path) {
                continue;
            }
            files.push(path);
            if (selectedId && diffFile.id === selectedId) {
                selectedPath = path;
            }
        }

        // Explicit selection via URL hash wins
        if (selectedPath) {
            console.debug('selected file path (rapid diffs, by hash): ' + selectedPath);
            return selectedPath;
        }

        // Fallback: exactly one bpmn/dmn file in the diff -> use it without explicit selection
        const diagramFiles = files.filter(
            p => p.endsWith(FILE_TYPE_BPMN.extension) || p.endsWith(FILE_TYPE_DMN.extension)
        );
        if (diagramFiles.length === 1) {
            console.debug('selected file path (rapid diffs, single diagram): ' + diagramFiles[0]);
            return diagramFiles[0];
        }

        console.debug('cannot determine selected file path in rapid diffs');
        return null;
    }

    #extractRapidDiffFilePath(diffFile) {
        const raw = diffFile.getAttribute('data-file-data');
        if (!raw) {
            return null;
        }
        try {
            const data = JSON.parse(raw);
            return data.new_path || data.old_path || null;
        } catch (error) {
            console.debug('cannot parse data-file-data of diff-file', error);
            return null;
        }
    }

    // Cache for initMergeRequestInfo result
    #initMergeRequestInfoCache = null;
    #initMergeRequestInfoCacheKey = null;

    async initChangeInfo() {
        console.debug('initializing merge request info...')

        // Create cache key based on URL
        const cacheKey = window.location.href;

        // Check if we have cached result for the same URL
        if (this.#initMergeRequestInfoCache && this.#initMergeRequestInfoCacheKey === cacheKey) {
            console.debug('Using cached merge request info');
            // Restore merge request info from cache
            Object.assign(this.mergeRequestInfo, this.#initMergeRequestInfoCache);
            return;
        }

        const beforeIidLen = this.projectInfo.url.length + '/-/merge_requests/'.length;
        this.mergeRequestInfo.iid = window.location.href.substring(beforeIidLen);

        let slashIndex = this.mergeRequestInfo.iid.indexOf('/');
        if (slashIndex !== -1) {
            this.mergeRequestInfo.iid = this.mergeRequestInfo.iid.substring(0, slashIndex);
        }

        let mrInfoUrl = this.projectInfo.url.substring(0, this.projectInfo.url.length - this.projectInfo.name.length - 1);
        slashIndex = mrInfoUrl.lastIndexOf('/');
        mrInfoUrl = mrInfoUrl.substring(0, slashIndex) + '/api/v4/projects/' + mrInfoUrl.substring(slashIndex + 1) +
            '%2F' + this.projectInfo.name + '/merge_requests/' + this.mergeRequestInfo.iid;
        this.mergeRequestInfo.infoUrl = mrInfoUrl;

        // Load title during initialization
        try {
            const content = await loadFileContent(this.mergeRequestInfo.infoUrl, true);
            const mrInfo = JSON.parse(content);
            this.mergeRequestInfo.title = mrInfo.title;
            console.debug('mr title: ' + this.mergeRequestInfo.title);
        } catch (error) {
            console.warn('cannot load MR title', error);
            this.mergeRequestInfo.title = null;
        }

        this.mergeRequestInfo.logDebug();

        // Cache the result
        this.#initMergeRequestInfoCache = { ...this.mergeRequestInfo };
        this.#initMergeRequestInfoCacheKey = cacheKey;
    }

    getChangeInfo() {
        return this.mergeRequestInfo;
    }

    getChangeBranchNames() {
        const pageDescrElem = document.querySelector('div.detail-page-description');
        if (!pageDescrElem) {
            console.warn('Cannot get MR detail page description element');
            return null;
        }

        let srcBranchName = null;
        let trgBranchName = null;
        let isNextATargetBranchName = false;
        for (const node of pageDescrElem.childNodes) {
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
        return new MergeRequestBranchNames(srcBranchName, trgBranchName);
    }

    async getSourceCommitId() {
        const commitId = await this.#getMrLastCommitId();
        if (commitId) {
            return commitId;
        }

        const diffHeadSha = this.#findDiffHeadSha();
        if (diffHeadSha) {
            return diffHeadSha;
        }

        return null;
    }

    async #isMrMerged() {
        // checking through DOM is faster than API call
        const mergeStatusElement = document.querySelector('.issuable-status-badge-merged');
        if (mergeStatusElement) {
            const mergedText = mergeStatusElement.querySelector('.gl-display-none.gl-sm-display-block');
            if (mergedText && mergedText.textContent.trim() === 'Merged') {
                return true;
            }
        }

        if (this.mergeRequestInfo.infoUrl) {
            const content = await loadFileContent(this.mergeRequestInfo.infoUrl, false);
            if (content) {
                const mrInfo = JSON.parse(content);
                return !!(mrInfo.merged_at || mrInfo.state === 'merged');
            }
        }
        return false;
    }

    // Cache for getTargetCommitId result
    #targetCommitIdCache = new SingleEntryCache();

    async getTargetCommitId(sourceCommitId, changeTitle, targetBranchName) {
        console.debug('getting target commit id...');

        const cacheKey = `${sourceCommitId}-${changeTitle}-${targetBranchName}`;

        const cachedTargetCommitId = this.#targetCommitIdCache.get(cacheKey);
        if (cachedTargetCommitId) {
            console.debug('Using cached target commit id: ' + cachedTargetCommitId);
            return cachedTargetCommitId;
        }

        // First check if MR is merged to avoid expensive operations when it's not
        const isMerged = await this.#isMrMerged();

        // Only do expensive operations if MR is likely merged
        let targetCommitId = null;
        if (isMerged) {
            console.debug('MR is likely merged. Trying to find target commit id by MR commit id...');
            targetCommitId = await this.#findTargetBranchPreviousCommitId(sourceCommitId);
            if (!targetCommitId) {
                const actualMrCommitId = await this.#findTargetBranchCommitIdByTitle(changeTitle);
                if (actualMrCommitId) {
                    targetCommitId = await this.#findTargetBranchPreviousCommitId(actualMrCommitId);
                }
            }
        }

        if (!targetCommitId) {
            console.debug('MR is not merged. Target commit id is target branch name: ' + targetBranchName);
            targetCommitId = targetBranchName;
        } else {
            console.debug('MR is already merged. Target commit id is previous before the merged MR commit: ' + targetCommitId);
        }

        this.#targetCommitIdCache.set(cacheKey, targetCommitId);

        return targetCommitId;
    }

    extractBranchCommitIdAndFilePath() {
        let branchCommitId = this.#extractBranchCommitIdByDocSelectorCase1();
        if (!branchCommitId) {
            branchCommitId = this.#extractBranchCommitIdByDocSelectorCase2();
        }
        return this.#extractBranchCommitIdAndFilePathByRegex(branchCommitId);
    }

    // ==== Private fields and methods ====

    #masterCommitManager = null;
    #filteredByTitleMasterCommitEntries = null;

    async #getProjectId() {
        const url = this.projectInfo.hostUrl + '/api/v4/projects/?simple=true&per_page=100&search=' + this.projectInfo.name;
        const content = await loadFileContent(url, true);
        const protectInfoArr = JSON.parse(content);

        const pathWithNs = this.projectInfo.groupName + '/' + this.projectInfo.name;
        const protectInfo = protectInfoArr.find(i => i.path_with_namespace === pathWithNs);
        if (!protectInfo) {
            return null;
        }

        return protectInfo.id;
    }

    async #findDataPathElements() {
        return await doWithAttempts(function () {
            const res = document.querySelectorAll('[data-path]');
            if (res && res.length > 0) {
                return res;
            } else {
                return null;
            }
        });
    }

    #findDiffHeadSha() {
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

    async #getMrLastCommitId() {
        console.debug('getting mr last commit id...');

        if (this.mergeRequestInfo.lastCommitId) {
            return this.mergeRequestInfo.lastCommitId;
        }

        const href = window.location.href;
        const getMrCommitInfoUrl = href.substring(0, href.indexOf('/diffs')) + '/commits.json';

        const mrCommitInfo = await loadFileContent(getMrCommitInfoUrl, true);

        const regex = /commit_id=([a-fA-F0-9]+)/;
        const match = mrCommitInfo.match(regex);
        if (!match || match.length < 2) {
            console.warn('cannot find mr last commit id in commits info!', mrCommitInfo);
            return null;
        }
        this.mergeRequestInfo.lastCommitId = match[1];
        return this.mergeRequestInfo.lastCommitId;
    }

    async #loadFilteredByTitleMasterCommitEntries(commitTitle) {
        console.debug('loading master commit entries filtered by title...');
        if (this.#filteredByTitleMasterCommitEntries) {
            console.debug('loading master commit entries filtered by title...done (used cache)');
            return;
        }

        const url = this.projectInfo.url + '/-/commits/' + MASTER_BRANCH_NAME + '?format=atom&search=' + encodeURIComponent(commitTitle);
        const content = await loadFileContent(url, true);
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        this.#filteredByTitleMasterCommitEntries = Array.from(doc.getElementsByTagName('entry'));

        console.debug('loading master commit entries filtered by title...done');
    }

    async #findTargetBranchPreviousCommitId(commitId) {
        console.debug('try to find target branch previous commit id for commit id: ' + commitId);
        return await this.#masterCommitManager.findPreviousCommitId(commitId);
    }

    async #findTargetBranchCommitIdByTitle(commitTitle) {
        console.debug('try to find target branch commit id by title: ' + commitTitle);

        await this.#loadFilteredByTitleMasterCommitEntries(commitTitle);

        const index = this.#filteredByTitleMasterCommitEntries.findIndex(entry => {
            const titleElement = entry.querySelector('title');
            return titleElement && titleElement.textContent.includes(commitTitle);
        });
        if (index === -1) {
            return null;
        }

        const entry = this.#filteredByTitleMasterCommitEntries[index];
        const idElemText = entry.querySelector('id').textContent;
        const foundCommitId = idElemText.substring(idElemText.lastIndexOf('/') + 1);
        return foundCommitId;
    }

    #extractBranchCommitIdByDocSelectorCase1() {
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

    #extractBranchCommitIdByDocSelectorCase2() {
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

    #extractBranchCommitIdAndFilePathByRegex(branchCommitId) {
        const href = window.location.href;

        let regex = `\/-\/blob\/([0-9a-zA-Z-_./]+)\/(${this.projectInfo.name}\/.*)`;
        let match = href.match(regex);
        if (!match || match.length < 3) {
            if (!branchCommitId) {
                branchCommitId = 'master|develop|feature\/[0-9a-zA-Z-_.]+|bugfix\/[0-9a-zA-Z-_.]+|[0-9a-zA-Z-_./]+';
            }
            regex = `\/-\/blob\/(` + branchCommitId + `)\/(.*)`;
            match = href.match(regex);
            if (!match || match.length < 3) {
                console.warn('cannot extract branch commit id and bpmn file path by regex from url: ' + href);
                return null;
            }
        }

        const filePath = match[2].split('?')[0];

        return {
            branchCommitId: match[1],
            filePath: filePath
        };
    }
}
