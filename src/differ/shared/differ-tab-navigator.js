// Shared opener-tab navigation for the differ page (FEAT-0005, extracted from
// BpmnDiffer). Both the BPMN and DMN orchestrators open NESTED differs (diving
// into a called diagram/decision, stepping up to a caller) and step BACK to the
// tab that opened them. The tab-management trickery is identical for both, so it
// lives here:
//   • openNestedDiffer — open a new differ tab for a file, choosing the differ
//     kind (BPMN vs DMN) by extension, and supplying the resource-href lookup the
//     fresh tab needs (chrome.runtime.getURL is unavailable in window.open tabs).
//   • focusOpenerAndClose — bring the opener tab forward WITHOUT reloading it and
//     close this one (dive out to the tab we came from).
//   • navigateOpenerTab — navigate the opener tab to a URL and bring it forward
//     (used by the BPMN handler navigation to open a handler's MR diff there).
//
// It also runs the cross-tab registry (BUG-0017) that prevents a SECOND tab for a
// diagram already open anywhere — independent of how the user got there (the
// window.opener chain only saw ancestors; "sibling" tabs opened from different
// places were missed). Every differ tab joins a BroadcastChannel and takes a
// stable window.name derived from WHICH diagram diff it shows. Before opening a
// diagram, a tab asks the channel "who shows this one?"; only OPEN tabs answer
// (so a closed tab leaves no stale entry), and a positive answer means the tab is
// brought to the front by its stable name instead of opening a duplicate.
class DifferTabNavigator {
    // A transient window.name used to bring the opener tab to the foreground via
    // window.open(target, name): opener.focus() alone does not reliably switch
    // the active tab in Chrome. The name is set transiently and restored, so the
    // opener keeps its own window.name.
    static OPENER_TAB_TARGET = 'gl-bpmn-diff-opener-tab';

    // Cross-tab registry (BUG-0017).
    static TAB_REGISTRY_CHANNEL = 'gl-bpmn-diff-tab-registry';
    static TAB_NAME_PREFIX = 'gl-bpmn-diff-tab:';
    // How long to wait for an answer before assuming no tab shows the diagram.
    // The answer is a local channel round-trip (near-instant); the margin only
    // guards against a momentarily busy responder. It is the added latency before
    // opening a fresh tab, negligible next to the diagram's network load.
    static QUERY_TIMEOUT_MS = 150;

    #identityKey = null;
    #channel = null;
    #queryCounter = 0;
    #createChannel;
    #focusByName;
    #queryTimeoutMs;

    // deps (all optional, for tests): createChannel(name) → a BroadcastChannel-like
    // object (or null when unsupported), focusByName(name) → bool, queryTimeoutMs.
    constructor(deps = {}) {
        this.#createChannel = deps.createChannel || DifferTabNavigator.#defaultCreateChannel;
        this.#focusByName = deps.focusByName || ((name) => this.#focusTabByName(name));
        this.#queryTimeoutMs = deps.queryTimeoutMs != null
            ? deps.queryTimeoutMs : DifferTabNavigator.QUERY_TIMEOUT_MS;
    }

    static #defaultCreateChannel(name) {
        if (typeof BroadcastChannel === 'undefined') {
            return null; // unsupported context (e.g. tests): the registry no-ops
        }
        try {
            return new BroadcastChannel(name);
        } catch (error) {
            console.warn('cannot open the tab-registry channel', error);
            return null;
        }
    }

    // Registers this tab in the cross-tab registry: takes a stable window.name (so
    // any same-origin tab can focus it by name) and starts answering "who shows
    // this diagram?" queries. Called once per differ after its params are parsed.
    registerTab(identityKey) {
        this.#identityKey = identityKey;
        try {
            window.name = DifferTabNavigator.tabNameFor(identityKey);
        } catch (error) {
            console.warn('cannot set the tab name', error);
        }
        this.#channel = this.#createChannel(DifferTabNavigator.TAB_REGISTRY_CHANNEL);
        if (!this.#channel) {
            return;
        }
        this.#channel.addEventListener('message', (event) => this.#answerRegistryQuery(event));
        // Leave the registry when the tab goes away, so it stops answering at once.
        window.addEventListener('pagehide', () => {
            try { this.#channel.close(); } catch (error) { /* already gone */ }
        });
    }

    #answerRegistryQuery(event) {
        const msg = event && event.data;
        if (msg && msg.type === 'who-has' && msg.key === this.#identityKey) {
            this.#channel.postMessage({ type: 'i-have', queryId: msg.queryId });
        }
    }

    // Resolves true (after bringing it to the front) when another OPEN tab already
    // shows the diagram identified by identityKey; false otherwise, so the caller
    // opens a fresh tab. The query reaches every tab over the channel — a closed
    // tab cannot answer, so it is never matched — and a tab never answers its own
    // query (BroadcastChannel does not echo to the sender).
    async focusExistingDifferTab(identityKey) {
        if (!this.#channel) {
            return false;
        }
        const found = await this.#queryTabExists(identityKey);
        if (!found) {
            return false;
        }
        return this.#focusByName(DifferTabNavigator.tabNameFor(identityKey));
    }

    #queryTabExists(identityKey) {
        return new Promise((resolve) => {
            // Per-asker-unique id: prefixed with this tab's own identity so two tabs
            // querying at once cannot mistake each other's answers.
            const queryId = `${this.#identityKey}#${++this.#queryCounter}`;
            let settled = false;
            const onAnswer = (event) => {
                const msg = event && event.data;
                if (msg && msg.type === 'i-have' && msg.queryId === queryId) {
                    finish(true);
                }
            };
            const finish = (result) => {
                if (settled) {
                    return;
                }
                settled = true;
                this.#channel.removeEventListener('message', onAnswer);
                resolve(result);
            };
            this.#channel.addEventListener('message', onAnswer);
            this.#channel.postMessage({ type: 'who-has', key: identityKey, queryId });
            setTimeout(() => finish(false), this.#queryTimeoutMs);
        });
    }

    static tabNameFor(identityKey) {
        return DifferTabNavigator.TAB_NAME_PREFIX + identityKey;
    }

    // Brings an existing same-origin tab with the given window.name to the front
    // without reloading it: window.open('', name) reuses that browsing context and
    // focuses it. Only called after the registry confirmed the tab is open, so the
    // empty-URL open lands on the existing tab rather than creating a blank one.
    #focusTabByName(name) {
        try {
            window.open('', name);
            return true;
        } catch (error) {
            console.warn('cannot focus tab by name', error);
            return false;
        }
    }

    // Opens a nested differ tab for the given file, choosing the differ kind
    // (BPMN vs DMN) by the file extension. The differ scripts for BOTH kinds load
    // in every differ tab, so either message id is understood.
    async openNestedDiffer(params, fileName) {
        const msgId = DifferTabNavigator.#differMsgIdForFile(fileName);
        await openDiffer(
            params,
            null,
            msgId,
            // Find the resource href in this document's head, because
            // chrome.runtime.getURL does not work in this freshly opened tab.
            (resourceName) => this.#getLinkOrScriptHref(resourceName)
        );
    }

    static #differMsgIdForFile(fileName) {
        return /\.dmn$/i.test(fileName || '') ? DmnDiffer.MSG_ID : BpmnDiffer.MSG_ID;
    }

    // Brings the opener tab (the calling differ) to the front WITHOUT navigating
    // it — opening an existing named target with an empty URL focuses it but does
    // not reload it, so the caller keeps its state — then closes this tab.
    // Returns false when there is no usable opener (then the caller reopens instead).
    focusOpenerAndClose() {
        const opener = window.opener;
        if (!opener || opener.closed) {
            return false;
        }
        if (!this.#focusTab(opener)) {
            return false;
        }
        window.close();
        return true;
    }

    // Brings the given (same-origin) tab to the foreground WITHOUT navigating it:
    // window.open('', name) returns the existing context without reloading it while
    // still switching the active tab — opener.focus() alone does not reliably do
    // that in Chrome. The name is set transiently and restored, so the tab keeps
    // its own window.name. Returns false only if even the focus() fallback fails.
    #focusTab(tab) {
        try {
            const target = DifferTabNavigator.OPENER_TAB_TARGET;
            const prevName = tab.name;
            tab.name = target;
            window.open('', target);
            tab.name = prevName;
            return true;
        } catch (error) {
            // Cross-origin tab: cannot use the named-target trick; fall back to a
            // plain focus() (the tab may not come forward, but it stays valid).
            console.warn('cannot focus tab via named target; using focus()', error);
            try {
                tab.focus();
                return true;
            } catch (focusError) {
                console.warn('cannot focus tab', focusError);
                return false;
            }
        }
    }

    // Navigates the tab that opened this differ (the originating MR tab) to the
    // given URL and brings it to the foreground, so opening a handler's MR diff
    // returns to the already-open MR instead of spawning another tab. Returns
    // false when no such tab is available (then the caller falls back to a new tab).
    navigateOpenerTab(url) {
        const opener = window.opener;
        if (!opener || opener.closed) {
            return false;
        }
        try {
            // Opening the URL with the opener's window name as the target reuses
            // that tab, navigates it AND brings it to the front. The name is set
            // transiently and restored, so the opener keeps its own window.name.
            const target = DifferTabNavigator.OPENER_TAB_TARGET;
            const prevName = opener.name;
            opener.name = target;
            window.open(url, target);
            opener.name = prevName;
        } catch (error) {
            // Cross-origin opener: cannot use the named-target trick; navigate
            // directly (the tab may not come to the front, but the URL opens).
            console.warn('cannot focus opener tab via named target; navigating directly', error);
            opener.location.href = url;
            opener.focus();
        }
        return true;
    }

    #getLinkOrScriptHref(resourceName) {
        for (const script of document.scripts) {
            if (script.src.endsWith(resourceName)) {
                return script.src;
            }
        }
        for (const styleSheet of document.styleSheets) {
            if (styleSheet.href.endsWith(resourceName)) {
                return styleSheet.href;
            }
        }
        console.error('cannot find url of link or style sheet: ' + resourceName);
        return null;
    }
}
