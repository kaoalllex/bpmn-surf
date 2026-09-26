// Reads — and, when asked, sets — GitLab's "Show one file at a time" preference.
//
//   node test/e2e/live/diff-mode.mjs            # report the current value
//   node test/e2e/live/diff-mode.mjs on|off     # change it
//
// The two diff modes lay out the page so differently that a bug in one says
// nothing about the other, and the preference is server-side per account — so
// testing both means changing an account setting. That is why setting it is an
// explicit argument and never a side effect of a check.
import { SANDBOX, hasProfile, launchWithExtension, signedInAs } from './support.mjs';

const wanted = process.argv[2];
if (wanted && !['on', 'off'].includes(wanted)) {
    console.error('usage: diff-mode.mjs [on|off]');
    process.exit(1);
}

if (!hasProfile()) {
    console.error('No signed-in profile — run capture-login.mjs first.');
    process.exit(1);
}

const context = await launchWithExtension({ withExtension: false });
const page = await context.newPage();
await page.goto(`${SANDBOX}/-/merge_requests`, { waitUntil: 'domcontentloaded' });

const username = await signedInAs(page);
if (!username) {
    console.error('The profile is signed out — run capture-login.mjs again.');
    await context.close();
    process.exit(1);
}
console.log('signed in as:', username);

const read = () => page.evaluate(async () => {
    const response = await fetch('/api/v4/user/preferences', { credentials: 'include' });
    return response.ok ? (await response.json()).view_diffs_file_by_file : `HTTP ${response.status}`;
});

console.log('show one file at a time:', await read());

if (wanted) {
    const result = await page.evaluate(async value => {
        // A session-authenticated write needs the page's CSRF token.
        const token = document.querySelector('meta[name="csrf-token"]')?.content;
        const response = await fetch('/api/v4/user/preferences', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token || '' },
            body: JSON.stringify({ view_diffs_file_by_file: value })
        });
        return response.ok ? 'ok' : `HTTP ${response.status}: ${(await response.text()).slice(0, 120)}`;
    }, wanted === 'on');
    console.log(`set to ${wanted}:`, result);
    console.log('now reads:', await read());
}

await context.close();
