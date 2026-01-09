const UI_BUTTON_TYPE = {
    DIFF: 'diff',
    BRANCH: 'branch',
};

class UIRepoProvider {
    /**
     * Добавляет кнопку на страницу.
     * @param {Object} options параметры кнопки
     * @param {FileType} options.fileType тип файла (bpmn или dmn)
     * @param {string} options.buttonType тип кнопки: UI_BUTTON_TYPE.DIFF или UI_BUTTON_TYPE.BRANCH
     * @param {boolean} options.needToSelectLocalFile нужно ли отображать выбор локального файла
     * @param {Function} options.onButtonClickFunc обработчик клика
     */
    addButton({ fileType, buttonType, needToSelectLocalFile, onButtonClickFunc }) {
        throw new Error('addButton() must be implemented');
    }

    /**
     * Удаляет ранее вставленные кнопки/контейнеры.
     */
    reset() {
        throw new Error('reset() must be implemented');
    }

    /**
     * Проверяет, относится ли клик к кнопкам плагина.
     * @param {Event} event событие клика
     * @returns {boolean}
     */
    isOwnButtonClick(event) {
        throw new Error('isOwnButtonClick() must be implemented');
    }
}
