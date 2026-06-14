/**
 * Builds the parameter object passed to a differ page (via postMessage).
 *
 * The shape is split into two levels so the differ core stays platform-agnostic:
 *  - neutral, flat fields the differ genuinely needs (sourceRef, targetRef,
 *    filePath, …);
 *  - everything platform-specific grouped under `platform`, discriminated by
 *    `platform.kind`. A future platform (GitHub) supplies its own `platform`
 *    payload without polluting the neutral surface, and GitLab-only fields do
 *    not leak into the core.
 */
class DiffParamsBuilder {
    /**
     * Params for diff mode (Merge Request: source ref vs target ref).
     */
    buildDiffParams({ projectInfo, sourceRef, sourceBranchName, targetRef, changeRequestId, filePath, fileName, camundaBpmnModdle }) {
        return {
            ...this.#commonParams(projectInfo, targetRef, filePath, fileName, camundaBpmnModdle),
            sourceRef: sourceRef,
            sourceBranchName: sourceBranchName,
            changeRequestId: changeRequestId
        };
    }

    /**
     * Params for branch mode (single file version, no source/MR side).
     */
    buildBranchParams({ projectInfo, targetRef, filePath, fileName, camundaBpmnModdle }) {
        return {
            ...this.#commonParams(projectInfo, targetRef, filePath, fileName, camundaBpmnModdle),
            sourceRef: null,
            sourceBranchName: null
        };
    }

    #commonParams(projectInfo, targetRef, filePath, fileName, camundaBpmnModdle) {
        return {
            platform: this.#platform(projectInfo),
            targetRef: targetRef,
            filePath: filePath,
            fileName: fileName,
            camundaBpmnModdle: camundaBpmnModdle
        };
    }

    #platform(projectInfo) {
        return {
            kind: 'gitlab',
            projectUrl: projectInfo.url,
            hostUrl: projectInfo.hostUrl,
            projectId: projectInfo.id
        };
    }
}
