'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const editParams = (overrides = {}) =>
    defaultBpmnParams({ mode: 'edit', editSide: 'source', ...overrides });

const DOWNLOAD_TITLE = 'Download the edited .bpmn';
const COLORING_ON = 'Colour the edits — on';

async function downloadedText(page) {
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTitle(DOWNLOAD_TITLE).click()
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return { name: download.suggestedFilename(), xml: Buffer.concat(chunks).toString('utf8') };
}

test('the downloaded file is named <name>-edited-<stamp>.bpmn', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    const { name } = await downloadedText(page);
    expect(name).toMatch(/^diagram-edited-\d{8}-\d{6}\.bpmn$/);
});

test('the downloaded XML carries the edit and the diff colours', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    // Task_2 is what the MR added over base — colour layer 3, green.
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/edit-diff-added/, { timeout: 5000 });

    const { xml } = await downloadedText(page);
    expect(xml).toMatch(/xmlns:color="http:\/\/www\.omg\.org\/spec\/BPMN\/non-normative\/color\/1\.0"/);
    expect(xml).toMatch(/bpmnElement="Task_2"[^>]*color:background-color="#88ff88"/);
});

test('with the colouring toggled off the file carries no diff colours', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/edit-diff-added/, { timeout: 5000 });
    await page.getByTitle(COLORING_ON).click();

    const { xml } = await downloadedText(page);
    expect(xml).not.toMatch(/color:background-color/);
    expect(xml).not.toMatch(/xmlns:color=/);
});

test('a manually coloured element keeps its colour in the file', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await page.locator('svg .djs-element[data-element-id="Task_2"]').click();
    await page.getByTitle('Colour the selection red').click();

    const { xml } = await downloadedText(page);
    // The user's colour is in the MODEL, so bpmn-js exports it itself; the diff
    // colour must not have overwritten it (Task_2 is outline-only now).
    // Attribute order is bpmn-moddle's choice for a colour it serializes itself,
    // so match on the values: Task_2 is the only added element in this fixture, so
    // the absence of the ADD green is enough to prove the diff colour stood down.
    expect(xml).toContain('#ffcdd2');
    expect(xml).not.toContain('#88ff88');
});
