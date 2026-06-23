// Differ-scope abstraction of every platform-specific data access the differ
// page performs (REFAC-0004). The differ core and the navigation locators talk
// only to this interface; concrete clients (GitLab, later GitHub) own the
// platform-specific URLs, search API and response parsing, so no provider
// detail leaks back into the locators.
//
// The mirror of the content scope's RepoProvider seam: a concrete client is
// built by platform-client-factory.js#createPlatformClient(platform), chosen by
// platform.kind. Methods throw here so an unimplemented client fails loudly.
//
// Search hits are normalised to { path, line, snippet } so a platform's own
// JSON shape (GitLab `data`/`startline`, GitHub's different schema) never
// reaches the locators — they gate and classify on the neutral `snippet`.
class PlatformClient {
    /**
     * Raw (machine-readable) URL of a file at a ref — the source loaded to
     * render a diagram version or scan a handler file.
     * @returns {string}
     */
    rawFileUrl(ref, filePath) {
        throw new Error('rawFileUrl() must be implemented');
    }

    /**
     * Human-facing URL that opens a file in the repository UI at a ref,
     * optionally anchored to a line (FEAT-0026, handler/correlation navigators).
     * @returns {string}
     */
    blobFileUrl(ref, filePath, line) {
        throw new Error('blobFileUrl() must be implemented');
    }

    /**
     * Searches the project's code for a term at a ref and returns normalised
     * hits. `options.perPage` may request a larger page (CorrelationLocator).
     * @returns {Promise<Array<{path: string, line: number, snippet: string}>>}
     */
    async searchCode(ref, term, options = {}) {
        throw new Error('searchCode() must be implemented');
    }

    /**
     * Human-facing code-search page URL for a term at a ref — the fallback the
     * navigators open when an automatic resolution finds nothing.
     * @returns {string}
     */
    searchPageUrl(term, ref) {
        throw new Error('searchPageUrl() must be implemented');
    }

    /**
     * Files changed by a merge/pull request, normalised. `status` is one of
     * 'added' / 'removed' / 'changed'; `oldPath` is the pre-rename path
     * (equals `path` when not renamed).
     * @returns {Promise<Array<{path: string, oldPath: string, status: string}>>}
     */
    async prChangedFiles(changeId) {
        throw new Error('prChangedFiles() must be implemented');
    }

    /**
     * Human-facing URL of the MR/PR diffs page (a file anchor is appended by
     * the caller — see HandlerLocator.mrFileDiffUrl).
     * @returns {string}
     */
    prDiffsUrl(changeId) {
        throw new Error('prDiffsUrl() must be implemented');
    }
}
