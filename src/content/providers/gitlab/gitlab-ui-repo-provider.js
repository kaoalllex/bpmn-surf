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

    // The blob header's actions. Our container goes first among them, beside
    // GitLab's own button groups: inside the first group (the viewer switcher)
    // the menu caret and Blame would be glued together.
    #BRANCH_BTN_PARENT_CONTAINER_SELECTOR = '#fileHolder > div.js-file-title .file-actions';

    static #CHEVRON_SVG =
        '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';

    // The open menu's document listeners, so closing (or reset) can take them off.
    #openMenu = null;

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

        const button = this.#createAccentButton('btn-md', this.#getButtonText(fileType, UI_BUTTON_TYPE.BRANCH));
        button.id = this.#buttonId + '-btn';
        button.addEventListener('click', () => onButtonClickFunc());

        const caret = document.createElement('button');
        caret.type = 'button';
        caret.id = this.#buttonId + '-caret';
        caret.className = 'btn gl-button btn-default btn-md btn-icon bpmn-surf-btn-accent';
        caret.title = 'More bpmn-surf actions';
        caret.setAttribute('aria-label', 'More bpmn-surf actions');
        caret.setAttribute('aria-haspopup', 'menu');
        caret.setAttribute('aria-expanded', 'false');
        caret.innerHTML = GitLabUIRepoProvider.#CHEVRON_SVG;

        const group = document.createElement('div');
        group.className = 'gl-button-group btn-group';
        group.setAttribute('role', 'group');
        group.append(button, caret);

        const fileInput = document.createElement('input');
        fileInput.id = this.#buttonId + '-input';
        fileInput.type = 'file';
        fileInput.accept = fileType.extension;
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (event) => this.#localFileSelected(event, onButtonClickFunc));

        const menu = document.createElement('div');
        menu.id = this.#buttonId + '-menu';
        menu.className = 'bpmn-surf-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        const localItem = document.createElement('button');
        localItem.type = 'button';
        localItem.id = this.#buttonId + '-local';
        localItem.className = 'bpmn-surf-menu-item';
        localItem.setAttribute('role', 'menuitem');
        localItem.textContent = 'Diff with local file…';
        localItem.addEventListener('click', () => {
            this.#closeMenu();
            fileInput.click();
        });
        menu.appendChild(localItem);

        caret.addEventListener('click', () => {
            if (menu.hidden) {
                this.#openMenuOf(container, caret, menu);
            } else {
                this.#closeMenu();
            }
        });

        container.append(group, menu, fileInput);
        parentContainer.prepend(container);
    }

    reset() {
        this.#closeMenu();
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

    #openMenuOf(container, caret, menu) {
        const onMouseDown = (event) => {
            if (!container.contains(event.target)) {
                this.#closeMenu();
            }
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                this.#closeMenu();
            }
        };
        document.addEventListener('mousedown', onMouseDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        this.#openMenu = { caret, menu, onMouseDown, onKeyDown };
        menu.hidden = false;
        caret.setAttribute('aria-expanded', 'true');
    }

    #closeMenu() {
        const open = this.#openMenu;
        if (!open) {
            return;
        }
        this.#openMenu = null;
        document.removeEventListener('mousedown', open.onMouseDown, true);
        document.removeEventListener('keydown', open.onKeyDown, true);
        open.menu.hidden = true;
        open.caret.setAttribute('aria-expanded', 'false');
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
