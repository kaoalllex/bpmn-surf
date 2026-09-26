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
     * @param {string} platformKind the page's detected PLATFORM_KIND
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
     * @param {string} options.filePath the file the button was built for
     * @param {Function} options.onButtonClickFunc click handler
     */
    addButton({ fileType, buttonType, needToSelectLocalFile, filePath, onButtonClickFunc }) {
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
     * Disables the button (if present) without removing it, so a click during a
     * re-check (the button may turn out to belong to a file no longer on screen)
     * does nothing instead of opening a stale diff.
     */
    disableButton() {
        throw new Error('disableButton() must be implemented');
    }

    /**
     * Re-enables the button (if present). A no-op when the button was just
     * rebuilt by addButton(), which always starts out enabled.
     */
    enableButton() {
        throw new Error('enableButton() must be implemented');
    }

    /**
     * Checks whether the plugin's button is currently present in the page.
     * @returns {boolean}
     */
    isButtonPresent() {
        throw new Error('isButtonPresent() must be implemented');
    }

    /**
     * The file path the currently shown button was built for, or null when there
     * is no button. Lets the caller tell "the button is there" from "the button
     * is there for the file now on screen".
     * @returns {string|null}
     */
    buttonFilePath() {
        throw new Error('buttonFilePath() must be implemented');
    }
}
