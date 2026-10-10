'use strict';

// The Claude Code PreToolUse hook that keeps shell writes out of libs/
// (.claude/hooks/guard-libs.js). Exit 2 blocks the Bash call, 0 lets it run.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'guard-libs.js');

function run(command) {
    const input = JSON.stringify({ tool_input: { command } });
    return spawnSync('node', [HOOK], { input, encoding: 'utf8' }).status;
}

describe('guard-libs hook', () => {
    it('blocks shell writes into libs/', () => {
        assert.equal(run("sed -i '' 's/a/b/' libs/bpmn-js/x.js"), 2);
        assert.equal(run('echo x > ./libs/y.js'), 2);
        assert.equal(run('cp /tmp/x.js libs/dmn-js/'), 2);
        assert.equal(run('rm libs/x.js && npm test'), 2);
        assert.equal(run("python3 -c \"open('libs/x.js','w').write('')\""), 2);
        assert.equal(run("node -e \"fs.writeFileSync('libs/x.js', '')\""), 2);
    });

    it('lets reads and the sync script through', () => {
        assert.equal(run('cat libs/bpmn-js/x.js'), 0);
        assert.equal(run('grep -n foo libs/dmn-js/x.js > /tmp/out'), 0);
        assert.equal(run("sed -n '1,5p' libs/x.js"), 0);
        assert.equal(run('npm run sync:libs'), 0);
        assert.equal(run("sed -i '' 's/a/b/' src/differ/x.js"), 0);
        assert.equal(run('cp src/x.js src/mylibs/y.js'), 0);
        assert.equal(run('cp libs/a.js /tmp/'), 0);
        assert.equal(run('cp node_modules/foo/libs/a.js /tmp/'), 0);
        assert.equal(run('git commit -m "touch libs/ fix"'), 0);
    });
});
