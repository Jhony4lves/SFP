const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, name = 'Import AI') {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  const value = fixture(name);
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await expect.poll(() => page.evaluate(() => state.settings.name)).toBe(name);
}

const nubankOfx = `<OFX><BANKTRANLIST>
<STMTTRN><DTPOSTED>20260801<TRNAMT>-8.00<FITID>NUB-1<MEMO>Rei do Sabor</STMTTRN>
<STMTTRN><DTPOSTED>20260802<TRNAMT>-8.96<FITID>NUB-2<MEMO>Pix no Crédito</STMTTRN>
<STMTTRN><DTPOSTED>20260803<TRNAMT>-94.36<FITID>NUB-3<MEMO>Assb Compra - Parcela 1/3</STMTTRN>
<STMTTRN><DTPOSTED>20260804<TRNAMT>59.99<FITID>NUB-4<MEMO>Pagamento recebido</STMTTRN>
</BANKTRANLIST></OFX>`;

test('fatura OFX realista do Nubank: negativos são compras e Pagamento recebido positivo é pagamento', async ({ page }) => {
  await boot(page, 'Nubank OFX real');
  const result = await page.evaluate(async (ofx) => {
    const rows = parseOFX(ofx);
    const analysis = await analyzeImportDocument({ rows, ext: 'ofx', text: ofx, intendedType: 'invoice' });
    const classified = classifyInvoiceRows(rows, analysis);
    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-08';
    prepareCardImport(classified, 'nubank-fatura.ofx', analysis);
    return {
      documentType: analysis.documentType,
      signConvention: analysis.signConvention,
      validator: analysis.validator,
      kinds: cardImportDraft.rows.map(r => r.kind),
      amounts: cardImportDraft.rows.map(r => r.amount),
      totals: cardImportDraft.rows.filter(r => r.kind === 'purchase').map(r => r.total),
      paymentTarget: cardImportDraft.rows.find(r => r.kind === 'payment')?.targetMonth,
      summary: document.querySelector('#cardImportSummary').textContent,
      validation: document.querySelector('#cardImportValidation').textContent
    };
  }, nubankOfx);

  expect(result.documentType).toBe('invoice');
  expect(result.signConvention).toBe('debitNegative');
  expect(result.validator).toBe('local');
  expect(result.kinds).toEqual(['purchase', 'purchase', 'purchase', 'payment']);
  expect(result.amounts).toEqual([8, 8.96, 94.36, 59.99]);
  expect(result.totals).toEqual([8, 8.96, 283.08]);
  expect(result.paymentTarget).toBe('2026-07');
  expect(result.summary).toContain('3 compra(s), 1 pagamento(s)');
  expect(result.validation).toContain('débitos negativos');
});

test('CSV legado mantém convenção positiva=compra e negativa=pagamento', async ({ page }) => {
  await boot(page, 'CSV legado');
  const result = await page.evaluate(async () => {
    const csv = 'Data;Descrição;Valor\n05/08/2026;Mercado;50,00\n06/08/2026;Pagamento da fatura;-50,00';
    const rows = parseCardCsv(csv);
    const analysis = await analyzeImportDocument({ rows, ext: 'csv', text: csv, intendedType: 'invoice' });
    return { signConvention: analysis.signConvention, kinds: classifyInvoiceRows(rows, analysis).map(r => r.invoiceKind) };
  });
  expect(result.signConvention).toBe('debitPositive');
  expect(result.kinds).toEqual(['purchase', 'payment']);
});

test('Groq recebe somente amostra sanitizada e não pode derrubar âncora semântica forte', async ({ page }) => {
  await boot(page, 'Groq sanitizado');
  const result = await page.evaluate(async () => {
    let captured = null;
    Object.defineProperty(window, 'AndroidBridge', {
      configurable: true,
      value: {
        hasSophyApiKey: () => true,
        callSophyGroq: payload => {
          captured = JSON.parse(payload);
          return JSON.stringify({
            choices: [{ message: { content: JSON.stringify({
              documentType: 'invoice', confidence: 0.97, signConvention: 'debitNegative',
              rows: [
                { index: 0, kind: 'payment', confidence: 0.99 },
                { index: 1, kind: 'payment', confidence: 0.99 }
              ], warnings: []
            }) } }]
          });
        }
      }
    });
    const rows = [
      { date: '2026-08-01', desc: 'Pix no Crédito 12345678901 usuario@email.com', amount: -12.34, fitid: 'SECRET-FITID-1' },
      { date: '2026-08-02', desc: 'Loja comum 998877665544', amount: -20, fitid: 'SECRET-FITID-2' }
    ];
    const analysis = await analyzeImportDocument({ rows, ext: 'ofx', text: '<OFX>conteúdo local não enviado</OFX>', intendedType: 'invoice' });
    const classified = classifyInvoiceRows(rows, analysis);
    return {
      validator: analysis.validator,
      kinds: classified.map(r => r.invoiceKind),
      payload: JSON.stringify(captured)
    };
  });
  expect(result.validator).toBe('local+groq');
  expect(result.kinds[0]).toBe('purchase');
  expect(result.payload).not.toContain('12345678901');
  expect(result.payload).not.toContain('998877665544');
  expect(result.payload).not.toContain('usuario@email.com');
  expect(result.payload).not.toContain('SECRET-FITID');
  expect(result.payload).toContain('***');
});

test('validador reconhece fatura carregada por engano no fluxo de extrato', async ({ page }) => {
  await boot(page, 'Roteamento de arquivo');
  const result = await page.evaluate(async (ofx) => {
    const rows = parseOFX(ofx);
    return analyzeImportDocument({ rows, ext: 'ofx', text: ofx, intendedType: 'statement' });
  }, nubankOfx);
  expect(result.documentType).toBe('invoice');
  expect(result.confidence).toBeGreaterThanOrEqual(0.8);
});

test('prévia de fatura usa cartões mobile em vez de tabela horizontal cortada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, 'Prévia mobile');
  await page.evaluate(async (ofx) => {
    setPage('cartoes');
    const rows = parseOFX(ofx);
    const analysis = await analyzeImportDocument({ rows, ext: 'ofx', text: ofx, intendedType: 'invoice' });
    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-08';
    prepareCardImport(classifyInvoiceRows(rows, analysis), 'nubank.ofx', analysis);
  }, nubankOfx);
  await expect(page.locator('#cardImportMobile .mobile-record')).toHaveCount(4);
  await expect(page.locator('#cardImportMobile .mobile-record').first()).toBeVisible();
  await expect(page.locator('#cardImportReview .desktop-table-mobile')).toBeHidden();
  const overflow = await page.locator('#cardImportReview').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
