const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}

test('reimportar a mesma fatura não cria histórico nem revisão só porque outro mês estava em foco', async ({ page }) => {
  await boot(page, fixture('Reimportação idempotente'));

  const result = await page.evaluate(async () => {
    const rows = [
      { date: '2026-08-30', desc: 'Compra A', amount: 50, fitid: 'IDEMP-30', invoiceKind: 'purchase' },
      { date: '2026-08-31', desc: 'Compra B', amount: 25, fitid: 'IDEMP-31', invoiceKind: 'purchase' }
    ];
    const meta = {
      source: 'pdf',
      officialTotal: 75,
      dueDate: '2026-09-16',
      closingDate: '2026-09-09'
    };

    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-09';
    prepareCardImport(rows, 'fatura-idempotente.pdf', null, meta);
    await confirmCardImport();

    const historyBefore = state.invoiceImports.length;
    const revisionBefore = state.persistenceMeta.revision;

    state.ui.invoiceMonthByCard[1] = '2026-10';
    if (document.querySelector('#invoiceMonth')) document.querySelector('#invoiceMonth').value = '2026-10';

    document.querySelector('#cardImportMonth').value = '2026-09';
    prepareCardImport(rows, 'fatura-idempotente.pdf', null, meta);
    const duplicatePreview = cardImportDraft.rows.map(row => row.duplicate);
    await confirmCardImport();

    return {
      duplicatePreview,
      purchases: state.purchases.map(purchase => purchase.invoiceImportKey),
      historyBefore,
      historyAfter: state.invoiceImports.length,
      revisionBefore,
      revisionAfter: state.persistenceMeta.revision,
      invoiceMonthInMemory: state.ui.invoiceMonthByCard[1]
    };
  });

  expect(result.duplicatePreview).toEqual([true, true]);
  expect(result.purchases).toEqual(['card:1|fit:IDEMP-30', 'card:1|fit:IDEMP-31']);
  expect(result.historyAfter).toBe(result.historyBefore);
  expect(result.revisionAfter).toBe(result.revisionBefore);
  expect(result.invoiceMonthInMemory).toBe('2026-09');
});
