// Overlay badge on a service task that links to its handler source code.
//
// "Handler" is the class implementing the service task. It can be an external
// task handler (@ExternalTaskSubscription("<topic>")) or a classic delegate
// (camunda:class / camunda:delegateExpression). Each task is mapped to a
// namespaced handler key (topic:<topic> or class:<Name>); see
// HandlerLocator for how keys are built and resolved.
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
// - Execution / task listeners (FEAT-0019) are handlers too, and an element can
//   carry several besides its own implementation: they get a row of "ℓ</>"
//   badges off the element's bottom-left corner (the implementation badge sits
//   off the bottom-right one), one per distinct handler key. The row is
//   permanent when any of them is touched in this MR (each badge coloured by its
//   own change), otherwise it appears on selection. A flow carries its row at
//   its middle. A pool shows its process's listeners; a process without a pool
//   has no shape, so its top-level start events carry them.
class HandlerNavigator {
    #overlays;
    #elementRegistry;
    #locator;
    #mrIid;
    #getSelectedElementIdFunc;
    #getCurrentRefFunc;
    #openUrlFunc;
    #navigateOpenerFunc;
    #getDialectFunc;
    #changeTerm;

    // Map "key -> {filePath, diffType}" of handlers touched in this MR
    // (key = topic:<topic> or class:<Name>); diffType is
    // 'added' | 'changed' | 'removed'.
    #changedHandlers = new Map();
    #persistentOverlayIds = [];
    #selectionOverlayIds = [];

    constructor(overlays, elementRegistry, locator, mrIid, getSelectedElementIdFunc, getCurrentRefFunc, openUrlFunc, navigateOpenerFunc,
        getDialectFunc = () => CAMUNDA_DIALECT.C7, changeTerm = 'MR') {
        this.#overlays = overlays;
        this.#elementRegistry = elementRegistry;
        this.#locator = locator;
        this.#mrIid = mrIid;
        this.#getSelectedElementIdFunc = getSelectedElementIdFunc;
        this.#getCurrentRefFunc = getCurrentRefFunc;
        this.#openUrlFunc = openUrlFunc;
        this.#navigateOpenerFunc = navigateOpenerFunc;
        this.#getDialectFunc = getDialectFunc;
        this.#changeTerm = changeTerm;
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
            const key = this.#getHandlerKey(elem);
            const change = key && this.#changedHandlers.get(key);
            if (change) {
                this.#persistentOverlayIds.push(this.#addBadge(elem.id, key, change.diffType));
            }
            const listeners = this.#getListeners(elem);
            if (listeners.some(listener => this.#changedHandlers.has(listener.key))) {
                this.#persistentOverlayIds.push(this.#addListenerBadges(elem, listeners));
            }
        }
    }

    // Shows the on-demand "open handler code" badges for the selected element:
    // its implementation and its listeners, each unless already permanent.
    showOverlayForSelectedElement() {
        this.#removeSelectionOverlay();

        const elementId = this.#getSelectedElementIdFunc();
        const elem = this.#elementRegistry.get(elementId);
        const key = this.#getHandlerKey(elem);
        if (key && !this.#changedHandlers.has(key)) {
            this.#selectionOverlayIds.push(this.#addBadge(elementId, key, null));
        }
        const listeners = this.#getListeners(elem);
        if (listeners.length > 0 && !listeners.some(listener => this.#changedHandlers.has(listener.key))) {
            this.#selectionOverlayIds.push(this.#addListenerBadges(elem, listeners));
        }
    }

    // The namespaced handler key for an element, or null if it references no
    // recognised handler. Covers both service-task-like tasks (attributes on the
    // BO) and message events (attributes on a nested bpmn:MessageEventDefinition);
    // see the dialect's handlerKey (camunda-dialect.js).
    #getHandlerKey(elem) {
        // A bpmn-js external label (e.g. an event's caption) is a separate
        // registry element that shares its host's businessObject, so it would
        // otherwise yield the host's key and get a duplicate badge — refreshChangedBadges
        // iterates labels too. The selection path already normalises `_label` ids;
        // skip labels here so both badge paths agree (BUG-0016).
        if (!elem || elem.labelTarget) {
            return null;
        }
        return this.#getDialectFunc().handlerKey(elem.businessObject);
    }

    // The element's listeners grouped by handler key: [{ key, labels }], one
    // entry per badge. A root element (a process without a pool) has no shape.
    #getListeners(elem) {
        if (!elem || elem.labelTarget || !elem.parent) {
            return [];
        }
        const labelsByKey = new Map();
        const collect = (bo, prefix) => {
            for (const { key, kind, event } of this.#getDialectFunc().listenerKeys(bo)) {
                const label = `${prefix}${kind} listener` + (event ? ` (${event})` : '');
                labelsByKey.set(key, [...(labelsByKey.get(key) || []), label]);
            }
        };
        collect(elem.type === 'bpmn:Participant' ? elem.businessObject?.processRef : elem.businessObject, '');
        if (elem.type === 'bpmn:StartEvent' && elem.parent.type === 'bpmn:Process' && !elem.parent.parent) {
            collect(elem.parent.businessObject, 'process ');
        }
        return [...labelsByKey].map(([key, labels]) => ({ key, labels }));
    }

    // Off a shape's bottom-left corner; on a flow, at the middle of its middle
    // segment (a connection's corner is its start, inside the source shape).
    static #listenerRowPosition(elem) {
        const points = elem.waypoints;
        if (!points || points.length < 2) {
            return { bottom: 0, left: 0 };
        }
        const i = Math.floor((points.length - 1) / 2);
        const left = Math.min(...points.map(point => point.x));
        const top = Math.min(...points.map(point => point.y));
        return {
            left: (points[i].x + points[i + 1].x) / 2 - left,
            top: (points[i].y + points[i + 1].y) / 2 - top
        };
    }

    // DOM nodes rather than an html string: the titles quote the diagram.
    #addListenerBadges(elem, listeners) {
        const row = document.createElement('div');
        row.className = elem.waypoints ? 'listener-links listener-links-flow' : 'listener-links';
        for (const { key, labels } of listeners) {
            const diffType = this.#changedHandlers.get(key)?.diffType;
            const badge = document.createElement('div');
            badge.className = 'handler-link handler-link-listener' + (diffType ? ` handler-link-${diffType}` : '');
            badge.title = capitalizeFirstLetter(labels.join(', '))
                + (diffType ? ` ${diffType} in this ${this.#changeTerm} — open its diff` : ' — open the handler code');
            badge.textContent = 'ℓ</>';
            badge.addEventListener('click', () => this.#onOpenCode(key));
            row.appendChild(badge);
        }
        return this.#overlays.add(elem.id, 'note', {
            position: HandlerNavigator.#listenerRowPosition(elem),
            html: row
        });
    }

    #addBadge(elementId, key, diffType) {
        const cssClass = diffType ? `handler-link handler-link-${diffType}` : 'handler-link';
        const title = diffType ? `Handler ${diffType} in this ${this.#changeTerm} — open its diff` : 'Open the handler code';

        const overlayId = this.#overlays.add(elementId, 'note', {
            position: { bottom: 0, right: 0 },
            html: `<div class="${cssClass}" title="${title}">&lt;/&gt;</div>`
        });

        const overlayElem = document.querySelector(
            `.djs-overlay.djs-overlay-note[data-overlay-id="${overlayId}"]`
        );
        if (overlayElem) {
            overlayElem.addEventListener('click', () => this.#onOpenCode(key));
        } else {
            console.warn('cannot find handler overlay element by id: ' + overlayId);
        }
        return overlayId;
    }

    #onOpenCode(key) {
        // A handler touched in this MR opens its MR diff: navigate the originating
        // MR tab (window.opener) so we return to the already-open MR instead of
        // spawning another tab. If that tab is gone, fall back to a new one.
        if (this.#changedHandlers.has(key)) {
            this.#resolveTargetUrl(key).then((url) => {
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
        this.#resolveTargetUrl(key).then((url) => {
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

    async #resolveTargetUrl(key) {
        // Touched in this MR: open the MR diff of the handler file.
        const change = this.#changedHandlers.get(key);
        if (change) {
            return this.#locator.mrFileDiffUrl(change.filePath, this.#mrIid);
        }

        // Unchanged: open the file at the currently shown diagram version.
        const ref = this.#getCurrentRefFunc();
        if (!ref) {
            console.warn('cannot open handler code: current ref is undefined');
            return null;
        }
        const location = await this.#locator.resolveLocation(key, ref);
        const term = HandlerLocator.termFromKey(key);
        return location
            ? this.#locator.blobFileUrl(location.filePath, location.line, ref)
            : this.#locator.blobSearchPageUrl(term, ref);
    }

    #removePersistentOverlays() {
        for (const overlayId of this.#persistentOverlayIds) {
            this.#overlays.remove(overlayId);
        }
        this.#persistentOverlayIds = [];
    }

    #removeSelectionOverlay() {
        for (const overlayId of this.#selectionOverlayIds) {
            this.#overlays.remove(overlayId);
        }
        this.#selectionOverlayIds = [];
    }
}
