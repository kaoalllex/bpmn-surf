// The branch (blob) view button: placement, split-button menu, and both flows.
//
//   node test/e2e/live/branch-button.mjs <ref> <path> [--shots <dir>]
//
// Checks: the container stands beside GitLab's button groups (not inside the
// viewer switcher); the main button opens the differ; the caret opens a menu
// that closes on Escape; "Diff with local file…" takes a file and opens the differ.
// Exits 1 when a check fails.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SANDBOX, launchWithExtension } from './support.mjs';

const [ref, path] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!ref || !path) {
    console.error('usage: branch-button.mjs <ref> <path> [--shots <dir>]');
    process.exit(2);
}
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const ID = 'btn_77844bf3d4e842caa0d88194431197c0';
let failures = 0;
const fail = message => { failures++; console.log('  FAIL ' + message); };

const context = await launchWithExtension();
const page = await context.newPage();
await page.setViewportSize({ width: 1500, height: 1000 });
await page.goto(`${SANDBOX}/-/blob/${ref}/${path}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const placement = await page.evaluate(id => {
    const c = document.getElementById(id);
    return c && {
        parentIsActions: c.parentElement.classList.contains('file-actions'),
        insideSwitcher: !!c.closest('.js-blob-viewer-switcher'),
        text: document.getElementById(id + '-btn')?.textContent.trim()
    };
}, ID);
console.log('button:', placement);
if (!placement) fail('no branch button');
else {
    if (!placement.parentIsActions || placement.insideSwitcher) fail('container is not a direct child of .file-actions');
    const expected = path.endsWith('.dmn') ? 'View decision' : 'View schema';
    if (placement.text !== expected) fail(`main button says "${placement.text}", expected "${expected}"`);
}

await page.click(`#${ID}-caret`);
if (await page.isHidden(`#${ID}-menu`)) fail('caret did not open the menu');
if (shotsDir) {
    mkdirSync(shotsDir, { recursive: true });
    await page.screenshot({ path: join(shotsDir, 'branch-menu-open.png'), clip: await page.locator('#fileHolder .js-file-title').boundingBox().then(b => ({ ...b, height: b.height + 60 })) });
}
await page.keyboard.press('Escape');
if (!(await page.isHidden(`#${ID}-menu`))) fail('Escape did not close the menu');

let tab = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
await page.click(`#${ID}-btn`);
if (!(await tab)) fail('main button: no differ tab'); else console.log('main button: differ tab opened');

const local = join(mkdtempSync(join(tmpdir(), 'bpmn-surf-local-')), path.split('/').pop());
writeFileSync(local, await page.evaluate(async u => (await fetch(u)).text(), `${SANDBOX}/-/raw/${ref}/${path}`));
await page.click(`#${ID}-caret`);
const chooser = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
await page.click(`#${ID}-local`);
const picker = await chooser;
if (!picker) fail('menu item: no file chooser');
else {
    tab = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
    await picker.setFiles(local);
    if (!(await tab)) fail('local diff: no differ tab'); else console.log('local diff: differ tab opened');
}

console.log(failures ? `RESULT: ${failures} failure(s)` : 'RESULT: OK');
await context.close();
process.exit(failures ? 1 : 0);
