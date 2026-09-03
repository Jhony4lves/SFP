const { test, expect } = require('@playwright/test');
const { fixture, monitor, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  await expect.poll(() => page.evaluate(() => Boolean(window.__SFP_MANUAL_INVOICE_RECONCILIATION_INSTALLED))).toBe(true);
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}

function manualPurchase(overrides = {}) {
  return {
    id: 71,
    cardId: 1,
    desc: 'iFood',
    total: 42.90,
    installments: 1,
    purchaseDate: '2026-09-03',
    firstMonth: '2026-09',
    category: 'Alimentação',
    status: 'active',
    note: '',
    tags: [],
    refunds: [],
    ...overrides
  };
}

async function prepare(page, csv, month = '2026-09') {
  return page.evaluate(({ csv, month }) => {
    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = month;
    prepareCardImport(parseCardCsv(csv), 'fatura-manual-reconcile.csv');
    return cardImportDraft.rows.map(row => ({
      duplicate: row.duplicate,
      matchId: row.duplicateMatch?.id ?? null,
      manualReconcile: Boolean(row.duplicateMatch?.manualReconcile),
      kind: row.kind,
      installment: row.installment,
      installments: row.installments
    }));
  }, { csv, month });
}

test('compra manual inequívoca é conciliada com a fatura sem duplicar valor', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('Conciliação manual única');
  value.mesAtual = '2026-09';
  value.purchases = [manualPurchase()];
  await boot(page, value);

  const csv = 'Data;Descrição;Valor\n03/09/2026;IFOOD *IFOOD;42,90';
  const preview = await prepare(page, csv);
  expect(preview).toEqual([{ duplicate: true, matchId: 71, manualReconcile: true, kind: 'purchase', installment: 1, installments: 1 }]);

  await page.evaluate(() => confirmCardImport());
  expect(await page.evaluate(() => ({
    count: state.purchases.length,
    total: invoiceCalculated(1, '2026-09'),
    importKey: state.purchases[0].invoiceImportKey || null,
    aliases: state.purchases[0].invoiceImportAliases || []
  }))).toEqual({ count: 1, total: 42.9, importKey: expect.any(String), aliases: [] });

  await prepare(page, csv);
  await page.evaluate(() => confirmCardImport());
  expect(await page.evaluate(() => ({ count: state.purchases.length, total: invoiceCalculated(1, '2026-09') })))
    .toEqual({ count: 1, total: 42.9 });
  expect(errors).toEqual([]);
});

test('duas compras manuais igualmente plausíveis não são fundidas automaticamente', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('Conciliação manual ambígua');
  value.mesAtual = '2026-09';
  value.purchases = [
    manualPurchase({ id: 71, desc: 'Uber', total: 25, purchaseDate: '2026-09-04' }),
    manualPurchase({ id: 72, desc: 'UBER', total: 25, purchaseDate: '2026-09-04' })
  ];
  await boot(page, value);

  const preview = await prepare(page, 'Data;Descrição;Valor\n04/09/2026;UBER *TRIP;25,00');
  expect(preview).toEqual([{ duplicate: false, matchId: null, manualReconcile: false, kind: 'purchase', installment: 1, installments: 1 }]);
  expect(await page.evaluate(() => state.purchases.map(p => p.invoiceImportKey || null))).toEqual([null, null]);
  expect(errors).toEqual([]);
});

test('descrições apenas parcialmente parecidas não bastam para conciliar compra diferente', async ({ page }) => {
  const value = fixture('Conciliação manual estabelecimento distinto');
  value.mesAtual = '2026-09';
  value.purchases = [manualPurchase({ desc: 'Amazon Prime', total: 19.9 })];
  await boot(page, value);

  const preview = await prepare(page, 'Data;Descrição;Valor\n03/09/2026;AMAZON MARKETPLACE;19,90');
  expect(preview[0]).toMatchObject({ duplicate: false, matchId: null, manualReconcile: false });
});

test('parcela manual é conciliada quando número da parcela, total, mês, valor, data e loja conferem', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('Conciliação manual parcelada');
  value.mesAtual = '2026-09';
  value.purchases = [manualPurchase({
    id: 81,
    desc: 'Curso de Inglês',
    total: 120,
    installments: 3,
    purchaseDate: '2026-08-03',
    firstMonth: '2026-08',
    category: 'Educação'
  })];
  await boot(page, value);

  const preview = await prepare(page, 'Data;Descrição;Valor\n03/08/2026;CURSO DE INGLES - Parcela 2/3;40,00');
  expect(preview).toEqual([{ duplicate: true, matchId: 81, manualReconcile: true, kind: 'purchase', installment: 2, installments: 3 }]);

  await page.evaluate(() => confirmCardImport());
  expect(await page.evaluate(() => ({ count: state.purchases.length, september: invoiceCalculated(1, '2026-09') })))
    .toEqual({ count: 1, september: 40 });
  expect(errors).toEqual([]);
});

test('cobrança sem marcador de parcela não é fundida no chute com compra manual parcelada', async ({ page }) => {
  const value = fixture('Conciliação manual sem evidência de parcela');
  value.mesAtual = '2026-09';
  value.purchases = [manualPurchase({
    id: 91,
    desc: 'Curso de Inglês',
    total: 120,
    installments: 3,
    purchaseDate: '2026-08-03',
    firstMonth: '2026-08',
    category: 'Educação'
  })];
  await boot(page, value);

  const preview = await prepare(page, 'Data;Descrição;Valor\n03/08/2026;CURSO DE INGLES;40,00');
  expect(preview[0]).toMatchObject({ duplicate: false, matchId: null, manualReconcile: false });
});
