const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await expect.poll(() => page.evaluate(() => state.settings.name)).toBe(value.settings.name);
}

test('ERR-008 saldo inicial seleciona zero padrão e normaliza centavos em pt-BR', async ({ page }) => {
  await boot(page, fixture('Saldo monetário'));
  await page.evaluate(() => openManagementAction('contas'));

  const input = page.locator('#accountInitial');
  await expect(input).toHaveValue('0,00');
  await input.focus();
  await expect.poll(() => input.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, 4]);

  await input.fill('25');
  await input.blur();
  await expect(input).toHaveValue('25,00');

  await page.locator('#accountName').fill('Conta monetária QA');
  await page.locator('#accountForm').evaluate(form => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => state.accounts.find(a => a.name === 'Conta monetária QA')?.initial)).toBe(25);
});

test('ERR-011 dívida calcula parcela Price e respeita periodicidade da taxa', async ({ page }) => {
  await boot(page, fixture('Parcela automática'));
  await page.evaluate(() => openManagementAction('dividas'));

  await page.locator('#debtName').fill('Financiamento QA');
  await page.locator('#debtBalance').fill('1000');
  await page.locator('#debtRate').fill('12');
  await page.locator('#debtRatePeriod').selectOption('annual');
  await page.locator('#debtInstallments').fill('12');
  await page.locator('#debtFirstDue').fill('2026-02-10');

  await expect(page.locator('#debtPayment')).toHaveValue('88.56');
  await expect(page.locator('#debtPaymentHint')).toContainText(/Price/i);
  await expect(page.locator('#debtPaymentHint')).toContainText(/estimativa/i);

  const values = await page.evaluate(() => ({
    annual: calculateDebtInstallment({ principal: 1000, rate: 12, ratePeriod: 'annual', installments: 12, method: 'price' }),
    monthly: calculateDebtInstallment({ principal: 1000, rate: 1, ratePeriod: 'monthly', installments: 12, method: 'price' }),
    zero: calculateDebtInstallment({ principal: 1200, rate: 0, ratePeriod: 'monthly', installments: 12, method: 'price' })
  }));
  expect(values.annual).toBe(88.56);
  expect(values.monthly).toBe(88.85);
  expect(values.zero).toBe(100);

  await page.locator('#debtForm').evaluate(form => form.requestSubmit());
  const saved = await page.evaluate(() => {
    const d = state.debts.find(x => x.name === 'Financiamento QA');
    return d && { payment: d.payment, rate: d.rate, ratePeriod: d.ratePeriod, amortizationMethod: d.amortizationMethod };
  });
  expect(saved).toEqual({ payment: 88.56, rate: 12, ratePeriod: 'annual', amortizationMethod: 'price' });
});

test('ERR-011 parcela pode ser ajustada ao contrato real sem recálculo invasivo', async ({ page }) => {
  await boot(page, fixture('Parcela manual'));
  await page.evaluate(() => openManagementAction('dividas'));

  await page.locator('#debtBalance').fill('1000');
  await page.locator('#debtRate').fill('1');
  await page.locator('#debtInstallments').fill('12');
  await expect(page.locator('#debtPayment')).toHaveValue('88.85');

  await page.locator('#debtPayment').fill('95.50');
  await page.locator('#debtRate').fill('2');
  await expect(page.locator('#debtPayment')).toHaveValue('95.50');

  await page.locator('#debtAmortization').selectOption('manual');
  await expect(page.locator('#debtPaymentHint')).toContainText(/contrato real/i);
  await expect(page.locator('#debtPayment')).toHaveValue('95.50');
});

test('ERR-011 taxa percentual com ponto e zeros finais não vira milhar', async ({ page }) => {
  await boot(page, fixture('Taxa percentual QA'));
  await page.evaluate(() => openManagementAction('dividas'));
  await page.locator('#debtName').fill('Taxa 1 por cento');
  await page.locator('#debtBalance').fill('1000');
  await page.locator('#debtRate').fill('1.000');
  await page.locator('#debtRatePeriod').selectOption('monthly');
  await page.locator('#debtInstallments').fill('12');
  await expect.poll(() => page.locator('#debtPayment').inputValue()).toBe('88.85');
  await page.locator('#debtFirstDue').fill('2026-09-10');
  await page.locator('#debtForm').evaluate(form => form.requestSubmit());
  const saved = await page.evaluate(() => state.debts.find(d => d.name === 'Taxa 1 por cento'));
  expect(saved.rate).toBe(1);
  expect(saved.payment).toBe(88.85);
});
