// Does every diagram file of a GitHub PR carry its own diff button — and only those?
// The GitHub twin of mr-button.mjs, on --project, else BPMN_SURF_PROJECT, else the GitHub sandbox.
//
//   node test/e2e/live/pr-button.mjs <number> [--range <sha>|<a>..<b>] [--soft] [--width <px>] [--scroll] [--click] [--shots <dir>] [--project <url>]
//
//   The UI follows the profile: signed in, GitHub serves the new "Files changed"
//   (/pull/N/changes); anonymous (BPMN_SURF_ANONYMOUS=1), the classic one (/pull/N/files).
//   --range   one commit or a range of the PR: /changes/<range> signed in; classic
//             /commits/<sha> or /files/<a>..<b>. With --click the differ's head side must
//             name the range's end commit
//   --soft    open the Conversation tab first and reach Files changed by clicking its tab
//             (GitHub's soft navigation: the page keeps the previous route's payload)
//   --width   viewport width (default 1500): at ~1100–1200 with the file tree open the label
//             must stay on one line
//   --scroll  wheel down through the diff, checking every block that mounts
//   --click   click the first file button: the differ tab opens, its head side names the
//             PR's head branch (or the range's end commit); prints both side labels
//   --shots   save a header screenshot of every diagram block into <dir>
//
// Also checked: our button is no taller than 32 px and ends inside its file header;
// signed in, nothing of ours calls api.github.com (opening the page, clicking, the differ);
// anonymous, the api.github.com requests are counted and printed.
// Exits 1 when a check fails. smoke.mjs runs it as a cell through prButton().
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    checkBlocks, collectExtensionLog, decorated, differSides, githubSignedInAs, idleChurn, isMain, launchWithExtension, settle
} from './support.mjs';

const USAGE = 'usage: pr-button.mjs <number> [--range <sha>|<a>..<b>] [--soft] [--width <px>] [--scroll] [--click] [--shots <dir>] [--project <url>]';
export const GITHUB_PROJECT = process.env.BPMN_SURF_PROJECT && new URL(process.env.BPMN_SURF_PROJECT).hostname === 'github.com'
    ? process.env.BPMN_SURF_PROJECT : 'https://github.com/kaoalllex/bpmn-surf-test';

// Per rendered file block (both UIs): its path, whether it is a diagram, our buttons in
// its header, and their geometry against the header.
function readBlocks() {
    const digests = {};
    for (const script of document.querySelectorAll('react-app script[data-target="react-app.embeddedData"]')) {
        try {
            const changes = JSON.parse(script.textContent).payload;
            const route = changes.pullRequestsChangesRoute || changes.pullRequestsChangesWithRangeRoute;
            (route?.diffSummaries || []).forEach(s => { digests[s.pathDigest] = s.path; });
        } catch { /* not ours */ }
    }
    const clean = text => text.replace(/‎/g, '').trim();
    const blocks = [];
    for (const header of document.querySelectorAll('div.file-header[data-path]')) {
        blocks.push({ ui: 'classic', header, path: header.getAttribute('data-path') });
    }
    for (const block of document.querySelectorAll('div[id^="diff-"]')) {
        const header = /^diff-[0-9a-f]{64}$/.test(block.id) && block.querySelector('[data-diff-header-wrapper]');
        if (!header) continue;
        // The page's own map from the block id (sha256 of the path); after a soft
        // navigation it may be missing, so fall back to the header's own text.
        const renamed = clean(header.querySelector('h3 a .sr-only')?.textContent || '').split(' renamed to ');
        const path = digests[block.id.slice(5)] || (renamed.length === 2 ? renamed[1] : null)
            || header.querySelector('[data-file-path]')?.getAttribute('data-file-path')
            || clean(header.querySelector('h3 a')?.textContent || '');
        blocks.push({ ui: 'new', header, path });
    }
    return blocks.map(({ ui, header, path }) => {
        const box = header.getBoundingClientRect();
        return {
            ui,
            path,
            diagram: /\.(bpmn|dmn)$/.test(path || ''),
            buttons: [...header.querySelectorAll('.bpmn-surf-file-btn')].map(w => {
                const b = w.querySelector('button').getBoundingClientRect();
                return {
                    path: w.dataset.bpmnSurfFilePath,
                    text: w.textContent.trim(),
                    height: Math.round(b.height),
                    overflow: Math.round(b.right - box.right)
                };
            })
        };
    });
}

/** Runs the checks on PR <args[0]> of the project in `context`; prints through `log`; resolves with the failure count. */
export async function prButton(context, args, log = console.log) {
    const value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
    const range = value('--range');
    const width = Number(value('--width')) || 1500;
    const shotsDir = value('--shots');
    const project = value('--project') || GITHUB_PROJECT;
    const pr = args.find((a, i) => /^\d+$/.test(a) && !['--width', '--range', '--shots', '--project'].includes(args[i - 1]));
    if (!pr) {
        throw new Error(USAGE);
    }

    const page = await context.newPage();
    await page.setViewportSize({ width, height: 1000 });
    const extensionLog = collectExtensionLog(page, /button|bpmn-surf|cannot|error/i);
    const apiRequests = [];
    // Ours are REST /repos/… calls; GitHub's own page posts its telemetry to /_private/….
    const onRequest = request => {
        const url = new URL(request.url());
        if (url.hostname === 'api.github.com' && url.pathname.startsWith('/repos/')) apiRequests.push(request.url());
    };
    context.on('request', onRequest);
    let failures = 0;
    const fail = message => { failures++; log('  FAIL ' + message); };

    await page.goto(`${project}/pull/${pr}`, { waitUntil: 'domcontentloaded' });
    const user = await githubSignedInAs(page);
    const tab = range
        ? (user ? `changes/${range}` : range.includes('..') ? `files/${range}` : `commits/${range}`)
        : (user ? 'changes' : 'files');
    if (args.includes('--soft')) {
        // The tab bar links to /files in both UIs; signed in, GitHub routes it to /changes.
        const link = page.locator(`a[href$="/pull/${pr}/files"], a[href$="/pull/${pr}/changes"]`).first();
        await link.waitFor({ timeout: 30000 });
        await link.click();
    } else {
        await page.goto(`${project}/pull/${pr}/${tab}`, { waitUntil: 'domcontentloaded' });
    }
    const blocks = () => page.evaluate(readBlocks);
    const initial = await settle(blocks, { ready: decorated, quietMs: 1500 });
    log(`PR #${pr}  ui=${initial[0]?.ui || '?'}  ${args.includes('--soft') ? 'soft from Conversation  ' : ''}url=${new URL(page.url()).pathname}  width=${width}  signed in: ${user || 'no'}`);
    log(`rendered blocks: ${initial.length}, diagrams: ${initial.filter(b => b.diagram).length}`);
    for (const b of initial) log(`  ${b.buttons.length ? '[btn]' : '     '} ${b.path}`);
    if (initial.length === 0) fail(`no file block rendered, page title "${await page.title()}"`);
    const checkAll = (list, label) => {
        checkBlocks(list, label, fail);
        for (const b of list) for (const btn of b.buttons) {
            if (btn.height > 32) fail(`${label}: ${b.path}'s button is ${btn.height}px tall (the label wraps?)`);
            if (btn.overflow > 0) fail(`${label}: ${b.path}'s button sticks ${btn.overflow}px out of its header`);
        }
    };
    checkAll(initial, 'initial');

    if (shotsDir) {
        mkdirSync(shotsDir, { recursive: true });
        const headers = await page.$$('div.file-header[data-path], [data-diff-header-wrapper]');
        let n = 0;
        for (const h of headers) {
            if (await h.$('.bpmn-surf-file-btn')) {
                await h.scrollIntoViewIfNeeded();
                await h.screenshot({ path: join(shotsDir, `pr${pr}-${initial[0].ui}-${width}-${++n}.png`) });
            }
        }
        log(`screenshots: ${n} → ${shotsDir}`);
    }

    if (args.includes('--scroll')) {
        const seen = new Set();
        await page.mouse.move(Math.round(width * 0.6), 600);
        let atBottom = 0;
        for (let i = 0; i < 60 && atBottom < 2; i++) {
            await page.mouse.wheel(0, 800);
            await page.waitForTimeout(500);
            const now = await blocks();
            now.forEach(b => seen.add(b.path));
            checkAll(now, `scroll ${i + 1}`);
            atBottom = await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2) ? atBottom + 1 : 0;
        }
        log(`scrolled past ${seen.size} block(s), ${[...seen].filter(p => /\.(bpmn|dmn)$/.test(p || '')).length} diagram(s)`);
    }

    const churn = await idleChurn(page);
    log(`button insertions/removals over 3s idle: ${churn}`);
    if (churn) fail(`buttons churn while idle (${churn})`);

    if (args.includes('--click') && !(await page.$('.bpmn-surf-file-btn'))) {
        fail('click: no file button on the page');
    } else if (args.includes('--click')) {
        const differTab = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
        await page.locator('.bpmn-surf-file-btn button').first().click();
        const differ = await differTab;
        if (!differ) fail('click: no differ tab opened');
        else {
            const { shown, other } = await differSides(differ);
            log(`click: differ tab opened, title "${await differ.title()}", sides: ${shown} / ${other}`);
            // A stale payload resolves another PR or selection: its head side names something else.
            const expected = range ? range.split('..').pop().slice(0, 7) : await page.evaluate(() =>
                document.querySelector('span.commit-ref.head-ref')?.getAttribute('title')?.split(':').pop()
                || [...document.querySelectorAll('react-app script[data-target="react-app.embeddedData"]')]
                    .map(s => { try { return JSON.parse(s.textContent).payload.pullRequestsLayoutRoute?.pullRequest?.headBranch; } catch { return null; } })
                    .find(Boolean));
            const head = [shown, other].find(s => s.startsWith('Changed')) || shown;
            if (!expected) log('click: the page names no head ref, side not checked');
            else if (!head.includes(expected)) fail(`click: the differ's head side "${head}" does not name ${expected}`);
            await differ.close();
        }
    }

    context.off('request', onRequest);
    log(`api.github.com requests: ${apiRequests.length}${apiRequests.length ? '  ' + apiRequests.map(u => new URL(u).pathname).join(' ') : ''}`);
    if (user && apiRequests.length) fail(`signed in, yet ${apiRequests.length} api.github.com request(s)`);
    log('--- extension log (last 8) ---\n' + extensionLog.slice(-8).join('\n'));
    await page.close();
    return failures;
}

if (isMain(import.meta.url)) {
    const args = process.argv.slice(2);
    if (!args.some((a, i) => /^\d+$/.test(a) && !['--width', '--range', '--shots', '--project'].includes(args[i - 1]))) {
        console.error(USAGE);
        process.exit(2);
    }
    const context = await launchWithExtension();
    const failures = await prButton(context, args);
    console.log(failures ? `RESULT: ${failures} failure(s)` : 'RESULT: OK');
    await context.close();
    process.exit(failures ? 1 : 0);
}
