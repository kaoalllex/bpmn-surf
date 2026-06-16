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
        this.#branchXml = await this.#loadXml(this.#params.targetRef);
    }

    async loadMrXml() {
        this.#mrXml = await this.#loadXml(this.#params.sourceRef);
    }

    useLocalFileContentAsMr() {
        this.#mrXml = this.#params.localFileContent;
    }

    async #loadXml(commitId) {
        return await loadFileContent(this.#params.rawFileUrl(commitId), false);
    }

    download(fileContent, branchName) {
        if (!fileContent) {
            // The shown side has no file to download (new/deleted schema).
            alert(`File does not exist in the ${branchName} branch`);
            return;
        }
        const blob = new Blob([fileContent], { type: 'application/octet-stream' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${branchName}-${this.#params.fileName}`;
        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
}
