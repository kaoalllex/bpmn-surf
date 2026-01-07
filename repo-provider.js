/**
 * DTO для хранения информации о ветках merge request
 */
class MergeRequestBranchNames {
    constructor(sourceBranchName, targetBranchName) {
        this.sourceBranchName = sourceBranchName;
        this.targetBranchName = targetBranchName;
    }
}

/**
 * Базовый интерфейс провайдера репозитория
 */
class RepoProvider {
    /**
     * Проверяет, доступен ли данный провайдер для текущей страницы
     * @returns {boolean} true если провайдер может работать с текущей страницей
     */
    isAvailable() {
        throw new Error('isAvailable() must be implemented');
    }

    /**
     * Инициализирует провайдер и определяет параметры проекта
     * @returns {Promise<boolean>} true если инициализация успешна
     */
    async init() {
        throw new Error('init() must be implemented');
    }

    /**
     * Возвращает информацию о проекте
     * @returns {Object} объект с полями: url, hostUrl, groupName, name, id
     */
    getProjectInfo() {
        throw new Error('getProjectInfo() must be implemented');
    }

    /**
     * Проверяет, активна ли вкладка с diff'ами MR
     * @returns {Promise<boolean>}
     */
    async isDiffsTabActive() {
        throw new Error('isDiffsTabActive() must be implemented');
    }

    /**
     * Определяет тип файла (bpmn или dmn), если просматривается файл в ветке
     * @returns {Promise<string|null>} 'bpmn', 'dmn' или null
     */
    async getBranchFileType() {
        throw new Error('getBranchFileType() must be implemented');
    }

    /**
     * Находит выбранный файл в diff'е MR
     * @returns {Promise<string|null>} путь к файлу или null
     */
    async findSelectedFilePath() {
        throw new Error('findSelectedFilePath() must be implemented');
    }

    /**
     * Инициализирует информацию о MR
     * @returns {Promise<void>}
     */
    async initMergeRequestInfo() {
        throw new Error('initMergeRequestInfo() must be implemented');
    }

    /**
     * Получает заголовок MR
     * @returns {string|null} заголовок MR или null если еще не вызывали initMergeRequestInfo
     */
    getMergeRequestTitle() {
        throw new Error('getMergeRequestTitle() must be implemented');
    }

    /**
     * Получает имена исходной и целевой веток MR
     * @returns {MergeRequestBranchNames|null} объект с информацией о ветках или null
     */
    getMergeRequestBranchNames() {
        throw new Error('getMergeRequestBranchNames() must be implemented');
    }

    /**
     * Получает ID последнего коммита в MR
     * @returns {Promise<string|null>}
     */
    async getMergeRequestCommitId() {
        throw new Error('getMergeRequestCommitId() must be implemented');
    }

    /**
     * Получает ID целевого коммита для сравнения
     * @param {string} mrCommitId - ID коммита MR
     * @param {string} mrTitle - заголовок MR
     * @param {string} targetBranchName - имя целевой ветки
     * @returns {Promise<string>} ID коммита или имя ветки
     */
    async getTargetCommitId(mrCommitId, mrTitle, targetBranchName) {
        throw new Error('getTargetCommitId() must be implemented');
    }

    /**
     * Извлекает информацию о коммите и пути файла из URL просмотра ветки
     * @returns {Object|null} объект с полями: branchCommitId, filePath или null
     */
    extractBranchCommitIdAndFilePath() {
        throw new Error('extractBranchCommitIdAndFilePath() must be implemented');
    }
}
