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
     * Extracts branch/commit id and file path from a branch blob URL.
     * @param {string} href full page URL
     * @param {string} projectName project name (used to anchor the first regex)
     * @param {string|null} branchCommitIdHint branch/commit id read from the page, if any
     * @returns {{branchCommitId: string, filePath: string}|null}
     */
    extractBranchCommitIdAndFilePath(href, projectName, branchCommitIdHint) {
        let branchCommitId = branchCommitIdHint;

        let regex = `\/-\/blob\/([0-9a-zA-Z-_./]+)\/(${projectName}\/.*)`;
        let match = href.match(regex);
        if (!match || match.length < 3) {
            if (!branchCommitId) {
                branchCommitId = 'master|develop|feature\/[0-9a-zA-Z-_.]+|bugfix\/[0-9a-zA-Z-_.]+|[0-9a-zA-Z-_./]+';
            }
            regex = `\/-\/blob\/(` + branchCommitId + `)\/(.*)`;
            match = href.match(regex);
            if (!match || match.length < 3) {
                console.warn('cannot extract branch commit id and bpmn file path by regex from url: ' + href);
                return null;
            }
        }

        const filePath = match[2].split('?')[0];

        return {
            branchCommitId: match[1],
            filePath: filePath
        };
    }
}
