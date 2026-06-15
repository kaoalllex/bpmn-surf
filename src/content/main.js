// entry point for the extension
(function () {
    if (window.BPMN_APP_INITIALIZED) {
        return;
    }
    window.BPMN_APP_INITIALIZED = true;

    new App().init();
})();
