/**
 * Reads GitLab page markup. This is the most fragile part of the integration
 * (it is bound to GitLab's HTML), so it is isolated here: every DOM query lives
 * in this class and nowhere else in the providers.
 *
 * findSelectedFilePath()/findBranchCommitIdText() are needed by every provider;
 * getMergeRequestBranchNames()/findDiffHeadSha()/isMergedByBadge() are used only
 * by the DOM-based provider and its merged-MR commit resolver.
 */
class GitLabDomScraper {
    // Last path resolved from the rapid-diffs DOM, and the page it belongs to.
    // Rapid diffs mounts and unmounts <diff-file> elements as the reader scrolls,
    // so the same page answers "one diagram" and "nothing here" seconds apart. An
    // empty DOM therefore means "not rendered right now", not "not in this diff",
    // and reporting it as nothing made the button blink (BUG-0036).
    #lastRapidDiffsPath = null;
    #lastRapidDiffsPage = null;

    async findSelectedFilePath() {
        console.debug('finding selected file path...');

        // Rapid diffs UI (gitlab.com): diff files are <diff-file> custom elements,
        // without [data-path] / .is-active markers. Detect it up front to avoid the
        // ~1.5s doWithAttempts wait the legacy lookup below would otherwise incur.
        if (document.querySelector('diff-file')) {
            return this.#findSelectedFilePathInRapidDiffs();
        }

        // Not a single file element in the DOM. On a rapid-diffs page that means
        // they are all unmounted at this scroll position, not that the diff is
        // empty — so the previous answer still stands. Falling through to the
        // legacy lookup would answer null and yank the button (BUG-0036), and pay
        // ~1.5s of polling for it.
        if (this.#lastRapidDiffsPath && this.#lastRapidDiffsPage === window.location.pathname) {
            console.debug('no diff-file rendered right now, keeping: ' + this.#lastRapidDiffsPath);
            return this.#lastRapidDiffsPath;
        }

        return await this.#findSelectedFilePathLegacy();
    }

    /**
     * Reads the branch/commit id text from the ref selector (two known markups).
     * @returns {string|null}
     */
    findBranchCommitIdText() {
        let branchCommitId = this.#extractBranchCommitIdByDocSelectorCase1();
        if (!branchCommitId) {
            branchCommitId = this.#extractBranchCommitIdByDocSelectorCase2();
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

    async #findSelectedFilePathLegacy() {
        const dataPathElems = await this.#findDataPathElements();
        if (!dataPathElems) {
            console.info('cannot find data-path element');
            return null;
        }

        // console.debug(
        //     'data-path elements (json)',
        //     JSON.stringify(
        //         [...dataPathElems].map(el => ({
        //             tag: el.tagName,
        //             text: el.textContent?.trim(),
        //             dataset: { ...el.dataset },
        //             attributes: Object.fromEntries(
        //                 [...el.attributes].map(a => [a.name, a.value])
        //             )
        //         })),
        //         null,
        //         2
        //     )
        // );

        let filePath;
        for (const elem of dataPathElems) {
            if (elem.classList.contains('is-active') || elem.classList.contains('diff-file-is-active')) {
                filePath = elem.getAttribute('data-path');
                if (filePath) {
                    break;
                }
            }
        }
        if (!filePath) {
            console.debug('cannot get file path from data-path element');
            return null;
        }
        console.debug('selected file path: ' + filePath);
        return filePath;
    }

    #findSelectedFilePathInRapidDiffs() {
        console.debug('finding selected file path in rapid diffs...');

        const files = [];
        let selectedPath = null;
        const selectedId = window.location.hash ? window.location.hash.substring(1) : null;

        for (const diffFile of document.querySelectorAll('diff-file')) {
            const path = this.#extractRapidDiffFilePath(diffFile);
            if (!path) {
                continue;
            }
            files.push(path);
            if (selectedId && diffFile.id === selectedId) {
                selectedPath = path;
            }
        }

        // Explicit selection via URL hash wins
        if (selectedPath) {
            return this.#rememberRapidDiffsPath(selectedPath, 'by hash');
        }

        // Fallback: exactly one bpmn/dmn file in the diff -> use it without explicit selection
        const diagramFiles = files.filter(
            p => p.endsWith(FILE_TYPE_BPMN.extension) || p.endsWith(FILE_TYPE_DMN.extension)
        );
        if (diagramFiles.length === 1) {
            return this.#rememberRapidDiffsPath(diagramFiles[0], 'single diagram');
        }

        console.debug(`cannot determine selected file path in rapid diffs (${files.length} file(s) rendered)`);
        this.#forgetRapidDiffsPath();
        return null;
    }

    #rememberRapidDiffsPath(path, how) {
        console.debug(`selected file path (rapid diffs, ${how}): ${path}`);
        this.#lastRapidDiffsPath = path;
        this.#lastRapidDiffsPage = window.location.pathname;
        return path;
    }

    #forgetRapidDiffsPath() {
        this.#lastRapidDiffsPath = null;
        this.#lastRapidDiffsPage = null;
    }

    #extractRapidDiffFilePath(diffFile) {
        const raw = diffFile.getAttribute('data-file-data');
        if (!raw) {
            return null;
        }
        try {
            const data = JSON.parse(raw);
            return data.new_path || data.old_path || null;
        } catch (error) {
            console.debug('cannot parse data-file-data of diff-file', error);
            return null;
        }
    }

    async #findDataPathElements() {
        return await doWithAttempts(function () {
            const res = document.querySelectorAll('[data-path]');
            if (res && res.length > 0) {
                return res;
            } else {
                return null;
            }
        });
    }

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
}
