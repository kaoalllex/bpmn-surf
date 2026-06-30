'use strict';

// Page-side capture of correlation jumps. A single result and each dropdown item
// open via window.open(url, '_blank'); the project blob/search origin would 404,
// so we never open a real popup. After install, window.__openCalls = [url, ...].
async function installOpenCapture(page) {
    await page.evaluate(() => {
        window.__openCalls = [];
        window.open = function (url) {
            window.__openCalls.push(url);
            return null;
        };
    });
}

function getOpenCalls(page) {
    return page.evaluate(() => window.__openCalls);
}

module.exports = { installOpenCapture, getOpenCalls };
