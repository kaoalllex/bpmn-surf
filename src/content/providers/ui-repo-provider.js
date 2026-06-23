const UI_BUTTON_TYPE = {
    DIFF: 'diff',
    BRANCH: 'branch',
};

class UIRepoProvider {
    /**
     * Checks if this UI provider handles the current page's platform. Mirror of
     * RepoProvider.isAvailable: the detected platform kind is passed in (computed
     * once by createUIRepoProvider via detectPlatformKind) and the provider
     * compares it to its own kind.
     * @param {string|null} platformKind the page's detected PLATFORM_KIND
     * @returns {boolean}
     */
    isAvailable(platformKind) {
        throw new Error('isAvailable() must be implemented');
    }

    /**
     * Adds a button to the page.
     * @param {Object} options button parameters
     * @param {FileType} options.fileType file type (bpmn or dmn)
     * @param {string} options.buttonType button type: UI_BUTTON_TYPE.DIFF or UI_BUTTON_TYPE.BRANCH
     * @param {boolean} options.needToSelectLocalFile whether to show the local file selector
     * @param {Function} options.onButtonClickFunc click handler
     */
    addButton({ fileType, buttonType, needToSelectLocalFile, onButtonClickFunc }) {
        throw new Error('addButton() must be implemented');
    }

    /**
     * Removes previously inserted buttons/containers.
     */
    reset() {
        throw new Error('reset() must be implemented');
    }

    /**
     * Checks whether the click belongs to the plugin's buttons.
     * @param {Event} event click event
     * @returns {boolean}
     */
    isOwnButtonClick(event) {
        throw new Error('isOwnButtonClick() must be implemented');
    }

    /**
     * Checks whether the plugin's button is currently present in the page.
     * @returns {boolean}
     */
    isButtonPresent() {
        throw new Error('isButtonPresent() must be implemented');
    }
}
