'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { DifferTabNavigator } = createScope();

// In-memory BroadcastChannel bus shared by the navigators under test: postMessage
// is delivered asynchronously to every OTHER live channel (never the sender),
// matching BroadcastChannel semantics, so the registry query/answer protocol can
// be exercised without a real browser.
function makeBus() {
    const channels = [];
    function createChannel() {
        const listeners = new Set();
        const ch = {
            addEventListener: (_type, fn) => listeners.add(fn),
            removeEventListener: (_type, fn) => listeners.delete(fn),
            close: () => {
                const i = channels.indexOf(ch);
                if (i >= 0) channels.splice(i, 1);
            },
            postMessage: (data) => {
                for (const other of channels) {
                    if (other === ch) continue;
                    for (const fn of other._listeners) {
                        queueMicrotask(() => fn({ data }));
                    }
                }
            },
            _listeners: listeners
        };
        channels.push(ch);
        return ch;
    }
    return { createChannel, channels };
}

// A navigator wired to the shared bus, recording every focus-by-name call.
function makeNav(bus, identityKey) {
    const focused = [];
    const nav = new DifferTabNavigator({
        createChannel: bus.createChannel,
        focusByName: (name) => { focused.push(name); return true; },
        queryTimeoutMs: 30
    });
    if (identityKey != null) {
        nav.registerTab(identityKey);
    }
    return { nav, focused };
}

describe('DifferTabNavigator.tabNameFor', () => {
    it('is a stable, identity-derived name', () => {
        assert.equal(DifferTabNavigator.tabNameFor('A'), DifferTabNavigator.tabNameFor('A'));
        assert.notEqual(DifferTabNavigator.tabNameFor('A'), DifferTabNavigator.tabNameFor('B'));
        assert.ok(DifferTabNavigator.tabNameFor('A').includes('A'));
    });
});

describe('DifferTabNavigator cross-tab registry', () => {
    let bus;
    beforeEach(() => { bus = makeBus(); });

    it('focuses an existing tab showing the same diagram', async () => {
        makeNav(bus, 'A');
        const b = makeNav(bus, 'B');

        const reused = await b.nav.focusExistingDifferTab('A');
        assert.equal(reused, true);
        assert.deepEqual(b.focused, [DifferTabNavigator.tabNameFor('A')]);
    });

    it('reuses a tab regardless of opener relationship (sibling tabs)', async () => {
        // A and B are unrelated tabs (no opener chain); both share the channel, so
        // B diving into A's diagram still finds it.
        const a = makeNav(bus, 'A');
        const b = makeNav(bus, 'B');
        assert.notEqual(a.nav, b.nav);

        assert.equal(await b.nav.focusExistingDifferTab('A'), true);
    });

    it('returns false when no tab shows the diagram (then a fresh tab opens)', async () => {
        const b = makeNav(bus, 'B');
        assert.equal(await b.nav.focusExistingDifferTab('Z'), false);
        assert.deepEqual(b.focused, []);
    });

    it('does not match a tab that has closed (left the registry)', async () => {
        makeNav(bus, 'A'); // channel created first, so it is bus.channels[0]
        const b = makeNav(bus, 'B');
        bus.channels[0].close(); // A's tab goes away

        assert.equal(await b.nav.focusExistingDifferTab('A'), false);
    });

    it('does not answer its own query (no self-match)', async () => {
        const a = makeNav(bus, 'A');
        // Only one tab exists; asking for its own diagram finds nobody else.
        assert.equal(await a.nav.focusExistingDifferTab('A'), false);
    });

    it('no-ops (returns false) when BroadcastChannel is unavailable', async () => {
        const nav = new DifferTabNavigator({ createChannel: () => null, queryTimeoutMs: 30 });
        nav.registerTab('A');
        assert.equal(await nav.focusExistingDifferTab('B'), false);
    });

    it('does not confuse two askers querying at once', async () => {
        makeNav(bus, 'A');
        const b = makeNav(bus, 'B');
        const c = makeNav(bus, 'C');

        const [bFound, cFound] = await Promise.all([
            b.nav.focusExistingDifferTab('A'), // exists
            c.nav.focusExistingDifferTab('Z')  // does not
        ]);
        assert.equal(bFound, true);
        assert.equal(cFound, false);
    });
});
