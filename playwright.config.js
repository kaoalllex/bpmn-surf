'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/e2e',
    testMatch: '**/*.spec.js',
    fullyParallel: true,
    // The default is half the cores: two workers on CI's 4-vCPU runner. Each test is
    // one page booting the differ, CPU-bound and stable on every core (a 20-worker
    // run on 14 cores stayed green), so CI takes them all.
    workers: process.env.CI ? '100%' : undefined,
    reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
    use: {
        baseURL: 'http://localhost:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'node test/e2e/support/static-server.js 4173',
        port: 4173,
        reuseExistingServer: !process.env.CI,
        timeout: 30000
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ]
});
