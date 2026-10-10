'use strict';

// The Claude Code PreToolUse hook that keeps commits and pushes off master
// (.claude/hooks/guard-master.js). Exit 2 blocks the Bash call, 0 lets it run.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'guard-master.js');

function makeRepo(root, branch) {
    const dir = path.join(root, branch.replace('/', '-'));
    execFileSync('git', ['init', '-q', '-b', branch, dir]);
    return dir;
}

function run(cwd, command) {
    const input = JSON.stringify({ cwd, tool_input: { command } });
    return spawnSync('node', [HOOK], { input, encoding: 'utf8' }).status;
}

describe('guard-master hook', () => {
    let root, master, feature;

    before(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-master-'));
        master = makeRepo(root, 'master');
        feature = makeRepo(root, 'feature/x');
    });

    after(() => fs.rmSync(root, { recursive: true, force: true }));

    it('blocks a commit on master', () => {
        assert.equal(run(master, 'git commit -m x'), 2);
        assert.equal(run(master, 'npm test && git add . && git commit -m x'), 2);
    });

    it('blocks a push from master or to master', () => {
        assert.equal(run(master, 'git push'), 2);
        assert.equal(run(feature, 'git push origin master'), 2);
        assert.equal(run(feature, 'git push origin HEAD:master'), 2);
    });

    it('lets a feature branch commit and push', () => {
        assert.equal(run(feature, 'git commit -m x'), 0);
        assert.equal(run(feature, 'git push -u origin feature/x'), 0);
    });

    it('lets read-only git run on master', () => {
        assert.equal(run(master, 'git status && git log --oneline -5'), 0);
        assert.equal(run(feature, 'git fetch origin master && git rebase origin/master'), 0);
    });

    it('ignores git mentioned inside text rather than invoked', () => {
        assert.equal(run(feature, 'echo "never git push to master" > notes.txt'), 0);
        assert.equal(run(master, 'grep -n "git commit" docs/git-workflow.md'), 0);
    });
});
