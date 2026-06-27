'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// bpmn-js renders the pan/zoom group as <g class="viewport"> inside the canvas
// SVG and applies the zoom as a transform matrix on it. Zoom in/out and fit all
// rewrite that attribute — robust and free of brittle pixel/size checks.
test('zooms in/out and fits the diagram', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const viewport = page.locator(
        '#bpmnCanvas_12345bf3d4e842caa0d88194431197c0 svg .viewport');
    await expect(viewport).toBeAttached();

    // Initialize viewport transform by triggering fit (transform not set until first interaction)
    await page.getByTitle('Fit view').click();
    await expect(viewport).toHaveAttribute('transform', /matrix/);

    const initial = await viewport.getAttribute('transform');

    await page.getByTitle('Zoom in').click();
    await expect.poll(() => viewport.getAttribute('transform')).not.toBe(initial);
    const zoomedIn = await viewport.getAttribute('transform');

    await page.getByTitle('Zoom out').click();
    await expect.poll(() => viewport.getAttribute('transform')).not.toBe(zoomedIn);

    // Fit re-frames the diagram to the viewport (transform stays a matrix).
    await page.getByTitle('Fit view').click();
    await expect(viewport).toHaveAttribute('transform', /matrix/);
});
