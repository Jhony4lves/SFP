const { test, expect } = require('@playwright/test');
const { fixture, monitor, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}

test('#77 extrato com saldo final incompatível não pode ser persistido silenciosamente', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('QA fechamento de extrato #77');
  value.accounts[0].name = 'Nubank';
  value.accounts[0].initial = 1000;
  value.accounts[0].balanceMode = 'snapshot';
  value.accounts[0].balanceDate = '2026-01-30';
  value.transactions = [];
  value.transfers = [];
  value.transferEvidence = [];
  value.statements = [];

  await boot(page, value);

  const result = await page.evaluate(async () => {
    const text = `<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260131000000<TRNAMT>-25.00<FITID>BUY-31<MEMO>Compra no debito</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>900.00<DTASOF>20260131000000</LEDGERBAL></OFX>`;
    const parsed = parseOFX(text);
    const rows = [...parsed];
    const meta = parsed.statementMeta;

    document.querySelector('#stmtAccount').value = '1';
    prepareStatement(rows, 'nubank-inconsistente.ofx', meta);

    const before = {
      balance: accountBalance(1),
      initial: state.accounts[0].initial,
      balanceDate: state.accounts[0].balanceDate,
      transactions: state.transactions.length,
      statements: state.statements.length
    };

    await importStatement();

    return {
      meta,
      before,
      after: {
        balance: accountBalance(1),
        initial: state.accounts[0].initial,
        balanceDate: state.accounts[0].balanceDate,
        transactions: state.transactions.length,
        statements: state.statements.length
      }
    };
  });

  expect(result.meta).toMatchObject({ closingBalance: 900, closingDate: '2026-01-31', source: 'ofx' });
  expect(result.before).toEqual({
    balance: 1000,
    initial: 1000,
    balanceDate: '2026-01-30',
    transactions: 0,
    statements: 0
  });

  // O extrato declara variação de -R$ 100,00, mas só contém -R$ 25,00 em
  // movimentos aceitos. Sem um aceite específico da divergência, o importador
  // deve bloquear a persistência em vez de transformar R$ 900,00 em novo
  // snapshot e esconder R$ 75,00 de diferença.
  expect(result.after).toEqual(result.before);
  expect(errors).toEqual([]);
});
