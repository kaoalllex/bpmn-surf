'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { GitHubChangesPayload, document } = createScope();

function page(payload) {
    const data = JSON.stringify({ payload });
    return `<react-app app-name="repo"><script type="application/json" data-target="react-app.embeddedData">${data}</script></react-app>`;
}

function parse(html) {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = html;
    return doc;
}

const CHANGES = { diffSummaries: [{ path: 'a.kt', changeType: 'MODIFIED' }], diffContents: [] };

describe('GitHubChangesPayload.read', () => {
    it('returns the changes and the pull request of the requested PR', () => {
        const doc = parse(page({
            pullRequestsChangesRoute: CHANGES,
            pullRequestsLayoutRoute: { pullRequest: { number: 7 } }
        }));
        const result = GitHubChangesPayload.read(doc, 7);
        assert.equal(result.changes.diffSummaries[0].path, 'a.kt');
        assert.equal(result.pull.number, 7);
        assert.ok(GitHubChangesPayload.read(doc, '7'));
    });

    it('ignores a payload that belongs to another pull request', () => {
        const doc = parse(page({
            pullRequestsChangesRoute: CHANGES,
            pullRequestsLayoutRoute: { pullRequest: { number: 8 } }
        }));
        assert.equal(GitHubChangesPayload.read(doc, 7), null);
    });

    it('ignores a Conversation-route payload left over from a soft navigation', () => {
        const doc = parse(page({
            pullRequestsConversationsRoute: {},
            pullRequestsLayoutRoute: { pullRequest: { number: 7 } }
        }));
        assert.equal(GitHubChangesPayload.read(doc, 7), null);
    });

    it('skips unparsable JSON', () => {
        const doc = parse('<react-app app-name="repo"><script type="application/json" data-target="react-app.embeddedData">{oops</script></react-app>');
        assert.equal(GitHubChangesPayload.read(doc, 7), null);
    });
});
