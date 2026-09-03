const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
}

test('dívida por total contratado registra valor recebido, custo e prazo sem inventar taxa', async ({ page }) => {
  const value = fixture('Crédito por total contratado');
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-03';
  await boot(page, value);
  await page.evaluate(() => openManagementAction('dividas'));

  await page.locator('#debtName').fill('Linha de crédito QA');
  await page.locator('#debtAmortization').selectOption('contract-total');
  await expect(page.locator('#debtContractTotalFields')).toBeVisible();
  await expect(page.locator('#debtRate')).toBeDisabled();

  await page.locator('#debtPrincipalReceived').fill('104.60');
  await page.locator('#debtContractTotal').fill('120.48');
  await page.locator('#debtPrincipalDate').fill('2026-09-03');
  await page.locator('#debtInstallments').fill('1');
  await page.locator('#debtFirstDue').fill('2026-09-24');

  await expect(page.locator('#debtBalance')).toHaveValue('120.48');
  await expect(page.locator('#debtPayment')).toHaveValue('120.48');
  await expect(page.locator('#debtPaymentHint')).toContainText('R$ 15,88');
  await expect(page.locator('#debtPaymentHint')).toContainText('15,18%');
  await expect(page.locator('#debtPaymentHint')).toContainText('21 dias');
  await expect(page.locator('#debtPaymentHint')).toContainText(/não inventa/i);

  await page.locator('#debtForm').evaluate(form => form.requestSubmit());

  const saved = await page.evaluate(() => {
    const d = state.debts.find(x => x.name === 'Linha de crédito QA');
    return d && {
      balance: d.balance,
      payment: d.payment,
      principalReceived: d.principalReceived,
      contractTotal: d.contractTotal,
      principalDate: d.principalDate,
      rate: d.rate,
      rateKnown: d.rateKnown,
      method: d.amortizationMethod,
      installments: d.installments
    };
  });

  expect(saved).toEqual({
    balance: 120.48,
    payment: 120.48,
    principalReceived: 104.6,
    contractTotal: 120.48,
    principalDate: '2026-09-03',
    rate: 0,
    rateKnown: false,
    method: 'contract-total',
    installments: 1
  });

  await page.evaluate(() => renderDebts());
  const card = page.locator('#debtGrid .management-card').filter({ hasText: 'Linha de crédito QA' });
  await expect(card).toContainText('taxa não informada');
  await expect(card).not.toContainText('0% a.m.');

  await page.evaluate(() => openDebtDetail(state.debts.find(d => d.name === 'Linha de crédito QA').id));
  await expect(page.locator('#modalRoot')).toContainText('Valor recebido');
  await expect(page.locator('#modalRoot')).toContainText('R$ 104,60');
  await expect(page.locator('#modalRoot')).toContainText('Total contratado');
  await expect(page.locator('#modalRoot')).toContainText('R$ 120,48');
  await expect(page.locator('#modalRoot')).toContainText('R$ 15,88');
  await expect(page.locator('#modalRoot')).toContainText('15,18%');
});

test('total contratado menor que o recebido é rejeitado', async ({ page }) => {
  await boot(page, fixture('Crédito inválido'));
  await page.evaluate(() => openManagementAction('dividas'));
  await page.locator('#debtName').fill('Contrato inválido');
  await page.locator('#debtAmortization').selectOption('contract-total');
  await page.locator('#debtPrincipalReceived').fill('120.00');
  await page.locator('#debtContractTotal').fill('100.00');
  await page.locator('#debtInstallments').fill('1');
  await page.locator('#debtFirstDue').fill('2026-09-24');
  await page.locator('#debtForm').evaluate(form => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => state.debts.some(d => d.name === 'Contrato inválido'))).toBe(false);
  await expect(page.locator('#toast')).toContainText(/não pode ser menor/i);
});
