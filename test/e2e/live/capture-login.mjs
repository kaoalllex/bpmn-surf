// One-time: opens a real browser window on the harness profile and waits, on its
// own, until you are signed in to GitLab.
//
//   node test/e2e/live/capture-login.mjs
//
// Nothing to press: it polls /api/v4/user and exits once that answers as you, so
// it behaves the same when started in the background.
//
// Nothing is copied out. The login lives in the profile at
// ~/.config/bpmn-surf-browser-profile, which every script here reuses, and the
// session cookie rotates there the way a browser's does. An exported copy does
// not survive that rotation — it is invalidated server-side within minutes.
//
// ⚠️ Tick "Remember me". GitLab's `_gitlab_session` is a session cookie, which
// Chromium keeps in memory and drops when the browser closes — a profile logged
// in without it is signed out again by the time the next script runs. "Remember
// me" adds a persistent `remember_user_token`, which is what actually survives.
// This script checks afterwards, by reopening the closed profile, and refuses to
// report success if it did not stick.
//
// Treat the profile as the account itself. `rm -rf` it to sign out; the harness
// then runs anonymously, which is enough for everything except per-user
// preferences.
//
// "Show one file at a time" is a server-side account preference — set it here,
// in GitLab → Preferences → Behavior, or with diff-mode.mjs.
import { createProfileDir, PROFILE_DIR, signedInAs } from './support.mjs';
import { chromium } from '@playwright/test';

const deadline = Date.now() + 10 * 60 * 1000;
const context = await chromium.launchPersistentContext(createProfileDir(), {
    channel: 'chromium',
    headless: false
});
const page = context.pages()[0] || await context.newPage();

const already = await (async () => {
    await page.goto('https://gitlab.com/', { waitUntil: 'domcontentloaded' });
    return signedInAs(page);
})();

if (already) {
    console.log(`Already signed in as ${already} — nothing to do.`);
    await context.close();
    process.exit(0);
}

await page.goto('https://gitlab.com/users/sign_in');
console.log('\nA browser window is open — sign in to GitLab (2FA and all).');
console.log('>>> Tick "Remember me", or the login will not outlive the browser. <<<');
console.log('Nothing to press afterwards: this exits by itself once you are in.\n');

let username = null;
while (!username && Date.now() < deadline) {
    await page.waitForTimeout(2000);
    username = await signedInAs(page);
}

await context.close();

if (!username) {
    console.log('Gave up after 10 minutes — still signed out.');
    process.exit(1);
}

// Signing in is not the same as staying signed in: prove the closed profile
// still authenticates before calling this a success.
console.log(`Signed in as ${username}. Checking that it survives a restart...`);
const verify = await chromium.launchPersistentContext(PROFILE_DIR, { channel: 'chromium', headless: true });
const verifyPage = await verify.newPage();
await verifyPage.goto('https://gitlab.com/', { waitUntil: 'domcontentloaded' });
const stillIn = await signedInAs(verifyPage);
await verify.close();

if (!stillIn) {
    console.log('\nThe login did NOT survive closing the browser.');
    console.log('That means "Remember me" was not ticked: GitLab\'s session cookie lives');
    console.log('in memory only. Run this again and tick it.');
    process.exit(1);
}
console.log(`Still signed in as ${stillIn} after a restart. The profile at ${PROFILE_DIR} is ready.`);
