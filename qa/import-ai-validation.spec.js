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

const demoOfx = `<OFX><BANKTRANLIST>
<STMTTRN><DTPOSTED>20260801<TRNAMT>-17.35<FITID>DEMO-1<MEMO>Loja Alpha</STMTTRN>
<STMTTRN><DTPOSTED>20260802<TRNAMT>-26.40<FITID>DEMO-2<MEMO>Pix no Crédito</STMTTRN>
<STMTTRN><DTPOSTED>20260803<TRNAMT>-73.25<FITID>DEMO-3<MEMO>Loja Beta - Parcela 1/3</STMTTRN>
<STMTTRN><DTPOSTED>20260804<TRNAMT>91.10<FITID>DEMO-4<MEMO>Pagamento recebido</STMTTRN>
</BANKTRANLIST></OFX>`;

test('fatura OFX de demonstração: negativos são débitos da fatura e Pagamento recebido positivo é pagamento', async ({ page }) => {
  await boot(page, 'OFX de demonstração');
  const result = await page.evaluate(async (ofx) => {
    const rows = parseOFX(ofx);
    const analysis = await analyzeImportDocument({ rows, ext: 'ofx', text: ofx, intendedType: 'invoice' });
    const classified = classifyInvoiceRows(rows, analysis);
    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-08';
    prepareCardImport(classified, 'demo-fatura.ofx', analysis);
    return {
      documentType: analysis.documentType,
      signConvention: analysis.signConvention,
      validator: analysis.validator,
      kinds: cardImportDraft.rows.map(r => r.kind),
      amounts: cardImportDraft.rows.map(r => r.amount),
      totals: cardImportDraft.rows.filter(r => r.kind === 'purchase').map(r => r.total),
      paymentTarget: cardImportDraft.rows.find(r => r.kind === 'payment')?.targetMonth,
      summary: document.querySelector('#cardImportSummary').textContent,
      validation: document.querySelector('#cardImportValidation').textContent,
      mobileText: document.querySelector('#cardImportMobile').textContent
    };
  }, demoOfx);

  expect(result.documentType).toBe('invoice');
  expect(result.signConvention).toBe('debitNegative');
  expect(result.validator).toBe('local');
  expect(result.kinds).toEqual(['purchase', 'purchase', 'purchase', 'payment']);
  expect(result.amounts).toEqual([17.35, 26.40, 73.25, 91.10]);
  expect(result.totals).toEqual([17.35, 26.40, 219.75]);
  expect(result.paymentTarget).toBe('2026-07');
  expect(result.summary).toContain('3 débito(s) de fatura, 1 pagamento(s)/crédito(s)');
  expect(result.validation).toContain('débitos negativos');
  expect(result.mobileText).toContain('Pix no crédito • débito na fatura');
  expect(result.mobileText).not.toContain('Pix no Crédito • Compra');
});

test('Pix no Crédito é débito estrutural da fatura, mas finalidade econômica continua em revisão', async ({ page }) => {
  await boot(page, 'Pix não é compra automática');
  const result = await page.evaluate(() => semanticClassify('Pix no Crédito - Destinatário Demo', -26.40));
  expect(result.semanticClass).toBe('possible_transfer');
  expect(result.economicImpact).toBe('review');
  expect(result.action).toBe('ignore');
  expect(result.reason).toContain('precisa identificar');
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

test('Groq recebe somente amostra sanitizada e não pode derrubar âncora estrutural forte', async ({ page }) => {
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
      { date: '2026-08-01', desc: 'Pix no Crédito 1234567890122 usuario@example.invalid', amount: -12.34, fitid: 'DEMO-FITID-1' },
      { date: '2026-08-02', desc: 'Loja comum 998877665544', amount: -20, fitid: 'DEMO-FITID-2' }
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
  expect(result.payload).not.toContain('123456789012');
  expect(result.payload).not.toContain('998877665544');
  expect(result.payload).not.toContain('usuario@example.invalid');
  expect(result.payload).not.toContain('DEMO-FITID');
  expect(result.payload).toContain('***');
});

test('validador reconhece fatura carregada por engano no fluxo de extrato', async ({ page }) => {
  await boot(page, 'Roteamento de arquivo');
  const result = await page.evaluate(async (ofx) => {
    const rows = parseOFX(ofx);
    return analyzeImportDocument({ rows, ext: 'ofx', text: ofx, intendedType: 'statement' });
  }, demoOfx);
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
    prepareCardImport(classifyInvoiceRows(rows, analysis), 'demo.ofx', analysis);
  }, demoOfx);
  await expect(page.locator('#cardImportMobile .mobile-record')).toHaveCount(4);
  await expect(page.locator('#cardImportMobile .mobile-record').first()).toBeVisible();
  await expect(page.locator('#cardImportReview .desktop-table-mobile')).toBeHidden();
  const overflow = await page.locator('#cardImportReview').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
