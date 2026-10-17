// Does every diagram file of an MR carry its own diff button — and only those?
//
//   node test/e2e/live/mr-button.mjs <iid> [--legacy] [--parallel] [--commit <sha>] [--file <path>] [--walk] [--scroll] [--click] [--shots <dir>]
//
//   --legacy    the legacy diffs UI (?rapid_diffs_disabled=true), what self-managed serves
//   --parallel  side-by-side compare view (?view=parallel)
//   --commit    one commit of the MR (?commit_id=<sha>): the diff of that commit against its parent
//   --file      open the MR on that file (?file_path=): with "Show one file at a time" on, the
//               file shown, so --click and --shots get a diagram whatever the MR's first file is
//   --walk      click every file in the file tree, twice round, sampling during each switch:
//               no button may be visible while rapid diffs greys out the previous file
//   --scroll    wheel down through the diff, checking every block that mounts (the legacy UI
//               virtual-scrolls all-files mode: blocks mount and unmount as the reader scrolls)
//   --click     click the first file button and expect the differ tab to open; prints the
//               differ's side labels (which versions it compares)
//   --shots     save a header screenshot of every diagram block into <dir>
//
// Exits 1 when a check fails. The diff mode ("Show one file at a time") is the
// account's preference — set it with diff-mode.mjs; this script never changes it.
// smoke.mjs runs it as a cell through mrButton().
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    PROJECT, checkBlocks, collectExtensionLog, decorated, differSides, idleChurn, isMain, launchWithExtension, settle, signedInAs
} from './support.mjs';

const USAGE = 'usage: mr-button.mjs <iid> [--legacy] [--parallel] [--commit <sha>] [--file <path>] [--walk] [--scroll] [--click] [--shots <dir>]';

/** Runs the checks on MR <args[0]> in `context`; prints through `log`; resolves with the failure count. */
export async function mrButton(context, args, log = console.log) {
    const commit = args.includes('--commit') ? args[args.indexOf('--commit') + 1] : null;
    const file = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
    const mr = args.find((a, i) => /^\d+$/.test(a) && args[i - 1] !== '--commit');
    if (!mr) {
        throw new Error(USAGE);
    }
    const legacy = args.includes('--legacy');
    const parallel = args.includes('--parallel');
    const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
    const query = [legacy && 'rapid_diffs_disabled=true', parallel && 'view=parallel', commit && `commit_id=${commit}`, file && `file_path=${encodeURIComponent(file)}`].filter(Boolean).join('&');

    const page = await context.newPage();
    await page.setViewportSize({ width: 1500, height: 1000 });
    const extensionLog = collectExtensionLog(page, /button|change view|cannot|error/i);
    let failures = 0;
    const fail = message => { failures++; log('  FAIL ' + message); };

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

    // The legacy UI picks the file by its anchor, rapid diffs by file_path (GitLabPlatformClient#prFileDiffUrl).
    const anchor = file ? '#' + createHash('sha1').update(file).digest('hex') : '';
    await page.goto(`${PROJECT}/-/merge_requests/${mr}/diffs${query ? '?' + query : ''}${anchor}`, { waitUntil: 'domcontentloaded' });
    const initial = await settle(blocks, { ready: decorated, quietMs: 1500 });
    log(`MR !${mr}  ui=${legacy ? 'legacy' : 'rapid'}  view=${parallel ? 'side-by-side' : 'inline'}  signed in: ${await signedInAs(page) || 'no'}`);
    log(`rendered blocks: ${initial.length}, diagrams: ${initial.filter(b => b.diagram).length}`);
    for (const b of initial) log(`  ${b.buttons.length ? '[btn]' : '     '} ${b.path}`);
    // Every MR renders at least one block: none means GitLab served something else, e.g.
    // Cloudflare's "Just a moment..." check after a long run of headless visits.
    if (initial.length === 0) fail(`no file block rendered, page title "${await page.title()}"`);
    checkBlocks(initial, 'initial', fail);

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
        log(`screenshots: ${n} → ${shotsDir}`);
    }

    if (args.includes('--walk')) {
        // Rapid diffs: <a class="file-row" href="…?file_path=…#sha1">; legacy: <button class="file-row" data-file-row="sha1">.
        const rows = await page.$$eval('a.file-row[href*="file_path="], button.file-row[data-file-row]', els => els.map(e => e.getAttribute('href') || e.getAttribute('data-file-row')));
        log(`--- walking ${rows.length} file(s), twice ---`);
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
            checkBlocks(await blocks(), `walk ${decodeURIComponent(row).split('/').pop()}`, fail);
        }
        log('--- walk done ---');
    }

    if (args.includes('--scroll')) {
        const seen = new Set();
        await page.mouse.move(900, 600);
        let atBottom = 0;
        for (let i = 0; i < 40 && atBottom < 2; i++) {
            await page.mouse.wheel(0, 800);
            await page.waitForTimeout(500);
            const now = await blocks();
            now.forEach(b => seen.add(b.path));
            checkBlocks(now, `scroll ${i + 1}`, fail);
            // Two wheels with nothing left to scroll: every block has mounted.
            atBottom = await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2) ? atBottom + 1 : 0;
        }
        log(`scrolled past ${seen.size} block(s), ${[...seen].filter(p => /\.(bpmn|dmn)$/.test(p || '')).length} diagram(s)`);
    }

    // Churn: once settled, nothing of ours should be inserted or removed.
    const churn = await idleChurn(page);
    log(`button insertions/removals over 3s idle: ${churn}`);
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
        else {
            const { shown, other } = await differSides(differ);
            log(`click: differ tab opened, title "${await differ.title()}", sides: ${shown} / ${other}`);
            await differ.close();
        }
        const after = await blockHeight();
        if (after < before / 2) fail(`click: the file block collapsed (${Math.round(before)}px -> ${Math.round(after)}px)`);
    }

    log('--- extension log (last 8) ---\n' + extensionLog.slice(-8).join('\n'));
    await page.close();
    return failures;
}

if (isMain(import.meta.url)) {
    const args = process.argv.slice(2);
    if (!args.some(a => /^\d+$/.test(a))) {
        console.error(USAGE);
        process.exit(2);
    }
    const context = await launchWithExtension();
    const failures = await mrButton(context, args);
    console.log(failures ? `RESULT: ${failures} failure(s)` : 'RESULT: OK');
    await context.close();
    process.exit(failures ? 1 : 0);
}
