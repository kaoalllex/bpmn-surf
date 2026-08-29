#!/usr/bin/env node
'use strict';

// Mutation sweep (REFAC-0015). Plants small artificial bugs in the target source
// files one at a time and reports which ones the test suite fails to notice.
//
//   node scripts/mutation-sweep.js                     # the eight priority files
//   node scripts/mutation-sweep.js --files src/a.js    # a subset
//   node scripts/mutation-sweep.js --list              # generate only, run nothing
//   node scripts/mutation-sweep.js --resume            # continue an interrupted run
//
// A mutant is KILLED when some test goes red (the suite notices the bug) and
// SURVIVED when everything stays green (the bug is invisible). Score = killed/total.
// 100% is not the target: equivalent mutants change nothing observable and survive by
// definition — every survivor needs a human verdict.
//
// Three traps this script exists to encode, each of which cost an hour to find:
//
//  1. It runs in a COPY of the working tree, never in the repo. Mutating the repo in
//     place and restoring afterwards loses the user's work on any crash, and the
//     Playwright web server would serve half-mutated sources to a parallel session.
//  2. The copy serves e2e on its own port. differ-update-indicator.spec.js hardcodes
//     4173 as the harness origin, so the port is rewritten in `test/` as well as in
//     playwright.config.js — otherwise the copy fails its own baseline.
//  3. Every command is prefixed with `exec `. execSync's timeout kills the shell, not
//     a hung grandchild; some mutants hang `node --test` forever, and without `exec `
//     the run stalls on one mutant instead of timing it out.

const fs = require('node:fs');
const path = require('node:path');
const { execSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

// The files behind the priority invariants: view-mode read-only, cross-tab dedup,
// diff colouring, download paths. 289 of roughly 1200 mutable points in src/.
const DEFAULT_FILES = [
    'src/differ/bpmn/bpmn-differ.js',
    'src/differ/bpmn/diff-highlighter.js',
    'src/differ/bpmn/edit/edit-session.js',
    'src/differ/bpmn/edit/edit-color-resolver.js',
    'src/differ/dmn/dmn-diff-painter.js',
    'src/differ/shared/differ-params.js',
    'src/differ/shared/differ-tab-navigator.js',
    'src/differ/shared/diagram-versions.js'
];

const STAGE_TIMEOUT_MS = { unit: 60000, all: 180000, e2e: 300000 };

function parseArgs(argv) {
    const opts = { files: DEFAULT_FILES, out: 'mutation-sweep.jsonl', port: 4199, limit: 0, list: false, resume: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--list') opts.list = true;
        else if (arg === '--resume') opts.resume = true;
        else if (arg === '--files') opts.files = argv[++i].split(',');
        else if (arg === '--out') opts.out = argv[++i];
        else if (arg === '--port') opts.port = Number(argv[++i]);
        else if (arg === '--limit') opts.limit = Number(argv[++i]);
        else throw new Error(`unknown argument: ${arg}`);
    }
    return opts;
}

//--- mutant generation -------------------------------------------------------

// Character ranges of a line that are inside a string literal or a comment. Mutating
// there produces noise: a changed message, or nothing at all. Tracks quotes only
// within the line, which is what the source style uses (no multi-line template
// literals carrying code in these files).
function maskedRanges(line) {
    const ranges = [];
    let quote = null;
    let start = 0;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quote) {
            if (char === '\\') { i++; continue; }
            if (char === quote) { ranges.push([start, i]); quote = null; }
            continue;
        }
        if (char === '\'' || char === '"' || char === '`') { quote = char; start = i; continue; }
        if (char === '/' && (line[i + 1] === '/' || line[i + 1] === '*')) {
            ranges.push([i, line.length]);
            break;
        }
    }
    if (quote) ranges.push([start, line.length]);
    return ranges;
}

const isMasked = (ranges, at, len) =>
    ranges.some(([from, to]) => at >= from && at + len - 1 <= to);

const isCommentLine = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

// Replaces the condition of an `if (...)` with its negation. Needs paren matching:
// a regex cannot find the closing paren of `if (a && (b || c))`.
function negateIf(line) {
    const at = line.indexOf('if (');
    if (at < 0 || isMasked(maskedRanges(line), at, 4)) return null;
    let depth = 0;
    for (let i = at + 3; i < line.length; i++) {
        if (line[i] === '(') depth++;
        else if (line[i] === ')') {
            depth--;
            if (depth === 0) {
                const cond = line.slice(at + 4, i);
                if (!cond.trim()) return null;
                return line.slice(0, at) + `if (!(${cond}))` + line.slice(i + 1);
            }
        }
    }
    return null;
}

const OPERATORS = [
    ['===', '!=='], ['!==', '==='], ['&&', '||'], ['||', '&&'],
    ['>=', '<'], ['<=', '>'], ['return true', 'return false'], ['return false', 'return true']
];

function mutantsForFile(relPath) {
    const lines = fs.readFileSync(path.join(ROOT, relPath), 'utf8').split('\n');
    const mutants = [];
    const add = (index, mutated, operator) =>
        mutants.push({ file: relPath, line: index + 1, operator, before: lines[index], after: mutated });

    lines.forEach((line, index) => {
        if (isCommentLine(line)) return;
        const ranges = maskedRanges(line);

        for (const [from, to] of OPERATORS) {
            let at = line.indexOf(from);
            while (at >= 0) {
                // `===` contains `==`; the list has no such overlap, but a `!==` inside
                // an already-masked span still has to be skipped.
                if (!isMasked(ranges, at, from.length)) {
                    add(index, line.slice(0, at) + to + line.slice(at + from.length), `${from}->${to}`);
                }
                at = line.indexOf(from, at + from.length);
            }
        }

        const negated = negateIf(line);
        if (negated) add(index, negated, 'if->if!');

        // String literals: a renamed class, event name, or key is a real bug the suite
        // should notice. Skips log lines — the project logs through its own helper too,
        // so `console` alone does not catch them all; `warn`/`debug`/`error` do.
        if (!/console|logger|\bwarn\b|\bdebug\b/.test(line)) {
            const literal = /'([^'\\\n]{2,60})'/g;
            let match;
            while ((match = literal.exec(line)) !== null) {
                add(index, line.slice(0, match.index) + `'MUT${match[1]}'` + line.slice(literal.lastIndex),
                    'literal');
            }
        }
    });
    return mutants;
}

//--- the working copy --------------------------------------------------------

function prepareCopy(port) {
    const copy = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mutation-sweep-'));
    // .codegraph holds a unix socket that breaks rsync; node_modules is symlinked
    // rather than copied (900 MB, and nothing mutates it).
    execFileSync('rsync', ['-a',
        '--exclude', 'node_modules', '--exclude', '.git', '--exclude', '.codegraph',
        '--exclude', 'test-results', '--exclude', 'playwright-report',
        ROOT + '/', copy + '/']);
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(copy, 'node_modules'));

    for (const file of ['playwright.config.js', ...listFiles(path.join(copy, 'test'))]) {
        const full = path.isAbsolute(file) ? file : path.join(copy, file);
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes('4173')) fs.writeFileSync(full, text.split('4173').join(String(port)));
    }
    return copy;
}

function listFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full) : [full];
    });
}

//--- the funnel --------------------------------------------------------------

// Cheapest stage first; the first red stage wins and the rest is skipped. Green all
// the way through = the mutant SURVIVED.
function runStage(command, cwd, timeout) {
    try {
        // `exec ` so the timeout kills the process itself, not just the shell.
        execSync('exec ' + command, { cwd, timeout, stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

function stagesFor(relPath, port) {
    const stages = [];
    const mirror = 'test/' + relPath.replace(/^src\//, '').replace(/\.js$/, '.test.js');
    if (fs.existsSync(path.join(ROOT, mirror))) {
        stages.push(['unit', `node --test '${mirror}'`, STAGE_TIMEOUT_MS.unit]);
    }
    stages.push(['all', "node --test 'test/**/*.test.js'", STAGE_TIMEOUT_MS.all]);
    stages.push(['e2e', `npx playwright test -x --workers=12 --reporter=dot`, STAGE_TIMEOUT_MS.e2e]);
    return stages;
}

function applyMutant(copy, mutant) {
    const full = path.join(copy, mutant.file);
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    const original = lines[mutant.line - 1];
    lines[mutant.line - 1] = mutant.after;
    fs.writeFileSync(full, lines.join('\n'));
    return () => {
        const current = fs.readFileSync(full, 'utf8').split('\n');
        current[mutant.line - 1] = original;
        fs.writeFileSync(full, current.join('\n'));
    };
}

//--- main --------------------------------------------------------------------

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const mutants = opts.files.flatMap(mutantsForFile);

    if (opts.list) {
        for (const m of mutants) console.log(`${m.file}:${m.line}\t${m.operator}\t${m.after.trim()}`);
        console.log(`\n${mutants.length} mutants`);
        return;
    }

    const outPath = path.resolve(ROOT, opts.out);
    const done = new Set();
    if (opts.resume && fs.existsSync(outPath)) {
        for (const line of fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean)) {
            const record = JSON.parse(line);
            done.add(`${record.file}:${record.line}:${record.operator}`);
        }
        console.log(`resuming: ${done.size} verdicts already recorded`);
    } else if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
    }

    const copy = prepareCopy(opts.port);
    console.log(`working copy: ${copy}\nport: ${opts.port}\nmutants: ${mutants.length}`);

    // A red baseline makes every verdict meaningless — the suite would kill everything.
    process.stdout.write('baseline... ');
    for (const [name, command, timeout] of stagesFor(opts.files[0], opts.port)) {
        if (!runStage(command, copy, timeout)) {
            console.error(`\nbaseline FAILED at stage '${name}' — fix the copy before sweeping`);
            process.exit(1);
        }
    }
    console.log('green');

    const started = Date.now();
    let killed = 0;
    let survived = 0;
    let index = 0;

    for (const mutant of mutants) {
        const id = `${mutant.file}:${mutant.line}:${mutant.operator}`;
        if (done.has(id)) continue;
        if (opts.limit && index >= opts.limit) break;
        index++;

        const restore = applyMutant(copy, mutant);
        let verdict;
        let stage = null;
        if (!runStage(`node --check ${mutant.file}`, copy, STAGE_TIMEOUT_MS.unit)) {
            // A syntax error is not a mutant: no test could pass, so it says nothing
            // about the suite.
            verdict = 'invalid';
        } else {
            verdict = 'survived';
            for (const [name, command, timeout] of stagesFor(mutant.file, opts.port)) {
                if (!runStage(command, copy, timeout)) { verdict = 'killed'; stage = name; break; }
            }
        }
        restore();

        if (verdict === 'killed') killed++;
        else if (verdict === 'survived') survived++;
        fs.appendFileSync(outPath, JSON.stringify({ ...mutant, verdict, stage }) + '\n');

        const rate = (index / ((Date.now() - started) / 60000)).toFixed(1);
        process.stdout.write(
            `\r[${index}/${mutants.length}] killed ${killed} survived ${survived}  ${rate}/min   `);
    }

    const total = killed + survived;
    console.log(`\n\nscore: ${killed}/${total} = ${total ? Math.round(100 * killed / total) : 0}%`);
    console.log(`verdicts: ${outPath}`);
    console.log(`survivors:  grep '"survived"' ${opts.out}`);
    console.log(`\nthe working copy is left in place for inspection: rm -rf ${copy}`);
}

main();
