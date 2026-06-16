// Placeholder shown inside the canvas area when the diagram is absent: either
// in the version the user just switched to (a blank cover, the absence is
// spelled out in the branch label) or in BOTH compared versions (a centered
// message). It lives inside the canvas cell — not as a full-screen overlay like
// DifferLoadingOverlay — so the toolbar (Close, Download, Switch) stays usable.
// Shared by both differ views (UX-0003 / BUG-0001).
class DifferEmptyState {
    #container;
    #element = null;
    #messageElement = null;

    constructor(container) {
        this.#container = container;
    }

    // Shows the placeholder over the canvas, building it on first use. An empty
    // message renders a blank cover (used when switching to an absent side);
    // a non-empty message renders centered (used when both versions are absent).
    show(message) {
        if (!this.#element) {
            this.#build();
        }
        this.#messageElement.textContent = message || '';
        this.#element.style.display = 'flex';
    }

    hide() {
        if (this.#element) {
            this.#element.style.display = 'none';
        }
    }

    #build() {
        // The cover is absolutely positioned within the canvas cell.
        this.#container.style.position = 'relative';

        const element = document.createElement('div');
        element.className = 'differ-empty-state';

        const message = document.createElement('div');
        message.className = 'differ-empty-state-message';
        element.appendChild(message);

        this.#container.appendChild(element);
        this.#element = element;
        this.#messageElement = message;
    }
}
