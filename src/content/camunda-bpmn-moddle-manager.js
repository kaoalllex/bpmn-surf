/**
 * Loads and caches one moddle descriptor (camunda.json or zeebe.json)
 */
class CamundaBpmnModdleManager {
    #descriptorPath;
    #moddle;
    #loadingPromise;

    constructor(descriptorPath) {
        this.#descriptorPath = descriptorPath;
        this.#moddle = null;
        this.#loadingPromise = null;
    }

    /**
     * Loads the moddle descriptor (with caching and protection against parallel loads)
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
        const moddlePath = chrome.runtime.getURL(this.#descriptorPath);
        const moddleContent = await loadFileContent(moddlePath, true);
        return JSON.parse(moddleContent);
    }

    get() {
        return this.#moddle;
    }
}
