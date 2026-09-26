// Does the diff button appear for the right file, and does it stay put?
//
//   node test/e2e/live/mr-button.mjs [mr-iid] [--walk]
//
// Reports what the button says, which file it was built for, how often it is
// rebuilt, and how often its state flips — the blinking of BUG-0036 showed up
// here as a flip every couple of seconds.
//
// --walk additionally clicks every file in the MR and reports the button after
// each one. That is the check "Show one file at a time" needs: the button has to
// follow the selection, not linger from the file before (BUG-0036).
import { createHash } from 'node:crypto';
import { SANDBOX, collectExtensionLog, launchWithExtension, signedInAs } from './support.mjs';

const mr = process.argv.find(a => /^\d+$/.test(a)) || '2';
const walk = process.argv.includes('--walk');
const context = await launchWithExtension();
const page = await context.newPage();
const log = collectExtensionLog(page);

await page.goto(`${SANDBOX}/-/merge_requests/${mr}/diffs`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const snapshot = () => page.evaluate(() => {
    const files = [...document.querySelectorAll('diff-file')].map(e => {
        let path = null;
        try {
            const data = JSON.parse(e.getAttribute('data-file-data') || '{}');
            path = data.new_path || data.old_path;
        } catch { /* element without parseable data */ }
        return { id: e.id, path };
    });
    const container = document.querySelector('[id^="btn_"]');
    return {
        files,
        hash: location.hash,
        search: location.search,
        button: container
            ? { text: container.textContent.trim(), path: container.dataset.bpmnSurfFilePath || null }
            : null
    };
});

const first = await snapshot();
console.log(`MR !${mr}  signed in: ${await signedInAs(page) || 'no'}`);
console.log(`rendered diff-file elements: ${first.files.length}`);
for (const f of first.files) {
    const sha1 = f.path ? createHash('sha1').update(f.path).digest('hex') : null;
    console.log(`  id=${f.id} sha1(path)=${sha1} match=${f.id === sha1}  ${f.path}`);
}
console.log(`url: search=${JSON.stringify(first.search)} hash=${JSON.stringify(first.hash)}`);
console.log('button:', first.button);

if (walk) {
    const links = await page.$$eval('a[href*="file_path="]', els => els
        .map(e => ({ href: e.href, path: decodeURIComponent((e.href.split('file_path=')[1] || '').split('#')[0]) }))
        .filter(l => /#[0-9a-f]{40}$/.test(l.href)));
    // Twice round: the interesting transition is diagram -> non-diagram, and a
    // single pass ending on the diagram never exercises it (BUG-0036 was exactly
    // "the button does not go away").
    const route = [...links, ...links];
    console.log(`\n--- walking ${links.length} file(s), twice ---`);
    for (const link of route) {
        await page.evaluate(href => {
            [...document.querySelectorAll('a')].find(a => a.href === href)?.click();
        }, link.href);
        await page.waitForTimeout(3000);
        const after = await snapshot();
        const expected = /\.(bpmn|dmn)$/.test(link.path) ? link.path : null;
        const actual = after.button && after.button.path;
        const verdict = actual === expected ? 'OK' : `WRONG (expected ${expected})`;
        console.log(`  ${link.path}`);
        console.log(`    rendered=${after.files.length} button=${after.button ? after.button.text : 'none'}` +
            ` for=${actual || 'none'} -> ${verdict}`);
    }
    console.log('--- walk done ---\n');
}

let flips = 0;
let previous = JSON.stringify((await snapshot()).button);
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const now = JSON.stringify((await snapshot()).button);
    if (now !== previous) {
        flips++;
        previous = now;
        console.log(`  t=${(i + 1) * 0.5}s -> ${now}`);
    }
}
console.log(`button state changes over 10s: ${flips}`);
console.log(`button rebuilds: ${log.filter(l => l.includes('adding show diff button')).length}`);
console.log('--- extension log (last 10) ---');
console.log(log.slice(-10).join('\n'));

await context.close();
