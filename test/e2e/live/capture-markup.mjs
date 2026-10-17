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
// The same for GitHub's markup (test/content/providers/github/, test/fixtures/github/):
//
//   node test/e2e/live/capture-markup.mjs --github <number> <blob path> [<outDir>]
//
// Writes pr-changes-new-ui.html (PR #<number>'s Files changed in the new UI, signed
// in: the embedded payload without the diff lines, and every file block's header),
// pr-files-classic.html (the classic UI, anonymous: the PR header, the comparison
// loaders, every file header) and blob.html (the breadcrumbs and the Raw button group
// of <blob path> at the PR's head branch). Channel names and tokens in the payload are
// replaced with REDACTED. pr-changes-new-ui-stale.html is hand-made and not touched.
//
// A unit test that turns red after a re-capture means GitLab or GitHub changed its markup.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT, REPO_ROOT, launchWithExtension } from './support.mjs';

const github = process.argv.includes('--github');
const [mr, blobPath, outDir = join(REPO_ROOT, 'test', 'fixtures', github ? 'github' : 'gitlab')] = process.argv.slice(2).filter(a => a !== '--github');
const GITHUB_SANDBOX = 'https://github.com/kaoalllex/bpmn-surf-test';
// The fixtures are tracked: capture only the public sandbox, never a project whose
// paths and names must not land in the repository.
if (!github && PROJECT !== 'https://gitlab.com/kao.alllex/bpmn-surf-test') {
    console.error(`capture-markup.mjs captures the sandbox only, not ${PROJECT}`);
    process.exit(2);
}
if (!/^\d+$/.test(mr || '') || !blobPath) {
    console.error('usage: capture-markup.mjs [--github] <iid|number> <blob path> [<outDir>]');
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

// Runs in the page: GitHub's markup, trimmed to what GitHubDomScraper reads.
function githubTrimmed(ui) {
    const empty = (copy) => {
        copy.querySelectorAll('script, style, template').forEach((n) => n.remove());
        copy.querySelectorAll('svg').forEach((svg) => { svg.innerHTML = ''; });
        return copy.outerHTML;
    };
    if (ui === 'blob') {
        const raw = document.querySelector('a[data-testid="raw-button"]');
        return [document.querySelector('a[data-testid="breadcrumbs-repo-link"]'), raw && raw.closest('[data-component="ButtonGroup"]')]
            .filter(Boolean).map((e) => empty(e.cloneNode(true)));
    }
    if (ui === 'classic') {
        // The comparison loaders only by their attributes: their bodies are diffs.
        const loaders = [...document.querySelectorAll('[src*="sha2="], [data-url*="sha2="]')].map((e) => e.cloneNode(false).outerHTML);
        return [
            ...[...document.querySelectorAll('bdi.js-issue-title, span.commit-ref[title]')].map((e) => empty(e.cloneNode(true))),
            ...loaders,
            ...[...document.querySelectorAll('div.file-header[data-path]')].map((e) => empty(e.cloneNode(true)))
        ];
    }
    const secret = /channel|token|csrf|nonce/i;
    const scrub = (value, key = '') => {
        if (Array.isArray(value)) return value.map((v) => scrub(v));
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value)
                .filter(([k]) => k !== 'diffLines' && k !== 'html')
                .map(([k, v]) => [k, scrub(v, k)]));
        }
        return typeof value === 'string' && secret.test(key) ? 'REDACTED' : value;
    };
    const app = document.querySelector('react-app[app-name="repo"]');
    const data = app.querySelector('script[data-target="react-app.embeddedData"]');
    const payload = `<react-app app-name="repo"><script type="application/json" data-target="react-app.embeddedData">${
        JSON.stringify(scrub(JSON.parse(data.textContent))).replace(/</g, '\\u003c')}</script></react-app>`;
    const blocks = [...document.querySelectorAll('div[id^="diff-"]')].filter((b) => /^diff-[0-9a-f]{64}$/.test(b.id)).map((b) => {
        const header = b.querySelector('[data-diff-header-wrapper]');
        return `<div id="${b.id}">${header ? empty(header.cloneNode(true)) : ''}</div>`;
    });
    return [payload, ...blocks];
}

if (github) {
    const day = new Date().toISOString().slice(0, 10);
    const write = (file, url, note, parts) => {
        writeFileSync(join(outDir, file), `<!DOCTYPE html>\n<!-- Source: ${url} | captured ${day} by capture-markup.mjs | ${note} -->\n<html><body>\n${parts.join('\n')}\n</body></html>\n`);
        console.log(`${file}: ${parts.length} element(s), ${parts.join('').length} chars`);
    };
    const open = async (context, url, selector) => {
        const page = await context.newPage();
        await page.setViewportSize({ width: 1500, height: 1000 });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(selector, { state: 'attached', timeout: 30000 });
        await page.waitForTimeout(3000);
        return page;
    };
    const pull = `${GITHUB_SANDBOX}/pull/${mr}`;
    const signedIn = await launchWithExtension({ withExtension: false });
    let page = await open(signedIn, `${pull}/changes`, '[data-diff-header-wrapper]');
    write('pr-changes-new-ui.html', `${pull}/changes`, 'trimmed: embedded payload without diffLines/html, file block headers only; channels and tokens REDACTED',
        await page.evaluate(githubTrimmed, 'new'));
    const head = await page.evaluate(() => [...document.querySelectorAll('react-app script[data-target="react-app.embeddedData"]')]
        .map((s) => { try { return JSON.parse(s.textContent).payload.pullRequestsLayoutRoute.pullRequest.headBranch; } catch { return null; } })
        .find(Boolean));
    const blobUrl = `${GITHUB_SANDBOX}/blob/${head}/${blobPath}`;
    page = await open(signedIn, blobUrl, 'a[data-testid="raw-button"]');
    write('blob.html', blobUrl, 'trimmed: the breadcrumbs repo link and the Raw button group', await page.evaluate(githubTrimmed, 'blob'));
    await signedIn.close();
    const anonymous = await launchWithExtension({ withExtension: false, anonymous: true });
    page = await open(anonymous, `${pull}/files`, 'div.file-header[data-path]');
    write('pr-files-classic.html', `${pull}/files (anonymous)`, 'trimmed: PR title and refs, comparison loaders (attributes only), file headers',
        await page.evaluate(githubTrimmed, 'classic'));
    await anonymous.close();
    process.exit(0);
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
