const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
}

test('editar dívida legada salva dia/conta e limpa modo de edição', async ({ page }) => {
  const value = fixture('Formulários críticos QA');
  value.accounts = [
    { id: 1, name: 'Principal', type: 'Conta corrente', initial: 1000 },
    { id: 2, name: 'Secundária', type: 'Conta corrente', initial: 500 }
  ];
  value.debts = [{ id: 77, name: 'Contrato antigo', balance: 900, rate: 1.5, payment: 100, firstDue: '2026-09-10', installments: 9, paidInstallments: 0, paymentMethod: 'bank', history: [] }];
  await boot(page, value);

  await page.evaluate(() => editDebt(77));
  await page.locator('#modalRoot #debtDay').fill('25');
  await page.locator('#modalRoot #debtAccount').selectOption('2');
  await page.locator('#modalRoot #debtForm button').click();

  await expect.poll(() => page.evaluate(() => state.debts[0].dueDay)).toBe(25);
  await expect.poll(() => page.evaluate(async () => (await dbGet()).value.debts[0].accountId)).toBe(2);
  await expect(page.locator('#debtFormMode')).toHaveText('Criação');
  await expect(page.locator('#debtSubmit')).toHaveText('Adicionar dívida');
});

test('formulários críticos recusam valores monetários inválidos', async ({ page }) => {
  const value = fixture('Validação monetária QA');
  await boot(page, value);

  await page.locator('.nav button[data-page="cartoes"]').click();
  await page.evaluate(() => openManagementAction('cartoes'));
  await page.locator('#modalRoot #cardName').fill('Cartão inválido');
  await page.locator('#modalRoot #cardLimit').fill('0');
  await page.locator('#modalRoot #cardClose').fill('10');
  await page.locator('#modalRoot #cardDue').fill('20');
  await page.locator('#modalRoot #cardForm button').click();
  await expect.poll(() => page.evaluate(() => state.cards.some(card => card.name === 'Cartão inválido'))).toBe(false);
  await expect(page.locator('#toast')).toContainText('limite do cartão');
  await page.locator('#modalRoot #closeProgressive').click();
  await expect(page.locator('#modalRoot')).toHaveClass('hidden');

  await page.locator('.nav button[data-page="metas"]').click();
  await page.evaluate(() => openManagementAction('metas'));
  await page.locator('#modalRoot #goalName').fill('Meta inválida');
  await page.locator('#modalRoot #goalTarget').fill('-1');
  await page.locator('#modalRoot #goalForm button').click();
  await expect.poll(() => page.evaluate(() => state.goals.some(goal => goal.name === 'Meta inválida'))).toBe(false);
  await expect(page.locator('#toast')).toContainText('valor alvo da meta');
});


test('editar dívida payroll somente no nome preserva campos ausentes', async ({ page }) => {
  const value = fixture('Payroll preservado QA');
  value.accounts = [{ id: 1, name: 'Principal', type: 'Conta corrente', initial: 1000 }];
  value.debts = [{ id: 89, name: 'Consignado', balance: 1000, rate: 2, payment: 100, firstDue: '2026-09-26', installments: 10, paidInstallments: 0, paymentMethod: 'payroll', history: [], metadata: { source: 'qa' } }];
  await boot(page, value);

  await page.evaluate(() => editDebt(89));
  await page.locator('#modalRoot #debtName').fill('Consignado renomeado');
  await page.locator('#modalRoot #debtForm button').click();

  const debt = await page.evaluate(() => structuredClone(state.debts.find(item => item.id === 89)));
  expect(debt.name).toBe('Consignado renomeado');
  expect(debt).not.toHaveProperty('dueDay');
  expect(debt).not.toHaveProperty('accountId');
  expect(debt.paymentMethod).toBe('payroll');
  expect(debt.metadata).toEqual({ source: 'qa' });
});

test('dívida valida número de parcelas sem coerção silenciosa', async ({ page }) => {
  const value = fixture('Parcelas dívida QA');
  value.debts = [{ id: 88, name: 'Dívida existente', balance: 500, rate: 1, payment: 50, firstDue: '2026-09-10', installments: 5, paidInstallments: 0, paymentMethod: 'bank', history: [] }];
  await boot(page, value);

  await page.locator('.nav button[data-page="dividas"]').click();
  await page.evaluate(() => openManagementAction('dividas'));
  for (const invalid of ['', '0', '-2', '1.5']) {
    await page.locator('#modalRoot #debtName').fill(`Dívida inválida ${invalid}`);
    await page.locator('#modalRoot #debtBalance').fill('100');
    await page.locator('#modalRoot #debtPayment').fill('10');
    await page.locator('#modalRoot #debtRate').fill('0');
    await page.locator('#modalRoot #debtFirstDue').fill('2026-09-10');
    await page.locator('#modalRoot #debtInstallments').fill(invalid);
    await page.locator('#modalRoot #debtForm button').click();
    await expect(page.locator('#toast')).toContainText('parcelas da dívida');
    await expect.poll(() => page.evaluate(() => state.debts.length)).toBe(1);
  }

  await page.evaluate(() => editDebt(88));
  await page.locator('#modalRoot #debtInstallments').fill('2.5');
  await page.locator('#modalRoot #debtForm button').click();
  await expect(page.locator('#toast')).toContainText('parcelas da dívida');
  await expect.poll(() => page.evaluate(() => state.debts.find(debt => debt.id === 88).installments)).toBe(5);

  await page.locator('#modalRoot #debtInstallments').fill('6');
  await page.locator('#modalRoot #debtForm button').click();
  await expect.poll(() => page.evaluate(() => state.debts.find(debt => debt.id === 88).installments)).toBe(6);
});
