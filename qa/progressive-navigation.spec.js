const { test, expect } = require('@playwright/test');

test('visões gerenciais revelam detalhe e ação progressivamente', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => state.settings.onboardingDone = true);
  for (const pageId of ['contas', 'cartoes', 'dividas', 'metas']) {
    await page.evaluate(id => setPage(id), pageId);
    await expect(page.locator(`#${pageId} .management-form-panel`)).toBeHidden();
    await page.evaluate(id => openManagementAction(id), pageId);
    await expect(page.locator('#modalRoot')).toHaveClass(/modalback/);
    await expect(page.locator('#modalRoot .management-form-panel')).toBeVisible();
    await page.evaluate(() => handleAndroidBack());
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  }
});

test('detalhe de conta precede ações e voltar restaura a lista', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => state && state.accounts.length);
  await page.evaluate(() => { state.settings.onboardingDone = true; setPage('contas'); openAccountDetail(state.accounts[0].id); });
  await expect(page.locator('#modalRoot [role="dialog"]')).toBeVisible();
  await expect(page.locator('#modalRoot')).toContainText('Movimentações recentes');
  await page.evaluate(() => handleAndroidBack());
  await expect(page.locator('#contas')).toHaveClass(/active/);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
});
