// Floating search panel for the BPMN differ page (FEAT-0006 + BUG-0007).
//
// Opens on Ctrl/Cmd+F — matched by KeyboardEvent.code ('KeyF'), which is
// layout-independent, so it works on a Russian keyboard layout too where the
// built-in bpmn-js search broke (BUG-0007). preventDefault on that keydown also
// suppresses Chrome's own find bar, so the differ tab always uses this search.
//
// Searches via ElementSearcher (name / id / parameters), highlights every match
// on the canvas, and centers + selects the current match (selection drives the
// existing properties panel, so a found sequence flow shows its condition).
class SearchPanel {
    static MATCH_MARKER = 'search-match';
    static CURRENT_MARKER = 'search-match-current';

    #canvas;
    #elementRegistry;
    #selection;
    #searcher;

    #panel = null;
    #input = null;
    #counter = null;
    #isOpen = false;
    #isAttached = false;

    #matchIds = [];
    #currentIndex = -1;

    constructor(canvas, elementRegistry, selection, searcher) {
        this.#canvas = canvas;
        this.#elementRegistry = elementRegistry;
        this.#selection = selection;
        this.#searcher = searcher;
    }

    // Builds the panel DOM (initially hidden) and installs the global Ctrl+F hook.
    // Idempotent: a second call is a no-op so the keydown listener is never doubled.
    attach() {
        if (this.#isAttached) {
            return;
        }
        this.#isAttached = true;
        this.#buildPanel();
        document.addEventListener('keydown', (event) => this.#onGlobalKeyDown(event), true);
    }

    // Re-indexes the freshly imported diagram and refreshes results if the panel
    // is open (the elementRegistry is recreated on every version switch).
    rebuildIndex() {
        // importXML recreated the canvas, so any prior match markers are gone
        // with the old DOM; drop the stale ids before indexing the new version.
        this.#matchIds = [];
        this.#currentIndex = -1;
        this.#searcher.buildIndex(this.#elementRegistry);
        if (this.#isOpen) {
            this.#runSearch();
        }
    }

    open() {
        this.#isOpen = true;
        this.#panel.style.display = 'flex';
        this.#input.focus();
        this.#input.select();
        if (this.#input.value) {
            this.#runSearch();
        }
    }

    close() {
        this.#isOpen = false;
        this.#panel.style.display = 'none';
        this.#clearMarkers();
        this.#matchIds = [];
        this.#currentIndex = -1;
    }

    #onGlobalKeyDown(event) {
        if ((event.ctrlKey || event.metaKey) && event.code === 'KeyF') {
            event.preventDefault();
            event.stopPropagation();
            this.open();
            return;
        }
        if (this.#isOpen && event.key === 'Escape') {
            event.preventDefault();
            this.close();
        }
    }

    #buildPanel() {
        const panel = document.createElement('div');
        panel.className = 'search-panel';
        panel.style.display = 'none';

        const icon = document.createElement('span');
        icon.textContent = '🔍';
        panel.appendChild(icon);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'search-panel-input';
        input.placeholder = 'Search element or parameter';
        input.addEventListener('input', () => this.#runSearch());
        input.addEventListener('keydown', (event) => this.#onInputKeyDown(event));
        panel.appendChild(input);
        this.#input = input;

        const counter = document.createElement('span');
        counter.className = 'search-panel-counter';
        panel.appendChild(counter);
        this.#counter = counter;

        panel.appendChild(this.#createButton('◀', 'Previous (Shift+Enter)', () => this.#goTo(-1)));
        panel.appendChild(this.#createButton('▶', 'Next (Enter)', () => this.#goTo(1)));
        panel.appendChild(this.#createButton('✕', 'Close (Esc)', () => this.close()));

        document.body.appendChild(panel);
        this.#panel = panel;
    }

    #createButton(text, title, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-panel-button';
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', onClick);
        return button;
    }

    #onInputKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.#goTo(event.shiftKey ? -1 : 1);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
        }
    }

    // Live search on every keystroke: only highlights all matches and updates
    // the counter. It deliberately does NOT center or pick a "current" match, so
    // the viewport stays still while typing (centering happens on Enter instead).
    #runSearch() {
        this.#clearMarkers();
        this.#matchIds = this.#searcher.search(this.#input.value);
        this.#currentIndex = -1; // navigation not started yet — no current match

        for (const id of this.#matchIds) {
            this.#addMarker(id, SearchPanel.MATCH_MARKER);
        }
        this.#updateCounter();
    }

    // Explicit navigation (Enter / Shift+Enter / ◀ ▶): steps to the next/previous
    // match and centers the view on it. The first step lands on the first match
    // (or the last, when stepping backwards) since typing leaves no current match.
    #goTo(delta) {
        if (this.#matchIds.length === 0) {
            return;
        }
        const count = this.#matchIds.length;
        if (this.#currentIndex === -1) {
            this.#currentIndex = delta < 0 ? count - 1 : 0;
        } else {
            // Drop the "current" emphasis from the previously focused match.
            this.#removeMarker(this.#matchIds[this.#currentIndex], SearchPanel.CURRENT_MARKER);
            this.#currentIndex = (this.#currentIndex + delta + count) % count;
        }
        this.#focusCurrent();
        this.#updateCounter();
    }

    #focusCurrent() {
        if (this.#currentIndex < 0) {
            return;
        }
        const id = this.#matchIds[this.#currentIndex];
        const elem = this.#elementRegistry.get(id);
        if (!elem) {
            return;
        }
        this.#addMarker(id, SearchPanel.CURRENT_MARKER);
        this.#centerOnElement(elem);
        try {
            this.#selection.select(elem);
        } catch (error) {
            // Some elements (e.g. the root) cannot be selected.
        }
    }

    // Centers the viewport on the element, keeping the current zoom. Unlike
    // canvas.scrollToElement (which only scrolls when the element is off-screen),
    // this always recenters — so stepping through matches with Enter visibly
    // moves to each one even when they are already in view.
    #centerOnElement(elem) {
        const mid = SearchPanel.#elementMidpoint(elem);
        if (!mid) {
            try {
                this.#canvas.scrollToElement(elem);
            } catch (error) {
                // Older canvas without scrollToElement, or element without bounds.
            }
            return;
        }
        try {
            const viewbox = this.#canvas.viewbox();
            this.#canvas.viewbox({
                x: mid.x - viewbox.width / 2,
                y: mid.y - viewbox.height / 2,
                width: viewbox.width,
                height: viewbox.height
            });
        } catch (error) {
            // Defensive: leave the viewport as-is if the canvas rejects it.
        }
    }

    // Geometric center of an element: from x/y/width/height for shapes,
    // or from the waypoints' bounding box for connections (which lack bounds).
    static #elementMidpoint(elem) {
        if (typeof elem.x === 'number' && typeof elem.y === 'number'
            && typeof elem.width === 'number' && typeof elem.height === 'number') {
            return { x: elem.x + elem.width / 2, y: elem.y + elem.height / 2 };
        }
        if (Array.isArray(elem.waypoints) && elem.waypoints.length > 0) {
            const xs = elem.waypoints.map(point => point.x);
            const ys = elem.waypoints.map(point => point.y);
            return {
                x: (Math.min(...xs) + Math.max(...xs)) / 2,
                y: (Math.min(...ys) + Math.max(...ys)) / 2
            };
        }
        return null;
    }

    #updateCounter() {
        const count = this.#matchIds.length;
        if (!this.#input.value.trim()) {
            this.#counter.textContent = '';
        } else if (count === 0) {
            this.#counter.textContent = '0';
        } else if (this.#currentIndex === -1) {
            // Matches found but navigation not started — show only the total.
            this.#counter.textContent = String(count);
        } else {
            this.#counter.textContent = `${this.#currentIndex + 1}/${count}`;
        }
    }

    #clearMarkers() {
        for (const id of this.#matchIds) {
            this.#removeMarker(id, SearchPanel.MATCH_MARKER);
            this.#removeMarker(id, SearchPanel.CURRENT_MARKER);
        }
    }

    #addMarker(id, marker) {
        const elem = this.#elementRegistry.get(id);
        if (!elem) {
            return;
        }
        try {
            this.#canvas.addMarker(elem, marker);
        } catch (error) {
            // Some elements have no id and addMarker throws — ignore.
        }
    }

    #removeMarker(id, marker) {
        const elem = this.#elementRegistry.get(id);
        if (!elem) {
            return;
        }
        try {
            this.#canvas.removeMarker(elem, marker);
        } catch (error) {
            // Ignore — see #addMarker.
        }
    }
}
