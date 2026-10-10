'use strict';

const { test, expect } = require('@playwright/test');
const {
    bootDmnDiffer, wireDiagnostics, defaultDmnParams
} = require('./support/boot-differ');

// Both refs point at content the fake does not have (empty fixtures map) →
// loadFileContent returns '' for each side → the DMN differ shows the centered
// "absent in both" placeholder and never imports a table (BUG-0001 / UX-0003).
// The expected "[console.error] dmn file is unavailable in both versions" line is
// the differ's own diagnostic — not a test failure.
test('shows a placeholder when the DMN file is absent in both versions', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        params: defaultDmnParams({ sourceRef: 'gone', targetRef: 'gone' }),
        fixtures: { xmlByRef: {} }
    });

    await expect(page.locator('.differ-empty-state')).toBeVisible();
    await expect(page.locator('.differ-empty-state-message'))
        .toHaveText('File does not exist in either version');
    // No decision table was rendered.
    await expect(page.locator('.rule-index')).toHaveCount(0);
    // Nothing to download.
    await expect(page.getByTitle('Download the file as shown for the current branch'))
        .toBeDisabled();
});

// A DRD-only file (decisions without a decision table, e.g. a Camunda 8 project
// skeleton) used to crash DmnTableViewport.fit() and leave the spinner up for good.
const DRD_ONLY_DMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="Definitions_1" name="DRD" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="BarDecision" name="BarDecision" />
  <dmndi:DMNDI>
    <dmndi:DMNDiagram>
      <dmndi:DMNShape id="DMNShape_1" dmnElementRef="BarDecision">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>`;

test('shows a message when the DMN file has no decision table', async ({ page }) => {
    wireDiagnostics(page);
    await bootDmnDiffer(page, {
        fixtures: { xmlByRef: { 'base-sha': DRD_ONLY_DMN, 'mr-sha': DRD_ONLY_DMN } }
    });

    await expect(page.locator('.differ-empty-state-message'))
        .toHaveText('This file has no decision table to compare');
    await expect(page.locator('.differ-loading-overlay')).toBeHidden();
});
