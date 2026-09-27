class GitLabUIRepoProvider extends UIRepoProvider {

    #buttonId = 'btn_77844bf3d4e842caa0d88194431197c0';

    // A file block of either diff UI: rapid diffs (<diff-file>, gitlab.com) or the
    // legacy Vue diffs (self-managed; gitlab.com serves it with ?rapid_diffs_disabled=true).
    static #FILE_BLOCK_SELECTOR = 'diff-file, .diff-file.file-holder[data-path]';
    // The block's own header controls (stats, Viewed, comment, ⋮). The legacy
    // diff body can hold other .file-actions, hence the :scope anchor.
    static #FILE_ACTIONS_SELECTOR = '.rd-diff-file-info, :scope > .js-file-title .file-actions';
    static #FILE_BUTTON_CLASS = 'bpmn-surf-file-btn';

    // icons/icon-small.svg, inlined: an <img> of the packaged file would need a
    // web_accessible_resources entry just for this.
    static #ICON_SVG =
        '<svg width="16" height="16" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="1024" height="1024" rx="229" ry="229" fill="#0E2438"/>' +
        '<path d="M408,452 Q515,576 620,584" fill="none" stroke="#4A9CEC" stroke-width="96" stroke-linecap="round"/>' +
        '<rect x="226" y="266" width="208" height="208" rx="58" fill="#0E2438" stroke="#4A9CEC" stroke-width="96"/>' +
        '<rect x="590" y="556" width="208" height="208" rx="58" fill="#0E2438" stroke="#4A9CEC" stroke-width="96"/>' +
        '</svg>';

    isAvailable(platformKind) {
        return platformKind === PLATFORM_KIND.GITLAB;
    }

    // Several GitLab versions render the MR header differently, so we try a list
    // of candidate selectors and use the first one that matches.
    // #SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTORS legacy: '#content-body > div.merge-request > div.merge-request-details.issuable-details > div.merge-request-tabs-holder.js-tabs-affix > div > div';
    #SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTORS = [
        // GitLab self-managed (gitlab.example.com): sticky header is a direct child of issuable-details
        '#content-body > div.merge-request > div.merge-request-details.issuable-details > div.merge-request-sticky-header.gl-border-b > div.merge-request-tabs-container.gl-flex.gl-justify-between.gl-relative.is-merge-request.js-tabs-affix > div',
        // GitLab.com: sticky header is nested inside .merge-request-sticky-header-wrapper
        '#content-body > div.merge-request > div.merge-request-details.issuable-details > div.merge-request-sticky-header-wrapper > div.merge-request-sticky-header.gl-border-b > div.merge-request-tabs-container.is-merge-request.js-tabs-affix > div',
        // Tolerant fallback: any MR tabs container, regardless of header wrapper nesting.
        // Deliberately without .is-merge-request: GitLab adds that class only when the
        // user's "Layout width" preference is Fixed, so with Fluid layout it is absent.
        '#content-body div.merge-request-tabs-container.js-tabs-affix > div'
    ];

    // #SHOW_BRANCH_BTN_PARENT_CONTAINER_SELECTOR = 'div.gl-display-flex.gl-flex-wrap.file-actions';
    #SHOW_BRANCH_BTN_PARENT_CONTAINER_SELECTOR = '#fileHolder > div.js-file-title.file-title-flex-parent > div.file-actions.gl-flex.gl-flex-wrap.gl-gap-3 > div';

    addButton({ fileType, buttonType, needToSelectLocalFile, filePath, onButtonClickFunc }) {
        this.reset();

        const parentContainerSelectors = buttonType === UI_BUTTON_TYPE.DIFF
            ? this.#SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTORS
            : [this.#SHOW_BRANCH_BTN_PARENT_CONTAINER_SELECTOR];

        const appendAtTheEnd = buttonType === UI_BUTTON_TYPE.DIFF;

        const buttonContainer = document.createElement('div');
        buttonContainer.id = this.#buttonId;
        buttonContainer.className = 'gl-display-flex';
        // On the container, because that is the element #buttonId identifies and
        // the one buttonFilePath() reads back.
        if (filePath) {
            buttonContainer.dataset.bpmnSurfFilePath = filePath;
        }

        const button = document.createElement('button');
        button.id = this.#buttonId + '-btn';
        // Main entry-point button — accented as bpmn-surf's (UX-0009). The accent
        // class lives in the content-script stylesheet (content-styles.css) and
        // overrides only border/text/hover on top of GitLab's native classes.
        button.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50 bpmn-surf-btn-accent';
        button.textContent = this.#getButtonText(fileType, buttonType);
        button.addEventListener('mouseup', onButtonClickFunc);
        buttonContainer.appendChild(button);

        if (needToSelectLocalFile) {
            const fileInput = document.createElement('input');
            fileInput.id = this.#buttonId + '-input';
            fileInput.type = 'file';
            fileInput.accept = fileType.extension;
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', (event) => this.#localFileSelected(event, onButtonClickFunc));
            buttonContainer.appendChild(fileInput);

            const button2 = document.createElement('button');
            button2.id = this.#buttonId + '-btn2';
            button2.className = 'gl-md-display-block btn gl-button btn-default gl-rounded-base gl-bg-gray-50 gl-ml-3';
            button2.textContent = 'Diff with local';
            button2.addEventListener('mouseup', () => { fileInput.click(); });
            buttonContainer.appendChild(button2);
        }

        const parentContainer = this.#findFirstMatch(parentContainerSelectors);
        if (!parentContainer) {
            console.error('Cannot find button parent container by selectors', parentContainerSelectors);
            return;
        }
        if (appendAtTheEnd) {
            parentContainer.appendChild(buttonContainer);
        } else {
            parentContainer.prepend(buttonContainer);
        }
    }

    reset() {
        removeElement(this.#buttonId);
    }

    syncFileButtons(describeFile) {
        for (const block of document.querySelectorAll(GitLabUIRepoProvider.#FILE_BLOCK_SELECTOR)) {
            const actions = block.querySelector(GitLabUIRepoProvider.#FILE_ACTIONS_SELECTOR);
            if (!actions) {
                continue;
            }
            const filePath = this.#fileBlockPath(block);
            const existing = actions.querySelector(`:scope > .${GitLabUIRepoProvider.#FILE_BUTTON_CLASS}`);
            if (existing && existing.dataset.bpmnSurfFilePath === filePath) {
                continue;
            }
            if (existing) {
                existing.remove();
            }
            const file = filePath ? describeFile(filePath) : null;
            if (file) {
                // Before the last control, GitLab's ⋮ menu: anchored to the right
                // edge, the button sits at the same spot on every file.
                actions.insertBefore(this.#createFileButton(filePath, file), actions.lastElementChild);
            }
        }
    }

    removeFileButtons() {
        for (const button of document.querySelectorAll('.' + GitLabUIRepoProvider.#FILE_BUTTON_CLASS)) {
            button.remove();
        }
    }

    #findFirstMatch(selectors) {
        for (const selector of selectors) {
            const elem = document.querySelector(selector);
            if (elem) {
                return elem;
            }
        }
        return null;
    }

    #fileBlockPath(block) {
        if (block.tagName !== 'DIFF-FILE') {
            return block.getAttribute('data-path');
        }
        try {
            const data = JSON.parse(block.getAttribute('data-file-data'));
            return data.new_path || data.old_path || null;
        } catch (error) {
            return null;
        }
    }

    #createFileButton(filePath, { fileType, onButtonClickFunc }) {
        const wrapper = document.createElement('div');
        wrapper.className = `${GitLabUIRepoProvider.#FILE_BUTTON_CLASS} gl-flex gl-items-center gl-mr-3`;
        wrapper.dataset.bpmnSurfFilePath = filePath;

        const button = this.#createAccentButton('btn-sm', this.#getButtonText(fileType, UI_BUTTON_TYPE.DIFF));
        button.addEventListener('click', (event) => {
            // The legacy file header toggles the file open/closed on a click.
            event.stopPropagation();
            onButtonClickFunc();
        });
        wrapper.appendChild(button);
        return wrapper;
    }

    #createAccentButton(sizeClass, text) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn gl-button btn-default ${sizeClass} bpmn-surf-btn-accent bpmn-surf-btn-with-icon`;
        button.innerHTML = GitLabUIRepoProvider.#ICON_SVG;
        const label = document.createElement('span');
        label.textContent = text;
        button.appendChild(label);
        return button;
    }

    isOwnButtonClick(event) {
        const target = event && event.target;
        if (!target || typeof target.closest !== 'function') {
            return false;
        }
        return !!target.closest(`[id^="${this.#buttonId}"], .${GitLabUIRepoProvider.#FILE_BUTTON_CLASS}`);
    }

    isButtonPresent() {
        return document.getElementById(this.#buttonId) !== null;
    }

    buttonFilePath() {
        const button = document.getElementById(this.#buttonId);
        return (button && button.dataset.bpmnSurfFilePath) || null;
    }

    #getButtonText(fileType, buttonType) {
        if (buttonType === UI_BUTTON_TYPE.DIFF) {
            return fileType === FILE_TYPE_BPMN ? 'Schema diff' : 'Decision diff';
        }
        if (buttonType === UI_BUTTON_TYPE.BRANCH) {
            return fileType === FILE_TYPE_BPMN ? 'View schema' : 'View decision';
        }
        throw new Error(`Unexpected buttonType: ${buttonType}`);
    }

    #localFileSelected(event, onButtonClickFunc) {
        const file = event.target.files[0];
        if (!file) {
            console.error('Cannot select local file');
            return;
        }
        console.debug('Selected local file: ' + file.name);

        event.target.value = '';

        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            console.debug('Selected local file has been read');
            const extParams = {
                localFileContent: content,
                // The uploaded file's own name, shown as "Local · <name>" in the
                // header so it is clear which local file is being compared.
                sourceLabel: file.name,
            };
            onButtonClickFunc(extParams);
        };
        reader.onerror = function (e) {
            console.error('Error while reading local file ' + file.name, e.target.error);
        };
        reader.readAsText(file);
    }
}
