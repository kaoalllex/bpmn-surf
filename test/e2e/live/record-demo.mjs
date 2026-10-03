// Records the README GIFs and the store screenshots from the demo project.
//
//   BPMN_SURF_PROJECT=https://gitlab.com/kao.alllex/bpmn-surf-demo \
//     node test/e2e/live/record-demo.mjs <iid> <outDir> [--clip <name>[,<name>…]] [--no-shots]
//
// <iid> is the showcase MR ("Express checkout and stricter payment risk"; resolve
// it by title, see README.md). Needs the signed-in profile (handler, correlation
// and caller navigation use code search), "Show one file at a time" on (the clips
// pick files in the tree), and ffmpeg on PATH.
//
// Writes <outDir>/<clip>.gif for every clip in CLIPS (all of them unless --clip),
// <outDir>/screenshots/*.png at 1280×800 (unless --no-shots), <outDir>/tile-source.png
// and <outDir>/edited.bpmn (the edit clip's download, which the local-diff clip reads).
//
// Every tab records its own video, so a clip notes which tab is on screen and
// when; ffmpeg then cuts those spans out and joins them. Tab loading falls
// between spans and never reaches a GIF.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROJECT, launchWithExtension, signedInAs } from './support.mjs';

const args = process.argv.slice(2);
const [iid, outArg] = args.filter(a => !a.startsWith('--'));
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
if (!iid || !outArg || !process.env.BPMN_SURF_PROJECT) {
    console.error('usage: BPMN_SURF_PROJECT=<demo project URL> record-demo.mjs <iid> <outDir> [--clip <name>[,…]] [--no-shots]');
    process.exit(2);
}
const OUT = resolve(outArg);
const SIZE = { width: 1280, height: 800 };
const RES = 'order-service/src/main/resources';
const BPMN = `${RES}/bpmn/OrderMain.bpmn`;
const DMN = `${RES}/dmn/PaymentRisk.dmn`;
const KOTLIN = 'order-service/src/main/kotlin/com/example/order/handler/ApplyExpressShippingHandler.kt';
const BRANCH = 'feature/express-checkout';
const EDITED = join(OUT, 'edited.bpmn');
const BLOB_BUTTON = '#btn_77844bf3d4e842caa0d88194431197c0';
rmSync(join(OUT, 'video'), { recursive: true, force: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const context = await launchWithExtension({
    viewport: SIZE, acceptDownloads: true, recordVideo: { dir: join(OUT, 'video'), size: SIZE }
});
const started = new Map();
context.on('page', p => started.set(p, Date.now()));
const pause = ms => new Promise(r => setTimeout(r, ms));

// GitLab keeps its layout in cookies of the shared profile: collapse the sidebar
// and pick the inline view for a roomier MR page, then put back what was there.
const host = new URL(PROJECT).hostname;
const LAYOUT = { super_sidebar_collapsed: 'true', diff_view: 'inline' };
const savedLayout = (await context.cookies(`https://${host}`)).filter(c => c.name in LAYOUT);
await context.addCookies(Object.entries(LAYOUT).map(([name, value]) => ({ name, value, domain: host, path: '/', secure: true })));
async function restoreLayout() {
    for (const name of Object.keys(LAYOUT)) await context.clearCookies({ name });
    if (savedLayout.length) await context.addCookies(savedLayout);
}

// --- what is on screen, and since when ------------------------------------------
let spans = [];
let current = null;
function onScreen(page) {
    const now = Date.now();
    if (current) spans.push({ ...current, to: now });
    current = page && { page, from: now };
}

// A visible pointer: headless Chromium draws none, and a click nobody sees is
// a jump cut. Idempotent, so it is safe to call after every navigation.
async function cursor(page) {
    await page.evaluate(() => {
        if (document.getElementById('demo-cursor')) return;
        const c = document.createElement('div');
        c.id = 'demo-cursor';
        c.innerHTML = '<svg width="22" height="28" viewBox="0 0 22 28"><path d="M2 2 L2 22 L7.5 17 L11 25.5 L14.5 24 L11 15.8 L18.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none' });
        document.documentElement.appendChild(c);
        addEventListener('mousemove', e => { c.style.left = e.clientX - 2 + 'px'; c.style.top = e.clientY - 2 + 'px'; }, true);
        addEventListener('mousedown', e => {
            const r = document.createElement('div');
            Object.assign(r.style, {
                position: 'fixed', left: e.clientX - 18 + 'px', top: e.clientY - 18 + 'px', width: '36px', height: '36px',
                borderRadius: '50%', background: 'rgba(255, 170, 0, .45)', zIndex: 2147483646, pointerEvents: 'none',
                transition: 'transform .45s ease-out, opacity .45s ease-out'
            });
            document.documentElement.appendChild(r);
            requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
            setTimeout(() => r.remove(), 600);
        }, true);
    });
}

const last = new WeakMap();
async function glideTo(page, locator) {
    await locator.waitFor({ state: 'visible', timeout: 20000 });
    const box = await locator.boundingBox();
    const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const from = last.get(page) || { x: SIZE.width / 2, y: SIZE.height - 120 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.move(to.x, to.y, { steps: 22 });
    last.set(page, to);
    await pause(250);
}
async function click(page, locator) {
    await glideTo(page, locator);
    await page.mouse.down();
    await page.mouse.up();
    // Step aside so the pointer does not cover what the click revealed.
    const at = last.get(page);
    last.set(page, { x: at.x + 30, y: at.y + 34 });
    await page.mouse.move(at.x + 30, at.y + 34, { steps: 8 });
}
// A click that moves the story to another tab: linger on the target, click, and
// cut away as soon as the ripple shows. Chromium greys the opener out while a new
// tab attaches, and that must not reach the video. `land` waits for the tab the
// click leads to (a new one, the MR tab, a parent) and returns it once rendered.
async function clickAway(page, locator, land) {
    await glideTo(page, locator);
    await pause(400);
    await page.mouse.down();
    await page.mouse.up();
    await pause(250);
    onScreen(null);
    const tab = await land();
    await cursor(tab);
    await tab.bringToFront();
    await pause(300);
    onScreen(tab);
    return tab;
}
const toNewTab = (ready = differReady) => async () => {
    const tab = await context.waitForEvent('page', { timeout: 30000 });
    await ready(tab);
    return tab;
};
const differReady = async tab => {
    await tab.locator('svg .djs-element, .tjs-table').first().waitFor({ timeout: 30000 });
    await pause(2500);
};
const gitlabReady = async tab => {
    await tab.waitForLoadState('domcontentloaded');
    await tab.locator('.blob-content, .file-content, [data-testid="blob-content"], diff-file, .diff-file').first()
        .waitFor({ timeout: 30000 });
    await pause(2500);
};
// A changed handler opens its diff in the MR tab, often by changing only the
// hash, so wait for the URL itself rather than for a load.
function mrLands(mr) {
    const before = mr.url();
    return async () => {
        await mr.waitForURL(url => url.href !== before, { timeout: 30000 });
        await pause(3500);
        return mr;
    };
}
const element = (tab, id) => tab.locator(`svg .djs-element[data-element-id="${id}"]`).first();
const badge = (tab, id, cls) => tab.locator(`.djs-overlays[data-container-id="${id}"] ${cls}`).first();
const button = (tab, title) => tab.locator(`button[title="${title}"]`).first();
// GitLab breaks file names in the tree with invisible direction marks, so the
// row is found in the page and tagged for the locator.
async function fileRow(page, path) {
    const name = path.split('/').pop();
    await page.waitForFunction(n => [...document.querySelectorAll('a.file-row')].some(a => {
        const found = a.textContent.replace(/[‎‏]/g, '').includes(n);
        if (found) a.dataset.demoRow = n;
        return found;
    }), name, { timeout: 20000 });
    return page.locator(`a.file-row[data-demo-row="${name}"]`).first();
}
const fileButton = (page, label) => page.locator('.bpmn-surf-file-btn button', { hasText: label }).first();

// The MR diffs page with one file selected in the tree (off screen: no span yet).
async function openMr(path = BPMN) {
    const mr = await context.newPage();
    await mr.goto(`${PROJECT}/-/merge_requests/${iid}/diffs`, { waitUntil: 'domcontentloaded' });
    await mr.waitForTimeout(9000);
    if (path) {
        await (await fileRow(mr, path)).click();
        await mr.waitForTimeout(3000);
    }
    await cursor(mr);
    return mr;
}
// The MR's OrderMain diff, already on screen.
async function openDiff() {
    const mr = await openMr();
    await fileButton(mr, 'Schema diff').click();
    const diff = await toNewTab()();
    await cursor(diff);
    await diff.bringToFront();
    return { mr, diff };
}
async function openBlob(ref, path) {
    const blob = await context.newPage();
    await blob.goto(`${PROJECT}/-/blob/${ref}/${path}`, { waitUntil: 'domcontentloaded' });
    await blob.waitForTimeout(8000);
    await cursor(blob);
    return blob;
}

// Cuts the clip's spans out of the per-tab videos and joins them into <name>.gif.
// The clip's tabs are closed first: a video is complete only once its page is.
async function finishClip(name, width) {
    onScreen(null);
    const clipSpans = spans;
    spans = [];
    for (const page of context.pages()) await page.close();
    const parts = [];
    for (const [i, s] of clipSpans.entries()) {
        const src = await s.page.video().path();
        const part = join(OUT, 'video', `${name}-${i}.mp4`);
        const ss = ((s.from - started.get(s.page)) / 1000).toFixed(2);
        const t = ((s.to - s.from) / 1000).toFixed(2);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-i', src, '-t', t, '-an',
            '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-crf', '18', part]);
        parts.push(part);
    }
    const list = join(OUT, 'video', `${name}.txt`);
    writeFileSync(list, parts.map(p => `file '${p}'`).join('\n'));
    const mp4 = join(OUT, 'video', `${name}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', mp4]);
    const fps = width >= 1000 ? 12 : 10;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf',
        `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        join(OUT, `${name}.gif`)]);
    const seconds = clipSpans.reduce((sum, s) => sum + (s.to - s.from), 0) / 1000;
    console.log(`${name}.gif: ${seconds.toFixed(1)} s in ${clipSpans.length} span(s)`);
}

// --- the clips ------------------------------------------------------------------
const CLIPS = {
    // The README's top GIF: the MR entry and what a diff looks like.
    async hero() {
        const mr = await openMr();
        onScreen(mr);
        await pause(1500);                                    // the XML diff GitLab shows
        const diff = await clickAway(mr, fileButton(mr, 'Schema diff'), toNewTab());
        await pause(2000);                                    // the colours
        await click(diff, button(diff, 'Turn diff highlight on'));
        await pause(2200);                                    // ☼ points at every change
        await click(diff, button(diff, 'Turn diff highlight off'));
        await pause(600);
        await click(diff, diff.getByRole('button', { name: 'Switch branch' }));
        await pause(2200);                                    // the original, "Check for fraud" removed
        await click(diff, diff.getByRole('button', { name: 'Switch branch' }));
        await pause(900);
        await click(diff, element(diff, 'ValidateOrder'));
        await pause(2800);                                    // the highlighted property groups
        await finishClip('hero', 1000);
    },

    // Where the buttons appear: only on diagrams, in the MR and on a blob page.
    async buttons() {
        const mr = await openMr(KOTLIN);
        onScreen(mr);
        await pause(1800);                                    // a Kotlin file: no button
        await click(mr, await fileRow(mr, BPMN));
        await fileButton(mr, 'Schema diff').waitFor({ timeout: 20000 });
        await glideTo(mr, fileButton(mr, 'Schema diff'));
        await pause(1300);
        await click(mr, await fileRow(mr, DMN));
        await fileButton(mr, 'Decision diff').waitFor({ timeout: 20000 });
        await glideTo(mr, fileButton(mr, 'Decision diff'));
        await pause(1300);
        onScreen(null);
        const blob = await openBlob('main', BPMN);
        onScreen(blob);
        await glideTo(blob, blob.locator(`${BLOB_BUTTON}-btn`));
        await pause(1000);
        await click(blob, blob.locator(`${BLOB_BUTTON}-caret`));
        await pause(1800);                                    // "Diff with local file…"
        await blob.keyboard.press('Escape');
        await pause(500);
        await finishClip('buttons', 800);
    },

    // The detail of a change: the changes table, a condition, a type change.
    async details() {
        const { diff } = await openDiff();
        onScreen(diff);
        await pause(1000);
        await click(diff, diff.getByRole('button', { name: 'Show changes' }));
        await pause(1300);
        await click(diff, diff.locator('table.changes-table tbody tr', { hasText: 'CancelOrder' }).first());
        await pause(1800);                                    // the row selects the element
        await click(diff, diff.getByRole('button', { name: 'Hide changes' }));
        await pause(600);
        await click(diff, element(diff, 'CancelOrder'));
        await pause(2000);                                    // the type change in the panel header
        await click(diff, element(diff, 'Flow_yes'));
        await pause(2800);                                    // the condition, line by line
        await finishClip('details', 800);
    },

    // A change inside a collapsed subprocess.
    async subprocess() {
        const { diff } = await openDiff();
        onScreen(diff);
        await pause(1500);                                    // "Reserve stock" outlined
        await click(diff, badge(diff, 'ReserveStock', '.bjs-drilldown'));
        await pause(1200);
        await click(diff, element(diff, 'NotifyWarehouse'));
        await pause(2000);
        await click(diff, diff.locator('.bjs-breadcrumbs li').first());
        await pause(1300);
        await finishClip('subprocess', 800);
    },

    // From the diagram to the code: changed and unchanged handlers, correlation.
    async code() {
        const { mr, diff } = await openDiff();
        onScreen(diff);
        await pause(1500);                                    // blue and grey </> badges
        await clickAway(diff, badge(diff, 'ValidateOrder', '.handler-link'), mrLands(mr));
        await pause(2400);                                    // its diff in this MR
        onScreen(null);
        await diff.bringToFront();
        await pause(300);
        onScreen(diff);
        await click(diff, element(diff, 'NotifyCustomer'));
        await pause(700);
        await clickAway(diff, badge(diff, 'NotifyCustomer', '.handler-link'), toNewTab(gitlabReady));
        await pause(2200);                                    // the unchanged handler's file
        onScreen(null);
        await diff.bringToFront();
        await pause(300);
        onScreen(diff);
        await click(diff, element(diff, 'AwaitPayment'));
        await pause(700);
        await clickAway(diff, badge(diff, 'AwaitPayment', '.correlation-link'), toNewTab(gitlabReady));
        await pause(2400);                                    // where OrderPaid is correlated
        await finishClip('code', 800);
    },

    // Across diagrams: dive in twice, find every caller, open the DMN.
    async diagrams() {
        const { mr, diff } = await openDiff();
        onScreen(diff);
        await click(diff, element(diff, 'Payment'));
        await pause(600);
        const payment = await clickAway(diff, badge(diff, 'Payment', '.dive-in-call-activity'), toNewTab());
        await pause(1000);
        await clickAway(payment, badge(payment, 'ChargeCustomer', '.handler-link'), mrLands(mr));
        await pause(2200);                                    // its handler's diff, in the same MR
        onScreen(null);
        await payment.bringToFront();
        await pause(300);
        onScreen(payment);
        await click(payment, element(payment, 'ManualReview'));
        await pause(600);
        const review = await clickAway(payment, badge(payment, 'ManualReview', '.dive-in-call-activity'), toNewTab());
        await pause(1500);
        await clickAway(review, review.locator('.differ-back-group button').first(), async () => {
            await pause(800);
            return payment;
        });
        await pause(600);
        await click(payment, payment.locator('.differ-back-caret'));
        await payment.locator('.differ-back-menu-item').nth(1).waitFor({ timeout: 30000 });
        await pause(2200);                                    // every diagram that calls Payment
        await payment.keyboard.press('Escape');
        await click(payment, element(payment, 'AssessRisk'));
        await pause(600);
        await clickAway(payment, badge(payment, 'AssessRisk', '.dive-in-call-activity'), toNewTab());
        await pause(2600);                                    // the decision, with the MR's changes
        await finishClip('diagrams', 800);
    },

    // Finding an element, and the viewport.
    async search() {
        const { diff } = await openDiff();
        onScreen(diff);
        await pause(800);
        await diff.keyboard.press('Control+f');
        await pause(500);
        await diff.keyboard.type('pay', { delay: 140 });
        await pause(1300);
        const next = diff.locator('.search-panel-button').nth(1);
        await click(diff, next);
        await pause(900);
        await click(diff, next);
        await pause(1000);
        await diff.keyboard.press('Escape');
        await glideTo(diff, element(diff, 'PaidGateway'));
        await diff.keyboard.down('Control');
        for (let i = 0; i < 4; i++) { await diff.mouse.wheel(0, -100); await pause(220); }
        await diff.keyboard.up('Control');
        await pause(1300);
        await click(diff, button(diff, 'Fit view'));
        await pause(1200);
        await finishClip('search', 800);
    },

    // Edit mode: add, change, retype, delete, colour, download.
    async edit() {
        const { diff } = await openDiff();
        const edit = await clickAway(diff, button(diff, 'Edit this diagram in a new tab'), toNewTab());
        spans = spans.filter(s => s.page === edit);           // the clip starts in the editor
        await pause(1000);
        const pad = action => edit.locator(`.djs-context-pad .entry[data-action="${action}"]`).first();
        await click(edit, element(edit, 'OrderCancelled'));
        await pause(400);
        await click(edit, pad('delete'));
        await pause(800);
        await click(edit, element(edit, 'CancelOrder'));
        await pause(400);
        await click(edit, pad('append.append-task'));
        await pause(500);
        await edit.keyboard.type('Refund the payment', { delay: 70 });
        await click(edit, element(edit, 'OrderDone'));       // commits the label
        await pause(1000);
        await click(edit, element(edit, 'NotifyCustomer'));
        await pause(400);
        await click(edit, pad('replace'));
        await pause(500);
        await click(edit, edit.locator('.djs-popup .entry[data-id="replace-with-send-task"]'));
        await pause(1200);
        const name = edit.locator('#bio-properties-panel-name');
        if (!await name.isVisible()) await click(edit, edit.locator('.bio-properties-panel-group-header', { hasText: 'General' }).first());
        await click(edit, name);
        await name.fill('E-mail the customer');
        await name.press('Tab');
        await pause(1200);
        await click(edit, button(edit, 'Colour the edits — on'));
        await pause(1300);
        await click(edit, button(edit, 'Colour the edits — off'));
        await pause(900);
        await click(edit, element(edit, 'Participant_CRM'));
        await pause(400);
        await click(edit, button(edit, 'Colour the selection orange'));
        await pause(1300);
        const download = edit.waitForEvent('download', { timeout: 15000 });
        await click(edit, button(edit, 'Download the edited .bpmn'));
        await (await download).saveAs(EDITED);
        await pause(1200);
        if (shotsWanted) {
            await edit.mouse.click(SIZE.width / 3, SIZE.height - 60);
            await pause(800);
            await shot(edit, '5-edit-mode.png');
        }
        await finishClip('edit', 800);
    },

    // The edited file against the branch it came from.
    async local() {
        if (!existsSync(EDITED)) throw new Error(`no ${EDITED}: record the edit clip first`);
        const blob = await openBlob(BRANCH, BPMN);
        onScreen(blob);
        await pause(800);
        await click(blob, blob.locator(`${BLOB_BUTTON}-caret`));
        await pause(700);
        const chooser = blob.waitForEvent('filechooser', { timeout: 10000 });
        await clickAway(blob, blob.locator(`${BLOB_BUTTON}-local`), async () => {
            const tab = context.waitForEvent('page', { timeout: 30000 });
            await (await chooser).setFiles(EDITED);
            const differ = await tab;
            await differReady(differ);
            return differ;
        });
        await pause(3200);                                    // only the edits are coloured
        await finishClip('local', 800);
    }
};

// --- screenshots for the store (1280×800) ---------------------------------------
const shotsWanted = !args.includes('--no-shots');
async function shot(page, name) {
    await page.mouse.move(-10, -10);
    await page.evaluate(() => document.getElementById('demo-cursor')?.remove());
    await pause(400);
    await page.screenshot({ path: join(OUT, 'screenshots', name) });
}
async function screenshots() {
    const { diff } = await openDiff();
    await diff.mouse.click(SIZE.width / 3, SIZE.height - 140);     // empty canvas: no selection
    await pause(800);
    await shot(diff, '../tile-source.png');
    await element(diff, 'ValidateOrder').click();
    await pause(1500);
    await shot(diff, '1-bpmn-diff.png');
    await element(diff, 'Flow_yes').click();
    await pause(1500);
    await shot(diff, '2-condition.png');
    await element(diff, 'Payment').click();
    await pause(800);
    await badge(diff, 'Payment', '.dive-in-call-activity').click();
    const payment = await toNewTab()();
    await payment.bringToFront();
    await payment.locator('.differ-back-caret').click();
    await payment.locator('.differ-back-menu-item').nth(1).waitFor({ timeout: 30000 });
    await pause(800);
    await shot(payment, '3-callers.png');
    await payment.keyboard.press('Escape');
    await element(payment, 'AssessRisk').click();
    await pause(800);
    await badge(payment, 'AssessRisk', '.dive-in-call-activity').click();
    const dmn = await toNewTab()();
    await dmn.bringToFront();
    for (let i = 0; i < 2; i++) await button(dmn, 'Zoom in').click();
    await pause(800);
    await shot(dmn, '4-dmn-diff.png');
    for (const page of context.pages()) await page.close();
    spans = [];
}

// --- run ------------------------------------------------------------------------
const wanted = option('--clip') ? option('--clip').split(',') : Object.keys(CLIPS);
try {
    const probe = await context.newPage();
    await probe.goto(PROJECT, { waitUntil: 'domcontentloaded' });
    const user = await signedInAs(probe);
    await probe.close();
    if (!user) throw new Error('the profile is signed out: navigation needs a session (capture-login.mjs)');
    console.log(`signed in as: ${user}`);
    for (const name of wanted) {
        if (!CLIPS[name]) throw new Error(`no clip "${name}"; clips: ${Object.keys(CLIPS).join(', ')}`);
        try {
            await CLIPS[name]();
        } catch (error) {
            // What every tab showed when the clip broke, to see where it stuck.
            for (const [i, page] of context.pages().entries()) {
                await page.screenshot({ path: join(OUT, `failed-${name}-${i}.png`) }).catch(() => {});
            }
            throw error;
        }
    }
    if (shotsWanted) await screenshots();
} finally {
    await restoreLayout();
    await context.close();
}
console.log(`wrote ${wanted.map(n => n + '.gif').join(', ')}${shotsWanted ? ' and screenshots/' : ''} in ${OUT}`);
