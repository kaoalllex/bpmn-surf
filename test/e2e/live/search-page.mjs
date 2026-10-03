// The "search in the repository" fallback link: does GitLab still answer the URL
// GitLabPlatformClient#searchPageUrl builds?
//
//   node test/e2e/live/search-page.mjs [--shots <dir>]
//
// Every locator that gives up opens that page, so a format GitLab no longer
// serves turns each fallback into a 404 — which is how it broke once ([BUG-0038]).
// The URL comes from the real client, not a copy of its format.
//
// Picks, at run time, a file that exists on a branch with a slash in its name
// and not on the default branch, and searches its base name:
//   - at the slash branch → 200, the file is found (the ref reached the search);
//   - at the default branch → 200, the file is not there;
//   - without a ref → 200.
// Exits 1 when a check fails.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PROJECT, launchWithExtension, signedInAs } from './support.mjs';

const { GitLabPlatformClient } = createRequire(import.meta.url)('#scope').createScope();

const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
let failures = 0;
const fail = message => { failures++; console.log('  FAIL ' + message); };

const context = await launchWithExtension({ withExtension: false });
const page = await context.newPage();
await page.goto(PROJECT, { waitUntil: 'domcontentloaded' });
console.log('signed in as:', await signedInAs(page) || '(anonymous)');

const sample = await page.evaluate(async (projectPath) => {
    const api = path => fetch('/api/v4/' + path, { credentials: 'include' });
    const project = await (await api(`projects/${encodeURIComponent(projectPath)}`)).json();
    const base = `projects/${project.id}/repository`;
    const branches = await (await api(`${base}/branches?per_page=100`)).json();
    for (const branch of branches.filter(b => b.name.includes('/'))) {
        const compare = await (await api(
            `${base}/compare?from=${encodeURIComponent(project.default_branch)}&to=${encodeURIComponent(branch.name)}`
        )).json();
        for (const diff of compare.diffs || []) {
            const onDefault = await api(
                `${base}/files/${encodeURIComponent(diff.new_path)}?ref=${encodeURIComponent(project.default_branch)}`
            );
            if (diff.new_file && onDefault.status === 404) {
                return { projectId: project.id, defaultBranch: project.default_branch, branch: branch.name, path: diff.new_path };
            }
        }
    }
    return { projectId: project.id, defaultBranch: project.default_branch };
}, new URL(PROJECT).pathname.slice(1));

if (!sample.path) {
    console.log('  FAIL no branch with a slash adds a file absent from the default branch — create one through the API');
    await context.close();
    process.exit(1);
}
const term = sample.path.split('/').pop().replace(/\.[^.]+$/, '');
console.log(`term '${term}': ${sample.path} on '${sample.branch}', absent on '${sample.defaultBranch}'`);

const client = new GitLabPlatformClient({ projectUrl: PROJECT, hostUrl: new URL(PROJECT).origin, projectId: sample.projectId });
const cases = [
    { name: 'slash-ref', ref: sample.branch, expectHit: true },
    { name: 'default-ref', ref: sample.defaultBranch, expectHit: false },
    { name: 'no-ref', ref: null, expectHit: false }
];
for (const { name, ref, expectHit } of cases) {
    const url = client.searchPageUrl(term, ref);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    // The result list renders after the document; the path is either there by then or not at all.
    await page.locator(`text=${sample.path}`).first().waitFor({ timeout: 8000 }).catch(() => {});
    const hit = (await page.locator('body').innerText()).includes(sample.path);
    console.log(`${name}: ${response.status()} hit=${hit} ${url}`);
    if (response.status() !== 200) fail(`${name}: HTTP ${response.status()}`);
    else if (hit !== expectHit) fail(`${name}: ${expectHit ? 'file not found' : 'file found'} at ref ${ref}`);
    if (shotsDir) {
        mkdirSync(shotsDir, { recursive: true });
        await page.screenshot({ path: join(shotsDir, `search-${name}.png`) });
    }
}

await context.close();
console.log(failures ? `RESULT: ${failures} FAIL` : 'RESULT: OK');
process.exit(failures ? 1 : 0);
