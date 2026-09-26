// Renders every popup screen and reports layout problems.
//
//   node test/e2e/live/popup-screens.mjs [out-dir]
//
// The odd one out in this directory: it needs no network and no GitLab account,
// only a stubbed chrome.* so popup.js can run from file://. A Chrome popup window
// scrolls past roughly 600px, so the height column is the thing to watch.
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
    window.chrome = {
        runtime: {
            getManifest: () => ({ version: '0.0.0', content_scripts: [{ matches: ['https://gitlab.com/*'] }] })
        },
        permissions: {
            getAll: async () => ({ origins: ['https://gitlab.mycompany.com/*'] }),
            request: async () => true,
            remove: async () => true
        },
        storage: {
            sync: {
                get: async key => ({ [key]: stored[key] }),
                set: async obj => Object.assign(stored, obj)
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

console.log(problems.length ? `page errors:\n${problems.join('\n')}` : 'no page errors');
console.log(`screenshots in ${outDir}`);
await browser.close();
