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
  await page.locator('#debtMoreDetails summary').click();
  await page.locator('#debtDay').fill('25');
  await page.locator('#debtAccount').selectOption('2');
  await page.locator('#debtForm button').click();

  await expect.poll(() => page.evaluate(() => state.debts[0].dueDay)).toBe(25);
  await expect.poll(() => page.evaluate(async () => (await dbGet()).value.debts[0].accountId)).toBe(2);
  await expect(page.locator('#debtFormMode')).toHaveText('Criação');
  await expect(page.locator('#debtSubmit')).toHaveText('Adicionar dívida');
});

test('formulários críticos recusam valores monetários inválidos', async ({ page }) => {
  const value = fixture('Validação monetária QA');
  await boot(page, value);

  await page.locator('.nav button[data-page="cartoes"]').click();
  await page.locator('#cardName').fill('Cartão inválido');
  await page.locator('#cardLimit').fill('0');
  await page.locator('#cardClose').fill('10');
  await page.locator('#cardDue').fill('20');
  await page.locator('#cardForm button').click();
  await expect.poll(() => page.evaluate(() => state.cards.some(card => card.name === 'Cartão inválido'))).toBe(false);
  await expect(page.locator('#toast')).toContainText('limite do cartão');

  await page.locator('.nav button[data-page="metas"]').click();
  await page.locator('#goalName').fill('Meta inválida');
  await page.locator('#goalTarget').fill('-1');
  await page.locator('#goalForm button').click();
  await expect.poll(() => page.evaluate(() => state.goals.some(goal => goal.name === 'Meta inválida'))).toBe(false);
  await expect(page.locator('#toast')).toContainText('valor alvo da meta');
});

test('dívida valida número de parcelas sem coerção silenciosa', async ({ page }) => {
  const value = fixture('Parcelas dívida QA');
  value.debts = [{ id: 88, name: 'Dívida existente', balance: 500, rate: 1, payment: 50, firstDue: '2026-09-10', installments: 5, paidInstallments: 0, paymentMethod: 'bank', history: [] }];
  await boot(page, value);

  await page.locator('.nav button[data-page="dividas"]').click();
  for (const invalid of ['', '0', '-2', '1.5']) {
    await page.locator('#debtName').fill(`Dívida inválida ${invalid}`);
    await page.locator('#debtBalance').fill('100');
    await page.locator('#debtPayment').fill('10');
    await page.locator('#debtRate').fill('0');
    await page.locator('#debtFirstDue').fill('2026-09-10');
    await page.locator('#debtInstallments').fill(invalid);
    await page.locator('#debtForm button').click();
    await expect(page.locator('#toast')).toContainText('parcelas da dívida');
    await expect.poll(() => page.evaluate(() => state.debts.length)).toBe(1);
  }

  await page.evaluate(() => editDebt(88));
  await page.locator('#debtInstallments').fill('2.5');
  await page.locator('#debtForm button').click();
  await expect(page.locator('#toast')).toContainText('parcelas da dívida');
  await expect.poll(() => page.evaluate(() => state.debts.find(debt => debt.id === 88).installments)).toBe(5);

  await page.locator('#debtInstallments').fill('6');
  await page.locator('#debtForm button').click();
  await expect.poll(() => page.evaluate(() => state.debts.find(debt => debt.id === 88).installments)).toBe(6);
});
