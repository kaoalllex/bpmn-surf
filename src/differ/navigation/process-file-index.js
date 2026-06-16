// Index "process id -> bpmn file path" of all bpmn files in the project,
// loaded via the GitLab API and cached in localStorage.
//
// The index is queried per ref: the fallback can be asked for either the shown
// MR ref or the target-branch ref, so each ref keeps its own map and its own
// localStorage entry. A query without an explicit ref uses the construction-time
// ref (the differ's target ref), which keeps the cache keys backward-compatible.
class ProcessFileIndex {
    static #PROCESS_ID_REGEX = /<bpmn:process id="([^"]+)"/;

    #projectUrl;
    #projectHostUrl;
    #projectId;
    #defaultRef;
    #mapByRef = new Map();             // ref -> Map(processId -> filePath)
    #latestCommitIdByRef = new Map();  // ref -> latest commit id of that ref

    constructor(projectUrl, projectHostUrl, projectId, branchCommitId) {
        this.#projectUrl = projectUrl;
        this.#projectHostUrl = projectHostUrl;
        this.#projectId = projectId;
        this.#defaultRef = branchCommitId;
    }

    hasIndex(ref = this.#defaultRef) {
        return this.#mapByRef.has(ref);
    }

    async restoreFromLocalStorage(ref = this.#defaultRef) {
        // console.debug('restoring processIdToBpmnFilePathMap...');
        const key = await this.#getLocalStorageKey(ref);
        const value = localStorage.getItem(key);

        if (!value) {
            // console.debug('restoring processIdToBpmnFilePathMap...no data found');
            return;
        }

        this.#mapByRef.set(ref, new Map(JSON.parse(value)));
        // console.debug(`restoring processIdToBpmnFilePathMap...done (${this.#mapByRef.get(ref).size} items)`);
    }

    /**
     * @param {string} processId
     * @param {string} [ref] ref to search in (defaults to the construction-time ref)
     * @returns {filePath, fileName} of the bpmn file that contains the process
     * or null if not found
     */
    async findProcessFileParams(processId, ref = this.#defaultRef) {
        console.debug(`loading process params for process '${processId}' in ref '${ref}'`);

        await this.#loadProjectBpmnFiles(ref);

        const bpmnFilePath = await this.#findBpmnFilePathByProcessId(processId, ref);
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

    async #findBpmnFilePathByProcessId(processId, ref) {
        const map = this.#mapByRef.get(ref);

        // Try to find by process id
        let res = map.get(processId);
        if (res) {
            // console.debug('found by case 1');
            return res;
        }

        if (processId.endsWith('Process')) {
            // Try to find by <process id> without 'Process' suffix
            const processIdWithoutProcessSuffix = processId.slice(0, -'Process'.length);
            res = map.get(processIdWithoutProcessSuffix);
            if (res) {
                // console.debug('found by case 2');
                return res;
            }
        } else {
            // Try to find by "<process id>Process"
            const processIdWithProcessSuffix = processId + 'Process';
            res = map.get(processIdWithProcessSuffix);
            if (res) {
                // console.debug('found by case 3');
                return res;
            }
        }

        // Go through all the bpmn files and get the process ID from their contents
        await this.#extractProcessIdFromProjectBpmnFiles(ref);

        // Once again try to find bpmn file path by process id
        res = this.#mapByRef.get(ref).get(processId);
        if (res) {
            // console.debug('found by case 4');
            return res;
        }

        return null;
    }

    async #loadProjectBpmnFiles(ref) {
        console.debug('loading project files...');
        if (this.#mapByRef.has(ref)) {
            console.debug('loading project files...done (used cache)');
            return;
        }

        const tmpMap = new Map();
        const bpmnFilePaths = await this.#loadBpmnFilePaths(ref);
        for (const bpmnFilePath of bpmnFilePaths) {
            const fileName = getFileNameWithoutExtensionFromPath(bpmnFilePath);
            // For now assume that the file name is equal to the process id
            const processId = capitalizeFirstLetter(fileName);
            tmpMap.set(processId, bpmnFilePath);
        }
        // console.debug('processIdToBpmnFilePath', tmpMap);

        await this.#updateMap(tmpMap, ref);
        console.debug('loading project files...done');
    }

    async #loadBpmnFilePaths(ref) {
        const treeUrlTemplate = this.#projectHostUrl + '/api/v4/projects/' + this.#projectId +
            '/repository/tree?ref=' + ref + '&recursive=true&per_page=100&page=';
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

    async #extractProcessIdFromProjectBpmnFiles(ref) {
        // console.debug('extracting process id from bpmn files...', this.#mapByRef.get(ref));

        const refreshedMap = new Map();
        for (const [oldKey, filePath] of this.#mapByRef.get(ref)) {
            const processId = await this.#extractProcessIdFromBpmnFile(filePath, ref);
            const newKey = processId !== null ? processId : oldKey;
            refreshedMap.set(newKey, filePath);
        }
        await this.#updateMap(refreshedMap, ref);
        // console.debug('extracting process id from bpmn files...done', this.#mapByRef.get(ref));
    }

    async #extractProcessIdFromBpmnFile(filePath, ref) {
        const fileUrl = `${this.#projectUrl}/-/raw/${ref}/${filePath}`;
        const content = await loadFileContent(fileUrl, false);
        const match = content.match(ProcessFileIndex.#PROCESS_ID_REGEX);
        if (match) {
            return match[1];
        } else {
            return null;
        }
    }

    async #updateMap(newMap, ref) {
        this.#mapByRef.set(ref, newMap);

        const key = await this.#getLocalStorageKey(ref);
        const value = JSON.stringify(Array.from(newMap.entries()));
        localStorage.setItem(key, value);

        // console.debug(`processIdToBpmnFilePathMap stored (${newMap.size} items)`);
    }

    async #getLocalStorageKey(ref) {
        let latestCommitId = await this.#getLatestBranchCommitId(ref);

        // keyPrefix = processIdToBpmnFilePathMap#<projectId>#<ref>
        // fullKey   = <keyPrefix>#<latestCommitId>
        const keyPrefix = `processIdToBpmnFilePathMap#${this.#projectId}#${ref}`;
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

    async #getLatestBranchCommitId(ref) {
        // console.debug('loading latest branch commit id...');
        const cached = this.#latestCommitIdByRef.get(ref);
        if (cached) {
            // console.debug('loading latest branch commit id...done (used cache): ' + cached);
            return cached;
        }

        const url = this.#projectHostUrl + '/api/v4/projects/' + this.#projectId +
            '/repository/commits?ref_name=' + ref;
        // console.debug('branchCommitsUrl = ' + url);

        const content = await loadFileContent(url, true);
        const items = JSON.parse(content);

        const latestCommitId = (items.length === 0 ? 'undefined' : items[0].id);
        this.#latestCommitIdByRef.set(ref, latestCommitId);
        // console.debug('loading latest branch commit id...done: ' + latestCommitId);

        return latestCommitId;
    }
}
