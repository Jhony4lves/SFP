const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseUrl = 'http://127.0.0.1:4173/index.html';

  console.log('Generating screenshots...');

  // 1. 384x854 DARK
  await page.setViewportSize({ width: 384, height: 854 });
  await page.goto(baseUrl);
  await page.waitForSelector('#monthLabel');
  await page.evaluate(() => {
    if (window.setThemePreference) {
      window.setThemePreference('dark', { persist: false });
    } else {
      window.applyTheme('dark');
    }
  });

  const darkPages = ['hoje', 'sophy', 'recorrencias', 'calendario', 'config'];
  for (const p of darkPages) {
    await page.evaluate((pageId) => window.setPage(pageId), p);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${p}-dark-384x854.png`), fullPage: false });
    console.log(`Captured ${p}-dark-384x854.png`);
  }

  // Dark Banner
  await page.evaluate(() => {
    window.setPage('hoje');
    window.showInAppBanner({
      id: 'screenshot-banner-dark',
      type: 'warning',
      title: 'Atenção aos vencimentos',
      message: 'Você possui faturas com vencimento próximo.',
      actionText: 'Verificar',
      dismissible: true
    });
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, `banner-dark-384x854.png`), fullPage: false });
  console.log(`Captured banner-dark-384x854.png`);

  // 2. 384x854 LIGHT
  await page.evaluate(() => {
    if (window.setThemePreference) {
      window.setThemePreference('light', { persist: false });
    } else {
      window.applyTheme('light');
    }
  });

  const lightPages = ['hoje', 'sophy', 'lancamentos', 'recorrencias', 'contas', 'calendario', 'config'];
  for (const p of lightPages) {
    await page.evaluate((pageId) => window.setPage(pageId), p);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${p}-light-384x854.png`), fullPage: false });
    console.log(`Captured ${p}-light-384x854.png`);
  }

  // Light Mais modal
  await page.evaluate(() => {
    window.showMoreMenu();
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, `mais-light-384x854.png`), fullPage: false });
  console.log(`Captured mais-light-384x854.png`);

  // Close modal and capture light banner
  await page.evaluate(() => {
    const root = document.getElementById('modalRoot');
    if (root) { root.className = 'hidden'; root.replaceChildren(); }
    window.setPage('hoje');
    window.showInAppBanner({
      id: 'screenshot-banner-light',
      type: 'info',
      title: 'Modo Claro Ativo',
      message: 'Tema claro configurado com alto contraste e legibilidade.',
      actionText: 'Entendi',
      dismissible: true
    });
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, `banner-light-384x854.png`), fullPage: false });
  console.log(`Captured banner-light-384x854.png`);

  // 3. 854x384 LIGHT (Landscape)
  await page.setViewportSize({ width: 854, height: 384 });
  const landscapePages = ['hoje', 'lancamentos', 'recorrencias', 'calendario'];
  for (const p of landscapePages) {
    await page.evaluate((pageId) => window.setPage(pageId), p);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${p}-light-854x384.png`), fullPage: false });
    console.log(`Captured ${p}-light-854x384.png`);
  }

  // 4. 1280x720 LIGHT (Desktop)
  await page.setViewportSize({ width: 1280, height: 720 });
  const desktopPages = ['hoje', 'dashboard', 'sophy'];
  for (const p of desktopPages) {
    await page.evaluate((pageId) => window.setPage(pageId), p);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${p}-light-1280x720.png`), fullPage: false });
    console.log(`Captured ${p}-light-1280x720.png`);
  }

  // Reset back to dark
  await page.evaluate(() => {
    window.applyTheme('dark');
  });

  await browser.close();
  console.log('All screenshots generated successfully!');
}

run().catch(err => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});
