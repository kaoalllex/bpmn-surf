// "Dive in" overlay on a selected Call Activity:
// finds the called process file and opens its differ in a new tab
class CallActivityNavigator {
    #overlays;
    #elementRegistry;
    #processFileIndex;
    #getSelectedElementIdFunc;
    #openDifferFunc;
    #currentOverlayId = null;
    #isDiveInHandling = false;

    constructor(overlays, elementRegistry, processFileIndex, getSelectedElementIdFunc, openDifferFunc) {
        this.#overlays = overlays;
        this.#elementRegistry = elementRegistry;
        this.#processFileIndex = processFileIndex;
        this.#getSelectedElementIdFunc = getSelectedElementIdFunc;
        this.#openDifferFunc = openDifferFunc;
    }

    async showDiveInOverlay() {
        if (this.#currentOverlayId) {
            this.#overlays.remove(this.#currentOverlayId);
            this.#currentOverlayId = null;
        }

        const selectedElementId = this.#getSelectedElementIdFunc();
        const elem = this.#elementRegistry.get(selectedElementId);
        if (elem.type !== 'bpmn:CallActivity') {
            return;
        }
        const processId = this.#getCallActivityProcessId(elem);
        if (!processId) {
            return;
        }

        // Try to restore index
        if (!this.#processFileIndex.hasIndex()) {
            await this.#processFileIndex.restoreFromLocalStorage();
        }

        let divLabel = 'Dive in';
        let divClass = 'dive-in-call-activity';
        if (!this.#processFileIndex.hasIndex()) {
            if (this.#isDiveInHandling) {
                divLabel = 'Loading process...';
                divClass = 'dive-in-call-activity-waiting';
            } else {
                divLabel = 'Load process';
            }
        }

        this.#currentOverlayId = this.#overlays.add(selectedElementId, 'note', {
            position: {
                bottom: 0,
                right: 0
            },
            html: '<div class="' + divClass + '">' + divLabel + '</div>'
        });

        if (!this.#isDiveInHandling) {
            const overlayElem = document.querySelector(
                `.djs-overlay.djs-overlay-note[data-overlay-id="${this.#currentOverlayId}"]`
            );
            if (overlayElem) {
                overlayElem.addEventListener('click', (event) => this.#onDiveInProcessEvent(processId));
            } else {
                console.warn('cannot find overlay element by id: ' + this.#currentOverlayId);
            }
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

    async #onDiveInProcessEvent(processId) {
        if (this.#isDiveInHandling) {
            return;
        }

        const dataWillBeLoaded = !this.#processFileIndex.hasIndex();

        this.#isDiveInHandling = true;
        try {
            if (dataWillBeLoaded) {
                // For refresh overlay label
                await this.showDiveInOverlay();
            }
            const processParams = await this.#processFileIndex.findProcessFileParams(processId);
            if (!processParams) {
                console.debug('process params loading failed');
                return;
            }
            if (!dataWillBeLoaded) {
                await this.#openDifferFunc(processParams.filePath, processParams.fileName);
            }
        } finally {
            this.#isDiveInHandling = false;
            if (dataWillBeLoaded) {
                // For refresh overlay label
                await this.showDiveInOverlay();
            }
        }
    }
}
