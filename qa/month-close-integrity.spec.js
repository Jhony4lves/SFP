const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

test('MONTH-01/02/03/04 fechamento é histórico e só muda por substituição explícita', async ({ page }) => {
  const value = fixture('Fechamento'); value.transactions = [{ id: 1, kind: 'income', desc: 'Salário', amount: 500, date: '2026-01-05', accountId: 1, status: 'paid', balanceImpact: true }];
  value.assets = [{ id: 2, name: 'Bem', value: 300 }]; value.debts = [{ id: 3, name: 'Dívida', balance: 100, history: [] }];
  await page.goto('/'); await page.evaluate(() => localStorage.clear()); await writeIndexedDB(page, value); await page.reload();
  await page.evaluate(() => document.querySelector('#closeMonth').click());
  await expect.poll(() => page.evaluate(async () => {
    const persisted = (await dbGet()).value;
    return { state: state.snapshots[0]?.income, persisted: persisted.snapshots[0]?.income, saved: lastSavedState.snapshots[0]?.income };
  })).toEqual({ state: 500, persisted: 500, saved: 500 });
  const original = await page.evaluate(() => clone(state.snapshots[0]));
  expect(original).toMatchObject({ month: '2026-01', income: 500, expense: 0, result: 500, assets: 1800, debts: 100, netWorth: 1700, reserve: 0 });
  await page.evaluate(async () => { state.transactions[0].amount = 900; state.assets[0].value = 700; await save('alterar depois'); });
  expect(await page.evaluate(() => state.snapshots[0])).toEqual(original);
  await page.reload(); await expect.poll(() => page.evaluate(() => state?.snapshots[0])).toEqual(original);
  await page.evaluate(() => { window.confirm = () => true; });
  await page.evaluate(() => document.querySelector('#closeMonth').click());
  await expect.poll(() => page.evaluate(async () => {
    const persisted = (await dbGet()).value;
    const fields = snapshot => snapshot && ({ income: snapshot.income, assets: snapshot.assets, debts: snapshot.debts, netWorth: snapshot.netWorth });
    return { state: fields(state.snapshots[0]), persisted: fields(persisted.snapshots[0]), saved: fields(lastSavedState.snapshots[0]) };
  })).toEqual({
    state: { income: 900, assets: 2600, debts: 100, netWorth: 2500 },
    persisted: { income: 900, assets: 2600, debts: 100, netWorth: 2500 },
    saved: { income: 900, assets: 2600, debts: 100, netWorth: 2500 }
  });
});
