// "Dive in" overlay on a selected Business Rule Task: resolves the called
// decision file (via DecisionLocator) and opens its DMN differ in a new tab
// (FEAT-0005). The mirror of CallActivityNavigator for DMN: it shows the same
// minimalist dive-in badge — reusing the .dive-in-call-activity style — but on a
// bpmn:BusinessRuleTask carrying a camunda:decisionRef instead of a Call Activity.
//
// On click the decision file is resolved on demand (a single targeted search);
// if it cannot be located (not found, or a decisionRef expression `${…}` that is
// not blob-searchable), GitLab blob-search for the decision id is opened as a
// fallback so the user can find it manually.
//
// While a resolve is in flight the dive-in arrow turns into a spinner (UX-0008),
// and the badge of any other Business Rule Task selected meanwhile shows the
// spinner too — making clear the same load is still running — until it finishes.
class DecisionNavigator {
    static ARROW_HTML = '&#x2935;';
    static ARROW_TITLE = 'Open the called decision';
    static SPINNER_HTML = '<span class="differ-spinner-inline"></span>';
    static SPINNER_TITLE = 'Loading the called decision…';

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
        if (!elem || elem.type !== 'bpmn:BusinessRuleTask') {
            return;
        }
        const decisionRef = this.#getDecisionRef(elem);
        if (!decisionRef) {
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
            // (this task was selected mid-load), otherwise the arrow.
            this.#refreshBadge();
            overlayElem.addEventListener('click', () => this.#onDiveIn(decisionRef));
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
            badge.title = DecisionNavigator.SPINNER_TITLE;
            badge.innerHTML = DecisionNavigator.SPINNER_HTML;
        } else {
            badge.classList.remove('dive-in-loading');
            badge.title = DecisionNavigator.ARROW_TITLE;
            badge.innerHTML = DecisionNavigator.ARROW_HTML;
        }
    }

    #getDecisionRef(businessRuleTaskElement) {
        try {
            return businessRuleTaskElement.businessObject.decisionRef;
        } catch (error) {
            console.warn('cannot get decisionRef for business rule task element', error);
            return null;
        }
    }

    async #onDiveIn(decisionRef) {
        if (this.#isHandling) {
            return;
        }

        this.#isHandling = true;
        this.#refreshBadge();
        try {
            const ref = this.#getCurrentRefFunc();
            const decisionParams = await this.#locator.resolveDecisionFile(decisionRef, ref);
            if (decisionParams) {
                await this.#openDifferFunc(decisionParams.filePath, decisionParams.fileName);
            } else {
                console.info('called decision file not found, opening GitLab search for: ' + decisionRef);
                this.#openUrlFunc(this.#locator.blobSearchPageUrl(decisionRef, ref));
            }
        } finally {
            this.#isHandling = false;
            this.#refreshBadge();
        }
    }
}
