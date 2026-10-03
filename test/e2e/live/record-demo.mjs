// Records the README GIF and the store/README screenshots from the demo project.
//
//   BPMN_SURF_PROJECT=https://gitlab.com/kao.alllex/bpmn-surf-demo \
//     node test/e2e/live/record-demo.mjs <iid> <outDir>
//
// <iid> is the showcase MR ("Express checkout and stricter payment risk"; resolve
// it by title, see README.md). Needs the signed-in profile (handler navigation
// uses code search), "Show one file at a time" on (the tour picks the file in the
// tree), and ffmpeg on PATH. Writes <outDir>/demo.gif (+ demo.mp4),
// <outDir>/screenshots/*.png at 1280×800, and <outDir>/tile-source.png (the
// diff with nothing selected, cropped into the store promo tile).
//
// Every tab records its own video, so the tour notes which tab is on screen and
// when; ffmpeg then cuts those spans out and joins them. Tab loading falls
// between spans and never reaches the GIF.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROJECT, launchWithExtension, signedInAs } from './support.mjs';

const [iid, outArg] = process.argv.slice(2);
if (!iid || !outArg || !process.env.BPMN_SURF_PROJECT) {
    console.error('usage: BPMN_SURF_PROJECT=<demo project URL> record-demo.mjs <iid> <outDir>');
    process.exit(2);
}
const OUT = resolve(outArg);
const SIZE = { width: 1280, height: 800 };
const BPMN = 'order-service/src/main/resources/bpmn/OrderMain.bpmn';
const DMN = 'order-service/src/main/resources/dmn/PaymentRisk.dmn';
rmSync(join(OUT, 'video'), { recursive: true, force: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const context = await launchWithExtension({ viewport: SIZE, recordVideo: { dir: join(OUT, 'video'), size: SIZE } });
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
const spans = [];
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
// A click that opens a tab: the tour lingers on the target, clicks, and cuts away
// as soon as the ripple shows. Chromium greys the opener out while the new tab
// attaches, and that must not reach the video. The tour resumes once the new
// tab has rendered.
async function clickToTab(page, locator, ready) {
    const opened = context.waitForEvent('page', { timeout: 30000 });
    await glideTo(page, locator);
    await pause(400);
    await page.mouse.down();
    await page.mouse.up();
    await pause(250);
    onScreen(null);
    const tab = await opened;
    await ready(tab);
    await cursor(tab);
    await pause(300);
    onScreen(tab);
    return tab;
}
const differReady = async tab => {
    await tab.locator('svg .djs-element, .tjs-table').first().waitFor({ timeout: 30000 });
    await pause(2500);
};
const element = (tab, id) => tab.locator(`svg .djs-element[data-element-id="${id}"] .djs-hit`).first();
const badge = (tab, id, cls) => tab.locator(`.djs-overlays[data-container-id="${id}"] ${cls}`).first();
// GitLab breaks file names in the tree with invisible direction marks, so the
// row is found in the page and tagged for the locator.
async function fileRow(page, path) {
    const name = path.split('/').pop();
    await page.waitForFunction(n => [...document.querySelectorAll('a.file-row')].some(a => {
        const found = a.textContent.replace(/[\u200e\u200f]/g, '').includes(n);
        if (found) a.dataset.demoRow = n;
        return found;
    }), name, { timeout: 20000 });
    return page.locator(`a.file-row[data-demo-row="${name}"]`).first();
}
const fileButton = (page, label) => page.locator('.bpmn-surf-file-btn button', { hasText: label }).first();

// --- the tour -----------------------------------------------------------------
let tour;
try {
    const mr = await context.newPage();
    for (const p of context.pages()) if (p !== mr) await p.close();
    await mr.goto(`${PROJECT}/-/merge_requests/${iid}/diffs`, { waitUntil: 'domcontentloaded' });
    await mr.waitForTimeout(9000);
    const user = await signedInAs(mr);
    if (!user) throw new Error('the profile is signed out: handler navigation needs a session (capture-login.mjs)');
    console.log(`signed in as: ${user}, page lang: ${await mr.evaluate(() => document.documentElement.lang)}`);
    await (await fileRow(mr, BPMN)).click();
    await fileButton(mr, 'Schema diff').waitFor({ timeout: 20000 });
    await pause(1500);
    await cursor(mr);
    onScreen(mr);
    await pause(1500);                                    // the XML diff GitLab shows
    await glideTo(mr, fileButton(mr, 'Schema diff'));
    await pause(400);

    const diff = await clickToTab(mr, fileButton(mr, 'Schema diff'), differReady);
    await pause(2200);                                    // the highlights
    await click(diff, element(diff, 'ValidateOrder'));
    await pause(2600);                                    // the highlighted property groups
    await click(diff, diff.getByRole('button', { name: 'Switch branch' }));
    await pause(2200);                                    // the original, "Check for fraud" removed
    await click(diff, diff.getByRole('button', { name: 'Switch branch' }));
    await pause(900);
    await click(diff, element(diff, 'Payment'));
    await pause(500);
    const payment = await clickToTab(diff, badge(diff, 'Payment', '.dive-in-call-activity'), differReady);
    await pause(1300);
    await click(payment, element(payment, 'ChargeCustomer'));
    await pause(700);
    const code = await clickToTab(payment, badge(payment, 'ChargeCustomer', '.handler-link'), async tab => {
        await tab.waitForLoadState('domcontentloaded');
        await tab.locator('.blob-content, .file-content, [data-testid="blob-content"]').first().waitFor({ timeout: 30000 });
        await pause(2500);
    });
    if (!code.url().includes('/-/blob/')) throw new Error(`the handler badge opened ${code.url()}, not the handler file`);
    await pause(2600);
    onScreen(null);
    tour = [...spans];

    // --- screenshots (not part of the video) ---------------------------------------------
    const shot = async (page, name) => {
        await page.mouse.move(-10, -10);
        await page.evaluate(() => document.getElementById('demo-cursor')?.remove());
        await pause(400);
        await page.screenshot({ path: join(OUT, 'screenshots', name) });
    };

    await diff.bringToFront();
    await diff.mouse.click(SIZE.width / 3, SIZE.height - 140);   // empty canvas: no selection
    await pause(1000);
    await shot(diff, '../tile-source.png');                     // the promo tile's diagram crop
    await element(diff, 'ValidateOrder').click();
    await pause(1500);
    await shot(diff, '1-bpmn-diff.png');

    const edit = await clickToTab(diff, diff.locator('button[title="Edit this diagram in a new tab"]'), differReady);
    await element(edit, 'NotifyCustomer').click();
    await pause(800);
    const name = edit.locator('#bio-properties-panel-name');
    if (!await name.isVisible()) await edit.locator('.bio-properties-panel-group-header', { hasText: 'General' }).first().click();
    await name.fill('E-mail the customer');
    await name.press('Tab');
    // One step out clears the palette's column; a click on empty canvas drops the
    // selection, and with it the context pad.
    await edit.locator('button[title="Zoom out"]').click();
    await pause(600);
    await edit.mouse.click(SIZE.width / 3, SIZE.height - 60);
    await pause(1200);
    await shot(edit, '4-edit-mode.png');

    await diff.bringToFront();
    await badge(diff, 'ReserveStock', '.bjs-drilldown').click();
    await pause(1000);
    await element(diff, 'NotifyWarehouse').click();
    await pause(800);
    // The subprocess is small: zoom in around it (Fit view never zooms past 1:1),
    // then drag it down to the middle of the canvas.
    await diff.mouse.move(480, 180);
    await diff.keyboard.down('Control');
    for (let i = 0; i < 2; i++) { await diff.mouse.wheel(0, -100); await pause(150); }
    await diff.keyboard.up('Control');
    await diff.mouse.move(480, 600);
    await diff.mouse.down();
    await diff.mouse.move(480, 760, { steps: 10 });
    await diff.mouse.up();
    await diff.evaluate(() => getSelection().removeAllRanges());   // the drag also selects page text
    await pause(1500);
    await shot(diff, '2-subprocess.png');

    await mr.bringToFront();
    await (await fileRow(mr, DMN)).click();
    await fileButton(mr, 'Decision diff').waitFor({ timeout: 20000 });
    await pause(1000);
    const dmn = await clickToTab(mr, fileButton(mr, 'Decision diff'), differReady);
    for (let i = 0; i < 2; i++) await dmn.locator('button[title="Zoom in"]').click();
    await pause(800);
    await shot(dmn, '3-dmn-diff.png');

    await mr.goto(`${PROJECT}/-/blob/main/order-service/src/main/resources/bpmn/Payment.bpmn`, { waitUntil: 'domcontentloaded' });
    await mr.waitForTimeout(8000);
    const view = await clickToTab(mr, mr.locator('#btn_77844bf3d4e842caa0d88194431197c0'), differReady);
    await element(view, 'AssessRisk').click();
    await pause(1200);
    await shot(view, '5-branch-view.png');
} finally {
    await restoreLayout();
    await context.close();
}

// --- video → GIF ------------------------------------------------------------------
const parts = [];
for (const [i, s] of tour.entries()) {
    const src = await s.page.video().path();
    const part = join(OUT, 'video', `part-${i}.mp4`);
    const ss = ((s.from - started.get(s.page)) / 1000).toFixed(2);
    const t = ((s.to - s.from) / 1000).toFixed(2);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-i', src, '-t', t, '-an',
        '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-crf', '18', part]);
    parts.push(part);
    console.log(`span ${i}: ${t}s from ${ss}s of ${src.split('/').pop()}`);
}
const list = join(OUT, 'video', 'parts.txt');
writeFileSync(list, parts.map(p => `file '${p}'`).join('\n'));
const mp4 = join(OUT, 'demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf',
    'fps=12,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    join(OUT, 'demo.gif')]);
console.log(`wrote ${join(OUT, 'demo.gif')}, ${join(OUT, 'demo.mp4')} and ${join(OUT, 'screenshots')}`);
