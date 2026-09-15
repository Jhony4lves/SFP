const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

const S24_PORTRAIT = { width: 390, height: 844 };

test('Open Finance fica no Mais sem criar sexto item na barra inferior', async ({ page }) => {
  const errors = monitor(page);
  await page.setViewportSize(S24_PORTRAIT);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');

  const visibleButtons = page.locator('.sidebar .nav button:visible');
  await expect(visibleButtons).toHaveCount(5);
  expect(await visibleButtons.evaluateAll(list => list.map(el => el.dataset.page || el.id)))
    .toEqual(['hoje','contas','cartoes','calendario','moreNavBtn']);

  await page.locator('#moreNavBtn').click();
  const syncEntry = page.locator('[data-sfp-more-page="openfinance"]');
  await expect(syncEntry).toBeVisible();
  await expect(syncEntry).toContainText('Sincronização');
  await expect(syncEntry).toContainText('Open Finance e atualização de dados');

  await syncEntry.click();
  await expect(page.locator('#openfinance')).toHaveClass(/active/);
  await expect(page.locator('#pageTitle')).toHaveText('Sincronização');
  expect(errors).toEqual([]);
});
