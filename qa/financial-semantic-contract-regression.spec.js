const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete } = require('./helpers');

async function loadFixture(page, value) {
  const errors = monitor(page);
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await page.evaluate(next => {
    state = next;
    normalize();
  }, value);
  return errors;
}

test('#163 financialContextSnapshot não chama competência pendente de realizado', async ({ page }) => {
  const value = fixture('QA issue 163');
  value.mesAtual = '2026-02';
  value.transactions = [
    {
      id: 16301,
      accountId: 1,
      kind: 'income',
      amount: 500,
      date: '2026-02-01',
      status: 'paid',
      balanceImpact: true,
      desc: 'Receita recebida',
      category: 'Trabalho'
    },
    {
      id: 16302,
      accountId: 1,
      kind: 'expense',
      amount: 70,
      date: '2026-02-10',
      status: 'pending',
      balanceImpact: false,
      desc: 'Despesa apenas por competência',
      category: 'Casa'
    }
  ];

  const errors = await loadFixture(page, value);
  const result = await page.evaluate(() => ({
    cash: cashView('2026-02'),
    accrual: accrualView('2026-02'),
    snapshot: financialContextSnapshot({ reference: new Date(2026, 1, 15, 12), months: 1 }).realized
  }));

  expect(result.cash).toMatchObject({ income: 500, expense: 0, net: 500 });
  expect(result.accrual).toMatchObject({ income: 500, expense: 70, net: 430 });
  expect(result.snapshot).toEqual({
    incomeCents: 50000,
    expenseCents: 0,
    resultCents: 50000
  });
  expect(errors).toEqual([]);
});

test('#164 transferência futura para Reserva não conta como poupança realizada', async ({ page }) => {
  const value = fixture('QA issue 164');
  value.mesAtual = '2099-01';
  value.accounts = [
    {
      id: 1,
      name: 'Conta corrente',
      type: 'Conta corrente',
      initial: 1000,
      balanceMode: 'snapshot',
      balanceDate: '2098-12-31'
    },
    {
      id: 2,
      name: 'Reserva',
      type: 'Reserva',
      initial: 0,
      balanceMode: 'snapshot',
      balanceDate: '2098-12-31'
    }
  ];
  value.transfers = [
    {
      id: 16401,
      desc: 'Aporte agendado',
      amount: 500,
      date: '2099-01-20',
      fromId: 1,
      toId: 2,
      balanceImpact: false
    }
  ];

  const errors = await loadFixture(page, value);
  const result = await page.evaluate(() => ({
    savings: actualSavings('2099-01'),
    budgetSavings: budgetModelSnapshot('2099-01').save.spent,
    balances: [accountBalance(1), accountBalance(2)]
  }));

  expect(result.balances).toEqual([1000, 0]);
  expect(result.savings).toBe(0);
  expect(result.budgetSavings).toBe(0);
  expect(errors).toEqual([]);
});
