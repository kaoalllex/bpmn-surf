// "Dive in" overlay on a selected Call Activity: resolves the called process
// file (via CallActivityLocator) and opens its differ in a new tab. The badge
// mirrors the handler-link badge — a small, minimalist glyph with a tooltip,
// shown only while a Call Activity is selected.
//
// On click the process file is resolved on demand (a single targeted search);
// if it cannot be located, GitLab blob-search for the process id is opened as a
// fallback so the user can find it manually.
//
// Resolving can take seconds to tens of seconds (the fallback walks the whole
// repository tree), so the badge gives feedback (UX-0008): while a resolve is
// in flight the dive-in arrow turns into a spinner, and the badge of any other
// Call Activity selected meanwhile shows the spinner too — making clear the
// same load is still running — until it finishes and the arrow returns.
class CallActivityNavigator {
    static ARROW_HTML = '&#x2935;';
    static ARROW_TITLE = 'Открыть вызываемую схему';
    static SPINNER_HTML = '<span class="differ-spinner-inline"></span>';
    static SPINNER_TITLE = 'Загрузка вызываемой схемы…';

    #overlays;
    #elementRegistry;
    #locator;
    #getSelectedElementIdFunc;
    #getCurrentRefFunc;
    #openDifferFunc;
    #openUrlFunc;
    #currentOverlayId = null;
    #currentOverlayElem = null;
    #isHandling = false;

    constructor(overlays, elementRegistry, locator, getSelectedElementIdFunc, getCurrentRefFunc, openDifferFunc, openUrlFunc) {
        this.#overlays = overlays;
        this.#elementRegistry = elementRegistry;
        this.#locator = locator;
        this.#getSelectedElementIdFunc = getSelectedElementIdFunc;
        this.#getCurrentRefFunc = getCurrentRefFunc;
        this.#openDifferFunc = openDifferFunc;
        this.#openUrlFunc = openUrlFunc;
    }

    showDiveInOverlay() {
        if (this.#currentOverlayId) {
            this.#overlays.remove(this.#currentOverlayId);
            this.#currentOverlayId = null;
        }

        const selectedElementId = this.#getSelectedElementIdFunc();
        const elem = this.#elementRegistry.get(selectedElementId);
        if (!elem || elem.type !== 'bpmn:CallActivity') {
            return;
        }
        const processId = this.#getCallActivityProcessId(elem);
        if (!processId) {
            return;
        }

        this.#currentOverlayId = this.#overlays.add(selectedElementId, 'note', {
            position: {
                bottom: 0,
                right: 0
            },
            html: '<div class="dive-in-call-activity"></div>'
        });

        const overlayElem = document.querySelector(
            `.djs-overlay.djs-overlay-note[data-overlay-id="${this.#currentOverlayId}"]`
        );
        this.#currentOverlayElem = overlayElem;
        if (overlayElem) {
            // Reflect the current state: a spinner if a resolve is still running
            // (this Call Activity was selected mid-load), otherwise the arrow.
            this.#refreshBadge();
            overlayElem.addEventListener('click', () => this.#onDiveIn(processId));
        } else {
            console.warn('cannot find overlay element by id: ' + this.#currentOverlayId);
        }
    }

    // Renders the current badge as a spinner while a resolve is in flight, or as
    // the dive-in arrow otherwise.
    #refreshBadge() {
        const badge = this.#currentOverlayElem
            && this.#currentOverlayElem.querySelector('.dive-in-call-activity');
        if (!badge) {
            return;
        }
        if (this.#isHandling) {
            badge.classList.add('dive-in-loading');
            badge.title = CallActivityNavigator.SPINNER_TITLE;
            badge.innerHTML = CallActivityNavigator.SPINNER_HTML;
        } else {
            badge.classList.remove('dive-in-loading');
            badge.title = CallActivityNavigator.ARROW_TITLE;
            badge.innerHTML = CallActivityNavigator.ARROW_HTML;
        }
    }

    #getCallActivityProcessId(callActivityElement) {
        try {
            return callActivityElement.businessObject.calledElement;
        } catch (error) {
            console.warn('cannot get calledElement for call activity element', error);
            return null;
        }
    }

    async #onDiveIn(processId) {
        if (this.#isHandling) {
            return;
        }

        this.#isHandling = true;
        this.#refreshBadge();
        try {
            const ref = this.#getCurrentRefFunc();
            const processParams = await this.#locator.resolveProcessFile(processId, ref);
            if (processParams) {
                await this.#openDifferFunc(processParams.filePath, processParams.fileName);
            } else {
                console.info('called process file not found, opening GitLab search for: ' + processId);
                this.#openUrlFunc(this.#locator.blobSearchPageUrl(processId, ref));
            }
        } finally {
            this.#isHandling = false;
            this.#refreshBadge();
        }
    }
}
