// Overlay badge on a message-catching element that jumps to where its message is
// correlated in code (FEAT-0027). Shown on selection for any element that waits
// for a message (ReceiveTask, message catch/start/boundary event); the search is
// run lazily on click, not on every selection, to avoid hammering the API.
//
// On click the badge turns into a spinner while CorrelationLocator searches, then:
//  - a single result → opens it straight away in a new tab (the dropdown is
//    skipped — there is nothing to choose), whether it is an exact correlation
//    point or the one weaker lead we found;
//  - several results → a dropdown listing them as a flat list — the correlation
//    points if any, else the weaker leads (constant declaration / config);
//  - a dynamic name → an explanatory note plus any config hits;
//  - a failed search or nothing usable → a short message. (No GitLab-search
//    fallback link — the project search URL 404s on this instance.)
//
// Test references (unit and auto-tests, any language) are segregated by the
// locator into a hidden `tests` group and never listed (a future setting may opt
// them back in); they only surface as an honest note when ALL matches were tests.
//
// The dropdown mirrors BackNavigator's menu (list + close-on-outside-click); it is
// anchored to the badge inside the overlay, so it tracks the element on pan/zoom.
class CorrelationNavigator {
    static BADGE_HTML = '&#x2709;&#x2192;'; // ✉→ — "this message wakes up code over there"
    static BADGE_TITLE = 'Find where this message is correlated in code';
    static SPINNER_HTML = '<span class="differ-spinner-inline"></span>';
    static SPINNER_TITLE = 'Searching for the correlation point…';

    #overlays;
    #elementRegistry;
    #locator;
    #getSelectedElementIdFunc;
    #getCurrentRefFunc;
    #openUrlFunc;

    #overlayId = null;
    #badgeElem = null;
    #menuElem = null;
    #message = null;
    #isSearching = false;
    #isMenuOpen = false;
    #onDocClick = null;

    constructor(overlays, elementRegistry, locator, getSelectedElementIdFunc, getCurrentRefFunc, openUrlFunc) {
        this.#overlays = overlays;
        this.#elementRegistry = elementRegistry;
        this.#locator = locator;
        this.#getSelectedElementIdFunc = getSelectedElementIdFunc;
        this.#getCurrentRefFunc = getCurrentRefFunc;
        this.#openUrlFunc = openUrlFunc;
    }

    // Shows the badge for the selected element when it waits for a message;
    // removes any previous badge first (selection moved on).
    showOverlayForSelectedElement() {
        this.#removeOverlay();

        const elementId = this.#getSelectedElementIdFunc();
        const elem = this.#elementRegistry.get(elementId);
        // A bpmn-js external label shares its host's businessObject; skip it so the
        // badge is not duplicated on the label (same guard as HandlerNavigator).
        if (!elem || elem.labelTarget) {
            return;
        }
        const message = CorrelationLocator.extractMessageName(elem.businessObject);
        if (!message) {
            return;
        }
        this.#message = message;

        this.#overlayId = this.#overlays.add(elementId, 'note', {
            position: { bottom: 0, right: 0 },
            html: '<div class="correlation-overlay">'
                + `<div class="correlation-link" title="${CorrelationNavigator.BADGE_TITLE}">`
                + `${CorrelationNavigator.BADGE_HTML}</div>`
                + '<div class="correlation-menu" hidden></div>'
                + '</div>'
        });

        const overlayElem = document.querySelector(
            `.djs-overlay.djs-overlay-note[data-overlay-id="${this.#overlayId}"]`
        );
        if (!overlayElem) {
            console.warn('cannot find correlation overlay element by id: ' + this.#overlayId);
            return;
        }
        this.#badgeElem = overlayElem.querySelector('.correlation-link');
        this.#menuElem = overlayElem.querySelector('.correlation-menu');
        this.#badgeElem.addEventListener('click', () => this.#onBadgeClick());
    }

    #onBadgeClick() {
        if (this.#isSearching) {
            return;
        }
        if (this.#isMenuOpen) {
            this.#closeMenu();
            return;
        }

        const ref = this.#getCurrentRefFunc();
        if (!ref) {
            console.warn('cannot search correlation point: current ref is undefined');
            return;
        }

        this.#isSearching = true;
        this.#refreshBadge();
        this.#locator.resolveCorrelations(this.#message.name, ref)
            .then((result) => this.#handleResult(result, ref))
            .catch((error) => {
                console.warn('cannot resolve correlation sites', error);
                this.#openMenu([this.#messageRow("Couldn't search the code.")]);
            })
            .finally(() => {
                this.#isSearching = false;
                this.#refreshBadge();
            });
    }

    #handleResult(result, ref) {
        if (result.dynamic) {
            this.#openMenu(this.#renderDynamic(result, ref));
            return;
        }

        const { correlation, other, config, tests } = result.groups;

        // What we'd show: the correlation points if any, else the weaker leads
        // (constant declaration / config), shown plainly.
        const leads = correlation.length > 0 ? correlation : [...other, ...config];

        // A single result → jump straight there, no dropdown, whether it is an
        // exact correlation point or just the one lead we found.
        if (leads.length === 1) {
            this.#openUrlFunc(this.#locator.blobFileUrl(leads[0].path, leads[0].line, ref));
            return;
        }
        if (leads.length > 1) {
            this.#openMenu(leads.map(hit => this.#hitRow(hit, ref)));
            return;
        }

        // Nothing usable — be honest when all we found were (hidden) test refs.
        const message = tests.length > 0
            ? 'Found references only in tests — hidden.'
            : 'Could not pinpoint a correlation point.';
        this.#openMenu([this.#messageRow(message)]);
    }

    // Renders the badge as a spinner while a search is in flight, or as the ✉→
    // glyph otherwise.
    #refreshBadge() {
        if (!this.#badgeElem) {
            return;
        }
        if (this.#isSearching) {
            this.#badgeElem.classList.add('correlation-link-loading');
            this.#badgeElem.title = CorrelationNavigator.SPINNER_TITLE;
            this.#badgeElem.innerHTML = CorrelationNavigator.SPINNER_HTML;
        } else {
            this.#badgeElem.classList.remove('correlation-link-loading');
            this.#badgeElem.title = CorrelationNavigator.BADGE_TITLE;
            this.#badgeElem.innerHTML = CorrelationNavigator.BADGE_HTML;
        }
    }

    #renderDynamic(result, ref) {
        const rows = [this.#messageRow(
            'This message name is built at runtime (${…}) — cannot search for a literal.')];
        for (const hit of result.groups.config) {
            rows.push(this.#hitRow(hit, ref));
        }
        return rows;
    }

    #openMenu(rows) {
        if (!this.#menuElem) {
            return;
        }
        this.#menuElem.replaceChildren(...rows);
        this.#menuElem.hidden = false;
        this.#isMenuOpen = true;

        this.#onDocClick = (event) => {
            if (this.#menuElem && !this.#menuElem.contains(event.target)
                && this.#badgeElem && !this.#badgeElem.contains(event.target)) {
                this.#closeMenu();
            }
        };
        document.addEventListener('click', this.#onDocClick, true);
    }

    #closeMenu() {
        this.#isMenuOpen = false;
        if (this.#menuElem) {
            this.#menuElem.hidden = true;
            this.#menuElem.replaceChildren();
        }
        if (this.#onDocClick) {
            document.removeEventListener('click', this.#onDocClick, true);
            this.#onDocClick = null;
        }
    }

    #hitRow(hit, ref) {
        const row = document.createElement('button');
        row.className = 'differ-back-menu-item';
        row.title = hit.path;

        const name = document.createElement('span');
        name.className = 'differ-back-menu-name';
        name.textContent = `${getFileNameFromPath(hit.path)}:${hit.line}`;
        row.appendChild(name);

        row.addEventListener('click', () => {
            this.#closeMenu();
            this.#openUrlFunc(this.#locator.blobFileUrl(hit.path, hit.line, ref));
        });
        return row;
    }

    #messageRow(text) {
        const row = document.createElement('div');
        row.className = 'differ-back-menu-message';
        row.textContent = text;
        return row;
    }

    #removeOverlay() {
        this.#closeMenu();
        if (this.#overlayId) {
            this.#overlays.remove(this.#overlayId);
            this.#overlayId = null;
        }
        this.#badgeElem = null;
        this.#menuElem = null;
        this.#message = null;
        this.#isSearching = false;
    }
}
