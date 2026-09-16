const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(name => typeof state !== 'undefined' && state?.settings?.name === name, value.settings.name);
}

test('AUDIT-HIST-01: fatura liquidada com histórico parcial pode ser corrigida em lote sem alterar saldo', async ({ page }) => {
  const value = fixture('Histórico parcial seguro');
  value.purchases.push({
    id: 501, cardId: 1, desc: 'Compra preservada', total: 30, installments: 1,
    purchaseDate: '2026-01-05', firstMonth: '2026-01', category: 'Outros', status: 'active', refunds: []
  });
  value.invoices.push({
    id: 581, cardId: 1, month: '2026-01', status: 'paid', paidAmount: 100,
    officialTotal: 100, accountId: 1,
    payments: [{ date: '2026-02-01', amount: 100, balanceImpact: false, targetMonth: '2026-01', sourceDesc: 'Pagamento recebido' }]
  });
  await boot(page, value);

  const before = await page.evaluate(() => ({
    balance: accountBalance(1),
    issue: auditData().issues.find(i => i.invoiceId === 581)
  }));
  expect(before.issue).toMatchObject({ type: 'historical-invoice-partial', repairable: true });

  await page.evaluate(() => setPage('auditoria'));
  const batch = page.locator('#repairSafeHistoricalAudit');
  await expect(batch).toBeEnabled();
  await expect(batch).toContainText('1 inconsistência histórica segura');
  await batch.click();
  await page.getByRole('button', { name: 'Corrigir 1 registro' }).click();

  await expect.poll(() => page.evaluate(() => state.invoices.find(i => i.id === 581)?.historicalOnly)).toBe(true);
  const after = await page.evaluate(() => {
    const inv = state.invoices.find(i => i.id === 581);
    return {
      balance: accountBalance(1),
      officialTotal: inv.officialTotal,
      paidAmount: inv.paidAmount,
      paymentCount: inv.payments.length,
      paymentImpact: inv.payments[0].balanceImpact,
      purchaseStillExists: state.purchases.some(p => p.id === 501),
      remaining: auditData().issues.filter(i => i.invoiceId === 581).length,
      repairMode: inv.historicalRepairMode
    };
  });
  expect(after).toMatchObject({
    balance: before.balance,
    officialTotal: 100,
    paidAmount: 100,
    paymentCount: 1,
    paymentImpact: false,
    purchaseStillExists: true,
    remaining: 0,
    repairMode: 'partial-history'
  });

  const second = await page.evaluate(async () => {
    const before = JSON.stringify(state.invoices.find(i => i.id === 581));
    const result = await repairSafeHistoricalAudit();
    const after = JSON.stringify(state.invoices.find(i => i.id === 581));
    return { result, same: before === after };
  });
  expect(second).toEqual({ result: false, same: true });
});

test('AUDIT-HIST-02: fatura atual ou aberta continua exigindo revisão manual', async ({ page }) => {
  const value = fixture('Fatura atual ambígua');
  value.purchases.push({
    id: 502, cardId: 1, desc: 'Compra atual', total: 30, installments: 1,
    purchaseDate: '2026-09-05', firstMonth: '2026-09', category: 'Outros', status: 'active', refunds: []
  });
  value.invoices.push({
    id: 582, cardId: 1, month: '2026-09', status: 'open', paidAmount: 0,
    officialTotal: 100, accountId: 1, payments: []
  });
  await boot(page, value);

  const issue = await page.evaluate(() => auditData().issues.find(i => i.invoiceId === 582));
  expect(issue.type).toBe('invoice-total-mismatch');
  expect(issue.repairable).not.toBe(true);

  await page.evaluate(() => setPage('auditoria'));
  await expect(page.locator('#auditIssues [data-audit-invoice="1:2026-09"]')).toBeVisible();
  await expect(page.locator('#repairSafeHistoricalAudit')).toBeDisabled();
});

test('AUDIT-HIST-03: críticos não reparáveis explicam o próximo passo', async ({ page }) => {
  const value = fixture('Crítico explicado');
  value.transactions.push({
    id: 777, kind: 'expense', desc: 'Lançamento quebrado', amount: 0,
    date: '2026-01-08', category: 'Outros', accountId: 1, status: 'paid'
  });
  await boot(page, value);

  const issue = await page.evaluate(() => auditData().issues.find(i => i.level === 'critical' && /valor inválido/i.test(i.text)));
  expect(issue).toBeTruthy();
  expect(issue.solution).toMatch(/corrija o valor/i);

  await page.evaluate(() => setPage('auditoria'));
  await expect(page.locator('#auditIssues')).toContainText('Como resolver:');
  await expect(page.locator('#auditIssues')).toContainText('corrija o valor');
});
