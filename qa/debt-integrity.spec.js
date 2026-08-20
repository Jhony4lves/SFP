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

async function readDebt(page, id) {
  return page.evaluate(id => structuredClone(state.debts.find(debt => debt.id === id)), id);
}

function payrollDebt() {
  return {
    id: 501,
    name: 'Crédito Consignado CLT',
    contractTotal: 4678.30,
    balance: 4678.30,
    principalReceived: 3800,
    financedAmount: 3885.48,
    iof: 85.48,
    rate: 2.74,
    cetMonthly: 3.08,
    cetAnnual: 43.90,
    payment: 467.83,
    installments: 10,
    paidInstallments: 0,
    firstDue: '2026-09-26',
    lastDue: '2027-06-26',
    paymentMethod: 'payroll',
    history: [],
    note: 'Contrato original preservado.',
    metadata: { source: 'seed', immutableReference: 'QA-501' }
  };
}

test('editar somente o nome preserva integralmente contrato payroll e cronograma após reload', async ({ page }) => {
  const value = fixture('Dívida seed QA');
  value.mesAtual = '2026-09';
  value.debts = [payrollDebt()];
  await loadState(page, value);
  const errors = monitor(page);
  const before = await readDebt(page, 501);

  await page.evaluate(() => editDebt(501));
  await page.locator('#debtName').fill('Consignado renomeado');
  await page.locator('#debtForm button').click();
  await expect.poll(() => page.evaluate(() => state.debts[0].name)).toBe('Consignado renomeado');
  await page.reload();
  await expectBootComplete(page, expect, 'Dívida seed QA');

  const after = await readDebt(page, 501);
  const { name: beforeName, ...beforeFields } = before;
  const { name: afterName, ...afterFields } = after;
  expect(beforeName).toBe('Crédito Consignado CLT');
  expect(afterName).toBe('Consignado renomeado');
  expect(afterFields).toEqual(beforeFields);
  expect(after.paymentMethod).toBe('payroll');
  expect(await page.evaluate(() => debtDueForMonth('2026-09').map(due => ({ n: due.n, method: due.paymentMethod })))).toEqual([{ n: 1, method: 'payroll' }]);
  expect(await page.evaluate(() => commitmentView('2026-09').items.some(item => item.source === 'payroll' && item.debtId === 501))).toBe(true);
  expect(errors).toEqual([]);
});

test('nova dívida criada pelo DOM alimenta patrimônio, competência e compromissos após reload', async ({ page }) => {
  const value = fixture('Nova dívida QA');
  value.mesAtual = '2026-12';
  await loadState(page, value);
  const errors = monitor(page);

  await page.locator('.nav button[data-page="dividas"]').click();
  await page.locator('#debtName').fill('Financiamento UI');
  await page.locator('#debtBalance').fill('1200');
  await page.locator('#debtRate').fill('2');
  await page.locator('#debtPayment').fill('100');
  await page.locator('#debtFirstDue').fill('2026-12-31');
  await page.locator('#debtInstallments').fill('4');
  await page.locator('#debtDay').fill('31');
  await page.locator('#debtAccount').selectOption('1');
  await page.locator('#debtForm button').click();
  await expect.poll(() => page.evaluate(() => state.debts.length)).toBe(1);
  const createdId = await page.evaluate(() => state.debts[0].id);

  await page.reload();
  await expectBootComplete(page, expect, 'Nova dívida QA');
  const result = await page.evaluate(id => {
    const debt = state.debts.find(item => item.id === id);
    return {
      debt: structuredClone(debt),
      due: ['2026-12', '2027-01', '2027-02', '2027-03'].map(month => debtDueForMonth(month).map(item => item.date)),
      accrual: accrualView('2027-01').expense,
      commitment: commitmentView('2027-01').total,
      debtTotal: debtTotal(),
      netWorth: netWorth()
    };
  }, createdId);

  expect(result.debt).toMatchObject({ firstDue: '2026-12-31', installments: 4, paidInstallments: 0, paymentMethod: 'bank', history: [] });
  expect(result.due).toEqual([['2026-12-31'], ['2027-01-31'], ['2027-02-28'], ['2027-03-31']]);
  expect(result.accrual).toBe(100);
  expect(result.commitment).toBe(100);
  expect(result.debtTotal).toBe(1200);
  expect(result.netWorth).toBe(-200);
  expect(errors).toEqual([]);
});

test('amortizações e pagamentos sucessivos nunca aumentam saldo e limitam paidInstallments', async ({ page }) => {
  const value = fixture('Amortização QA');
  const debt = payrollDebt();
  debt.contractTotal = 1000;
  debt.balance = 1000;
  debt.payment = 100;
  debt.installments = 3;
  debt.firstDue = '2026-09-15';
  debt.lastDue = '2026-11-15';
  value.debts = [debt];
  value.mesAtual = '2026-09';
  await loadState(page, value);
  const errors = monitor(page);

  page.once('dialog', dialog => dialog.accept('250'));
  await page.evaluate(() => amortize(501));
  await expect.poll(() => page.evaluate(() => state.debts[0].balance)).toBe(750);
  await page.evaluate(() => payDebtInstallment(501));
  await expect.poll(() => page.evaluate(() => state.debts[0].balance)).toBe(650);

  await page.evaluate(() => { state.mesAtual = '2026-10'; renderAll(); });
  page.once('dialog', dialog => dialog.accept('75'));
  await page.evaluate(() => amortize(501));
  await expect.poll(() => page.evaluate(() => state.debts[0].balance)).toBe(575);
  await page.evaluate(() => payDebtInstallment(501));
  await expect.poll(() => page.evaluate(() => state.debts[0].balance)).toBe(475);

  await page.evaluate(() => { state.mesAtual = '2026-11'; renderAll(); });
  await page.evaluate(() => payDebtInstallment(501));
  await expect.poll(() => page.evaluate(() => state.debts[0].balance)).toBe(375);
  await page.evaluate(() => payDebtInstallment(501));

  await page.reload();
  await expectBootComplete(page, expect, 'Amortização QA');
  const after = await readDebt(page, 501);
  expect(after.balance).toBe(375);
  expect(after.paidInstallments).toBe(3);
  expect(after.paidInstallments).toBeLessThanOrEqual(after.installments);
  expect(after.history.map(item => item.type)).toEqual(['extra', 'payment', 'extra', 'payment', 'payment']);
  expect(after.history.filter(item => item.type === 'extra').map(item => item.amount)).toEqual([250, 75]);
  expect(errors).toEqual([]);
});

test('cronograma limita dia 31 em fevereiro comum, bissexto, abril e virada de ano', async ({ page }) => {
  const value = fixture('Datas de dívida QA');
  value.debts = [{ id: 1, name: 'Datas', balance: 400, payment: 100, installments: 26, paidInstallments: 0, firstDue: '2026-01-31', paymentMethod: 'bank', history: [] }];
  await loadState(page, value);
  const errors = monitor(page);
  const dates = await page.evaluate(() => ['2026-02', '2026-04', '2026-12', '2027-01', '2028-02'].map(month => debtDueForMonth(month)[0]?.date));
  expect(dates).toEqual(['2026-02-28', '2026-04-30', '2026-12-31', '2027-01-31', '2028-02-29']);
  await page.reload();
  await expectBootComplete(page, expect, 'Datas de dívida QA');
  expect(await page.evaluate(() => debtDueForMonth('2028-02')[0].date)).toBe('2028-02-29');
  expect(errors).toEqual([]);
});
