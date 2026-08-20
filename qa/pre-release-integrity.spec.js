const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await page.waitForFunction(name => state?.settings?.name === name && lastSavedState, value.settings.name);
}

function realLifeFixture() {
  const v = fixture('REL vida real');
  v.mesAtual = '2026-05';
  v.accounts = [
    { id: 1, name: 'Corrente', type: 'Conta corrente', initial: 1000, balanceMode: 'snapshot', balanceDate: '2026-01-01' },
    { id: 2, name: 'Reserva', type: 'Reserva', initial: 500, balanceMode: 'snapshot', balanceDate: '2026-01-01' }
  ];
  v.transactions = [
    { id: 11, kind: 'income', desc: 'Salário jan', amount: 3000, date: '2026-01-05', accountId: 1, status: 'paid', balanceImpact: true },
    { id: 12, kind: 'expense', desc: 'Aluguel jan', amount: 900, date: '2026-01-10', accountId: 1, status: 'paid', balanceImpact: true },
    { id: 13, kind: 'expense', desc: 'Extrato conciliado', amount: 10.01, date: '2026-03-08', accountId: 1, status: 'paid', balanceImpact: true, statementKey: 'bank:2026-03-08:1001' }
  ];
  v.transfers = [{ id: 21, date: '2026-02-02', amount: 200, fromId: 1, toId: 2, balanceImpact: true, goalId: 61 }];
  v.recurring = [
    { id: 31, desc: 'Salário', type: 'income', amount: 3000, day: 5, category: 'Trabalho', accountId: 1, start: '2026-02', end: '', active: true, skips: [] },
    { id: 32, desc: 'Internet', type: 'expense', amount: 100, day: 10, category: 'Casa', accountId: 1, start: '2026-01', end: '', active: true, skips: [] }
  ];
  v.purchases = [
    { id: 41, cardId: 1, desc: 'Notebook', total: 100, installments: 3, firstMonth: '2026-01', category: 'Casa', status: 'active', refunds: [{ month: '2026-03', amount: 10.01 }] },
    { id: 42, cardId: 1, desc: 'Cancelada', total: 20, installments: 4, firstMonth: '2026-02', category: 'Lazer', status: 'cancelled', cancelledFromMonth: '2026-04', refunds: [] }
  ];
  v.invoices = [
    { id: 51, cardId: 1, month: '2026-01', status: 'partial', paidAmount: 20, accountId: 1, closedAt: '2026-01-10T00:00:00Z', payments: [{ date: '2026-02-17', amount: 20, balanceImpact: true }] },
    { id: 52, cardId: 1, month: '2026-02', status: 'paid', paidAmount: 38.33, accountId: 1, payments: [{ date: '2026-03-17', amount: 38.33, balanceImpact: true }] }
  ];
  v.debts = [{ id: 71, name: 'Empréstimo', balance: 800, payment: 100, installments: 10, paidInstallments: 2, firstDue: '2026-01-20', history: [{ type: 'payment', installment: 1, amount: 100 }, { type: 'amortization', amount: 100 }] }];
  v.goals = [{ id: 61, name: 'Reserva', accountId: 2, target: 2000, initialAllocated: 500, history: [{ date: '2026-02-02', amount: 200 }] }];
  v.assets = [{ id: 81, name: 'Veículo', value: 5000 }];
  v.categoryBudgets = { Casa: 1200, Lazer: 200 };
  v.statements = [{ id: 91, accountId: 1, account: 'Corrente', file: 'marco.csv', count: 1, months: ['2026-03'], importedAt: '2026-03-08T10:00:00Z', keys: ['bank:2026-03-08:1001'], rows: [] }];
  v.snapshots = [{ id: 101, month: '2026-01', income: 3000, expense: 1033.34, result: 1966.66 }];
  v.closedMonths = ['2026-01'];
  return v;
}

test('REL-01 fixture integrada cruza saldo, caixa, competência, compromissos e patrimônio', async ({ page }) => {
  await boot(page, realLifeFixture());
  const r = await page.evaluate(() => ({
    individual: state.accounts.reduce((sum, a) => sum + accountBalance(a.id), 0), all: allAccountBalance(),
    net: netWorth(), formula: allAccountBalance() + state.assets.reduce((s, a) => s + a.value, 0) - debtTotal(),
    jan: accrualView('2026-01'), febCash: cashView('2026-02'), febAccrual: accrualView('2026-02'), commitment: commitmentView('2026-05').total
  }));
  expect(r.all).toBe(r.individual); expect(r.net).toBe(r.formula);
  expect(r.jan.items.some(x => x.source === 'installment')).toBe(true);
  expect(r.febCash.items.some(x => x.source === 'invoicePayment')).toBe(true);
  expect(r.febAccrual.items.some(x => x.source === 'invoicePayment')).toBe(false);
  expect(r.commitment).toBeGreaterThanOrEqual(0);
});

test('REL-02 sequência longa mantém invariantes depois de cada operação', async ({ page }) => {
  await boot(page, realLifeFixture());
  const checks = await page.evaluate(async () => {
    const out = [], check = () => out.push(sfpRound(allAccountBalance()) === sfpRound(state.accounts.reduce((s, a) => s + accountBalance(a.id), 0)) && sfpRound(netWorth()) === sfpRound(assetTotal() - debtTotal()));
    check(); state.transactions.push({ id: 201, kind: 'income', desc: 'Extra', amount: 1, date: '2026-04-01', accountId: 1, status: 'paid', balanceImpact: true }); check();
    state.transactions.push({ id: 202, kind: 'expense', desc: 'Café', amount: .1, date: '2026-04-02', accountId: 1, status: 'paid', balanceImpact: true }); check();
    state.transfers.push({ id: 203, date: '2026-04-03', amount: 10.01, fromId: 1, toId: 2, balanceImpact: true }); check();
    state.transactions.push({ id: 204, recurringId: 32, kind: 'expense', desc: 'Internet', amount: 100, date: '2026-04-10', accountId: 1, status: 'paid', balanceImpact: true }); check();
    state.purchases.push({ id: 205, cardId: 1, desc: 'Compra', total: 1, installments: 1, firstMonth: '2026-04', status: 'active', refunds: [] }); check();
    state.debts[0].balance = 700; state.debts[0].history.push({ type: 'amortization', amount: 100 }); check();
    state.goals[0].history.push({ date: '2026-04-11', amount: 10 }); check();
    state.snapshots.push({ id: 206, month: '2026-02', netWorth: netWorth() }); state.closedMonths.push('2026-02'); check();
    await save('sequência REL'); check(); return out;
  });
  expect(checks).toHaveLength(10); expect(checks.every(Boolean)).toBe(true);
});

test('REL-03 save, pagamento, undo e reload não dependem de memória transitória', async ({ page }) => {
  await boot(page, realLifeFixture());
  await page.evaluate(async () => { state.invoices[0].paidAmount += 13.34; state.invoices[0].payments.push({ date: '2026-04-17', amount: 13.34, balanceImpact: true }); await save('pagamento'); });
  await page.reload(); expect(await page.evaluate(() => [invoiceRemaining(1, '2026-01'), accountBalance(1)])).toEqual([0, 2818.32]);
  await page.evaluate(() => undoLast()); await page.reload();
  expect(await page.evaluate(() => [state.invoices[0].paidAmount, state.undo.length])).toEqual([20, 0]);
});

test('REL-04 backup complexo faz round-trip financeiramente equivalente', async ({ page }) => {
  await boot(page, realLifeFixture());
  const before = await page.evaluate(() => JSON.stringify(state));
  await page.evaluate(async raw => { state = clone(seed); await save('destruir'); await restoreState(JSON.parse(raw)); }, before);
  await page.reload();
  expect(await page.evaluate(() => { const x = clone(state); delete x.persistenceMeta; return x; })).toEqual((() => { const x = JSON.parse(before); delete x.persistenceMeta; return x; })());
});

test('REL-05 dois fechamentos permanecem imutáveis após meses futuros e reload', async ({ page }) => {
  const v = realLifeFixture(); v.snapshots.push({ id: 102, month: '2026-02', income: 3000, expense: 138.33, marker: 'imutável' }); v.closedMonths.push('2026-02');
  await boot(page, v); const old = await page.evaluate(() => JSON.stringify(state.snapshots));
  await page.evaluate(async () => { state.transactions.push({ id: 300, kind: 'expense', desc: 'Futura', amount: 999, date: '2026-06-01', accountId: 1, status: 'paid', balanceImpact: true }); await save('mês futuro'); });
  await page.reload(); expect(await page.evaluate(() => JSON.stringify(state.snapshots))).toBe(old);
});

test('REL-06 centavos, parcelamento, estorno e pagamentos não criam centavos', async ({ page }) => {
  await boot(page, realLifeFixture());
  const r = await page.evaluate(() => ({ parts: ['2026-01','2026-02','2026-03'].map(m => purchaseInstallment(state.purchases[0], m).amount), invoice: invoiceCalculated(1, '2026-03'), balance: accountBalance(1) }));
  expect(r.parts).toEqual([33.34, 33.33, 23.32]); expect(Math.round(r.parts.reduce((a, b) => a + b, 0) * 100) / 100).toBe(89.99);
  expect(Number.isInteger(Math.round(r.invoice * 100))).toBe(true); expect(Number.isInteger(Math.round(r.balance * 100))).toBe(true);
});

test('REL-07/08 legado incompleto normaliza de modo idempotente sem apagar desconhecidos', async ({ page }) => {
  const v = realLifeFixture(); v.future = { opaque: true }; v.cards[0].future = 7;
  delete v.persistenceMeta; delete v.cards[0].history; delete v.purchases[0].refunds; delete v.invoices[0].payments; delete v.debts[0].paidInstallments; delete v.transactions[0].balanceImpact; delete v.accounts[0].balanceDate; delete v.purchases[1].cancelledFromMonth;
  await boot(page, v);
  const r = await page.evaluate(() => { const once = clone(state); normalize(); const twice = clone(state); normalize(); return { once, twice, root: state.future, card: state.cards[0].future }; });
  expect(r.twice).toEqual(r.once); expect(r.root).toEqual({ opaque: true }); expect(r.card).toBe(7);
  expect(r.once.transactions[0].balanceImpact).toBeUndefined(); expect(r.once.accounts[0].balanceDate).toBeUndefined();
});

test('REL-10 reimportação tardia pela mesma statementKey não duplica entidade financeira', async ({ page }) => {
  await boot(page, realLifeFixture());
  const result = await page.evaluate(async () => { const before = { n: state.transactions.length, balance: allAccountBalance() }; const key = 'bank:2026-03-08:1001'; if (!state.transactions.some(t => t.statementKey === key)) state.transactions.push({ statementKey: key }); await save('reimportar'); return { before, after: { n: state.transactions.length, balance: allAccountBalance() } }; });
  expect(result.after).toEqual(result.before);
});
