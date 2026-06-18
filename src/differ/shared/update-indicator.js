// Indicator of an available update in the differ page toolbar (FEAT-0012).
// Shared between BPMN and DMN (like BranchIndicator). The differ page is a plain
// web context (about:blank) with no access to chrome.*, so the update data
// arrives via parameters (read by the content-script from the SW state), and a
// click opens the popup as a tab (window.open with the popupUrl passed by the
// content-script via chrome.runtime.getURL).
class UpdateIndicator {
    // updateInfo: { updateAvailable, latestVersion, popupUrl } | null
    constructor(updateInfo) {
        this.updateInfo = updateInfo || null;
    }

    isAvailable() {
        return !!(this.updateInfo
            && this.updateInfo.updateAvailable
            && this.updateInfo.latestVersion);
    }

    // Creates a clickable "bell" element. onActivate is called on click (the view
    // wires up opening the popup). Returns null if there is no update — the caller
    // does not add the element to the toolbar.
    createElement(onActivate) {
        if (!this.isAvailable()) {
            return null;
        }
        const button = document.createElement('button');
        button.className = 'differ-btn differ-update-indicator';
        button.textContent = `🔔 v${this.updateInfo.latestVersion}`;
        button.title = 'A BPMN differ update is available — open the update window';
        button.addEventListener('click', () => {
            if (typeof onActivate === 'function') {
                onActivate();
            }
        });
        return button;
    }
}
