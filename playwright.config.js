const { defineConfig } = require('@playwright/test');
const { fixture } = require('./qa/helpers');

module.exports = defineConfig({
  testDir: './qa',
  outputDir: 'build/reports/playwright-results',
  workers: 1,
  reporter: [['html', { outputFolder: 'build/reports/playwright-html', open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'off',
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://127.0.0.1:4173', localStorage: [{ name: 'sfp_final_fallback', value: JSON.stringify(fixture()) }] }]
    },
    launchOptions: {
      args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--disable-breakpad', '--no-crashpad']
    }
  },
  webServer: {
    command: 'python3 -m http.server 4173 --directory app/src/main/assets/www',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true
  }
});
