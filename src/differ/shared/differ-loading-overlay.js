// Full-screen spinner shown on the differ page while the diagram is being
// loaded and rendered, hidden once the canvas is revealed (see showCanvas in
// the BPMN/DMN views). Shared by both differ views (UX-0008).
//
// It is the safety indicator for the render delay: when "diving into" a Call
// Activity the freshly opened tab is otherwise a blank white page until the
// nested diagram is fetched and imported. The long resolve that precedes that
// (process-id -> file) happens on the originating page and is covered there by
// the dive-in badge spinner in CallActivityNavigator.
class DifferLoadingOverlay {
    static OVERLAY_ID = 'differLoadingOverlay_12345bf3d4e842caa0d88194431197c0';

    #element = null;
    #messageElement = null;

    // Shows the overlay (building it on first use), with an optional message.
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
        const overlay = document.createElement('div');
        overlay.id = DifferLoadingOverlay.OVERLAY_ID;
        overlay.className = 'differ-loading-overlay';

        const spinner = document.createElement('div');
        spinner.className = 'differ-spinner';
        overlay.appendChild(spinner);

        const message = document.createElement('div');
        message.className = 'differ-loading-message';
        overlay.appendChild(message);

        document.body.appendChild(overlay);
        this.#element = overlay;
        this.#messageElement = message;
    }
}
