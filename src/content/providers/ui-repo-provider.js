const UI_BUTTON_TYPE = {
    DIFF: 'diff',
    BRANCH: 'branch',
};

class UIRepoProvider {
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
}
