const { defineConfig } = require('@playwright/test');
const { fixture } = require('./qa/helpers');

module.exports = defineConfig({
  testDir: './qa',
  outputDir: 'build/reports/playwright-results',
  reporter: [['html', { outputFolder: 'build/reports/playwright-html', open: 'never' }], ['list']],
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'off',
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://127.0.0.1:4173', localStorage: [{ name: 'sfp_final_fallback', value: JSON.stringify(fixture()) }] }]
    }
  },
  webServer: {
    command: 'python3 -m http.server 4173 --directory app/src/main/assets/www',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true
  }
});
