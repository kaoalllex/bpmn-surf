// Overlay badge on a service task that links to its handler source code.
//
// "Handler" is the class implementing the service task. It can be an external
// task handler (@ExternalTaskSubscription("<topic>")) — supported now — or a
// delegate (camunda:class / delegateExpression) — a future extension.
//
// - For every task whose handler was touched in the current MR a badge is shown
//   permanently, coloured by the kind of change so it is visible at a glance
//   without selecting each task: green = added, blue = changed, red = removed
//   (matching the diagram's diff colours). An added handler's task only exists
//   in the MR version; a removed handler's task only in the target version; a
//   changed one in both — so the badge appears on whichever version shows it.
// - For any other task the badge appears on selection (like the Call Activity
//   "Dive in" overlay), in a neutral colour.
// - A click opens the handler: for a handler changed in this MR it opens the MR
//   diff of that file (so the change is visible) by navigating the originating
//   MR tab (window.opener) and switching back to it, instead of opening yet
//   another one (navigateOpenerFunc); for an unchanged handler it opens the file
//   at the currently shown diagram version (MR commit or target branch commit)
//   in a new tab.
class HandlerNavigator {
    // Tooltip per change kind; absence (selection badge) falls back to a neutral one.
    static #BADGE_TITLES = {
        added: 'Хендлер добавлен в этом MR — открыть его diff',
        changed: 'Хендлер изменён в этом MR — открыть его diff',
        removed: 'Хендлер удалён в этом MR — открыть его diff'
    };

    #overlays;
    #elementRegistry;
    #locator;
    #mrIid;
    #getSelectedElementIdFunc;
    #getCurrentRefFunc;
    #openUrlFunc;
    #navigateOpenerFunc;

    // Map "topic -> {filePath, diffType}" of handlers touched in this MR;
    // diffType is 'added' | 'changed' | 'removed'.
    #changedHandlers = new Map();
    #persistentOverlayIds = [];
    #selectionOverlayId = null;

    constructor(overlays, elementRegistry, locator, mrIid, getSelectedElementIdFunc, getCurrentRefFunc, openUrlFunc, navigateOpenerFunc) {
        this.#overlays = overlays;
        this.#elementRegistry = elementRegistry;
        this.#locator = locator;
        this.#mrIid = mrIid;
        this.#getSelectedElementIdFunc = getSelectedElementIdFunc;
        this.#getCurrentRefFunc = getCurrentRefFunc;
        this.#openUrlFunc = openUrlFunc;
        this.#navigateOpenerFunc = navigateOpenerFunc;
    }

    setChangedHandlers(changedHandlers) {
        this.#changedHandlers = changedHandlers || new Map();
    }

    // Re-adds the permanent "changed handler" badges. Must be called after each
    // diagram import, because bpmn-js drops overlays when the model is replaced.
    refreshChangedBadges() {
        this.#removePersistentOverlays();
        this.#removeSelectionOverlay();

        if (this.#changedHandlers.size === 0) {
            return;
        }
        for (const elem of this.#elementRegistry.getAll()) {
            const topic = this.#getExternalTopic(elem);
            const change = topic && this.#changedHandlers.get(topic);
            if (change) {
                this.#persistentOverlayIds.push(this.#addBadge(elem.id, topic, change.diffType));
            }
        }
    }

    // Shows the on-demand "open handler code" badge for the selected external
    // task (unless it already has a permanent badge).
    showOverlayForSelectedElement() {
        this.#removeSelectionOverlay();

        const elementId = this.#getSelectedElementIdFunc();
        const elem = this.#elementRegistry.get(elementId);
        const topic = this.#getExternalTopic(elem);
        if (!topic || this.#changedHandlers.has(topic)) {
            return;
        }
        this.#selectionOverlayId = this.#addBadge(elementId, topic, null);
    }

    #getExternalTopic(elem) {
        const bo = elem && elem.businessObject;
        if (!bo || bo.type !== 'external' || !bo.topic) {
            return null;
        }
        return bo.topic;
    }

    #addBadge(elementId, topic, diffType) {
        const cssClass = diffType ? `handler-link handler-link-${diffType}` : 'handler-link';
        const title = HandlerNavigator.#BADGE_TITLES[diffType] || 'Открыть код хендлера';

        const overlayId = this.#overlays.add(elementId, 'note', {
            position: { bottom: 0, right: 0 },
            html: `<div class="${cssClass}" title="${title}">&lt;/&gt;</div>`
        });

        const overlayElem = document.querySelector(
            `.djs-overlay.djs-overlay-note[data-overlay-id="${overlayId}"]`
        );
        if (overlayElem) {
            overlayElem.addEventListener('click', () => this.#onOpenCode(topic));
        } else {
            console.warn('cannot find handler overlay element by id: ' + overlayId);
        }
        return overlayId;
    }

    #onOpenCode(topic) {
        // A handler touched in this MR opens its MR diff: navigate the originating
        // MR tab (window.opener) so we return to the already-open MR instead of
        // spawning another tab. If that tab is gone, fall back to a new one.
        if (this.#changedHandlers.has(topic)) {
            this.#resolveTargetUrl(topic).then((url) => {
                if (url && !this.#navigateOpenerFunc(url)) {
                    this.#openUrlFunc(url);
                }
            });
            return;
        }

        // Unchanged handler: open the file at the shown version in a new tab.
        // Open it synchronously on click (to avoid the popup blocker), then
        // navigate it once the target URL is resolved.
        const newTab = this.#openUrlFunc('about:blank');
        this.#resolveTargetUrl(topic).then((url) => {
            if (!url) {
                if (newTab) {
                    newTab.close();
                }
                return;
            }
            if (newTab) {
                newTab.location.href = url;
            } else {
                this.#openUrlFunc(url);
            }
        });
    }

    async #resolveTargetUrl(topic) {
        // Touched in this MR: open the MR diff of the handler file.
        const change = this.#changedHandlers.get(topic);
        if (change) {
            return this.#locator.mrFileDiffUrl(change.filePath, this.#mrIid);
        }

        // Unchanged: open the file at the currently shown diagram version.
        const ref = this.#getCurrentRefFunc();
        if (!ref) {
            console.warn('cannot open handler code: current ref is undefined');
            return null;
        }
        const location = await this.#locator.resolveLocation(topic, ref);
        return location
            ? this.#locator.blobFileUrl(location.filePath, location.line, ref)
            : this.#locator.blobSearchPageUrl(topic, ref);
    }

    #removePersistentOverlays() {
        for (const overlayId of this.#persistentOverlayIds) {
            this.#overlays.remove(overlayId);
        }
        this.#persistentOverlayIds = [];
    }

    #removeSelectionOverlay() {
        if (this.#selectionOverlayId) {
            this.#overlays.remove(this.#selectionOverlayId);
            this.#selectionOverlayId = null;
        }
    }
}
