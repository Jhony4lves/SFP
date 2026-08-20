const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

async function boot(page) {
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

async function go(page, id) {
  await page.locator(`.nav button[data-page="${id}"]`).click();
}

async function back(page) {
  return page.evaluate(() => window.handleAndroidBack());
}

test('NAV-01: Hoje → Cartões → Lançamentos volta por cada página', async ({ page }) => {
  await boot(page);
  await go(page, 'cartoes');
  await go(page, 'lancamentos');
  expect(await back(page)).toBe(true);
  await expect(page.locator('#cartoes')).toHaveClass(/active/);
  expect(await back(page)).toBe(true);
  await expect(page.locator('#hoje')).toHaveClass(/active/);
});

test('NAV-02/03: página sem histórico volta à raiz, e a raiz libera a saída', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { setPage('dividas', { mode: 'replace' }); sfpNavigation.reset('dividas'); });
  expect(await back(page)).toBe(true);
  await expect(page.locator('#hoje')).toHaveClass(/active/);
  expect(await back(page)).toBe(false);
});

test('NAV-04: Back não reinsere a página removida nem cria loop', async ({ page }) => {
  await boot(page);
  await go(page, 'cartoes');
  await go(page, 'lancamentos');
  await back(page);
  await back(page);
  expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje']);
  expect(await back(page)).toBe(false);
});

test('NAV-05: mês, filtro e renderização não entram no histórico', async ({ page }) => {
  await boot(page);
  await go(page, 'cartoes');
  const before = await page.evaluate(() => sfpNavigation.getStack());
  await page.locator('#nextMonth').click();
  await page.locator('#nextMonth').click();
  await page.evaluate(() => { renderAll(); const filter = document.querySelector('#txSearch'); if (filter) { filter.value = 'qa'; filter.dispatchEvent(new Event('input')); } });
  expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(before);
  await back(page);
  await expect(page.locator('#hoje')).toHaveClass(/active/);
});

test('NAV-06: camada temporária fecha antes de trocar de página', async ({ page }) => {
  await boot(page);
  await go(page, 'cartoes');
  await page.evaluate(() => showMoreMenu());
  await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
  expect(await back(page)).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect(page.locator('#cartoes')).toHaveClass(/active/);
  expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje', 'cartoes']);
});

test('NAV-07: nova navegação depois de Back mantém uma stack linear', async ({ page }) => {
  await boot(page);
  await go(page, 'cartoes');
  await go(page, 'lancamentos');
  await back(page);
  await back(page);
  await go(page, 'cartoes');
  expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje', 'cartoes']);
  await back(page);
  expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje']);
});

test('NAV-08: reload reinicia um histórico interno válido', async ({ page }) => {
  await boot(page);
  await go(page, 'cartoes');
  await go(page, 'lancamentos');
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje']);
  expect(await back(page)).toBe(false);
});

test('NAV-09: navegação programática replace não cria retorno ao formulário', async ({ page }) => {
  await boot(page);
  await go(page, 'lancamentos');
  await page.evaluate(() => setPage('hoje', { mode: 'replace' }));
  expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje']);
  expect(await back(page)).toBe(false);
});

test('NAV-10: Android consulta o contrato JavaScript e só delega Back não consumido', async () => {
  const java = fs.readFileSync('app/src/main/java/com/jhony/sfp/MainActivity.java', 'utf8');
  expect(java).toContain("typeof window.handleAndroidBack === 'function' && window.handleAndroidBack()");
  expect(java).toContain('if (!"true".equals(result)) MainActivity.super.onBackPressed();');
});
