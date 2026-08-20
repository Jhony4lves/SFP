const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

async function loadState(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
}

test('editar somente o nome preserva integralmente conta rica após reload', async ({ page }) => {
  const value = fixture('Conta rica QA');
  value.accounts = [{
    id: 91,
    name: 'Conta original',
    type: 'Conta corrente',
    initial: 725.40,
    balanceMode: 'snapshot',
    balanceDate: '2026-08-18',
    overdraftLimit: 900,
    reconciled: { balance: 700, date: '2026-08-19', difference: -25.40 },
    metadata: { source: 'importação', externalId: 'account-91' }
  }];
  await loadState(page, value);
  const errors = monitor(page);
  const before = await page.evaluate(() => structuredClone(state.accounts[0]));

  await page.evaluate(() => editAccount(91));
  await page.locator('#accountName').fill('Conta renomeada');
  await page.locator('#accountForm button').click();
  await expect.poll(() => page.evaluate(() => state.accounts[0].name)).toBe('Conta renomeada');
  await page.reload();
  await expectBootComplete(page, expect, 'Conta rica QA');

  const after = await page.evaluate(() => structuredClone(state.accounts[0]));
  const { name: beforeName, ...beforeFields } = before;
  const { name: afterName, ...afterFields } = after;
  expect(beforeName).toBe('Conta original');
  expect(afterName).toBe('Conta renomeada');
  expect(afterFields).toEqual(beforeFields);
  expect(errors).toEqual([]);
});

test('tela Hoje trata conta sem balanceDate sem inventar data-base', async ({ page }) => {
  const value = fixture('Conta sem data QA');
  value.accounts = [{ id: 92, name: 'Conta sem data', type: 'Dinheiro', initial: 50, custom: 'preservar ausência' }];
  await loadState(page, value);
  const errors = monitor(page);

  await expect(page.locator('#todayAccounts')).toContainText('data-base não informada');
  await expect(page.locator('#todayAccounts')).not.toContainText('Invalid Date');
  await page.reload();
  await expectBootComplete(page, expect, 'Conta sem data QA');
  await expect(page.locator('#todayAccounts')).toContainText('data-base não informada');
  await expect(page.locator('#todayAccounts')).not.toContainText('Invalid Date');
  expect(errors).toEqual([]);
});
