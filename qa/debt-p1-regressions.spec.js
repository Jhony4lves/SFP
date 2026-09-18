const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB, monitor } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
}

test('#181 pagar somente a parcela 3 não marca a parcela 1 como paga', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('QA dívida fora de ordem #181');
  value.debts = [{
    id: 181,
    name: 'Empréstimo 3 parcelas',
    balance: 300,
    rate: 0,
    payment: 100,
    firstDue: '2026-01-10',
    installments: 3,
    paidInstallments: 1,
    paymentMethod: 'bank',
    accountId: 1,
    history: [{ type: 'payment', installment: 3, amount: 100, date: '2026-03-10' }]
  }];

  await boot(page, value);

  const result = await page.evaluate(() => ({
    jan: debtDueForMonth('2026-01')[0]?.status,
    feb: debtDueForMonth('2026-02')[0]?.status,
    mar: debtDueForMonth('2026-03')[0]?.status
  }));

  expect(result).toEqual({ jan: 'pending', feb: 'pending', mar: 'paid' });
  expect(errors).toEqual([]);
});

test('#186 edição não reduz parcelas abaixo do maior número já pago', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('QA cronograma impossível #186');
  value.debts = [{
    id: 186,
    name: 'Contrato com histórico',
    balance: 100,
    rate: 0,
    payment: 100,
    firstDue: '2026-01-10',
    installments: 3,
    paidInstallments: 1,
    paymentMethod: 'bank',
    accountId: 1,
    history: [{ type: 'payment', installment: 3, amount: 100, date: '2026-03-10' }]
  }];

  await boot(page, value);

  await page.evaluate(() => editDebt(186));
  await page.locator('#modalRoot #debtInstallments').fill('2');
  await page.locator('#modalRoot #debtForm button').click();

  await expect.poll(() => page.evaluate(() => state.debts.find(d => d.id === 186).installments)).toBe(3);
  await expect(page.locator('#toast')).toContainText(/parcela|histórico|pag/i);

  const persisted = await page.evaluate(async () => (await dbGet()).value.debts.find(d => d.id === 186));
  expect(persisted.installments).toBe(3);
  expect(persisted.history).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'payment', installment: 3 })
  ]));
  expect(errors).toEqual([]);
});
