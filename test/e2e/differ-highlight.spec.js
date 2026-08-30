'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics } = require('./support/boot-differ');

// The MR (default side) adds Task_2 + Flow_3 over base. Two independent things
// happen: DiffHighlighter.paint colours the elements at load (inline fill on a
// shape, stroke on a connection — REFAC-0015 §1), while the outline marker is OFF
// until the ☼ button turns it on (a 1.5 s pulse phase, then steady). The marker
// assertions stay class-based, robust against the pulse→steady swap.
test('toggles the diff highlight on the added elements', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(addedTask).toBeVisible();

    // Painted at load, independently of the ☼ toggle: modeling.setColor writes the
    // ADD colours inline on the .djs-visual child — the shape's fill (#88ff88) and
    // the connection's stroke (#00aa00, DiffType.ADD.rowColor).
    await expect(addedTask.locator('.djs-visual > rect'))
        .toHaveCSS('fill', 'rgb(136, 255, 136)');
    await expect(page.locator('svg .djs-element[data-element-id="Flow_3"] .djs-visual > path'))
        .toHaveCSS('stroke', 'rgb(0, 170, 0)');

    // Off by default: no highlight marker yet.
    await expect(addedTask).not.toHaveClass(/highlight-diff/);

    // Turn the diff highlight on (icon button — located by its title).
    await page.getByTitle('Turn diff highlight on').click();

    // The button flipped to the "off" affordance.
    await expect(page.getByTitle('Turn diff highlight off')).toBeVisible();

    // The added elements now carry a highlight marker (pulse or steady).
    await expect(addedTask).toHaveClass(/highlight-diff/);
    await expect(page.locator('svg .djs-element[data-element-id="Flow_3"]'))
        .toHaveClass(/highlight-diff/);

    // After the pulse settles it becomes the steady marker.
    await expect(addedTask).toHaveClass(/(^|\s)highlight-diff(\s|$)/, { timeout: 3000 });
});

// UX-0006: the ☼ button first blinks the diff elements for PULSE_DURATION_MS
// (highlight-diff-pulse, a CSS animation) and only then settles to the steady thin
// outline (highlight-diff). Both classes contain 'highlight-diff', so the regexes are
// anchored on word boundaries — a loose /highlight-diff/ cannot tell the phases apart,
// which is why the class name was renameable unnoticed (REFAC-0015 §5).
const PULSE = /(^|\s)highlight-diff-pulse(\s|$)/;
const STEADY = /(^|\s)highlight-diff(\s|$)/;

test('the highlight blinks first and settles to the steady outline', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(addedTask).toBeVisible();

    await page.getByTitle('Turn diff highlight on').click();

    await expect(addedTask).toHaveClass(PULSE);
    await expect(addedTask).not.toHaveClass(STEADY);

    // PULSE_DURATION_MS is 1.5 s; the swap happens on the timer, with no click.
    await expect(addedTask).toHaveClass(STEADY, { timeout: 3000 });
    await expect(addedTask).not.toHaveClass(PULSE);
});

// Switching the highlight off mid-blink must also cancel the timer. Without the
// clearTimeout the pending callback fires afterwards and re-adds the steady marker to
// elements the user has just unhighlighted (REFAC-0015 §5).
test('turning the highlight off during the blink leaves nothing behind', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(addedTask).toBeVisible();

    await page.getByTitle('Turn diff highlight on').click();
    await expect(addedTask).toHaveClass(PULSE);
    // Well inside the 1.5 s blink, so the timer is still pending.
    await page.getByTitle('Turn diff highlight off').click();
    await expect(addedTask).not.toHaveClass(PULSE);

    // Outlive the timer: it must not resurrect the markers.
    await page.waitForTimeout(2000);
    await expect(addedTask).not.toHaveClass(PULSE);
    await expect(addedTask).not.toHaveClass(STEADY);
});

// §8: the highlight marker does not render on a SELECTED element (diagram-js paints
// the selection outline over it), so setEnabled clears the selection marker first.
// Cheap to pin, and the effect is visible: the user selects a changed task, presses ☼
// and would otherwise see nothing happen on the very element they were looking at.
test('highlighting an element that is selected clears the selection marker', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await addedTask.click();
    await expect(addedTask).toHaveClass(/selected/);

    await page.getByTitle('Turn diff highlight on').click();

    await expect(addedTask).toHaveClass(PULSE);
    await expect(addedTask).not.toHaveClass(/selected/);
});

// BUG-0030: the marker classes above are only half the story — every
// .highlight-diff* rule styles the .djs-outline child, so the user sees nothing
// unless that child is actually rendered. diagram-js creates it lazily (hover /
// selection only), which the class-based assertions cannot catch.
test('the highlight marker renders a visible cyan outline', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);

    const addedTask = page.locator('svg .djs-element[data-element-id="Task_2"]');
    await expect(addedTask).toBeVisible();

    await page.getByTitle('Turn diff highlight on').click();
    await expect(addedTask).toHaveClass(PULSE);

    const outline = addedTask.locator('.djs-outline');
    await expect(outline).toHaveCount(1);
    await expect(outline).toHaveCSS('visibility', 'visible');
    await expect(outline).toHaveCSS('stroke', 'rgb(102, 255, 255)');
});
