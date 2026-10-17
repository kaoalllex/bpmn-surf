// The scripted part of the release smoke (live-check skill, "Release smoke") in one
// run, ending with a summary table:
//
//   node test/e2e/live/smoke.mjs [--only gitlab,branch,github] [--shots <dir>]
//
//   --only   run some groups: gitlab (MR buttons, "Show one file at a time" on, then
//            off), branch (blob view, decision-table layout, search fallback), github
//            (PR buttons signed in, then anonymous). Default: all three
//   --shots  header screenshots of every diagram block and the decision-table steps
//
// MRs and PRs are resolved by kind from the projects' public APIs at run time (never
// iids from memory). The MR and PR cells share one browser per group; the blob, layout
// and search scripts run as they are, one process each. The account's "Show one file
// at a time" is set for the run and restored at the end, even when a cell throws.
// A cell that times out is run once more; only a second timeout counts.
// What stays by hand: the badge rows (badges.mjs), Camunda 8, feedback, the private
// repository, Chrome's permission dialog — see the skill.
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { mrButton } from './mr-button.mjs';
import { GITHUB_PROJECT, prButton } from './pr-button.mjs';
import { PROJECT, launchWithExtension } from './support.mjs';

const args = process.argv.slice(2);
const value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const only = (value('--only') || 'gitlab,branch,github').split(',');
const shots = value('--shots');
const shotArgs = shots ? ['--shots', shots] : [];
const LIVE = new URL('.', import.meta.url).pathname;
const DIAGRAM = /\.(bpmn|dmn)$/;
const results = [];

// --- resolving the material by kind -----------------------------------------------

// files: [{ path, status: added | removed | renamed | changed }]
function kinds(changes) {
    const pick = (test) => changes.find(test) || null;
    const diagrams = c => c.files.filter(f => DIAGRAM.test(f.path));
    const has = (c, ext) => c.files.some(f => f.path.endsWith(ext));
    const firstDiagram = c => diagrams(c)[0]?.path;
    const withStatus = status => c => diagrams(c).some(f => f.status === status);
    const found = {
        bpmnCode: pick(c => has(c, '.bpmn') && c.files.some(f => !DIAGRAM.test(f.path))),
        bpmnDmn: pick(c => has(c, '.bpmn') && has(c, '.dmn')),
        dmn: pick(c => has(c, '.dmn') && !has(c, '.bpmn')),
        added: pick(withStatus('added')),
        removed: pick(withStatus('removed')),
        renamed: pick(withStatus('renamed')),
        subprocess: pick(c => /subprocess/i.test(c.title) && has(c, '.bpmn')),
        largeDmn: pick(c => /decision table/i.test(c.title) && has(c, '.dmn')),
        specialPath: pick(c => diagrams(c).some(f => /[ #]/.test(f.path))),
        codeOnly: pick(c => c.files.length && !diagrams(c).length),
        many: [...changes].sort((a, b) => b.files.length - a.files.length)[0] || null
    };
    for (const [kind, change] of Object.entries(found)) {
        if (change) {
            const status = kind === 'added' || kind === 'removed' || kind === 'renamed' ? kind : null;
            change.diagram = change.diagram || {};
            change.diagram[kind] = (status ? diagrams(change).find(f => f.status === status).path : null)
                || (kind === 'dmn' || kind === 'largeDmn' ? diagrams(change).find(f => f.path.endsWith('.dmn')).path : null)
                || (kind === 'specialPath' ? diagrams(change).find(f => /[ #]/.test(f.path)).path : null)
                || firstDiagram(change);
        }
    }
    return found;
}

async function json(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url}: HTTP ${response.status}`);
    }
    return response.json();
}

async function gitlabChanges() {
    const api = `https://gitlab.com/api/v4/projects/${encodeURIComponent(new URL(PROJECT).pathname.slice(1))}`;
    const mrs = await json(`${api}/merge_requests?state=opened&per_page=100`);
    return Promise.all(mrs.map(async mr => ({
        id: mr.iid,
        title: mr.title,
        sourceBranch: mr.source_branch,
        files: (await json(`${api}/merge_requests/${mr.iid}/diffs?per_page=100`)).map(d => ({
            path: d.new_path,
            status: d.new_file ? 'added' : d.deleted_file ? 'removed' : d.renamed_file ? 'renamed' : 'changed'
        }))
    })));
}

// gh's token when it is signed in (5000 requests an hour); the anonymous API (60) otherwise.
function githubApi(path) {
    try {
        return Promise.resolve(JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })));
    } catch {
        return json(`https://api.github.com/${path}`);
    }
}

async function githubChanges() {
    const repo = `repos/${new URL(GITHUB_PROJECT).pathname.slice(1)}`;
    const prs = await githubApi(`${repo}/pulls?state=all&per_page=100`);
    return Promise.all(prs.map(async pr => ({
        id: pr.number,
        title: pr.title,
        state: pr.merged_at ? 'merged' : pr.state,
        commits: pr.state === 'open' ? (await githubApi(`${repo}/pulls/${pr.number}/commits`)).map(c => c.sha) : [],
        files: (await githubApi(`${repo}/pulls/${pr.number}/files?per_page=100`)).map(f => ({
            path: f.filename,
            status: f.status === 'removed' ? 'removed' : f.status === 'added' ? 'added' : f.status === 'renamed' ? 'renamed' : 'changed'
        }))
    })));
}

// --- running cells -----------------------------------------------------------------

async function cell(group, label, run) {
    console.log(`\n=== ${group} · ${label}`);
    const t0 = Date.now();
    let outcome;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const failures = await run();
            outcome = failures ? `FAIL ${failures}` : 'OK';
            break;
        } catch (error) {
            outcome = `ERROR ${error.message.split('\n')[0].slice(0, 80)}`;
            console.log(`  ${outcome}`);
            if (!/timeout/i.test(error.message) || attempt === 2) break;
            console.log('  a timeout: once more');
        }
    }
    results.push({ group, label, outcome, seconds: ((Date.now() - t0) / 1000).toFixed(1) });
}

const missing = (group, kind) => results.push({ group, label: kind, outcome: 'SKIP no such MR/PR', seconds: '-' });

function script(group, name, scriptArgs) {
    return cell(group, `${name} ${scriptArgs.join(' ')}`, () => {
        const run = spawnSync('node', [join(LIVE, name), ...scriptArgs], { encoding: 'utf8' });
        console.log((run.stdout + run.stderr).trimEnd());
        if (/Timeout \d+ms exceeded/.test(run.stdout + run.stderr) && run.status) throw new Error('Timeout in ' + name);
        return run.status;
    });
}

function diffMode(setTo) {
    const out = spawnSync('node', [join(LIVE, 'diff-mode.mjs'), ...(setTo ? [setTo] : [])], { encoding: 'utf8' }).stdout;
    const value = [...out.matchAll(/(?:show one file at a time|now reads): (\w+)/g)].pop()?.[1];
    if (value !== 'true' && value !== 'false') {
        throw new Error(`diff-mode.mjs: ${out.trim() || 'no output'}`);
    }
    return value;
}

async function inBrowser(options, cells) {
    const context = await launchWithExtension(options);
    try {
        for (const run of cells) await run(context);
    } finally {
        await context.close();
    }
}

// The one-file cells open the diagram itself (--file): the MR's first file may be code.
const mrCell = (group, kind, mr, extra) => mr
    ? context => cell(group, `${kind} !${mr.id} ${extra.join(' ')}`, () => mrButton(context, [String(mr.id), ...extra, ...shotArgs]))
    : async () => missing(group, kind);

const prCell = (group, kind, pr, extra) => pr
    ? context => cell(group, `${kind} #${pr.id} ${extra.join(' ')}`, () => prButton(context, [String(pr.id), ...extra, ...shotArgs]))
    : async () => missing(group, kind);

if (only.includes('gitlab') || only.includes('branch')) {
    const mr = kinds(await gitlabChanges());
    if (only.includes('gitlab')) {
        const initial = diffMode();
        console.log(`"Show one file at a time" was ${initial}`);
        try {
            diffMode('on');
            const one = (kind, ...extra) => mrCell('gitlab one-file', kind, mr[kind], mr[kind] ? ['--file', mr[kind].diagram[kind], ...extra] : []);
            await inBrowser({}, [
                mrCell('gitlab one-file', 'bpmnCode', mr.bpmnCode, []),
                mrCell('gitlab one-file', 'bpmnCode', mr.bpmnCode, ['--legacy']),
                one('bpmnDmn', '--click'), one('bpmnDmn', '--click', '--legacy'), one('dmn', '--click'),
                one('added'), one('removed'), one('renamed'), one('subprocess', '--click'),
                mrCell('gitlab one-file', 'codeOnly', mr.codeOnly, [])
            ]);
            diffMode('off');
            const all = (kind, ...extra) => mrCell('gitlab all-files', kind, mr[kind], extra);
            await inBrowser({}, [
                all('bpmnCode'), all('bpmnCode', '--legacy'), all('bpmnDmn', '--click'),
                all('many', '--scroll'), all('many', '--scroll', '--legacy')
            ]);
        } finally {
            console.log(`\n"Show one file at a time" restored to ${initial}: now reads ${diffMode(initial === 'true' ? 'on' : 'off')}`);
        }
    }
    if (only.includes('branch')) {
        const tree = [];
        for (let page = 1; page <= 10; page++) {
            const batch = await json(`https://gitlab.com/api/v4/projects/${encodeURIComponent(new URL(PROJECT).pathname.slice(1))}/repository/tree?recursive=true&per_page=100&page=${page}`);
            tree.push(...batch);
            if (batch.length < 100) break;
        }
        const onMain = ext => tree.find(f => f.type === 'blob' && f.path.endsWith(ext))?.path;
        const slashed = [mr.bpmnCode, mr.bpmnDmn, mr.dmn].find(c => c && c.sourceBranch.includes('/'));
        for (const ext of ['.bpmn', '.dmn']) {
            if (onMain(ext)) await script('branch', 'branch-button.mjs', ['main', onMain(ext), ...shotArgs]);
            else missing('branch', `${ext} on main`);
        }
        if (slashed) await script('branch', 'branch-button.mjs', [slashed.sourceBranch, Object.values(slashed.diagram)[0], ...shotArgs]);
        else missing('branch', 'a diagram on a slashed branch');
        if (mr.largeDmn) await script('branch', 'dmn-layout.mjs', ['--mr', String(mr.largeDmn.id), ...shotArgs, 'x', mr.largeDmn.diagram.largeDmn]);
        else missing('branch', 'largeDmn');
        await script('branch', 'search-page.mjs', shotArgs);
    }
}

if (only.includes('github')) {
    const prs = await githubChanges();
    const open = prs.filter(p => p.state === 'open');
    const pr = kinds(open);
    const merged = prs.find(p => p.state === 'merged' && p.files.some(f => DIAGRAM.test(f.path)));
    const closed = prs.find(p => p.state === 'closed' && p.files.some(f => DIAGRAM.test(f.path)));
    // A PR of two commits or more whose last commit touches a diagram: the commit and range views.
    let ranged = null;
    for (const p of open.filter(p => p.commits.length > 1 && p.files.some(f => DIAGRAM.test(f.path)))) {
        const last = await githubApi(`repos/${new URL(GITHUB_PROJECT).pathname.slice(1)}/commits/${p.commits.at(-1)}`);
        if (last.files.some(f => DIAGRAM.test(f.filename))) { ranged = p; break; }
    }
    const ranges = ranged ? [ranged.commits.at(-1), `${ranged.commits.at(-2)}..${ranged.commits.at(-1)}`] : [];
    const signedIn = (kind, change, ...extra) => prCell('github signed in', kind, change, extra);
    await inBrowser({}, [
        signedIn('bpmnCode', pr.bpmnCode, '--click'), signedIn('dmn', pr.dmn, '--click'),
        signedIn('renamed', pr.renamed, '--click'), signedIn('specialPath', pr.specialPath, '--soft', '--click'),
        signedIn('narrow', pr.bpmnCode, '--width', '1150'), signedIn('many', pr.many, '--scroll'),
        signedIn('codeOnly', pr.codeOnly), signedIn('merged', merged, '--click'), signedIn('closed', closed),
        ...ranges.map(r => signedIn('range', ranged, '--range', r, '--click')),
        signedIn('external', { id: 852 }, '--project', 'https://github.com/bpmn-io/dmn-js', '--scroll')
    ]);
    const anonymous = (kind, change, ...extra) => prCell('github anonymous', kind, change, extra);
    await inBrowser({ anonymous: true }, [
        anonymous('bpmnCode', pr.bpmnCode, '--click'),
        ...ranges.map(r => anonymous('range', ranged, '--range', r, '--click'))
    ]);
}

console.log('\n=== summary');
const width = Math.max(...results.map(r => `${r.group} · ${r.label}`.length));
for (const r of results) console.log(`${`${r.group} · ${r.label}`.padEnd(width)}  ${r.seconds.padStart(5)} s  ${r.outcome}`);
const bad = results.filter(r => r.outcome !== 'OK');
console.log(bad.length ? `RESULT: ${bad.length} of ${results.length} cell(s) not OK` : `RESULT: OK (${results.length} cells)`);
process.exitCode = bad.length ? 1 : 0;
