/**
 * Class for managing loading and caching of Camunda BPMN Moddle
 */
class CamundaBpmnModdleManager {
    #moddle;
    #loadingPromise;
    
    constructor() {
        this.#moddle = null;
        this.#loadingPromise = null;
    }

    /**
     * Loads Camunda BPMN Moddle (with caching and protection against parallel loads)
     * @returns {Promise<Object>} loaded moddle object
     */
    async load() {
        if (this.#moddle) {
            return this.#moddle;
        }

        if (this.#loadingPromise) {
            return this.#loadingPromise;
        }

        this.#loadingPromise = this.#doLoad();
        try {
            this.#moddle = await this.#loadingPromise;
            return this.#moddle;
        } finally {
            this.#loadingPromise = null;
        }
    }

    async #doLoad() {
        const moddlePath = chrome.runtime.getURL('libs/camunda-bpmn-moddle/resources/camunda.json');
        const moddleContent = await loadFileContent(moddlePath, true);
        return JSON.parse(moddleContent);
    }

    get() {
        return this.#moddle;
    }
}
