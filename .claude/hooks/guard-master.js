#!/usr/bin/env node
'use strict';

// PreToolUse(Bash) guard: master is protected (docs/git-workflow.md), so a
// `git commit` while on master, or a `git push` while on master or naming
// master as the target, is blocked (exit 2 feeds the reason back to Claude).

const { execFileSync } = require('node:child_process');

let raw = '';
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
    const input = JSON.parse(raw || '{}');
    const command = (input.tool_input && input.tool_input.command) || '';
    // Only git in command position (line start or after ; & | ( ), so a commit
    // message or heredoc that merely mentions "git push … master" passes.
    const invocation = sub => new RegExp(`(?:^|[;&|(])\\s*git\\s+(?:-C\\s+\\S+\\s+)?${sub}\\b([^;&|\\n]*)`, 'gm');
    const commits = invocation('commit').test(command);
    const pushArgs = [...command.matchAll(invocation('push'))].map(m => m[1]);
    const pushes = pushArgs.length > 0;
    if (!commits && !pushes) process.exit(0);

    let branch = '';
    try {
        branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
            cwd: input.cwd || process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch {
        process.exit(0);
    }

    const pushesToMaster = pushArgs.some(args => /(?:^|[\s:])master\b/.test(args));
    if (branch === 'master' || pushesToMaster) {
        process.stderr.write('Blocked: master is protected — create a feature/fix branch and land the change through a PR (docs/git-workflow.md).\n');
        process.exit(2);
    }
});
