'use strict';

// Page-side capture of handler-badge tab opening. Handler clicks call
// window.open(url) — either window.open('about:blank') then newTab.location.href =
// <resolved> for an unchanged handler, or window.open(mrDiffUrl) for a changed one
// (navigateOpenerTab returns false in Layer-2: no window.opener). After install:
//   window.__openCalls  — [url] passed to window.open(...)
//   window.__navigated  — [url] assigned to a returned tab's location.href
async function installHandlerOpenCapture(page) {
    await page.evaluate(() => {
        window.__openCalls = [];
        window.__navigated = [];
        window.open = function (url) {
            window.__openCalls.push(url);
            const tab = {};
            Object.defineProperty(tab, 'location', {
                value: { set href(v) { window.__navigated.push(v); }, get href() { return null; } }
            });
            tab.close = () => { window.__tabClosed = true; };
            return tab;
        };
    });
}

function getOpenCalls(page) {
    return page.evaluate(() => window.__openCalls);
}

function getNavigated(page) {
    return page.evaluate(() => window.__navigated);
}

module.exports = { installHandlerOpenCapture, getOpenCalls, getNavigated };
