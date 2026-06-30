'use strict';

// Page-side capture of the differ's tab-opening primitives, so dive-in flows can
// be characterized WITHOUT rendering a nested tab. A nested tab rebuilds its client
// via createPlatformClient(params.platform), which throws for the fake 'fake' kind,
// so we never let the real openDiffer run. After install:
//   window.__openDifferCalls — [{ params, msgId }] for each openDiffer(...) call
//   window.__openUrlCalls    — [url] for each window.open(url, ...) call
// openDiffer is a top-level function in utils.js, so overriding window.openDiffer
// replaces the binding the bare `openDiffer(...)` call site resolves at call time.
async function installTabCapture(page) {
    await page.evaluate(() => {
        window.__openDifferCalls = [];
        window.__openUrlCalls = [];
        window.openDiffer = async function (params, extParams, msgId) {
            window.__openDifferCalls.push({ params, msgId });
            return true;
        };
        window.open = function (url) {
            window.__openUrlCalls.push(url);
            return null;   // the dive-in fallback ignores the return value
        };
    });
}

function getOpenDifferCalls(page) {
    return page.evaluate(() => window.__openDifferCalls);
}

function getOpenUrlCalls(page) {
    return page.evaluate(() => window.__openUrlCalls);
}

module.exports = { installTabCapture, getOpenDifferCalls, getOpenUrlCalls };
