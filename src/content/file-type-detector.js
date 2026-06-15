/**
 * Class for determining file type by extension
 */
class FileTypeDetector {
    /**
     * Determines file type by extension
     * @param {string} filePath file path
     * @returns {FileType|null} FILE_TYPE_BPMN, FILE_TYPE_DMN or null
     */
    detect(filePath) {
        if (!filePath) {
            return null;
        }

        if (filePath.endsWith(FILE_TYPE_BPMN.extension)) {
            return FILE_TYPE_BPMN;
        }

        if (filePath.endsWith(FILE_TYPE_DMN.extension)) {
            return FILE_TYPE_DMN;
        }

        return null;
    }
}
