// Captures GitLab's own markup of the places the extension decorates, for the
// unit tests in test/content/providers/gitlab/ (test/fixtures/gitlab/):
//
//   node test/e2e/live/capture-markup.mjs <iid> <blob path> [<outDir>]
//
// Writes mr-rapid.html and mr-legacy.html (every file block of MR !<iid> in the
// rapid and the legacy diffs UI) and blob.html (the header of <blob path> on the
// default branch). Runs without the extension, so nothing of ours is in the markup,
// on the signed-in profile (gitlab.com puts an anonymous headless browser behind a
// bot check), with "Show one file at a time" off (diff-mode.mjs) so every block
// renders. The diff bodies, scripts, styles and SVG paths are dropped to keep the
// fixtures small; the headers are kept as GitLab serves them.
//
// A unit test that turns red after a re-capture means GitLab changed its markup.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT, REPO_ROOT, launchWithExtension } from './support.mjs';

const [mr, blobPath, outDir = join(REPO_ROOT, 'test', 'fixtures', 'gitlab')] = process.argv.slice(2);
// The fixtures are tracked: capture only the public sandbox, never a project whose
// paths and names must not land in the repository.
if (PROJECT !== 'https://gitlab.com/kao.alllex/bpmn-surf-test') {
    console.error(`capture-markup.mjs captures the sandbox only, not ${PROJECT}`);
    process.exit(2);
}
if (!/^\d+$/.test(mr || '') || !blobPath) {
    console.error('usage: capture-markup.mjs <iid> <blob path> [<outDir>]');
    process.exit(2);
}
mkdirSync(outDir, { recursive: true });

// Runs in the page: a trimmed copy of each matched element.
function trimmed({ selector, dropSelector }) {
    return [...document.querySelectorAll(selector)].map((element) => {
        const copy = element.cloneNode(true);
        copy.querySelectorAll(`script, style, template, table, ${dropSelector}`).forEach((n) => n.remove());
        copy.querySelectorAll('svg').forEach((svg) => { svg.innerHTML = ''; });
        return copy.outerHTML;
    });
}

const context = await launchWithExtension({ withExtension: false });
const page = await context.newPage();
await page.setViewportSize({ width: 1500, height: 1000 });

const capture = async (url, selector, dropSelector, file) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(selector, { state: 'attached', timeout: 30000 });
    await page.waitForTimeout(3000);
    const parts = await page.evaluate(trimmed, { selector, dropSelector });
    writeFileSync(join(outDir, file), `<!-- ${url} -->\n${parts.join('\n')}\n`);
    console.log(`${file}: ${parts.length} element(s), ${parts.join('').length} chars`);
};

const diffs = `${PROJECT}/-/merge_requests/${mr}/diffs`;
await capture(diffs, 'diff-file', '.rd-diff-file-body, [data-file-body]', 'mr-rapid.html');
await capture(`${diffs}?rapid_diffs_disabled=true`, '.diff-file.file-holder[data-path]', '.diff-content', 'mr-legacy.html');
await capture(`${PROJECT}/-/blob/main/${blobPath}`, '#fileHolder > .js-file-title', '.nonexistent', 'blob.html');
await context.close();
