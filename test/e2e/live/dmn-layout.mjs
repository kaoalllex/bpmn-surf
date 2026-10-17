// Does a decision table keep the window's width at every zoom on the real page?
//
//   node test/e2e/live/dmn-layout.mjs [--mr <iid>] [--shots <dir>] <ref> <path>
//
//   --mr <iid>     open the table from MR !<iid> ("Decision diff" button); <ref> is
//                  then ignored. Without it the blob view of <ref> is used.
//   --shots <dir>  save each step as <dir>/dmn-<width>-<step>.png
//
// In two windows (1200×700 and 1500×1000) it opens the table and walks: fitted,
// four "Zoom in", eight "Zoom out", "Show full". Each step prints the zoom, the
// table's width against the window and the scroll state, and asserts the layout
// of the 1.4.0 fixes (differ-dmn.md): the table spans the window and never past
// it, the page itself never scrolls sideways, the rows scroll inside the window,
// and "Show full" leaves nothing to scroll unless it stopped at the minimum zoom.
// The Layer-2 twin is dmn-zoom.spec.js; this is the same walk on gitlab.com's page.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchWithExtension, openDiffer } from './support.mjs';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const mr = option('--mr');
const shots = option('--shots');
const [ref, path] = args.filter((a, i) => !a.startsWith('--') && !['--mr', '--shots'].includes(args[i - 1]));
if (!path) {
    console.error('usage: dmn-layout.mjs [--mr <iid>] [--shots <dir>] <ref> <path>');
    process.exit(2);
}
if (shots) {
    mkdirSync(shots, { recursive: true });
}

const MIN_ZOOM = 10; // DmnTableViewport.MIN_ZOOM
const failures = [];
const context = await launchWithExtension();

for (const [width, height] of [[1200, 700], [1500, 1000]]) {
    const { source, differ } = await openDiffer(context, { mr, ref, path, width, height });
    const layout = () => differ.evaluate(() => {
        const scroller = document.querySelector('.tjs-table-container');
        const table = scroller.querySelector('.tjs-table').getBoundingClientRect();
        return {
            zoom: parseFloat(scroller.style.zoom),
            tableWidth: Math.round(table.width),
            tableRight: Math.round(table.right),
            scrollerBottom: Math.round(scroller.getBoundingClientRect().bottom),
            rowsScroll: scroller.scrollHeight > scroller.clientHeight,
            tableScrollsSideways: scroller.scrollWidth > scroller.clientWidth,
            pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth
        };
    });
    const step = async (name, action) => {
        await action();
        await differ.waitForTimeout(600);
        const l = await layout();
        console.log(`${width}x${height} ${name.padEnd(9)} zoom=${l.zoom}%  table=${l.tableWidth}px of ${width}`
            + `  rows scroll: ${l.rowsScroll}  sideways: ${l.tableScrollsSideways || l.pageScrollsSideways}`);
        const fail = (what) => failures.push(`FAIL ${width}x${height} ${name}: ${what}`);
        if (l.tableRight > width || l.tableWidth < width * 0.95) {
            fail(`the table does not span the window (${l.tableWidth}px, right edge ${l.tableRight})`);
        }
        if (l.pageScrollsSideways || l.tableScrollsSideways) {
            fail('scrolls sideways');
        }
        if (l.scrollerBottom > height) {
            fail(`the rows run past the window (${l.scrollerBottom} > ${height})`);
        }
        if (name === 'show-full' && l.rowsScroll && l.zoom > MIN_ZOOM) {
            fail(`Show full left rows to scroll at ${l.zoom}%`);
        }
        if (shots) {
            await differ.screenshot({ path: join(shots, `dmn-${width}-${name}.png`) });
        }
    };
    const click = (title, times) => async () => {
        for (let i = 0; i < times; i++) {
            await differ.getByTitle(title).first().click();
        }
    };
    await step('fitted', async () => {});
    await step('zoom-in', click('Zoom in', 4));
    await step('zoom-out', click('Zoom out', 8));
    await step('show-full', () => differ.getByRole('button', { name: 'Show full' }).first().click());
    await differ.close();
    await source.close();
}

await context.close();
console.log(failures.length ? failures.join('\n') : 'RESULT: OK');
process.exitCode = failures.length ? 1 : 0;
