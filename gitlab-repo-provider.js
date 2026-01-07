/**
 * Реализация провайдера для GitLab
 * Содержит всю специфику работы с GitLab: парсинг URL, DOM-моделей, API
 */
class GitLabRepoProvider extends RepoProvider {
    constructor() {
        super();
        this.projectInfo = {
            url: null,
            hostUrl: null,
            groupName: null,
            name: null,
            id: null
        };
        this.mergeRequestInfo = {
            iid: null,
            infoUrl: null,
            lastCommitId: null,
            title: null
        };
        this.#masterCommitEntries = null;
        this.#filteredByTitleMasterCommitEntries = null;
    }

    isAvailable() {
        return window.location.href.includes('gitlab');
    }

    async init() {
        const href = window.location.href;
        this.projectInfo.url = href.substring(0, href.indexOf('/-/'));
        if (!this.projectInfo.url) {
            console.debug('cannot get project url');
            return false;
        }
        const parts = this.projectInfo.url.split('/');
        if (parts.length < 3) {
            console.error('cannot get project group name and name from url: ' + this.projectInfo.url);
            return false;
        }
        this.projectInfo.groupName = parts[parts.length - 2];
        this.projectInfo.name = parts[parts.length - 1];

        parts.pop();
        parts.pop();
        this.projectInfo.hostUrl = parts.join('/');

        this.projectInfo.id = await this.#getProjectId();
        if (!this.projectInfo.id) {
            console.debug('cannot get project id');
            return false;
        }

        console.debug(`project params: 
            url: ${this.projectInfo.url}; 
            host url: ${this.projectInfo.hostUrl}; 
            group name: ${this.projectInfo.groupName}; 
            name: ${this.projectInfo.name}; 
            id: ${this.projectInfo.id}`
        );

        return true;
    }

    getProjectInfo() {
        return this.projectInfo;
    }

    async isDiffsTabActive() {
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
        if (hrefWithoutParams.endsWith('.bpmn')) {
            return 'bpmn';
        }
        if (hrefWithoutParams.endsWith('.dmn')) {
            return 'dmn';
        }
        return null;
    }

    async findSelectedFilePath() {
        const dataPathElems = await this.#findDataPathElements();
        if (!dataPathElems) {
            console.info('cannot find data-path element');
            return null;
        }

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

    async initMergeRequestInfo() {
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

        // Загружаем title при инициализации
        try {
            const content = await loadFileContent(this.mergeRequestInfo.infoUrl, true);
            const mrInfo = JSON.parse(content);
            this.mergeRequestInfo.title = mrInfo.title;
            console.debug('mr title: ' + this.mergeRequestInfo.title);
        } catch (error) {
            console.warn('cannot load MR title', error);
            this.mergeRequestInfo.title = null;
        }
    }

    getMergeRequestTitle() {
        return this.mergeRequestInfo.title;
    }

    getMergeRequestBranchNames() {
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

    async getMergeRequestCommitId() {
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

    async getTargetCommitId(mrCommitId, mrTitle, targetBranchName) {
        console.debug('getting target commit id...');

        let targetCommitId = await this.#findTargetBranchPreviousCommitId(mrCommitId);
        if (!targetCommitId) {
            const actualMrCommitId = await this.#findTargetBranchCommitIdByTitle(mrTitle);
            if (actualMrCommitId) {
                targetCommitId = await this.#findTargetBranchPreviousCommitId(actualMrCommitId);
            }
        }

        if (!targetCommitId) {
            console.debug('MR is not merged. Target commit id is target branch name: ' + targetBranchName);
            return targetBranchName;
        }
        console.debug('MR is already merged. Target commit id is previous before the merged MR commit: ' + targetCommitId);
        return targetCommitId;
    }

    extractBranchCommitIdAndFilePath() {
        let branchCommitId = this.#extractBranchCommitIdByDocSelectorCase1();
        if (!branchCommitId) {
            branchCommitId = this.#extractBranchCommitIdByDocSelectorCase2();
        }
        return this.#extractBranchCommitIdAndFilePathByRegex(branchCommitId);
    }

    // ==== Приватные поля и методы ====

    #masterCommitEntries = null;
    #filteredByTitleMasterCommitEntries = null;

    async #getProjectId() {
        const url = this.projectInfo.hostUrl + '/api/v4/projects/?simple=true&search=' + this.projectInfo.name;
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

    async #loadMasterCommitEntries() {
        console.debug('loading master commit entries...');
        if (this.#masterCommitEntries) {
            console.debug('loading master commit entries...done (used cache)');
            return;
        }

        const [page1, page2, page3, page4, page5] = await Promise.all([
            this.#loadMasterCommitEntriesPage(1),
            this.#loadMasterCommitEntriesPage(2),
            this.#loadMasterCommitEntriesPage(3),
            this.#loadMasterCommitEntriesPage(4),
            this.#loadMasterCommitEntriesPage(5),
        ]);
        this.#masterCommitEntries = [...page1, ...page2, ...page3, ...page4, ...page5];

        console.debug('loading master commit entries...done');
    }

    async #loadMasterCommitEntriesPage(pageNumber) {
        const offset = (pageNumber - 1) * 100;
        const url = this.projectInfo.url + '/-/commits/' + MASTER_BRANCH_NAME + '?format=atom&limit=100&offset=' + offset;
        const content = await loadFileContent(url, true);
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        return Array.from(doc.getElementsByTagName('entry'));
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

        await this.#loadMasterCommitEntries();

        const index = this.#masterCommitEntries.findIndex(entry => {
            const idElement = entry.querySelector('id');
            return idElement && idElement.textContent.includes(commitId);
        });
        if (index === -1) {
            return null;
        }

        const nextIndex = index + 1;
        if (nextIndex >= this.#masterCommitEntries.length) {
            console.warn('next index is out of range! array length: ' + this.#masterCommitEntries.length);
            return null;
        }

        const entry = this.#masterCommitEntries[nextIndex];
        const idElemText = entry.querySelector('id').textContent;
        const foundCommitId = idElemText.substring(idElemText.lastIndexOf('/') + 1);
        return foundCommitId;
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
