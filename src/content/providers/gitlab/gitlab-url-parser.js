/**
 * Pure parsing of GitLab URLs and paths: no DOM reads, no network. Every method
 * derives its result from the given href (and, where needed, already-resolved
 * project info), which makes the whole class trivially unit-testable.
 */
class GitLabUrlParser {
    /**
     * Parses project coordinates from a GitLab page URL.
     * @param {string} href full page URL
     * @returns {{url: string, hostUrl: string, groupName: string, name: string}|null}
     */
    parseProject(href) {
        const url = href.substring(0, href.indexOf('/-/'));
        if (!url) {
            console.debug('cannot get project url');
            return null;
        }
        const parts = url.split('/');
        if (parts.length < 3) {
            console.error('cannot get project group name and name from url: ' + url);
            return null;
        }
        const groupName = parts[parts.length - 2];
        const name = parts[parts.length - 1];

        parts.pop();
        parts.pop();
        const hostUrl = parts.join('/');

        return { url, hostUrl, groupName, name };
    }

    /**
     * Extracts the merge request iid from a GitLab URL.
     * @param {string} href full page URL
     * @returns {string|null}
     */
    extractMrIid(href) {
        const cleanHref = href.split('?')[0].split('#')[0];
        const marker = '/-/merge_requests/';
        const markerIndex = cleanHref.indexOf(marker);
        if (markerIndex === -1) {
            return null;
        }
        let rest = cleanHref.substring(markerIndex + marker.length);
        const slashIndex = rest.indexOf('/');
        if (slashIndex !== -1) {
            rest = rest.substring(0, slashIndex);
        }
        return rest || null;
    }

    /**
     * Builds the MR-info API URL (GET /api/v4/projects/{group%2Fname}/merge_requests/{iid}).
     * @param {ProjectInfo} projectInfo resolved project info (url + name)
     * @param {string} iid merge request iid
     * @returns {string}
     */
    buildMrApiUrl(projectInfo, iid) {
        let mrInfoUrl = projectInfo.url.substring(0, projectInfo.url.length - projectInfo.name.length - 1);
        const slashIndex = mrInfoUrl.lastIndexOf('/');
        mrInfoUrl = mrInfoUrl.substring(0, slashIndex) + '/api/v4/projects/' + mrInfoUrl.substring(slashIndex + 1) +
            '%2F' + projectInfo.name + '/merge_requests/' + iid;
        return mrInfoUrl;
    }

    /**
     * Extracts the selected commit id from an MR diffs URL.
     *
     * GitLab puts ?commit_id=<sha> on the diffs page when a single commit is
     * picked from the MR commit list, and then shows that commit's diff against
     * its parent. Returns null when no specific commit is selected (the whole-MR
     * view).
     * @param {string} href full page URL
     * @returns {string|null}
     */
    extractCommitId(href) {
        const queryIndex = href.indexOf('?');
        if (queryIndex === -1) {
            return null;
        }
        const query = href.substring(queryIndex + 1).split('#')[0];
        const match = query.match(/(?:^|&)commit_id=([a-fA-F0-9]+)/);
        return match ? match[1] : null;
    }

    /**
     * @param {string} href full page URL
     * @returns {boolean} true if the URL is an MR diffs page
     */
    isMrDiffPage(href) {
        return href.includes('/-/merge_requests/') && href.includes('/diffs');
    }

    /**
     * Determines the diagram file type for a branch blob URL.
     * @param {string} href full page URL
     * @returns {FileType|null} FILE_TYPE_BPMN, FILE_TYPE_DMN or null
     */
    getBranchFileType(href) {
        if (!href.includes('/-/blob/')) {
            return null;
        }
        const hrefWithoutParams = href.split('?')[0];
        if (hrefWithoutParams.endsWith(FILE_TYPE_BPMN.extension)) {
            return FILE_TYPE_BPMN;
        }
        if (hrefWithoutParams.endsWith(FILE_TYPE_DMN.extension)) {
            return FILE_TYPE_DMN;
        }
        return null;
    }

    /**
     * Splits a blob URL's `/-/blob/<ref>/<path>` tail into the ref and the file
     * path.
     *
     * The split is genuinely ambiguous: a ref may itself contain slashes
     * (release/1.2), and nothing in the URL marks where it ends. Only the page's
     * own ref selector knows for sure, so that hint wins whenever it is present;
     * without it the ref is assumed to be a single segment, which is right for
     * every unslashed branch, tag and sha.
     *
     * It used to guess instead, from a list of branch names (master, develop,
     * feature/*, bugfix/*) with a greedy catch-all behind them. The catch-all
     * matched slashes, so for any other branch it swallowed the directories and
     * left only the file name: `main/a/b/c.bpmn` parsed as ref `main/a/b` and
     * path `c.bpmn`. The diagram still rendered (raw URLs re-join the two), but
     * every ref-scoped API call — code search, repository tree — was issued with
     * a ref that does not exist, which is what broke dive-in and handler
     * navigation for any diagram outside the repository root.
     *
     * @param {string} href full page URL
     * @param {string|null} branchCommitIdHint branch/commit id read from the page, if any
     * @returns {{branchCommitId: string, filePath: string}|null}
     */
    extractBranchCommitIdAndFilePath(href, branchCommitIdHint) {
        const marker = '/-/blob/';
        const markerIndex = href.indexOf(marker);
        if (markerIndex === -1) {
            console.warn('cannot extract branch commit id and file path: not a blob url: ' + href);
            return null;
        }

        const tail = href.substring(markerIndex + marker.length).split('?')[0].split('#')[0];
        const firstSlash = tail.indexOf('/');
        if (firstSlash <= 0) {
            console.warn('cannot extract branch commit id and file path: no file path in url: ' + href);
            return null;
        }

        const split = (ref, source) => {
            console.debug(`branch ref '${ref}' resolved by ${source}; file path '${tail.substring(ref.length + 1)}'`);
            return { branchCommitId: ref, filePath: tail.substring(ref.length + 1) };
        };

        // The ref selector is the only source that can state a slashed ref.
        if (branchCommitIdHint && tail.startsWith(branchCommitIdHint + '/')) {
            return split(branchCommitIdHint, 'the page ref selector');
        }

        const firstSegment = tail.substring(0, firstSlash);
        if (/^[0-9a-fA-F]{7,40}$/.test(firstSegment)) {
            return split(firstSegment, 'its commit-sha shape');
        }

        return split(firstSegment, 'the first url segment');
    }
}
