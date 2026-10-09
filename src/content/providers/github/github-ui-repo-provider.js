// GitHub button injection (REFAC-0004): a diff button in every diagram file's
// header on the PR "Files changed" page (both UIs, found by GitHubDomScraper),
// and a split "View …" button with the local-file menu beside Raw on a blob
// page. Styled by content-styles.css only — no GitHub classes are borrowed, so
// a GitHub restyle cannot break them.
class GitHubUIRepoProvider extends UIRepoProvider {
    static #BRANCH_ID = 'bpmn-surf-gh-branch';
    static #FILE_BUTTON_CLASS = 'bpmn-surf-file-btn';

    #domScraper;

    constructor(domScraper = new GitHubDomScraper()) {
        super();
        this.#domScraper = domScraper;
    }

    isAvailable(platformKind) {
        return platformKind === PLATFORM_KIND.GITHUB;
    }

    syncFileButtons(describeFile) {
        for (const { path, actions, before } of this.#domScraper.fileBlocks(document)) {
            const existing = actions.querySelector(`:scope > .${GitHubUIRepoProvider.#FILE_BUTTON_CLASS}`);
            if (existing && existing.dataset.bpmnSurfFilePath === path) {
                continue;
            }
            if (existing) {
                existing.remove();
            }
            const file = describeFile(path);
            if (file) {
                // Classic: first in the actions row; new UI: just before "More options".
                const button = this.#createFileButton(path, file);
                before ? actions.insertBefore(button, before) : actions.prepend(button);
            }
        }
    }

    removeFileButtons() {
        for (const button of document.querySelectorAll('.' + GitHubUIRepoProvider.#FILE_BUTTON_CLASS)) {
            button.remove();
        }
    }

    addButton({ fileType, filePath, onButtonClickFunc }) {
        this.reset();
        const anchor = this.#domScraper.blobActionsAnchor(document);
        if (!anchor) {
            console.debug('GitHub blob header not rendered yet');
            return;
        }
        const id = GitHubUIRepoProvider.#BRANCH_ID;
        const container = document.createElement('div');
        container.id = id;
        container.className = 'bpmn-surf-gh-split';
        container.dataset.bpmnSurfFilePath = filePath;

        const button = GitHubUIRepoProvider.#accentButton(UIRepoProvider.buttonText(fileType, UI_BUTTON_TYPE.BRANCH));
        button.addEventListener('click', () => {
            this.closeMenu();
            onButtonClickFunc();
        });

        const caret = document.createElement('button');
        caret.type = 'button';
        caret.className = 'bpmn-surf-btn-accent bpmn-surf-gh-caret';
        caret.title = 'More bpmn-surf actions';
        caret.setAttribute('aria-label', 'More bpmn-surf actions');
        caret.setAttribute('aria-haspopup', 'menu');
        caret.setAttribute('aria-expanded', 'false');
        caret.innerHTML = UIRepoProvider.CHEVRON_SVG;

        const { menu, fileInput } = this.buildLocalFileMenu(id, fileType, onButtonClickFunc);
        caret.addEventListener('click', () => this.toggleMenu(container, caret, menu));

        container.append(button, caret, menu, fileInput);
        anchor.before(container);
    }

    reset() {
        this.closeMenu();
        removeElement(GitHubUIRepoProvider.#BRANCH_ID);
    }

    isOwnButtonClick(event) {
        const target = event && event.target;
        if (!target || typeof target.closest !== 'function') {
            return false;
        }
        return !!target.closest(`#${GitHubUIRepoProvider.#BRANCH_ID}, .${GitHubUIRepoProvider.#FILE_BUTTON_CLASS}`);
    }

    isButtonPresent() {
        return document.getElementById(GitHubUIRepoProvider.#BRANCH_ID) !== null;
    }

    buttonFilePath() {
        const container = document.getElementById(GitHubUIRepoProvider.#BRANCH_ID);
        return (container && container.dataset.bpmnSurfFilePath) || null;
    }

    #createFileButton(filePath, { fileType, onButtonClickFunc }) {
        const wrapper = document.createElement('span');
        // The second class scopes the GitHub-only look; GitLab's wrapper shares the first.
        wrapper.className = `${GitHubUIRepoProvider.#FILE_BUTTON_CLASS} bpmn-surf-gh-file-btn`;
        wrapper.dataset.bpmnSurfFilePath = filePath;
        const button = GitHubUIRepoProvider.#accentButton(UIRepoProvider.buttonText(fileType, UI_BUTTON_TYPE.DIFF));
        button.addEventListener('click', (event) => {
            // The file header toggles the file open/closed on a click.
            event.stopPropagation();
            onButtonClickFunc();
        });
        wrapper.appendChild(button);
        return wrapper;
    }

    static #accentButton(text) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bpmn-surf-btn-accent bpmn-surf-btn-with-icon';
        button.innerHTML = UIRepoProvider.ICON_SVG;
        const label = document.createElement('span');
        label.textContent = text;
        button.appendChild(label);
        return button;
    }
}
