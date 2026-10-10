class GitLabUIRepoProvider extends UIRepoProvider {

    #buttonId = 'btn_77844bf3d4e842caa0d88194431197c0';

    // A file block of either diff UI: rapid diffs (<diff-file>, gitlab.com) or the
    // legacy Vue diffs (self-managed; gitlab.com serves it with ?rapid_diffs_disabled=true).
    static #FILE_BLOCK_SELECTOR = 'diff-file, .diff-file.file-holder[data-path]';
    // The block's own header controls (stats, Viewed, comment, ⋮). The legacy
    // diff body can hold other .file-actions, hence the :scope anchor.
    static #FILE_ACTIONS_SELECTOR = '.rd-diff-file-info, :scope > .js-file-title .file-actions';
    static #FILE_BUTTON_CLASS = 'bpmn-surf-file-btn';

    isAvailable(platformKind) {
        return platformKind === PLATFORM_KIND.GITLAB;
    }

    // The blob header's actions. Our container goes first among them, beside
    // GitLab's own button groups: inside the first group (the viewer switcher)
    // the menu caret and Blame would be glued together.
    #BRANCH_BTN_PARENT_CONTAINER_SELECTOR = '#fileHolder > div.js-file-title .file-actions';

    addButton({ fileType, filePath, onButtonClickFunc }) {
        this.reset();

        const parentContainer = document.querySelector(this.#BRANCH_BTN_PARENT_CONTAINER_SELECTOR);
        if (!parentContainer) {
            console.error('Cannot find button parent container by selector', this.#BRANCH_BTN_PARENT_CONTAINER_SELECTOR);
            return;
        }

        const container = document.createElement('div');
        container.id = this.#buttonId;
        container.className = 'gl-relative gl-flex';
        // On the container, because that is the element #buttonId identifies and
        // the one buttonFilePath() reads back.
        container.dataset.bpmnSurfFilePath = filePath;

        const button = this.#createAccentButton('btn-md', GitLabUIRepoProvider.buttonText(fileType, UI_BUTTON_TYPE.BRANCH));
        button.id = this.#buttonId + '-btn';
        button.addEventListener('click', () => {
            // A click inside our container does not count as "outside", so the
            // open menu would otherwise stay up behind the differ tab.
            this.closeMenu();
            onButtonClickFunc();
        });

        const caret = document.createElement('button');
        caret.type = 'button';
        caret.id = this.#buttonId + '-caret';
        caret.className = 'btn gl-button btn-default btn-md btn-icon bpmn-surf-btn-accent';
        caret.title = 'More bpmn-surf actions';
        caret.setAttribute('aria-label', 'More bpmn-surf actions');
        caret.setAttribute('aria-haspopup', 'menu');
        caret.setAttribute('aria-expanded', 'false');
        caret.innerHTML = GitLabUIRepoProvider.CHEVRON_SVG;

        const group = document.createElement('div');
        group.className = 'gl-button-group btn-group';
        group.setAttribute('role', 'group');
        group.append(button, caret);

        const { menu, fileInput } = this.buildLocalFileMenu(this.#buttonId, fileType, onButtonClickFunc);

        caret.addEventListener('click', () => this.toggleMenu(container, caret, menu));

        container.append(group, menu, fileInput);
        parentContainer.prepend(container);
    }

    reset() {
        this.closeMenu();
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

        const button = this.#createAccentButton('btn-sm', GitLabUIRepoProvider.buttonText(fileType, UI_BUTTON_TYPE.DIFF));
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
        button.innerHTML = GitLabUIRepoProvider.ICON_SVG;
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
}
