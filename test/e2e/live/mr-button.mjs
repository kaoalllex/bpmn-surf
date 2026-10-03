// Does every diagram file of an MR carry its own diff button — and only those?
//
//   node test/e2e/live/mr-button.mjs <iid> [--legacy] [--parallel] [--walk] [--scroll] [--click] [--shots <dir>]
//
//   --legacy    the legacy diffs UI (?rapid_diffs_disabled=true), what self-managed serves
//   --parallel  side-by-side compare view (?view=parallel)
//   --walk      click every file in the file tree, twice round, sampling during each switch:
//               no button may be visible while rapid diffs greys out the previous file
//   --scroll    wheel down through the diff, checking every block that mounts (the legacy UI
//               virtual-scrolls all-files mode: blocks mount and unmount as the reader scrolls)
//   --click     click the first file button and expect the differ tab to open
//   --shots     save a header screenshot of every diagram block into <dir>
//
// Exits 1 when a check fails. The diff mode ("Show one file at a time") is the
// account's preference — set it with diff-mode.mjs; this script never changes it.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT, collectExtensionLog, launchWithExtension, signedInAs } from './support.mjs';

const args = process.argv.slice(2);
const mr = args.find(a => /^\d+$/.test(a));
if (!mr) {
    console.error('usage: mr-button.mjs <iid> [--legacy] [--parallel] [--walk] [--scroll] [--click] [--shots <dir>]');
    process.exit(2);
}
const legacy = args.includes('--legacy');
const parallel = args.includes('--parallel');
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const query = [legacy && 'rapid_diffs_disabled=true', parallel && 'view=parallel'].filter(Boolean).join('&');

const context = await launchWithExtension();
const page = await context.newPage();
await page.setViewportSize({ width: 1500, height: 1000 });
const log = collectExtensionLog(page, /button|change view|cannot|error/i);
let failures = 0;
const fail = message => { failures++; console.log('  FAIL ' + message); };

await page.goto(`${PROJECT}/-/merge_requests/${mr}/diffs${query ? '?' + query : ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
console.log(`MR !${mr}  ui=${legacy ? 'legacy' : 'rapid'}  view=${parallel ? 'side-by-side' : 'inline'}  signed in: ${await signedInAs(page) || 'no'}`);

// Per rendered block: its path, whether it is a diagram, and the buttons inside it.
const blocks = () => page.evaluate(() => [...document.querySelectorAll('diff-file, .diff-file.file-holder[data-path]')].map(b => {
    let path = b.getAttribute('data-path');
    if (b.tagName === 'DIFF-FILE') {
        try { const d = JSON.parse(b.getAttribute('data-file-data')); path = d.new_path || d.old_path; } catch { path = null; }
    }
    const buttons = [...b.querySelectorAll('.bpmn-surf-file-btn')];
    return {
        path,
        diagram: /\.(bpmn|dmn)$/.test(path || ''),
        buttons: buttons.map(w => ({
            path: w.dataset.bpmnSurfFilePath,
            text: w.textContent.trim(),
            visible: getComputedStyle(w).visibility !== 'hidden' && w.getBoundingClientRect().width > 0
        }))
    };
}));

const check = (list, label) => {
    for (const b of list) {
        if (b.diagram && b.buttons.length !== 1) fail(`${label}: ${b.path} has ${b.buttons.length} buttons, expected 1`);
        if (!b.diagram && b.buttons.length) fail(`${label}: ${b.path} is not a diagram but has a button`);
        for (const btn of b.buttons) {
            if (btn.path !== b.path) fail(`${label}: button for ${btn.path} sits on ${b.path}`);
            const expected = b.path.endsWith('.dmn') ? 'Decision diff' : 'Schema diff';
            if (btn.text !== expected) fail(`${label}: ${b.path} says "${btn.text}", expected "${expected}"`);
        }
    }
};

const initial = await blocks();
console.log(`rendered blocks: ${initial.length}, diagrams: ${initial.filter(b => b.diagram).length}`);
for (const b of initial) console.log(`  ${b.buttons.length ? '[btn]' : '     '} ${b.path}`);
check(initial, 'initial');

if (shotsDir) {
    mkdirSync(shotsDir, { recursive: true });
    const headers = await page.$$('diff-file header.rd-diff-file-header, .diff-file.file-holder > .js-file-title');
    let n = 0;
    for (const h of headers) {
        if (await h.$('.bpmn-surf-file-btn')) {
            await h.scrollIntoViewIfNeeded();
            await h.screenshot({ path: join(shotsDir, `mr${mr}-${legacy ? 'legacy' : 'rapid'}-${parallel ? 'parallel' : 'inline'}-${++n}.png`) });
        }
    }
    console.log(`screenshots: ${n} → ${shotsDir}`);
}

if (args.includes('--walk')) {
    // Rapid diffs: <a class="file-row" href="…?file_path=…#sha1">; legacy: <button class="file-row" data-file-row="sha1">.
    const rows = await page.$$eval('a.file-row[href*="file_path="], button.file-row[data-file-row]', els => els.map(e => e.getAttribute('href') || e.getAttribute('data-file-row')));
    console.log(`--- walking ${rows.length} file(s), twice ---`);
    for (const row of [...rows, ...rows]) {
        await page.evaluate(r => [...document.querySelectorAll('.file-row')]
            .find(e => (e.getAttribute('href') || e.getAttribute('data-file-row')) === r)?.click(), row);
        const t0 = Date.now();
        while (Date.now() - t0 < 2500) {
            const state = await page.evaluate(() => ({
                loading: document.querySelector('.rd-app-diffs-list-loading-overlay')?.getAttribute('data-loading') === 'true',
                visible: [...document.querySelectorAll('.bpmn-surf-file-btn')]
                    .filter(w => getComputedStyle(w).visibility !== 'hidden' && w.getBoundingClientRect().width > 0).length
            }));
            if (state.loading && state.visible) fail(`walk: ${state.visible} button(s) visible during the grey-out after ${row}`);
            await page.waitForTimeout(40);
        }
        const after = await blocks();
        check(after, `walk ${decodeURIComponent(row).split('/').pop()}`);
    }
    console.log('--- walk done ---');
}

if (args.includes('--scroll')) {
    const seen = new Set();
    await page.mouse.move(900, 600);
    for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(500);
        const now = await blocks();
        now.forEach(b => seen.add(b.path));
        check(now, `scroll ${i + 1}`);
    }
    console.log(`scrolled past ${seen.size} block(s), ${[...seen].filter(p => /\.(bpmn|dmn)$/.test(p || '')).length} diagram(s)`);
}

// Churn: once settled, nothing of ours should be inserted or removed.
await page.evaluate(() => {
    window.__bpmnSurfChurn = 0;
    new MutationObserver(ms => ms.forEach(m => [...m.addedNodes, ...m.removedNodes]
        .forEach(n => { if (n.classList?.contains('bpmn-surf-file-btn')) window.__bpmnSurfChurn++; })))
        .observe(document.body, { childList: true, subtree: true });
});
await page.waitForTimeout(5000);
const churn = await page.evaluate(() => window.__bpmnSurfChurn);
console.log(`button insertions/removals over 5s idle: ${churn}`);
if (churn) fail(`buttons churn while idle (${churn})`);

if (args.includes('--click') && !(await page.$('.bpmn-surf-file-btn'))) {
    fail('click: no file button on the page (in one-file mode, pick an MR whose first file is a diagram)');
} else if (args.includes('--click')) {
    // The legacy file header toggles the file on a click; ours must not reach it.
    const blockHeight = () => page.evaluate(() => document.querySelector('.bpmn-surf-file-btn')
        .closest('diff-file, .diff-file.file-holder').getBoundingClientRect().height);
    const before = await blockHeight();
    const tab = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
    await page.locator('.bpmn-surf-file-btn button').first().click();
    const differ = await tab;
    if (!differ) fail('click: no differ tab opened');
    else { await differ.waitForTimeout(4000); console.log(`click: differ tab opened, title "${await differ.title()}"`); }
    const after = await blockHeight();
    if (after < before / 2) fail(`click: the file block collapsed (${Math.round(before)}px -> ${Math.round(after)}px)`);
}

console.log('--- extension log (last 8) ---\n' + log.slice(-8).join('\n'));
console.log(failures ? `RESULT: ${failures} failure(s)` : 'RESULT: OK');
await context.close();
process.exit(failures ? 1 : 0);
