class FileType {
    constructor(name, extension) {
        this.name = name;
        this.extension = extension;
    }
}

const FILE_TYPE_BPMN = new FileType('bpmn', '.bpmn');
const FILE_TYPE_DMN = new FileType('dmn', '.dmn');

/**
 * DTO for storing project information
 */
class ProjectInfo {
    constructor() {
        this.url = null;
        this.hostUrl = null;
        this.groupName = null;
        this.name = null;
        this.id = null;
    }

    logDebug() {
        console.debug(`Project info: 
            url: ${this.url}; 
            host url: ${this.hostUrl}; 
            group name: ${this.groupName}; 
            name: ${this.name}; 
            id: ${this.id}`
        );
    }
}

/**
 * DTO for storing merge request information
 */
class MergeRequestInfo {
    constructor() {
        this.iid = null;
        this.infoUrl = null;
        this.lastCommitId = null;
        this.title = null;
    }

    logDebug() {
        console.debug(`Merge request info: 
            iid: ${this.iid}; 
            infoUrl: ${this.infoUrl}; 
            lastCommitId: ${this.lastCommitId}; 
            title: ${this.titlee}`
        );
    }
}

/**
 * DTO for storing merge request branch names
 */
class MergeRequestBranchNames {
    constructor(sourceBranchName, targetBranchName) {
        this.sourceBranchName = sourceBranchName;
        this.targetBranchName = targetBranchName;
    }
}
