'use strict';

// GitHub's React "Files changed" page (/pull/N/changes, the signed-in default)
// embeds the whole comparison as JSON (REFAC-0004). Read by the content
// provider (refs, renames) and by the differ (changed files for handler badges).
// After a soft navigation the embedded JSON can belong to another route or PR,
// so callers pass the PR number and re-fetch the page when this returns null.
const GitHubChangesPayload = {
    read(doc, number) {
        const scripts = doc.querySelectorAll('react-app[app-name="repo"] script[data-target="react-app.embeddedData"]');
        for (const script of scripts) {
            let data;
            try {
                data = JSON.parse(script.textContent);
            } catch (e) {
                continue;
            }
            const payload = data && data.payload;
            const changes = payload && payload.pullRequestsChangesRoute;
            const pull = payload && payload.pullRequestsLayoutRoute && payload.pullRequestsLayoutRoute.pullRequest;
            if (changes && pull && String(pull.number) === String(number)) {
                return { changes, pull };
            }
        }
        return null;
    }
};
