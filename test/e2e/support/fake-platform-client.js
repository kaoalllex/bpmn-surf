'use strict';

// Test-only PlatformClient (the differ-scope seam — see
// src/differ/platform/platform-client.js). Returns in-memory fixtures so the
// differ runs fully offline: rawFileUrl yields a data: URL that the global
// loadFileContent fetches locally; search/changes return canned arrays. Loaded
// into the harness page via a <script> tag, so it defines a global class.
class FakePlatformClient {
    // { xmlByRef: { [ref]: xmlString }, searchHits: [...], changedFiles: [...],
    //   contentByRefPath: { [`${ref}:${path}`]: contentString } }
    constructor({ xmlByRef = {}, searchHits = [], changedFiles = [], contentByRefPath = {} } = {}) {
        this._xmlByRef = xmlByRef;
        this._searchHits = searchHits;
        this._changedFiles = changedFiles;
        this._contentByRefPath = contentByRefPath;
        // Every searchCode call, so a spec can assert WHICH ref was queried
        // (BUG-0033: a local-file comparison used to pass null).
        this.searchCalls = [];
    }

    rawFileUrl(ref, filePath) {
        // Per-(ref,path) content wins (handler source files differ from the diagram
        // XML at the same ref); otherwise fall back to the by-ref diagram XML — an
        // unknown ref → '' (the differ's "file absent" path). Backward compatible:
        // with no contentByRefPath entry the original behaviour is unchanged.
        const pathKey = `${ref}:${filePath}`;
        if (Object.prototype.hasOwnProperty.call(this._contentByRefPath, pathKey)) {
            return 'data:application/xml,' + encodeURIComponent(this._contentByRefPath[pathKey]);
        }
        const xml = this._xmlByRef[ref];
        return 'data:application/xml,' + encodeURIComponent(xml || '');
    }

    blobFileUrl(ref, filePath, line) {
        return `http://localhost/blob/${ref}/${filePath}` + (line ? `#L${line}` : '');
    }

    async searchCode(ref, term, options = {}) {
        this.searchCalls.push({ ref, term });
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
