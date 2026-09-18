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

async function importPreparedStatement(page) {
  await page.evaluate(() => {
    window.__qaStatementImportResult = { done: false, error: null };
    window.__qaPendingStatementImport = importStatement()
      .then(() => { window.__qaStatementImportResult.done = true; })
      .catch(error => {
        window.__qaStatementImportResult = {
          done: true,
          error: String(error?.stack || error?.message || error)
        };
      });
  });
  await expect.poll(() => page.evaluate(() => window.__qaStatementImportResult?.done)).toBe(true);
  const error = await page.evaluate(() => window.__qaStatementImportResult?.error || null);
  expect(error).toBeNull();
  await page.evaluate(() => {
    window.__qaPendingStatementImport = null;
    window.__qaStatementImportResult = null;
  });
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

  const setup = await page.evaluate(() => {
    const text = `<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260131000000<TRNAMT>-25.00<FITID>BUY-31<MEMO>Compra no debito</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>900.00<DTASOF>20260131000000</LEDGERBAL></OFX>`;
    const parsed = parseOFX(text);
    const rows = [...parsed];
    const meta = parsed.statementMeta;

    document.querySelector('#stmtAccount').value = '1';
    prepareStatement(rows, 'nubank-inconsistente.ofx', meta);

    return {
      meta,
      before: {
        balance: accountBalance(1),
        initial: state.accounts[0].initial,
        balanceDate: state.accounts[0].balanceDate,
        transactions: state.transactions.length,
        statements: state.statements.length
      }
    };
  });

  await importPreparedStatement(page);

  const after = await page.evaluate(() => ({
    balance: accountBalance(1),
    initial: state.accounts[0].initial,
    balanceDate: state.accounts[0].balanceDate,
    transactions: state.transactions.length,
    statements: state.statements.length
  }));

  expect(setup.meta).toMatchObject({ closingBalance: 900, closingDate: '2026-01-31', source: 'ofx' });
  expect(setup.before).toEqual({
    balance: 1000,
    initial: 1000,
    balanceDate: '2026-01-30',
    transactions: 0,
    statements: 0
  });
  expect(after).toEqual(setup.before);
  expect(errors).toEqual([]);
});
