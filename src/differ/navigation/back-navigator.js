// "Dive out" navigation for the differ page (FEAT-0023): a split control in the
// toolbar that moves UP the call hierarchy — to a diagram that calls this one.
// It is the mirror of the dive-in arrow (⤵, CallActivityNavigator): dive in goes
// down into a called diagram, dive out goes up to a calling one. Going up lands
// on "where we came from" only when we got here by diving in — that is a
// coincidence, not the definition: dive out is always "up the hierarchy".
//
// Two parts:
//   • the ⤴ button — dive out one level. When we got here by diving in, the
//     calling diagram's tab is still open above us, so this jumps straight to it
//     (the injected onDiveOutToOpener focuses that tab — instant, state-preserved).
//     Otherwise (opened directly, or reached by stepping up) it opens the menu,
//     since the caller must be searched for.
//   • the ▾ caret — opens a menu of ALL diagrams that call this one (resolved
//     lazily via CallerLocator, a reverse blob-search), so the user can step up
//     to any of them, even one not opened yet. The caller we dived in from is
//     marked and listed first; selecting it reuses its open tab.
//
// The menu distinguishes three outcomes: a spinner while resolving, "no diagram
// calls this one" for a top-level diagram (an empty result), and "couldn't check
// the callers" for a failed search (CallerLocator throws), which offers a
// GitLab-search link.
//
// createElement() returns null when there is nothing to offer (no diagram we
// dived in from AND no CallerLocator — e.g. a DMN page, which has no caller
// picker yet; see FEAT-0023 for the deferred DMN direction).
class BackNavigator {
    static DIVE_OUT_ICON = '⤴'; // ⤴ — mirror of the dive-in ⤵ (CallActivityNavigator)
    static CARET_ICON = '▾'; // ▾
    static DIVE_OUT_TITLE = 'Dive out to a calling diagram';
    static CALLERS_TITLE = 'Diagrams that call this one';
    static CAME_FROM_MARK = '↩'; // ↩

    #callerLocator;
    #divedInFrom;
    #getProcessIdsFunc;
    #getCurrentRefFunc;
    #currentFilePath;
    #onDiveOutToOpener;
    #onOpenCaller;
    #onOpenUrl;

    #group = null;
    #menu = null;
    #isMenuOpen = false;
    #onDocClick = null;

    // deps: { callerLocator, divedInFrom, getProcessIdsFunc, getCurrentRefFunc,
    //         currentFilePath, onDiveOutToOpener, onOpenCaller, onOpenUrl }
    constructor(deps) {
        this.#callerLocator = deps.callerLocator || null;
        this.#divedInFrom = deps.divedInFrom || null;
        this.#getProcessIdsFunc = deps.getProcessIdsFunc;
        this.#getCurrentRefFunc = deps.getCurrentRefFunc;
        this.#currentFilePath = deps.currentFilePath;
        this.#onDiveOutToOpener = deps.onDiveOutToOpener;
        this.#onOpenCaller = deps.onOpenCaller;
        this.#onOpenUrl = deps.onOpenUrl;
    }

    // Builds the toolbar group, or returns null when there is nothing to offer
    // (nothing we dived in from and no locator to find callers).
    createElement() {
        if (!this.#divedInFrom && !this.#callerLocator) {
            return null;
        }

        const group = document.createElement('div');
        group.className = 'differ-btn-group differ-back-group';

        group.appendChild(this.#createDiveOutButton());

        if (this.#callerLocator) {
            group.appendChild(this.#createCaretButton());
            this.#menu = document.createElement('div');
            this.#menu.className = 'differ-back-menu';
            this.#menu.hidden = true;
            group.appendChild(this.#menu);
        }

        this.#group = group;
        return group;
    }

    #createDiveOutButton() {
        const button = document.createElement('button');
        button.className = BpmnDifferView.BTN_CLASS + ' differ-btn differ-icon-btn';
        button.textContent = BackNavigator.DIVE_OUT_ICON;
        button.title = this.#divedInFrom
            ? `${BackNavigator.DIVE_OUT_TITLE} (${this.#divedInFrom.fileName})`
            : BackNavigator.DIVE_OUT_TITLE;
        button.addEventListener('click', () => {
            // Fast path: we dived in, so the caller is open above us — go there.
            // Otherwise the caller is unknown until searched — open the menu.
            if (this.#divedInFrom) {
                this.#onDiveOutToOpener();
            } else if (this.#callerLocator) {
                this.#toggleMenu();
            }
        });
        return button;
    }

    #createCaretButton() {
        const caret = document.createElement('button');
        caret.className = BpmnDifferView.BTN_CLASS + ' differ-btn differ-icon-btn differ-back-caret';
        caret.textContent = BackNavigator.CARET_ICON;
        caret.title = BackNavigator.CALLERS_TITLE;
        caret.addEventListener('click', () => this.#toggleMenu());
        return caret;
    }

    #toggleMenu() {
        if (this.#isMenuOpen) {
            this.#closeMenu();
        } else {
            this.#openMenu();
        }
    }

    #closeMenu() {
        this.#isMenuOpen = false;
        if (this.#menu) {
            this.#menu.hidden = true;
        }
        if (this.#onDocClick) {
            document.removeEventListener('click', this.#onDocClick, true);
            this.#onDocClick = null;
        }
    }

    // Opens the menu and (re)resolves the callers for the currently shown ref.
    // Returns the resolve promise so callers (tests) can await the render.
    #openMenu() {
        this.#isMenuOpen = true;
        this.#menu.hidden = false;
        this.#renderLoading();

        // Close when clicking anywhere outside the group.
        this.#onDocClick = (event) => {
            if (this.#group && !this.#group.contains(event.target)) {
                this.#closeMenu();
            }
        };
        document.addEventListener('click', this.#onDocClick, true);

        const ref = this.#getCurrentRefFunc();
        const processIds = this.#getProcessIdsFunc() || [];
        return this.#callerLocator.resolveCallers(processIds, ref, this.#currentFilePath)
            .then((callers) => this.#renderCallers(callers))
            .catch((error) => {
                console.warn('cannot resolve calling diagrams', error);
                this.#renderError(processIds, ref);
            });
    }

    #renderLoading() {
        this.#menu.replaceChildren(
            this.#messageRow(`<span class="differ-spinner-inline"></span> Searching for callers…`, true)
        );
    }

    #renderCallers(callers) {
        if (!this.#isMenuOpen) {
            return; // menu was closed before the search returned
        }
        if (!callers || callers.length === 0) {
            this.#menu.replaceChildren(this.#messageRow('No diagram calls this one'));
            return;
        }

        // Put the diagram we dived in from first and mark it, so "where I was" is
        // obvious among potentially many callers.
        const ordered = this.#orderCallers(callers);
        const rows = ordered.map((caller) => this.#callerRow(caller));
        this.#menu.replaceChildren(...rows);
    }

    #orderCallers(callers) {
        if (!this.#divedInFrom) {
            return callers;
        }
        const cameFrom = callers.filter((c) => c.filePath === this.#divedInFrom.filePath);
        const rest = callers.filter((c) => c.filePath !== this.#divedInFrom.filePath);
        return [...cameFrom, ...rest];
    }

    #callerRow(caller) {
        const row = document.createElement('button');
        row.className = 'differ-back-menu-item';
        row.title = caller.filePath;

        const isCameFrom = this.#divedInFrom && caller.filePath === this.#divedInFrom.filePath;
        const name = document.createElement('span');
        name.className = 'differ-back-menu-name';
        name.textContent = caller.fileName;
        row.appendChild(name);
        if (isCameFrom) {
            row.classList.add('differ-back-menu-item-came-from');
            const mark = document.createElement('span');
            mark.className = 'differ-back-menu-mark';
            mark.textContent = `${BackNavigator.CAME_FROM_MARK} came from here`;
            row.appendChild(mark);
        }

        row.addEventListener('click', () => {
            this.#closeMenu();
            // The diagram we dived in from is already open above us — reuse its
            // tab (instant, state-preserved) instead of opening a fresh one.
            if (isCameFrom) {
                this.#onDiveOutToOpener();
            } else {
                this.#onOpenCaller(caller.filePath, caller.fileName);
            }
        });
        return row;
    }

    #renderError(processIds, ref) {
        if (!this.#isMenuOpen) {
            return;
        }
        const row = this.#messageRow("Couldn't check the calling diagrams.");
        const id = (processIds && processIds[0]) || '';
        if (id) {
            const link = document.createElement('a');
            link.className = 'differ-back-menu-link';
            link.textContent = 'Search in GitLab';
            link.href = '#';
            link.addEventListener('click', (event) => {
                event.preventDefault();
                this.#closeMenu();
                this.#onOpenUrl(this.#callerLocator.blobSearchPageUrl(id, ref));
            });
            row.appendChild(link);
        }
        this.#menu.replaceChildren(row);
    }

    #messageRow(html, isHtml = false) {
        const row = document.createElement('div');
        row.className = 'differ-back-menu-message';
        if (isHtml) {
            row.innerHTML = html;
        } else {
            row.textContent = html;
        }
        return row;
    }
}
