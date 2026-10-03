/**
 * Reads GitLab page markup. This is the most fragile part of the integration
 * (it is bound to GitLab's HTML), so it is isolated here: every DOM query lives
 * in this class and nowhere else in the providers.
 *
 * findBranchCommitIdText() is needed by every provider;
 * getMergeRequestBranchNames()/findDiffHeadSha()/isMergedByBadge() are used only
 * by the DOM-based provider and its merged-MR commit resolver. File blocks of the
 * MR diff are not read here: they are where buttons go, so GitLabUIRepoProvider
 * owns them.
 */
class GitLabDomScraper {
    /**
     * Reads the branch/commit id the page states. The two older ref selector
     * markups (still served by self-managed GitLab) are tried first; current
     * gitlab.com matches neither but keeps the full ref on the ambiguous-ref modal.
     * @returns {string|null}
     */
    findBranchCommitIdText() {
        let branchCommitId = this.#extractBranchCommitIdByDocSelectorCase1();
        if (!branchCommitId) {
            branchCommitId = this.#extractBranchCommitIdByDocSelectorCase2();
        }
        if (!branchCommitId) {
            branchCommitId = this.#extractBranchCommitIdByAmbiguousRefModal();
        }
        return branchCommitId;
    }

    /**
     * Reads source/target branch names from the MR detail page description.
     * @returns {MergeRequestBranchNames|null}
     */
    getMergeRequestBranchNames() {
        const pageDescrElem = document.querySelector('div.detail-page-description');
        if (!pageDescrElem) {
            console.warn('Cannot get MR detail page description element');
            return null;
        }

        let srcBranchName = null;
        let trgBranchName = null;
        let isNextATargetBranchName = false;
        for (const node of pageDescrElem.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('into')) {
                isNextATargetBranchName = true;
                continue;
            }
            if (node.tagName === 'A') {
                if (isNextATargetBranchName) {
                    trgBranchName = node.textContent;
                    break;
                } else {
                    srcBranchName = node.textContent;
                }
            }
        }
        return new MergeRequestBranchNames(srcBranchName, trgBranchName);
    }

    /**
     * Reads diff_head_sha from the MR discussions data attribute.
     * @returns {string|null}
     */
    findDiffHeadSha() {
        console.debug('finding diff head sha...');

        const elem = document.getElementById('js-vue-mr-discussions');
        if (!elem) {
            console.debug('js-vue-mr-discussions not found');
            return null;
        }
        const data = elem.getAttribute('data-noteable-data');
        if (!data) {
            console.debug('att data-noteable-data not found');
            return null;
        }
        const matches = /"diff_head_sha":"([0-9a-f]+)"/g.exec(data);
        if (matches && matches.length >= 2) {
            const res = matches[1];
            console.debug('diffHeadSha: ' + res);
            return res;
        } else {
            console.debug('diffHeadSha not found by regex');
            return null;
        }
    }

    /**
     * Detects a merged MR by the status badge in the page header.
     * @returns {boolean}
     */
    isMergedByBadge() {
        // checking through DOM is faster than API call
        const mergeStatusElement = document.querySelector('.issuable-status-badge-merged');
        if (mergeStatusElement) {
            const mergedText = mergeStatusElement.querySelector('.gl-display-none.gl-sm-display-block');
            if (mergedText && mergedText.textContent.trim() === 'Merged') {
                return true;
            }
        }
        return false;
    }

    // ==== Private methods ====

    #extractBranchCommitIdByDocSelectorCase1() {
        let elem = document.querySelector('div.ref-selector');
        if (!elem) {
            console.debug('cannot extract branch commit id and bpmn file path by doc selector case 1: ref-selector not found');
            return null;
        }

        elem = elem.querySelector('.gl-dropdown-button-text');
        if (!elem) {
            console.debug('cannot extract branch commit id and bpmn file path by doc selector case 1: gl-dropdown-button-text not found');
            return null;
        }

        return elem.innerText;
    }

    #extractBranchCommitIdByDocSelectorCase2() {
        let elem = document.querySelector('button.js-project-refs-dropdown');
        if (!elem) {
            console.debug('cannot extract branch commit id and bpmn file path by doc selector case 2: refs-dropdown not found');
            return null;
        }

        elem = elem.querySelector('.dropdown-toggle-text');
        if (!elem) {
            console.debug('cannot extract branch commit id and bpmn file path by doc selector case 2: dropdown-toggle-text not found');
            return null;
        }

        return elem.innerText;
    }

    #extractBranchCommitIdByAmbiguousRefModal() {
        const elem = document.querySelector('#js-ambiguous-ref-modal[data-ref]');
        if (!elem) {
            console.debug('cannot extract branch commit id by the ambiguous-ref modal: not found');
            return null;
        }
        return elem.getAttribute('data-ref');
    }
}
