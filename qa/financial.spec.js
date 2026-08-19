const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete } = require('./helpers');

async function loadFixture(page, value = fixture('Financeiro QA')) {
  const errors = monitor(page);
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await page.evaluate(value => { state = value; normalize(); }, value);
  return errors;
}

test('parcelas em centavos reconciliam exatamente com o total', async ({ page }) => {
  const errors = await loadFixture(page);
  const cases = [[100, 3], [10, 6], [0.05, 3], [9.99, 1], [1, 100]];
  for (const [total, count] of cases) {
    const result = await page.evaluate(({ total, count }) => {
      const purchase = { id: 1, cardId: 1, total, installments: count, firstMonth: '2026-01', status: 'active', refunds: [] };
      const amounts = Array.from({ length: count }, (_, index) => purchaseInstallment(purchase, monthAdd('2026-01', index)).amount);
      return { amounts, cents: amounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0) };
    }, { total, count });
    expect(result.cents).toBe(Math.round(total * 100));
    expect(Math.round((Math.max(...result.amounts) - Math.min(...result.amounts)) * 100)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('100 / 3 distribui o centavo restante deterministicamente na primeira parcela', async ({ page }) => {
  const errors = await loadFixture(page);
  const amounts = await page.evaluate(() => {
    const purchase = { id: 1, cardId: 1, total: 100, installments: 3, firstMonth: '2026-01', status: 'active', refunds: [] };
    return [0, 1, 2].map(index => purchaseInstallment(purchase, monthAdd('2026-01', index)).amount);
  });
  expect(amounts).toEqual([33.34, 33.33, 33.33]);
  expect(errors).toEqual([]);
});

test('estornos parcial, total e superior reduzem somente a obrigação da parcela', async ({ page }) => {
  const errors = await loadFixture(page);
  const result = await page.evaluate(() => {
    const purchase = { id: 1, cardId: 1, total: 30, installments: 3, firstMonth: '2026-01', status: 'active', refunds: [
      { month: '2026-01', amount: 2.25 }, { month: '2026-02', amount: 10 }, { month: '2026-03', amount: 20 }
    ] };
    return ['2026-01', '2026-02', '2026-03'].map(month => purchaseInstallment(purchase, month).amount);
  });
  expect(result).toEqual([7.75, 0, 0]);
  expect(errors).toEqual([]);
});

test('invariantes independentes separam caixa, competência e compromisso parcial', async ({ page }) => {
  const value = fixture('Visões QA');
  value.transactions = [
    { id: 1, accountId: 1, kind: 'income', amount: 500, date: '2026-02-01', status: 'paid', balanceImpact: true, desc: 'Receita', category: 'Trabalho' },
    { id: 2, accountId: 1, kind: 'expense', amount: 40, date: '2026-02-02', status: 'paid', balanceImpact: true, desc: 'Conta paga', category: 'Casa' },
    { id: 3, accountId: 1, kind: 'expense', amount: 70, date: '2026-02-03', status: 'pending', balanceImpact: false, desc: 'Conta aberta', category: 'Casa' }
  ];
  value.purchases = [{ id: 10, cardId: 1, total: 300, installments: 3, firstMonth: '2026-01', status: 'active', refunds: [{ month: '2026-02', amount: 20 }], desc: 'Compra', category: 'Outros' }];
  value.invoices = [{ id: 20, cardId: 1, month: '2026-02', paidAmount: 30, accountId: 1, payments: [{ date: '2026-02-10', amount: 30, balanceImpact: true }], status: 'partial' }];
  const errors = await loadFixture(page, value);
  const views = await page.evaluate(() => financialViews('2026-02'));
  expect(views.cash.income).toBe(500);
  expect(views.cash.expense).toBe(70); // conta paga + pagamento real da fatura
  expect(views.cash.net).toBe(430);
  expect(views.accrual.income).toBe(500);
  expect(views.accrual.expense).toBe(190); // 40 + 70 aberta + parcela 100 - estorno 20
  expect(views.commitments.total).toBe(120); // 70 aberta + 50 restantes da fatura
  expect(errors).toEqual([]);
});

test('conciliação de extrato vincula pagamento de fatura sem duplicar caixa', async ({ page }) => {
  const value = fixture('Conciliação QA');
  value.mesAtual = '2026-02';
  value.invoices = [{ id: 20, cardId: 1, month: '2026-01', officialTotal: 100, paidAmount: 100, accountId: 1, payments: [{ date: '2026-02-10', amount: 100, balanceImpact: true }], status: 'paid' }];
  const errors = await loadFixture(page, value);
  const result = await page.evaluate(async () => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement([{ date: '2026-02-11', desc: 'PAGAMENTO CARTAO', amount: -100, fitid: 'bank-1' }], 'extrato.csv');
    const candidate = statementDraft[0].candidateId;
    await importStatement();
    return { candidate, transactionCount: state.transactions.length, statementKey: state.invoices[0].payments[0].statementKey, cashExpense: cashView('2026-02').expense };
  });
  expect(result.candidate).toBe('invoice:20:0');
  expect(result.transactionCount).toBe(0);
  expect(result.statementKey).toContain('fit:bank-1');
  expect(result.cashExpense).toBe(100);
  expect(errors).toEqual([]);
});

test('conciliação de fatura rejeita débito não relacionado e correspondência ambígua', async ({ page }) => {
  const value = fixture('Matching conservador');
  value.invoices = [
    { id: 20, cardId: 1, month: '2026-01', accountId: 1, payments: [{ date: '2026-02-10', amount: 100, balanceImpact: true }] },
    { id: 21, cardId: 1, month: '2026-02', accountId: 1, payments: [{ date: '2026-02-11', amount: 100, balanceImpact: true }] }
  ];
  const errors = await loadFixture(page, value);
  const result = await page.evaluate(() => ({
    unrelated: reconcileCandidate({ date: '2026-02-10', desc: 'COMPRA MERCADO', amount: -100 }, 1),
    ambiguous: reconcileCandidate({ date: '2026-02-10', desc: 'PAGAMENTO CARTAO', amount: -100 }, 1)
  }));
  expect(result.unrelated).toBeNull();
  expect(result.ambiguous).toBeNull();
  expect(errors).toEqual([]);
});

test('parcelas e fechamento atravessam mês, ano e fevereiro sem lacunas', async ({ page }) => {
  const errors = await loadFixture(page);
  const result = await page.evaluate(() => {
    const purchase = { id: 1, cardId: 1, total: 12, installments: 4, firstMonth: '2026-11', status: 'active', refunds: [] };
    return {
      installments: ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map(month => purchaseInstallment(purchase, month)?.amount ?? null),
      decemberAfterClose: currentInvoiceMonth({ closeDay: 30 }, new Date(2026, 11, 31, 12)),
      januaryBeforeClose: currentInvoiceMonth({ closeDay: 2 }, new Date(2027, 0, 1, 12)),
      februaryClose31: currentInvoiceMonth({ closeDay: 31 }, new Date(2028, 1, 29, 12))
    };
  });
  expect(result.installments).toEqual([null, 3, 3, 3, 3, null]);
  expect(result.decemberAfterClose).toBe('2027-01');
  expect(result.januaryBeforeClose).toBe('2027-01');
  expect(result.februaryClose31).toBe('2028-02');
  expect(errors).toEqual([]);
});
