'use strict';

// Test-only PlatformClient (the differ-scope seam — see
// src/differ/platform/platform-client.js). Returns in-memory fixtures so the
// differ runs fully offline: rawFileUrl yields a data: URL that the global
// loadFileContent fetches locally; search/changes return canned arrays. Loaded
// into the harness page via a <script> tag, so it defines a global class.
class FakePlatformClient {
    // { xmlByRef: { [ref]: xmlString }, searchHits: [...], changedFiles: [...] }
    constructor({ xmlByRef = {}, searchHits = [], changedFiles = [] } = {}) {
        this._xmlByRef = xmlByRef;
        this._searchHits = searchHits;
        this._changedFiles = changedFiles;
    }

    rawFileUrl(ref, filePath) {
        const xml = this._xmlByRef[ref];
        // An unknown ref → empty content; loadFileContent returns '' (falsy), which
        // the differ treats as "file absent in this version" (BUG-0001 path).
        return 'data:application/xml,' + encodeURIComponent(xml || '');
    }

    blobFileUrl(ref, filePath, line) {
        return `http://localhost/blob/${ref}/${filePath}` + (line ? `#L${line}` : '');
    }

    async searchCode(ref, term, options = {}) {
        return this._searchHits;
    }

    searchPageUrl(term, ref) {
        return `http://localhost/search?term=${encodeURIComponent(term)}`;
    }

    async prChangedFiles(changeId) {
        return this._changedFiles;
    }

    prDiffsUrl(changeId) {
        return `http://localhost/mr/${changeId}/diffs`;
    }
}
