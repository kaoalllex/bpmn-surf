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
     * Adds the branch (blob) view button: open the diagram, or diff it against a
     * local file. The change view uses syncFileButtons() instead.
     * @param {Object} options button parameters
     * @param {FileType} options.fileType file type (bpmn or dmn)
     * @param {string} options.filePath the file the button was built for
     * @param {Function} options.onButtonClickFunc click handler; receives extParams
     *     ({ localFileContent, sourceLabel }) when a local file was picked
     */
    addButton({ fileType, filePath, onButtonClickFunc }) {
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

    /**
     * The file path the currently shown button was built for, or null when there
     * is no button. Lets the caller tell "the button is there" from "the button
     * is there for the file now on screen".
     * @returns {string|null}
     */
    buttonFilePath() {
        throw new Error('buttonFilePath() must be implemented');
    }

    /**
     * Keeps one diff button on every diagram file the change view shows,
     * attached to that file's own block. Safe to call on every DOM change:
     * blocks that already carry the right button are left untouched.
     * @param {Function} describeFile (filePath) => ({ fileType, onButtonClickFunc }) for
     *     a file that gets a button, or null for one that does not
     */
    syncFileButtons(describeFile) {
        throw new Error('syncFileButtons() must be implemented');
    }

    /**
     * Removes every per-file button (e.g. before rebuilding them for other refs).
     */
    removeFileButtons() {
        throw new Error('removeFileButtons() must be implemented');
    }
}
