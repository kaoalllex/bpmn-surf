// "Dive in" overlay on a selected Call Activity: resolves the called process
// file (via CallActivityLocator) and opens its differ in a new tab. The badge
// mirrors the handler-link badge — a small, minimalist glyph with a tooltip,
// shown only while a Call Activity is selected.
//
// On click the process file is resolved on demand (a single targeted search);
// if it cannot be located, GitLab blob-search for the process id is opened as a
// fallback so the user can find it manually.
class CallActivityNavigator {
    #overlays;
    #elementRegistry;
    #locator;
    #getSelectedElementIdFunc;
    #getCurrentRefFunc;
    #openDifferFunc;
    #openUrlFunc;
    #currentOverlayId = null;
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
            html: '<div class="dive-in-call-activity" title="Открыть вызываемую схему">&#x2935;</div>'
        });

        const overlayElem = document.querySelector(
            `.djs-overlay.djs-overlay-note[data-overlay-id="${this.#currentOverlayId}"]`
        );
        if (overlayElem) {
            overlayElem.addEventListener('click', () => this.#onDiveIn(processId));
        } else {
            console.warn('cannot find overlay element by id: ' + this.#currentOverlayId);
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
        }
    }
}
