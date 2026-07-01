'use strict';

// Page-side capture for the dive-out (FEAT-0023) and cross-tab (BUG-0017) flows.
// A nested/reused differ tab cannot render in Layer-2 (its main() calls
// createPlatformClient('fake'), which throws), so we stub the tab-management
// primitives and assert the decisions the orchestrator makes:
//   window.openDiffer       -> window.__openDifferCalls: [{ params, msgId }]
//   window.open(url, name)  -> window.__openCalls:        [[url, name], ...]
//   window.close()          -> window.__closeCount
// With { opener: true } we also install a fake same-origin window.opener so the
// opener-present branch of focusOpenerAndClose runs (assigning window.opener to an
// object sticks — spike-confirmed). openDiffer is a top-level function in utils.js,
// so reassigning window.openDiffer shadows the binding the bare openDiffer(...) call
// resolves at call time.
async function installCapture(page, { opener = false } = {}) {
    await page.evaluate(({ opener }) => {
        window.__openDifferCalls = [];
        window.__openCalls = [];
        window.__closeCount = 0;
        if (opener) {
            // Stand-in for the tab that opened this one. name is read+restored by the
            // named-target focus trick; closed:false so focusOpenerAndClose proceeds.
            window.opener = { closed: false, name: '', focus() {} };
        }
        window.openDiffer = async function (params, extParams, msgId) {
            window.__openDifferCalls.push({ params, msgId });
            return true;
        };
        window.open = function (url, name) {
            window.__openCalls.push([url, name]);
            return null;
        };
        window.close = function () {
            window.__closeCount += 1;
        };
    }, { opener });
}

function getOpenDifferCalls(page) {
    return page.evaluate(() => window.__openDifferCalls);
}

function getOpenCalls(page) {
    return page.evaluate(() => window.__openCalls);
}

function getCloseCount(page) {
    return page.evaluate(() => window.__closeCount);
}

module.exports = { installCapture, getOpenDifferCalls, getOpenCalls, getCloseCount };
