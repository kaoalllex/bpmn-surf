'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootBpmnDiffer, wireDiagnostics, defaultBpmnParams, CALL_ACTIVITY_BPMN
} = require('./support/boot-differ');
const {
    installCapture, getOpenDifferCalls, getOpenCalls
} = require('./support/dive-out-capture');

const CA_FIXTURES = { xmlByRef: { 'mr-sha': CALL_ACTIVITY_BPMN, 'base-sha': CALL_ACTIVITY_BPMN } };
const caret = (page) => page.locator('.differ-back-caret');

// J3: opening the caret menu shows a spinner while CallerLocator searches, then the
// list of callers. The diagram we came from is marked and ordered first, even though
// it is second in the raw search hits. We slow searchCode so the spinner is
// deterministically observable.
test('caller menu shows a spinner then the ordered caller list (came-from first)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams({ divedInFrom: { filePath: 'caller-a.bpmn', fileName: 'caller-a.bpmn' } }),
        fixtures: {
            ...CA_FIXTURES,
            searchHits: [
                { path: 'caller-b.bpmn', line: 1, snippet: 'calledElement="Process_2"' },
                { path: 'caller-a.bpmn', line: 1, snippet: 'calledElement="Process_2"' }
            ]
        }
    });
    await installCapture(page);
    await page.evaluate((ms) => {
        const orig = FakePlatformClient.prototype.searchCode;
        FakePlatformClient.prototype.searchCode = async function (...args) {
            await new Promise((r) => setTimeout(r, ms));
            return orig.apply(this, args);
        };
    }, 250);

    await caret(page).click();

    // While resolving: spinner row.
    await expect(page.locator('.differ-back-menu .differ-spinner-inline')).toBeVisible();
    await expect(page.locator('.differ-back-menu-message')).toContainText('Searching for callers');

    // Resolved: two rows, came-from (caller-a) first and marked.
    const items = page.locator('.differ-back-menu-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('.differ-back-menu-name')).toHaveText('caller-a.bpmn');
    await expect(items.nth(0)).toHaveClass(/differ-back-menu-item-came-from/);
    await expect(items.nth(1).locator('.differ-back-menu-name')).toHaveText('caller-b.bpmn');
    await expect(items.nth(1)).not.toHaveClass(/differ-back-menu-item-came-from/);
});

// J4: a root diagram (nothing calls it) -> empty search result -> "No diagram calls
// this one", distinct from the error state below.
test('caller menu shows "no callers" for a root diagram', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams(), fixtures: { ...CA_FIXTURES, searchHits: [] } });
    await installCapture(page);

    await caret(page).click();

    await expect(page.locator('.differ-back-menu-message')).toHaveText('No diagram calls this one');
    await expect(page.locator('.differ-back-menu-item')).toHaveCount(0);
});

// J5: a failing search (CallerLocator throws) -> "Couldn't check…" plus a "Search in
// GitLab" link; clicking it opens the human search page for calledElement="<id>".
test('caller menu shows an error and a GitLab search link when the search fails', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: defaultBpmnParams(), fixtures: CA_FIXTURES });
    await installCapture(page);
    await page.evaluate(() => {
        FakePlatformClient.prototype.searchCode = async () => { throw new Error('search disabled'); };
    });

    await caret(page).click();

    await expect(page.locator('.differ-back-menu-message')).toContainText("check the calling diagrams");
    const link = page.locator('.differ-back-menu-link');
    await expect(link).toHaveText('Search in GitLab');
    await link.click();

    await expect.poll(() => getOpenCalls(page))
        .toContainEqual(['http://localhost/search?term=calledElement%3D%22Process_2%22', '_blank']);
});

// J6: clicking a (non-came-from) caller row opens that caller as a fresh differ,
// asking it to auto-select the call site (selectCalledProcessIds = this diagram's
// process ids). No divedInFrom is carried (this is the dive-out direction).
test('clicking a caller row opens that caller with the auto-select hint', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, {
        params: defaultBpmnParams(),
        fixtures: { ...CA_FIXTURES, searchHits: [{ path: 'caller-x.bpmn', line: 1, snippet: 'calledElement="Process_2"' }] }
    });
    await installCapture(page);

    await caret(page).click();
    const row = page.locator('.differ-back-menu-item');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.differ-back-menu-name')).toHaveText('caller-x.bpmn');
    await row.click();

    await expect.poll(async () => (await getOpenDifferCalls(page)).length).toBe(1);
    const [call] = await getOpenDifferCalls(page);
    expect(call.params.filePath).toBe('caller-x.bpmn');
    expect(call.params.fileName).toBe('caller-x.bpmn');
    expect(call.params.selectCalledProcessIds).toEqual(['Process_2']);
    expect(call.params.divedInFrom).toBeUndefined();
    expect(call.msgId).toBe(await page.evaluate(() => BpmnDiffer.MSG_ID));
});
