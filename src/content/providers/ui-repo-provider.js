const UI_BUTTON_TYPE = {
    DIFF: 'diff',
    BRANCH: 'branch',
};

class UIRepoProvider {
    /**
     * Checks if this UI provider handles the current page's platform. Mirror of
     * RepoProvider.isAvailable: the detected platform kind is passed in (computed
     * once by createUIRepoProvider via detectPlatformKind) and the provider
     * compares it to its own kind.
     * @param {string} platformKind the page's detected PLATFORM_KIND
     * @returns {boolean}
     */
    isAvailable(platformKind) {
        throw new Error('isAvailable() must be implemented');
    }

    /**
     * Adds the branch (blob) view button: open the diagram, or diff it against a
     * local file. The change view uses syncFileButtons() instead.
     * @param {Object} options button parameters
     * @param {FileType} options.fileType file type (bpmn or dmn)
     * @param {string} options.filePath the file the button was built for
     * @param {Function} options.onButtonClickFunc click handler; receives extParams
     *     ({ localFileContent, sourceLabel }) when a local file was picked
     */
    addButton({ fileType, filePath, onButtonClickFunc }) {
        throw new Error('addButton() must be implemented');
    }

    /**
     * Removes previously inserted buttons/containers.
     */
    reset() {
        throw new Error('reset() must be implemented');
    }

    /**
     * Checks whether the click belongs to the plugin's buttons.
     * @param {Event} event click event
     * @returns {boolean}
     */
    isOwnButtonClick(event) {
        throw new Error('isOwnButtonClick() must be implemented');
    }

    /**
     * Checks whether the plugin's button is currently present in the page.
     * @returns {boolean}
     */
    isButtonPresent() {
        throw new Error('isButtonPresent() must be implemented');
    }

    /**
     * The file path the currently shown button was built for, or null when there
     * is no button. Lets the caller tell "the button is there" from "the button
     * is there for the file now on screen".
     * @returns {string|null}
     */
    buttonFilePath() {
        throw new Error('buttonFilePath() must be implemented');
    }

    /**
     * Keeps one diff button on every diagram file the change view shows,
     * attached to that file's own block. Safe to call on every DOM change:
     * blocks that already carry the right button are left untouched.
     * @param {Function} describeFile (filePath) => ({ fileType, onButtonClickFunc }) for
     *     a file that gets a button, or null for one that does not
     */
    syncFileButtons(describeFile) {
        throw new Error('syncFileButtons() must be implemented');
    }

    /**
     * Removes every per-file button (e.g. before rebuilding them for other refs).
     */
    removeFileButtons() {
        throw new Error('removeFileButtons() must be implemented');
    }

    // icons/icon-small.svg, inlined: an <img> of the packaged file would need a
    // web_accessible_resources entry just for this.
    static ICON_SVG =
        '<svg width="16" height="16" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="1024" height="1024" rx="229" ry="229" fill="#0E2438"/>' +
        '<path d="M408,452 Q515,576 620,584" fill="none" stroke="#4A9CEC" stroke-width="96" stroke-linecap="round"/>' +
        '<rect x="226" y="266" width="208" height="208" rx="58" fill="#0E2438" stroke="#4A9CEC" stroke-width="96"/>' +
        '<rect x="590" y="556" width="208" height="208" rx="58" fill="#0E2438" stroke="#4A9CEC" stroke-width="96"/>' +
        '</svg>';

    static CHEVRON_SVG =
        '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';

    // The open menu's document listeners, so closing (or reset) can take them off.
    #openMenu = null;

    static buttonText(fileType, buttonType) {
        if (buttonType === UI_BUTTON_TYPE.DIFF) {
            return fileType === FILE_TYPE_BPMN ? 'Schema diff' : 'Decision diff';
        }
        if (buttonType === UI_BUTTON_TYPE.BRANCH) {
            return fileType === FILE_TYPE_BPMN ? 'View schema' : 'View decision';
        }
        throw new Error(`Unexpected buttonType: ${buttonType}`);
    }

    buildLocalFileMenu(idPrefix, fileType, onButtonClickFunc) {
        const fileInput = document.createElement('input');
        fileInput.id = idPrefix + '-input';
        fileInput.type = 'file';
        fileInput.accept = fileType.extension;
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (event) => this.readLocalFile(event, onButtonClickFunc));

        const menu = document.createElement('div');
        menu.id = idPrefix + '-menu';
        menu.className = 'bpmn-surf-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        const localItem = document.createElement('button');
        localItem.type = 'button';
        localItem.id = idPrefix + '-local';
        localItem.className = 'bpmn-surf-menu-item';
        localItem.setAttribute('role', 'menuitem');
        localItem.textContent = 'Diff with local file…';
        localItem.addEventListener('click', () => {
            this.closeMenu();
            fileInput.click();
        });
        menu.appendChild(localItem);
        return { menu, fileInput };
    }

    toggleMenu(container, caret, menu) {
        if (menu.hidden) {
            this.#openMenuOf(container, caret, menu);
        } else {
            this.closeMenu();
        }
    }

    #openMenuOf(container, caret, menu) {
        const onMouseDown = (event) => {
            if (!container.contains(event.target)) {
                this.closeMenu();
            }
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                this.closeMenu();
            }
        };
        document.addEventListener('mousedown', onMouseDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        this.#openMenu = { caret, menu, onMouseDown, onKeyDown };
        menu.hidden = false;
        caret.setAttribute('aria-expanded', 'true');
    }

    closeMenu() {
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

    readLocalFile(event, onButtonClickFunc) {
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
