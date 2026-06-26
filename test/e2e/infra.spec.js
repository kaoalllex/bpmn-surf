'use strict';

const { test, expect } = require('@playwright/test');

test('static server serves repo files over http', async ({ page }) => {
    const response = await page.goto('/src/core/utils.js');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('javascript');
});
