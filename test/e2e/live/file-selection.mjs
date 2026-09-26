// What does GitLab actually do when a file is picked in an MR?
//
//   node test/e2e/live/file-selection.mjs [mr-iid]
//
// Written to settle whether the selected file can be read from the URL. It
// cannot: the file-tree href carries `?file_path=<path>#<sha1(path)>`, but
// clicking it leaves location.search and location.hash untouched (REFAC-0016).
// Re-run it whenever GitLab's diff UI changes.
import { SANDBOX, launchWithExtension, signedInAs } from './support.mjs';

const mr = process.argv[2] || '2';
const context = await launchWithExtension();
const page = await context.newPage();

await page.goto(`${SANDBOX}/-/merge_requests/${mr}/diffs`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

// File-level entries only: their anchor is the file's sha1, line anchors are not.
const links = await page.$$eval('a[href*="file_path="]', els => els
    .map(e => ({ href: e.href, text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) }))
    .filter(l => /#[0-9a-f]{40}$/.test(l.href)));

console.log(`MR !${mr}  signed in: ${await signedInAs(page) || 'no'}  file entries: ${links.length}`);
for (const link of links) {
    console.log('  ', decodeURIComponent(link.href.split('?')[1] || ''));
}

for (const link of links) {
    await page.evaluate(href => {
        [...document.querySelectorAll('a')].find(a => a.href === href)?.click();
    }, link.href);
    await page.waitForTimeout(2500);
    const now = await page.evaluate(() => ({
        search: location.search,
        hash: location.hash,
        rendered: document.querySelectorAll('diff-file').length
    }));
    console.log(`clicked ${link.text}`);
    console.log(`   search=${JSON.stringify(decodeURIComponent(now.search))}` +
        ` hash=${JSON.stringify(now.hash)} rendered=${now.rendered}`);
}

await context.close();
