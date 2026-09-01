const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}

test('transferência histórica importada não altera o saldo atual das contas', async ({ page }) => {
  const value = fixture('Transferência histórica sem impacto');
  value.baseDate = '2026-08-31';
  value.accounts.push({ id: 2, name: 'Mercado Pago', type: 'Conta corrente', initial: 0, balanceMode: 'snapshot', balanceDate: '2026-08-31' });
  await boot(page, value);

  const before = await page.evaluate(() => ({ nubank: accountBalance(1), mercadoPago: accountBalance(2) }));

  await page.evaluate(async () => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement([
      { date: '2026-08-17', desc: 'PIX TRANSF ENTRE CONTAS', amount: -746.39, fitid: 'HIST-TRANSFER-74639' }
    ], 'historico.ofx');
    statementDraft[0].action = 'transfer';
    statementDraft[0].transferAccountId = 2;
    await importStatement();
  });

  const after = await page.evaluate(() => ({
    nubank: accountBalance(1),
    mercadoPago: accountBalance(2),
    transfers: state.transfers.map(t => ({ amount: t.amount, balanceImpact: t.balanceImpact }))
  }));

  expect(after.nubank).toBe(before.nubank);
  expect(after.mercadoPago).toBe(before.mercadoPago);
  expect(after.transfers).toContainEqual({ amount: 746.39, balanceImpact: false });
});
