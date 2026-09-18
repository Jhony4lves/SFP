const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete, monitor } = require('./helpers');

async function boot(page, value) {
  const errors = monitor(page);
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  return errors;
}

function debtFixture(name='Dívida fora de ordem') {
  const value = fixture(name);
  value.mesAtual = '2026-03';
  value.debts = [{
    id: 50,
    name: 'Empréstimo QA',
    balance: 300,
    rate: 0,
    ratePeriod: 'monthly',
    payment: 100,
    installments: 3,
    paidInstallments: 1,
    firstDue: '2026-01-10',
    dueDay: 10,
    accountId: 1,
    paymentMethod: 'bank',
    amortizationMethod: 'manual',
    history: [{ type: 'payment', installment: 3, amount: 100, date: '2026-03-10' }]
  }];
  return value;
}

async function statuses(page) {
  return page.evaluate(() => Object.fromEntries(
    ['2026-01','2026-02','2026-03'].map(month => {
      const due = debtDueForMonth(month).find(row => row.debt.id === 50);
      return [month, due?.status || null];
    })
  ));
}

test('histórico explícito marca somente a parcela realmente paga', async ({ page }) => {
  const errors = await boot(page, debtFixture());

  expect(await statuses(page)).toEqual({
    '2026-01': 'planned',
    '2026-02': 'planned',
    '2026-03': 'paid'
  });

  const persisted = await page.evaluate(async () => (await dbGet()).value.debts.find(d => d.id === 50));
  expect(persisted.paidInstallments).toBe(1);
  expect(persisted.history).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'payment', installment: 3 })
  ]));

  await page.reload();
  await expectBootComplete(page, expect, debtFixture().settings.name);
  expect(await statuses(page)).toEqual({
    '2026-01': 'planned',
    '2026-02': 'planned',
    '2026-03': 'paid'
  });
  expect(errors).toEqual([]);
});

test('paidInstallments continua preenchendo parcelas legadas sem identidade explícita', async ({ page }) => {
  const value = debtFixture('Dívida legada fora de ordem');
  value.debts[0].paidInstallments = 2;
  value.debts[0].history = [
    { type: 'payment', amount: 100, date: '2026-01-10' },
    { type: 'payment', amount: 100, date: '2026-02-10' }
  ];
  const errors = await boot(page, value);

  expect(await statuses(page)).toEqual({
    '2026-01': 'paid',
    '2026-02': 'paid',
    '2026-03': 'planned'
  });
  expect(errors).toEqual([]);
});
