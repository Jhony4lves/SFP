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
