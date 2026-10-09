// Renders every popup screen and reports layout problems.
//
//   node test/e2e/live/popup-screens.mjs [out-dir]
//
// The odd one out in this directory: it needs no network and no GitLab account,
// only a stubbed chrome.* so popup.js can run from file://. A Chrome popup window
// scrolls past roughly 600px, so the height column is the thing to watch. Then
// the site warnings: none granted, the gitlab.com notice, gitlab.com + github.com.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { REPO_ROOT } from './support.mjs';

const outDir = process.argv[2] || mkdtempSync(join(tmpdir(), 'popup-'));

function stubChromeApis() {
    let stored = {
        settings: { handlerAnnotations: { topic: ['ExternalTaskSubscription'], className: [] } }
    };
    // Both are changed between checks below, then the popup re-renders.
    window.grantedOrigins = ['https://gitlab.acme.io/*'];
    window.localStore = {};
    window.chrome = {
        runtime: {
            getManifest: () => ({ version: '0.0.0' })
        },
        permissions: {
            getAll: async () => ({ origins: window.grantedOrigins }),
            request: async () => { window.permissionRequests = (window.permissionRequests || 0) + 1; return true; },
            remove: async () => true
        },
        storage: {
            sync: {
                get: async key => ({ [key]: stored[key] }),
                set: async obj => Object.assign(stored, obj)
            },
            local: {
                get: async key => ({ [key]: window.localStore[key] }),
                set: async obj => Object.assign(window.localStore, obj),
                remove: async key => { delete window.localStore[key]; }
            }
        }
    };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 380, height: 700 } });
const problems = [];
page.on('pageerror', e => problems.push(String(e)));
page.on('console', m => m.type() === 'error' && problems.push(m.text()));
await page.addInitScript(stubChromeApis);
await page.goto(`file://${REPO_ROOT}/src/popup/popup.html`);
await page.waitForTimeout(300);

for (const [name, open] of [['home', null], ['sites', 'sites'], ['annotations', 'annotations'], ['file', 'file']]) {
    if (open) {
        await page.click(`[data-open="${open}"]`);
    }
    await page.waitForTimeout(150);
    const box = await page.evaluate(() => ({
        height: document.body.scrollHeight,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }));
    console.log(`${name.padEnd(12)} height=${box.height}px  horizontal-overflow=${box.overflowX}`);
    await page.screenshot({ path: join(outDir, `popup-${name}.png`), fullPage: true });
    if (open) {
        await page.click('#backBtn');
    }
}

const WARNINGS = ['noSitesWarning', 'noSitesHomeWarning', 'gitlabComNotice'];

async function rerender(origins, localStore) {
    await page.evaluate(([o, l]) => {
        window.grantedOrigins = o;
        window.localStore = l;
        return renderSites();
    }, [origins, localStore]);
}

function warningFlags() {
    return page.evaluate(ids => ids.map(id =>
        `${id}.warning-visible=${!document.getElementById(id).classList.contains('hidden')}`).join('  '), WARNINGS);
}

// No site at all: both "nothing is on" warnings show.
await rerender([], {});
await page.click('[data-open="sites"]');
console.log(`sites-none     ${await warningFlags()}`);
await page.screenshot({ path: join(outDir, 'popup-sites-none.png'), fullPage: true });
await page.click('#backBtn');

// An update from 1.3.x that lost gitlab.com: the notice shows on Home.
await rerender(['https://gitlab.acme.io/*'], { gitlabComNotice: true });
console.log(`gitlab-notice  ${await warningFlags()}`);
await page.screenshot({ path: join(outDir, 'popup-gitlab-notice.png'), fullPage: true });

// gitlab.com and github.com on: nothing to warn about, both removable.
await rerender(['https://gitlab.com/*', 'https://github.com/*'], { gitlabComNotice: true });
const listed = await page.$$eval('#siteList .pu-site', items => items.map(item =>
    `${item.querySelector('.pu-site-host').textContent}${item.querySelector('.pu-site-remove') ? ' ×' : ''}`));
console.log(`sites-both     ${await warningFlags()}  listed=${JSON.stringify(listed)}`);

console.log(problems.length ? `page errors:\n${problems.join('\n')}` : 'no page errors');
console.log(`screenshots in ${outDir}`);
await browser.close();
