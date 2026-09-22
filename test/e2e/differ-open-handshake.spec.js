'use strict';

// The openDiffer handshake — how every differ tab is actually started — had no
// test at all: the feature specs boot the differ directly and the dive-in specs
// stub openDiffer out. So a break here would leave `npm test` and the whole e2e
// suite green (the hazard docs/conventions.md warns about), which is why the
// params message is pinned here rather than only reasoned about.
const { test, expect } = require('@playwright/test');

test('openDiffer addresses the params message to this origin, not to everyone', async ({ page }) => {
    await page.goto('/test/e2e/harness/differ-harness.html');
    await page.addScriptTag({ url: '/src/core/utils.js' });

    const result = await page.evaluate(async () => {
        // The scripts the differ tab loads are irrelevant to the handshake and
        // cost seconds; the postMessage that follows them is the subject.
        window.loadScripts = async () => {};

        const opened = [];
        const realOpen = window.open;
        window.open = (...args) => {
            const child = realOpen(...args);
            const realPost = child.postMessage.bind(child);
            child.postMessage = (message, targetOrigin) => {
                opened.push({ targetOrigin, id: message.id, fileName: message.params.fileName });
                realPost(message, targetOrigin);
            };
            return child;
        };
        try {
            const ok = await openDiffer(
                { fileName: 'process.bpmn', localFileContent: '<bpmn:definitions/>' },
                null, 'msg_test', (name) => '/' + name);
            return { ok, opened, origin: window.location.origin };
        } finally {
            window.open = realOpen;
        }
    });

    expect(result.ok).toBe(true);
    expect(result.opened).toHaveLength(1);
    expect(result.opened[0].targetOrigin).toBe(result.origin);
    expect(result.opened[0].targetOrigin).not.toBe('*');
    // The message itself is unchanged: same id, same params.
    expect(result.opened[0].id).toBe('msg_test');
    expect(result.opened[0].fileName).toBe('process.bpmn');
});

test('a differ tab accepts the message its opener addressed to it', async ({ page }) => {
    // The receiving half: window.origin inside the about:blank tab must equal the
    // opener's origin, or the differ's own `msg.origin !== window.origin` guard
    // would drop every message and no diagram would ever render.
    await page.goto('/test/e2e/harness/differ-harness.html');
    const received = await page.evaluate(async () => {
        const child = window.open('about:blank');
        child.eval('window.__seen = null; window.addEventListener("message",'
            + ' (m) => { window.__seen = { sender: m.origin, own: window.origin, id: m.data.id }; });');
        await new Promise((resolve) => setTimeout(resolve, 50));
        child.postMessage({ id: 'msg_test' }, window.location.origin);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const seen = child.__seen && JSON.parse(JSON.stringify(child.__seen));
        child.close();
        return seen;
    });

    expect(received).not.toBeNull();
    expect(received.id).toBe('msg_test');
    expect(received.sender).toBe(received.own);
});
