// Loads, stores and downloads the two compared versions of a diagram file:
// target branch version and MR branch version (or local file content)
class DiagramVersions {
    #params;
    #branchXml = null;
    #mrXml = null;

    constructor(params) {
        this.#params = params;
    }

    get branchXml() {
        return this.#branchXml;
    }

    get mrXml() {
        return this.#mrXml;
    }

    async loadBranchXml() {
        // The target (base) side may load from a different path than the MR side
        // when the file was renamed in the MR (BUG-0002).
        this.#branchXml = await this.#loadXml(this.#params.targetRef, this.#params.targetFilePath);
    }

    async loadMrXml() {
        this.#mrXml = await this.#loadXml(this.#params.sourceRef);
    }

    useLocalFileContentAsMr() {
        this.#mrXml = this.#params.localFileContent;
    }

    async #loadXml(commitId, filePath) {
        return await loadFileContent(this.#params.rawFileUrl(commitId, filePath), false);
    }

    download(fileContent, branchName, fileName = this.#params.fileName) {
        if (!fileContent) {
            // The shown side has no file to download (new/deleted schema).
            alert(`File does not exist in the ${branchName} branch`);
            return;
        }
        const blob = new Blob([fileContent], { type: 'application/octet-stream' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${branchName}-${fileName}`;
        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
}
