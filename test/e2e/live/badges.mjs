// Where does each navigation badge of a diagram lead, on the real platform search?
//
//   node test/e2e/live/badges.mjs [--mr <iid>] [--open <n>] <ref> <path> <elementId>[:<badge>] …
//
//   <badge>     handler (default) · listener · correlation · dive-in · callers;
//               `-:feedback` clicks the toolbar's 💬 instead and reads the GitHub
//               new-issue form it opens (title, body length, no diagram XML in it)
//   --mr <iid>  open the diagram from MR !<iid> (its "Schema diff" button, MR side
//               shown), so a handler changed in the MR gets its permanent badge;
//               <ref> is then ignored. Without it the blob view of <ref> is used.
//   --open <n>  for `callers`, also open the n-th caller (1-based) and report the
//               element it selects
//   --shots <dir>  save the fitted diagram before any selection as <dir>/<file>-fitted.png
//               (the permanent badges of an MR, and how crowded they get), then each
//               selected element with its badges, before any click, as
//               <dir>/<file>-<elementId>-<badge>.png — the look is judged there
//
// BPMN_SURF_PROJECT=https://github.com/<owner>/<repo> runs it on a GitHub blob view
// (signed in with capture-login.mjs --github); --mr is GitLab-only.
//
// Prints one line per badge: `<elementId> <badge> → <where it leads>` — the URL of
// the tab it opens, the URL the MR tab is sent to (a changed handler), the rows of
// the menu it opens (several correlation points, the callers list), the file a
// dive-in opens, or `no badge`. It asserts nothing: the catalog row holds the
// expected answer. Needs the signed-in profile (code search answers only a session).
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PROJECT, githubSignedInAs, launchWithExtension, openDiffer, signedInAs } from './support.mjs';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const mr = option('--mr');
const openCaller = option('--open');
const shots = option('--shots');
const positional = args.filter((a, i) => !a.startsWith('--') && !['--mr', '--open', '--shots'].includes(args[i - 1]));
const [ref, path, ...targets] = positional;
if (!path || targets.length === 0) {
    console.error('usage: badges.mjs [--mr <iid>] [--open <n>] [--shots <dir>] <ref> <path> <elementId>[:<badge>] …');
    process.exit(2);
}

const SELECTORS = {
    handler: '.handler-link:not(.handler-link-listener)',
    listener: '.handler-link-listener',
    correlation: '.correlation-link',
    'dive-in': '.dive-in-call-activity'
};

const github = new URL(PROJECT).hostname === 'github.com';
if (github && mr) {
    console.error('--mr is GitLab-only');
    process.exit(2);
}

const context = await launchWithExtension();
const { source, differ } = await openDiffer(context, { mr, ref, path });
const user = github ? await githubSignedInAs(source) : await signedInAs(source);
console.log(`${mr ? `MR !${mr}` : ref} ${path}  signed in: ${user || 'no'}`);
const fileName = basename(path).replace(/\.\w+$/, '');
if (shots) {
    mkdirSync(shots, { recursive: true });
    await differ.screenshot({ path: join(shots, `${fileName}-fitted.png`) });
}

const menuRows = (menu) => menu.locator('.differ-back-menu-item, .differ-back-menu-message, .differ-back-menu-link')
    .evaluateAll((rows) => rows.map((row) => row.textContent.replace(/\s+/g, ' ').trim()));

// Waits for whatever the click leads to: a new tab, the source tab sent elsewhere,
// or nothing (a menu opened in place).
async function landing(click) {
    const before = source.url();
    const newTab = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);
    await click();
    const tab = await newTab;
    if (tab) {
        // A differ tab stays on about:blank: its file path tells it apart from a tab still loading.
        await Promise.any([
            tab.waitForURL((url) => url.href !== 'about:blank', { timeout: 30000 }),
            tab.locator('a.differ-file-path').waitFor({ timeout: 30000 })
        ]).catch(() => {});
        return { tab, url: tab.url() };
    }
    if (source.url() !== before) {
        return { url: `MR tab → ${source.url()}` };
    }
    return null;
}

// The element and a margin around it, where its badges hang, clamped to the viewport.
async function shoot(element, name) {
    const box = await element.boundingBox();
    const view = differ.viewportSize();
    const x = Math.max(0, box.x - 250);
    const y = Math.max(0, box.y - 120);
    const clip = { x, y, width: Math.min(view.width, box.x + box.width + 250) - x, height: Math.min(view.height, box.y + box.height + 250) - y };
    await differ.screenshot({ path: join(shots, name), clip });
}

// null when the tab is not a differ: a dive-in that found nothing opens the code search.
async function differFileOf(tab) {
    const path = tab.locator('a.differ-file-path');
    if (!(await path.waitFor({ timeout: 60000 }).then(() => true, () => false))) {
        return null;
    }
    return path.getAttribute('title');
}

for (const target of targets) {
    const [id, kind = 'handler'] = target.split(':');
    if (kind === 'feedback') {
        const result = await landing(() => differ.getByTitle('Report a problem or send feedback').click());
        if (!result?.tab) {
            console.log(`feedback → ${result ? result.url : 'nothing opened'}`);
            continue;
        }
        const form = result.tab;
        await form.waitForLoadState('domcontentloaded');
        const title = await form.locator('input[name="issue[title]"], input[aria-label="Add a title"], #issue_title').first()
            .inputValue({ timeout: 30000 }).catch(() => null);
        const body = await form.locator('textarea[name="issue[body]"], textarea[aria-label="Markdown value"], #issue_body').first()
            .inputValue({ timeout: 30000 }).catch(() => null);
        console.log(`feedback → ${form.url().split('?')[0]}  title: ${title === null ? 'no field' : JSON.stringify(title)}` +
            `  body: ${body === null ? 'no field' : `${body.length} chars, xml: ${/<\?xml|<bpmn:|<definitions/.test(body)}`}`);
        await form.close();
        continue;
    }
    const element = differ.locator(`svg .djs-element[data-element-id="${id}"]`).first();
    if (!(await element.count())) {
        console.log(`${id} ${kind} → no such element`);
        continue;
    }
    await element.click({ force: true });
    await differ.waitForTimeout(800);
    if (shots) {
        await shoot(element, `${fileName}-${id}-${kind}.png`);
    }

    if (kind === 'callers') {
        await differ.locator('.differ-back-caret').click();
        const menu = differ.locator('.differ-back-menu');
        await menu.locator('.differ-back-menu-item, .differ-back-menu-message').first().waitFor({ timeout: 60000 });
        await differ.waitForFunction(() => !/Searching/.test(document.querySelector('.differ-back-menu')?.textContent || ''),
            null, { timeout: 60000 });
        console.log(`${id} callers → ${(await menuRows(menu)).join(' | ')}`);
        if (openCaller) {
            const result = await landing(() => menu.locator('.differ-back-menu-item').nth(Number(openCaller) - 1).click());
            if (result?.tab) {
                await result.tab.locator('svg .djs-element').first().waitFor({ timeout: 60000 });
                await result.tab.locator('svg .djs-element.selected').first().waitFor({ timeout: 10000 }).catch(() => {});
                const selected = await result.tab.locator('svg .djs-element.selected').evaluateAll((els) => els.map((e) => e.dataset.elementId));
                console.log(`  caller ${openCaller} → ${await differFileOf(result.tab)}, selected: ${selected.join(', ') || 'none'}`);
            } else {
                console.log(`  caller ${openCaller} → ${result ? result.url : 'nothing opened'}`);
            }
        }
        await differ.keyboard.press('Escape');
        continue;
    }

    const badges = differ.locator(`.djs-overlays[data-container-id="${id}"] ${SELECTORS[kind]}`);
    const count = await badges.count();
    if (count === 0) {
        console.log(`${id} ${kind} → no badge`);
        continue;
    }
    for (let i = 0; i < count; i++) {
        const badge = badges.nth(i);
        const label = `${id} ${kind}${count > 1 ? ` #${i + 1}` : ''}`;
        const change = (await badge.getAttribute('class')).match(/handler-link-(added|changed|removed)/)?.[1];
        const title = await badge.getAttribute('title');
        const result = await landing(() => badge.click());
        const differFile = result?.tab && kind === 'dive-in' ? await differFileOf(result.tab) : null;
        if (differFile) {
            console.log(`${label} [${title}] → differ of ${differFile}`);
            await result.tab.close();
        } else if (result) {
            console.log(`${label} ${change ? `(${change}) ` : ''}[${title}] → ${result.url}`);
            await result.tab?.close();
        } else {
            const menu = differ.locator(`.djs-overlays[data-container-id="${id}"] .correlation-menu`);
            const rows = (await menu.count()) ? await menuRows(menu) : [];
            console.log(`${label} [${title}] → ${rows.length ? `menu: ${rows.join(' | ')}` : 'nothing opened'}`);
            await differ.keyboard.press('Escape');
        }
        if (source.url().includes('/-/merge_requests/') && mr && !source.url().endsWith('/diffs')) {
            await source.goBack().catch(() => {});
        }
    }
}

await context.close();
