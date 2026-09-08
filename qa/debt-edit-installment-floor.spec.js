const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}

async function submitDebtEdit(page, id, installments) {
  await page.evaluate(id => editDebt(id), id);
  await page.locator('#debtInstallments').fill(String(installments));
  await page.locator('#debtForm').evaluate(form => form.requestSubmit());
}

test('não permite reduzir contrato abaixo da maior parcela explicitamente paga', async ({ page }) => {
  const value = fixture('Debt edit explicit floor');
  value.debts = [{
    id: 501,
    name: 'Empréstimo QA',
    balance: 200,
    rate: 0,
    payment: 100,
    installments: 3,
    paidInstallments: 1,
    firstDue: '2026-01-10',
    accountId: 1,
    paymentMethod: 'bank',
    amortizationMethod: 'manual',
    history: [{ id: 9001, type: 'payment', installment: 3, amount: 100, date: '2026-03-10' }]
  }];
  await boot(page, value);

  await submitDebtEdit(page, 501, 2);

  expect(await page.evaluate(() => ({
    installments: state.debts[0].installments,
    history: state.debts[0].history.map(h => h.installment),
    toast: document.querySelector('#toast')?.textContent || ''
  }))).toEqual({
    installments: 3,
    history: [3],
    toast: expect.stringContaining('parcela 3')
  });

  await page.reload();
  expect(await page.evaluate(() => state.debts[0].installments)).toBe(3);
});

test('usa paidInstallments como piso para estados legados sem número explícito', async ({ page }) => {
  const value = fixture('Debt edit legacy floor');
  value.debts = [{
    id: 502,
    name: 'Dívida legada',
    balance: 200,
    rate: 0,
    payment: 100,
    installments: 4,
    paidInstallments: 2,
    firstDue: '2026-01-10',
    accountId: 1,
    paymentMethod: 'bank',
    amortizationMethod: 'manual',
    history: [
      { id: 1, type: 'payment', amount: 100, date: '2026-01-10' },
      { id: 2, type: 'payment', amount: 100, date: '2026-02-10' }
    ]
  }];
  await boot(page, value);

  await submitDebtEdit(page, 502, 1);
  expect(await page.evaluate(() => state.debts[0].installments)).toBe(4);

  await submitDebtEdit(page, 502, 2);
  await expect.poll(() => page.evaluate(() => state.debts[0].installments)).toBe(2);
  expect(await page.evaluate(() => state.debts[0].history.length)).toBe(2);
});
