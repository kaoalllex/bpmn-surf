'use strict';

const { test, expect } = require('@playwright/test');
const { bootDmnDiffer, wireDiagnostics, defaultDmnParams } = require('./support/boot-differ');

const DOWNLOAD_TITLE = 'Download the file as shown for the current branch';

// The download blob/anchor logic (DiagramVersions#download -> utils.js#downloadTextFile)
// is shared between the BPMN and DMN differs — this is the DMN-side mirror of
// differ-download.spec.js, so a regression in that shared code is caught on both
// sides, not only the BPMN one it happened to be extracted next to (FEAT-0031).
test('downloads the shown side with a branch-prefixed filename', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page);

    // DmnDiffer#show renders the MR/source side first whenever one is defined
    // (defaultDmnParams sets sourceRef), so the shown side is the source side —
    // download() is called with sourceLabel + fileName.
    const params = defaultDmnParams();
    const expectedName = `${params.sourceLabel}-${params.fileName}`;

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTitle(DOWNLOAD_TITLE).click()
    ]);
    expect(download.suggestedFilename()).toBe(expectedName);
});

// The absent-file / disabled-Download case is already covered by
// dmn-absent-side.spec.js — not duplicated here.
