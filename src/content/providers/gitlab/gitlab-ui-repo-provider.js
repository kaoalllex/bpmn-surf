class GitLabUIRepoProvider extends UIRepoProvider {

    #buttonId = 'btn_77844bf3d4e842caa0d88194431197c0';

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

    addButton({ fileType, buttonType, needToSelectLocalFile, onButtonClickFunc }) {
        this.reset();

        const parentContainerSelectors = buttonType === UI_BUTTON_TYPE.DIFF
            ? this.#SHOW_DIFF_BTN_PARENT_CONTAINER_SELECTORS
            : [this.#SHOW_BRANCH_BTN_PARENT_CONTAINER_SELECTOR];

        const appendAtTheEnd = buttonType === UI_BUTTON_TYPE.DIFF;

        const buttonContainer = document.createElement('div');
        buttonContainer.id = this.#buttonId;
        buttonContainer.className = 'gl-display-flex';

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

    #findFirstMatch(selectors) {
        for (const selector of selectors) {
            const elem = document.querySelector(selector);
            if (elem) {
                return elem;
            }
        }
        return null;
    }

    isOwnButtonClick(event) {
        if (!event || !event.target || !event.target.id) {
            return false;
        }
        return event.target.id.startsWith(this.#buttonId);
    }

    isButtonPresent() {
        return document.getElementById(this.#buttonId) !== null;
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
