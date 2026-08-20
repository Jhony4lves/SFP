const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

test('REL-09 falha de persistência reverte integralmente operações compostas', async ({ page }) => {
  const v = fixture('REL falhas'); v.accounts.push({ id: 2, name: 'Reserva', initial: 0 });
  v.debts.push({ id: 3, name: 'Dívida', balance: 300, history: [] }); v.goals.push({ id: 4, name: 'Meta', history: [] });
  await page.goto('/'); await page.evaluate(() => localStorage.clear()); await writeIndexedDB(page, v); await page.reload();
  await page.waitForFunction(() => state?.settings?.name === 'REL falhas' && lastSavedState);
  const results = await page.evaluate(async () => {
    const mutations = [
      () => state.invoices.push({ id: 10, cardId: 1, month: '2026-01', paidAmount: 10, accountId: 1, payments: [{ date: '2026-01-17', amount: 10, balanceImpact: true }] }),
      () => state.transactions.push({ id: 11, recurringId: 99, kind: 'expense', amount: 10, date: '2026-01-05', accountId: 1, status: 'paid', balanceImpact: true }),
      () => { state.debts[0].balance -= 10; state.debts[0].history.push({ type: 'amortization', amount: 10 }); },
      () => state.transactions.push({ id: 12, statementKey: 'unique', kind: 'expense', amount: 10, date: '2026-01-06', accountId: 1, status: 'paid', balanceImpact: true }),
      () => { state.transfers.push({ id: 13, amount: 10, fromId: 1, toId: 2, date: '2026-01-07' }); state.goals[0].history.push({ amount: 10 }); },
      () => { state.snapshots.push({ id: 14, month: '2026-01' }); state.closedMonths.push('2026-01'); }
    ];
    const original = dbSet, out = [];
    const signature = () => JSON.stringify({ accounts: state.accounts, transactions: state.transactions, transfers: state.transfers, invoices: state.invoices, debts: state.debts, goals: state.goals, snapshots: state.snapshots, closedMonths: state.closedMonths, balance: allAccountBalance(), netWorth: netWorth() });
    for (const mutate of mutations) { const before = signature(); mutate(); dbSet = async () => { throw Error('falha simulada'); }; try { await save('composta'); } catch {} out.push(signature() === before); }
    const beforeRestore = JSON.stringify(state); try { await restoreState(clone(seed)); } catch {} out.push(JSON.stringify(state) === beforeRestore); dbSet = original; return out;
  });
  expect(results).toEqual([true, true, true, true, true, true, true]);
});
