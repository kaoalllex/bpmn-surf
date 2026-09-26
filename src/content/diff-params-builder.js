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
    #extensionVersion;

    // The version is injected rather than read from chrome.* here, so the builder
    // stays a pure function of its inputs; the differ page needs it because it has
    // no chrome.* of its own (FEAT-0024).
    constructor(extensionVersion) {
        this.#extensionVersion = extensionVersion;
    }

    /**
     * Params for diff mode (Merge Request: source ref vs target ref).
     */
    buildDiffParams({ projectInfo, sourceRef, sourceLabel, targetRef, targetLabel, changeRequestId, filePath, fileName, camundaBpmnModdle, handlerAnnotations }) {
        return {
            ...this.#commonParams(projectInfo, targetRef, targetLabel, filePath, fileName, camundaBpmnModdle, handlerAnnotations),
            sourceRef: sourceRef,
            sourceLabel: sourceLabel,
            changeRequestId: changeRequestId
        };
    }

    /**
     * Params for branch mode (single file version, no source/MR side).
     * There is no MR target branch here, so the displayed label falls back to the
     * ref taken from the page URL (usually a readable branch name already).
     */
    buildBranchParams({ projectInfo, targetRef, filePath, fileName, camundaBpmnModdle, handlerAnnotations }) {
        return {
            ...this.#commonParams(projectInfo, targetRef, targetRef, filePath, fileName, camundaBpmnModdle, handlerAnnotations),
            sourceRef: null,
            sourceLabel: null
        };
    }

    #commonParams(projectInfo, targetRef, targetLabel, filePath, fileName, camundaBpmnModdle, handlerAnnotations) {
        return {
            platform: this.#platform(projectInfo),
            targetRef: targetRef,
            targetLabel: targetLabel,
            filePath: filePath,
            fileName: fileName,
            camundaBpmnModdle: camundaBpmnModdle,
            // The differ page has no chrome.*, so the configured annotation names
            // ride along with the params (FEAT-0035), like extensionVersion.
            handlerAnnotations: handlerAnnotations,
            extensionVersion: this.#extensionVersion
        };
    }

    #platform(projectInfo) {
        return {
            // Single source of truth (REFAC-0004 step 1.4): detection-by-URL and
            // the active provider's identity always agree (a provider is available
            // only on its own host), so on every gitlab page this still yields
            // 'gitlab' and the descriptor is unchanged.
            kind: detectPlatformKind(),
            projectUrl: projectInfo.url,
            hostUrl: projectInfo.hostUrl,
            projectId: projectInfo.id
        };
    }
}
