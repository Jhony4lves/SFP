const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, name = 'OFX credit regression') {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  const value = fixture(name);
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await expect.poll(() => page.evaluate(() => state.settings.name)).toBe(name);
}

const nubankCreditOfx = `<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260829000000[-3:BRT]</DTPOSTED><TRNAMT>-158.12</TRNAMT><FITID>NUB-PURCHASES</FITID><MEMO>Compras à vista consolidadas</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260812000000[-3:BRT]</DTPOSTED><TRNAMT>-94.36</TRNAMT><FITID>NUB-INSTALLMENT</FITID><MEMO>Assb Comercio Varejist - Parcela 1/3</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260902000000[-3:BRT]</DTPOSTED><TRNAMT>81.64</TRNAMT><FITID>NUB-GOOGLE-CREDIT</FITID><MEMO>Crédito de "Google One" (Google One)</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260809000000[-3:BRT]</DTPOSTED><TRNAMT>59.99</TRNAMT><FITID>NUB-PAYMENT</FITID><MEMO>Pagamento recebido</MEMO></STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>-170.84</BALAMT><DTASOF>20260909000000[-3:BRT]</DTASOF></LEDGERBAL></OFX>`;

test('Nubank OFX: crédito de lojista reduz a fatura e Pagamento recebido continua sendo pagamento', async ({ page }) => {
  await boot(page, 'Nubank merchant credit');

  const result = await page.evaluate(async (ofx) => {
    const rows = parseOFX(ofx);
    const analysis = await analyzeImportDocument({ rows, ext: 'ofx', text: ofx, intendedType: 'invoice' });
    const classified = classifyInvoiceRows(rows, analysis);

    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-09';
    prepareCardImport(classified, '08-26 Nubank.ofx', analysis);

    const currentInvoiceImpact = cardImportDraft.rows.reduce((sum, row) => {
      if(row.kind === 'purchase') return sum + row.amount;
      if(row.kind === 'credit') return sum - row.amount;
      return sum;
    }, 0);

    return {
      rawTypes: rows.map(row => row.ofxType || null),
      rawKinds: rows.map(row => row.invoiceKind || null),
      kinds: cardImportDraft.rows.map(row => row.kind),
      credit: cardImportDraft.rows.find(row => row.kind === 'credit'),
      payment: cardImportDraft.rows.find(row => row.kind === 'payment'),
      currentInvoiceImpact: Math.round(currentInvoiceImpact * 100) / 100,
      summary: document.querySelector('#cardImportSummary').textContent
    };
  }, nubankCreditOfx);

  expect(result.rawTypes).toEqual(['DEBIT', 'DEBIT', 'CREDIT', 'CREDIT']);
  expect(result.rawKinds[2]).toBe('credit');
  expect(result.rawKinds[3]).toBe('payment');
  expect(result.kinds).toEqual(['purchase', 'purchase', 'credit', 'payment']);
  expect(result.credit.desc).toContain('Google One');
  expect(result.credit.amount).toBe(81.64);
  expect(result.credit.targetMonth).toBe('2026-09');
  expect(result.payment.amount).toBe(59.99);
  expect(result.payment.targetMonth).toBe('2026-08');
  expect(result.currentInvoiceImpact).toBe(170.84);
  expect(result.summary).toContain('2 débito(s), 1 pagamento(s), 1 crédito(s)/estorno(s)');
});
