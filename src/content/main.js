// entry point for the extension
(async function () {
    if (window.BPMN_APP_INITIALIZED) {
        return;
    }
    window.BPMN_APP_INITIALIZED = true;

    // Chrome injects into every top-level document on a granted host, raw files
    // and API JSON included; those carry no markup and must not mark the site unknown.
    if (document.contentType !== 'text/html') {
        return;
    }

    const hostname = window.location.hostname;
    setSiteKindOverride((await loadSiteKinds())[hostname]);
    if (!detectPlatformKind()) {
        // GitLab's own 404/5xx pages carry no GitLab markup, and it answers 404 for
        // "no access" too: a dead link must not mark a self-hosted GitLab unknown.
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation && navigation.responseStatus >= 400) {
            return;
        }
        console.info(`bpmn-surf: ${hostname} looks like neither GitLab nor GitHub — pick its type under Sites in the extension`);
        await reportUndetectedSite(hostname);
        return;
    }
    new App().init();
    // A page that was unrecognised once (a proxy error page) heals on the next good one.
    clearUndetectedSite(hostname).catch(() => {});
})();
