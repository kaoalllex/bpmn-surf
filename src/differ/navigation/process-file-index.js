// Index "process id -> bpmn file path" of all bpmn files in the project,
// loaded via the GitLab API and cached in localStorage
class ProcessFileIndex {
    static #PROCESS_ID_REGEX = /<bpmn:process id="([^"]+)"/;

    #projectUrl;
    #projectHostUrl;
    #projectId;
    #branchCommitId;
    #map = null;
    #latestBranchCommitId = null;

    constructor(projectUrl, projectHostUrl, projectId, branchCommitId) {
        this.#projectUrl = projectUrl;
        this.#projectHostUrl = projectHostUrl;
        this.#projectId = projectId;
        this.#branchCommitId = branchCommitId;
    }

    hasIndex() {
        return this.#map !== null;
    }

    async restoreFromLocalStorage() {
        // console.debug('restoring processIdToBpmnFilePathMap...');
        const key = await this.#getLocalStorageKey();
        const value = localStorage.getItem(key);

        if (!value) {
            // console.debug('restoring processIdToBpmnFilePathMap...no data found');
            return;
        }

        this.#map = new Map(JSON.parse(value));
        // console.debug(`restoring processIdToBpmnFilePathMap...done (${this.#map.size} items)`);
    }

    /**
     * @returns {filePath, fileName} of the bpmn file that contains the process
     * or null if not found
     */
    async findProcessFileParams(processId) {
        console.debug('loading process params for process: ' + processId);

        await this.#loadProjectBpmnFiles();

        const bpmnFilePath = await this.#findBpmnFilePathByProcessId(processId);
        if (!bpmnFilePath) {
            console.info('cannot find bpmn file path by process id: ' + processId);
            return null;
        }
        // console.debug(`found bpmn file path by process id '${processId}': ${bpmnFilePath}`);

        const bpmnFileName = bpmnFilePath.substring(bpmnFilePath.lastIndexOf('/') + 1);

        return {
            filePath: bpmnFilePath,
            fileName: bpmnFileName
        };
    }

    async #findBpmnFilePathByProcessId(processId) {
        // Try to find by process id
        let res = this.#map.get(processId);
        if (res) {
            // console.debug('found by case 1');
            return res;
        }

        if (processId.endsWith('Process')) {
            // Try to find by <process id> without 'Process' suffix
            const processIdWithoutProcessSuffix = processId.slice(0, -'Process'.length);
            res = this.#map.get(processIdWithoutProcessSuffix);
            if (res) {
                // console.debug('found by case 2');
                return res;
            }
        } else {
            // Try to find by "<process id>Process"
            const processIdWithProcessSuffix = processId + 'Process';
            res = this.#map.get(processIdWithProcessSuffix);
            if (res) {
                // console.debug('found by case 3');
                return res;
            }
        }

        // Go through all the bpmn files and get the process ID from their contents
        await this.#extractProcessIdFromProjectBpmnFiles();

        // Once again try to find bpmn file path by process id
        res = this.#map.get(processId);
        if (res) {
            // console.debug('found by case 4');
            return res;
        }

        return null;
    }

    async #loadProjectBpmnFiles() {
        console.debug('loading project files...');
        if (this.#map) {
            console.debug('loading project files...done (used cache)');
            return;
        }

        const tmpMap = new Map();
        const bpmnFilePaths = await this.#loadBpmnFilePaths();
        for (const bpmnFilePath of bpmnFilePaths) {
            const fileName = getFileNameWithoutExtensionFromPath(bpmnFilePath);
            // For now assume that the file name is equal to the process id
            const processId = capitalizeFirstLetter(fileName);
            tmpMap.set(processId, bpmnFilePath);
        }
        // console.debug('processIdToBpmnFilePath', tmpMap);

        await this.#updateMap(tmpMap);
        console.debug('loading project files...done');
    }

    async #loadBpmnFilePaths() {
        const treeUrlTemplate = this.#projectHostUrl + '/api/v4/projects/' + this.#projectId +
            '/repository/tree?ref=' + this.#branchCommitId + '&recursive=true&per_page=100&page=';
        // console.debug('treeUrlTemplate = ' + treeUrlTemplate);

        const bpmnFilePaths = [];
        let pageNum = 0;
        while (true) {
            pageNum++;
            const url = treeUrlTemplate + pageNum;
            const content = await loadFileContent(url, true);
            const items = JSON.parse(content);
            if (items.length === 0) {
                break;
            }

            const paths = items
                .filter(i => i.type === 'blob' && i.path.endsWith('.bpmn'))
                .map(i => i.path);
            bpmnFilePaths.push(...paths);
        }
        // console.debug('bpmnFilePaths', bpmnFilePaths);
        return bpmnFilePaths;
    }

    async #extractProcessIdFromProjectBpmnFiles() {
        // console.debug('extracting process id from bpmn files...', this.#map);

        const refreshedMap = new Map();
        for (const [oldKey, filePath] of this.#map) {
            const processId = await this.#extractProcessIdFromBpmnFile(filePath);
            const newKey = processId !== null ? processId : oldKey;
            refreshedMap.set(newKey, filePath);
        }
        await this.#updateMap(refreshedMap);
        // console.debug('extracting process id from bpmn files...done', this.#map);
    }

    async #extractProcessIdFromBpmnFile(filePath) {
        const fileUrl = `${this.#projectUrl}/-/raw/${this.#branchCommitId}/${filePath}`;
        const content = await loadFileContent(fileUrl, false);
        const match = content.match(ProcessFileIndex.#PROCESS_ID_REGEX);
        if (match) {
            return match[1];
        } else {
            return null;
        }
    }

    async #updateMap(newMap) {
        this.#map = newMap;

        const key = await this.#getLocalStorageKey();
        const value = JSON.stringify(Array.from(newMap.entries()));
        localStorage.setItem(key, value);

        // console.debug(`processIdToBpmnFilePathMap stored (${newMap.size} items)`);
    }

    async #getLocalStorageKey() {
        let latestCommitId = await this.#getLatestBranchCommitId();

        // keyPrefix = processIdToBpmnFilePathMap#<projectId>#<branchCommitId>#<latestCommitId>
        // fullKey = <keyPrefix>#<latestCommitId>
        const keyPrefix = `processIdToBpmnFilePathMap#${this.#projectId}#${this.#branchCommitId}`;
        const fullKey = `${keyPrefix}#${latestCommitId}`;

        // Check if value exists
        const value = localStorage.getItem(fullKey);
        if (!value) {
            // Remove old keys
            const oldKeys = Object.keys(localStorage).filter((key) => key.startsWith(keyPrefix));
            if (oldKeys.length > 0) {
                oldKeys.forEach(key => localStorage.removeItem(key));
                // console.debug('removed old keys from local storage', oldKeys);
            }
        }

        return fullKey;
    }

    async #getLatestBranchCommitId() {
        // console.debug('loading latest branch commit id...');
        if (this.#latestBranchCommitId) {
            // console.debug('loading latest branch commit id...done (used cache): ' + this.#latestBranchCommitId);
            return this.#latestBranchCommitId;
        }

        const url = this.#projectHostUrl + '/api/v4/projects/' + this.#projectId +
            '/repository/commits?ref_name=' + this.#branchCommitId;
        // console.debug('branchCommitsUrl = ' + url);

        const content = await loadFileContent(url, true);
        const items = JSON.parse(content);

        this.#latestBranchCommitId = (items.length === 0 ? 'undefined' : items[0].id);
        // console.debug('loading latest branch commit id...done: ' + this.#latestBranchCommitId);

        return this.#latestBranchCommitId;
    }
}
