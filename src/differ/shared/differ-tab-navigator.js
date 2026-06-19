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
class DifferTabNavigator {
    // A transient window.name used to bring the opener tab to the foreground via
    // window.open(target, name): opener.focus() alone does not reliably switch
    // the active tab in Chrome. The name is set transiently and restored, so the
    // opener keeps its own window.name.
    static OPENER_TAB_TARGET = 'gl-bpmn-diff-opener-tab';

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
        try {
            // window.open('', name) returns the existing context without navigating
            // it (so no reload), while still bringing that tab to the foreground —
            // opener.focus() alone does not reliably switch the active tab in Chrome.
            const target = DifferTabNavigator.OPENER_TAB_TARGET;
            const prevName = opener.name;
            opener.name = target;
            window.open('', target);
            opener.name = prevName;
        } catch (error) {
            // Cross-origin opener: cannot use the named-target trick; fall back to
            // a plain focus() (the tab may not come forward, but it stays valid).
            console.warn('cannot focus opener tab via named target; using focus()', error);
            try {
                opener.focus();
            } catch (focusError) {
                console.warn('cannot focus opener tab', focusError);
                return false;
            }
        }
        window.close();
        return true;
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
