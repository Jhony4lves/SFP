const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await page.waitForFunction(name => state?.settings?.name === name && typeof lastSavedState !== 'undefined' && lastSavedState, value.settings.name);
}

test('RC5 repara transferência histórica importada sem alterar transferência manual ou futura', async ({ page }) => {
  const value = fixture('RC5 saldo de transferência');
  value.baseDate = '2026-08-31';
  value.accounts = [
    { id: 1, name: 'Conta A', type: 'Conta corrente', initial: 0, balanceMode: 'snapshot', balanceDate: '2026-08-31' },
    { id: 2, name: 'Conta B', type: 'Conta corrente', initial: 0, balanceMode: 'snapshot', balanceDate: '2026-08-31' }
  ];
  value.cards = [];
  value.transfers = [
    { id: 10, desc: 'Importada antiga', amount: 746.39, date: '2026-08-17', fromId: 1, toId: 2, tags: ['extrato', 'transferência'], statementKey: 'stmt:old', balanceImpact: true },
    { id: 11, desc: 'Manual antiga', amount: 100, date: '2026-08-17', fromId: 1, toId: 2, tags: ['manual'], balanceImpact: true },
    { id: 12, desc: 'Importada futura', amount: 50, date: '2026-09-02', fromId: 1, toId: 2, tags: ['extrato', 'transferência'], statementKey: 'stmt:future', balanceImpact: true }
  ];

  await boot(page, value);

  const result = await page.evaluate(() => ({
    impacts: state.transfers.map(t => ({ id: t.id, impact: t.balanceImpact, repair: t.balanceImpactRepair || null })),
    balances: [accountBalance(1), accountBalance(2)]
  }));

  expect(result.impacts).toEqual([
    { id: 10, impact: false, repair: '2.2-rc5-historical-import' },
    { id: 11, impact: true, repair: null },
    { id: 12, impact: true, repair: null }
  ]);
  expect(result.balances).toEqual([-150, 150]);

  await page.reload();
  await page.waitForFunction(() => state?.settings?.name === 'RC5 saldo de transferência');
  expect(await page.evaluate(() => state.transfers.find(t => t.id === 10).balanceImpact)).toBe(false);
});

test('RC5 novas transferências históricas de extrato usam a mesma regra temporal das demais movimentações', async ({ page }) => {
  await page.goto('/');
  const source = await page.evaluate(() => importStatement.toString());
  expect(source).toContain("tags:['extrato','transferência'],statementKey:r.key,balanceImpact:r.date>state.baseDate");
});
