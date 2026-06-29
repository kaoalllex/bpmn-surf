'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, SEARCH_MULTI_BPMN } = require('./support/boot-differ');

// search-multi.bpmn has three userTasks all named "Check ..." (document order
// Task_A, Task_B, Task_C). Ctrl/Cmd+F opens the panel; typing "Check" matches all
// three (live search marks them with `search-match`, counter shows the bare total
// "3", no current yet). Enter / Shift+Enter / the ◀ ▶ buttons drive #goTo: the
// counter becomes "i/total", exactly one element carries `search-match-current`,
// the index wraps at the edges, and the current match is selected on the canvas.
test('navigates matches with Enter/Shift+Enter and the ◀ ▶ buttons (counter, current marker, wrap)', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { fixtures: { xmlByRef: { 'base-sha': SEARCH_MULTI_BPMN } } });

    await page.keyboard.press('Control+f');
    const input = page.locator('input.search-panel-input');
    await expect(input).toBeFocused();
    const counter = page.locator('.search-panel-counter');

    await input.fill('Check');

    // Live search: three hits marked, the bare total shown, navigation not started.
    await expect(page.locator('svg .search-match')).toHaveCount(3);
    await expect(page.locator('svg .search-match-current')).toHaveCount(0);
    await expect(counter).toHaveText('3');

    const matchCurrent = (id) => page.locator(`svg .djs-element[data-element-id="${id}"]`);

    // First Enter → first match (document order: Task_A), selected and current.
    await input.press('Enter');
    await expect(counter).toHaveText('1/3');
    await expect(page.locator('svg .search-match-current')).toHaveCount(1);
    await expect(matchCurrent('Task_A')).toHaveClass(/search-match-current/);
    await expect(matchCurrent('Task_A')).toHaveClass(/selected/);

    // Enter steps forward; the previous current loses the marker.
    await input.press('Enter');
    await expect(counter).toHaveText('2/3');
    await expect(matchCurrent('Task_B')).toHaveClass(/search-match-current/);
    await expect(matchCurrent('Task_A')).not.toHaveClass(/search-match-current/);

    await input.press('Enter');
    await expect(counter).toHaveText('3/3');
    await expect(matchCurrent('Task_C')).toHaveClass(/search-match-current/);

    // Wrap forward: 3/3 → 1/3.
    await input.press('Enter');
    await expect(counter).toHaveText('1/3');
    await expect(matchCurrent('Task_A')).toHaveClass(/search-match-current/);

    // Wrap backward: 1/3 → 3/3.
    await input.press('Shift+Enter');
    await expect(counter).toHaveText('3/3');
    await expect(matchCurrent('Task_C')).toHaveClass(/search-match-current/);

    // The ◀ ▶ buttons mirror Shift+Enter / Enter.
    await page.getByTitle('Previous (Shift+Enter)').click();
    await expect(counter).toHaveText('2/3');
    await expect(matchCurrent('Task_B')).toHaveClass(/search-match-current/);

    await page.getByTitle('Next (Enter)').click();
    await expect(counter).toHaveText('3/3');
    await expect(matchCurrent('Task_C')).toHaveClass(/search-match-current/);

    // Throughout, exactly one element is the current match.
    await expect(page.locator('svg .search-match-current')).toHaveCount(1);
});
