const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function itauState({ paid = false, persistedOctober = false } = {}) {
  const value = fixture('Compat ciclo Itaú #216');
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-18';
  value.accounts = [{ id: 1, name: 'Itaú', type: 'Conta corrente', initial: 0, balanceMode: 'snapshot', balanceDate: '2026-09-18' }];
  value.cards = [{ id: 1, name: 'Itaú Click', limit: 2090, closeDay: 2, dueDay: 10, payAccountId: 1, history: [] }];
  value.purchases = [
    { id: 201, cardId: 1, desc: 'Compras confirmadas de setembro', total: 321.24, installments: 1, firstMonth: '2026-09', purchaseDate: '2026-09-01', status: 'active', refunds: [] },
    { id: 202, cardId: 1, desc: 'Parcela futura de outubro', total: 180.82, installments: 1, firstMonth: '2026-10', purchaseDate: '2026-08-01', status: 'active', refunds: [] }
  ];
  value.invoices = paid
    ? [{ id: 901, cardId: 1, month: '2026-09', status: 'paid', paidAmount: 321.24, payments: [{ date: '2026-09-10', amount: 321.24, source: 'manual' }] }]
    : [];
  value.invoiceAdjustments = [];
  value.ui = value.ui || {};
  if (persistedOctober) value.ui.invoiceMonthByCard = { 1: '2026-10' };
  return value;
}

function nubankState() {
  const value = fixture('Compat ciclo Nubank #216');
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-18';
  value.accounts = [{ id: 1, name: 'Nubank', type: 'Conta corrente', initial: 21.15, balanceMode: 'snapshot', balanceDate: '2026-09-18' }];
  value.cards = [{ id: 1, name: 'Nubank', limit: 600, closeDay: 9, dueDay: 16, payAccountId: 1, history: [] }];
  value.purchases = [
    { id: 10, cardId: 1, desc: 'Compras do ciclo já confirmadas', total: 147.13, installments: 1, firstMonth: '2026-09', purchaseDate: '2026-08-16', status: 'active', refunds: [] },
    { id: 11, cardId: 1, desc: 'ASSB Comércio Varejista', total: 283.08, installments: 3, firstMonth: '2026-09', purchaseDate: '2026-08-12', status: 'active', refunds: [] }
  ];
  value.invoices = [];
  value.invoiceAdjustments = [];
  return value;
}

async function boot(page, value, institution) {
  await page.clock.setFixedTime(new Date('2026-09-18T15:00:00Z'));
  await page.addInitScript(({ institution }) => {
    const nubank = institution === 'Nubank';
    const account = {
      id: nubank ? 'nu-credit' : 'itau-credit',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      name: nubank ? 'Nubank' : 'Itaú Click',
      marketingName: nubank ? 'Nubank' : 'Itaú Click',
      presentationName: nubank ? 'Nubank' : 'Itaú Click',
      balance: nubank ? 403.02 : 1494.37,
      currencyCode: 'BRL',
      transactionPreviewHasMore: false,
      transactionsError: false,
      creditData: nubank
        ? { creditLimit: 600, availableCreditLimit: 196.98, balanceCloseDate: '2026-10-09', balanceDueDate: '2026-10-16' }
        : { creditLimit: 2090, availableCreditLimit: 595.63, balanceCloseDate: '2026-10-02', balanceDueDate: '2026-10-10' },
      transactions: nubank
        ? [{ id: 'nu-credit-8164', date: '2026-09-09T12:00:00.000Z', description: 'Pagamento antecipado', amount: -81.64, type: 'CREDIT', status: 'PENDING', currencyCode: 'BRL' }]
        : [],
      bills: []
    };
    const payload = {
      ok: true,
      provider: 'pluggy-personal',
      readOnly: true,
      itemCount: 1,
      accountCount: 1,
      transactionPreviewCount: account.transactions.length,
      billCount: 0,
      items: [{ id: nubank ? 'nu-item' : 'itau-item', connectorName: 'MeuPluggy', institution, status: 'UPDATED', accounts: [account] }]
    };
    Object.defineProperty(window, 'PluggyBridge', {
      configurable: true,
      value: {
        getCredentialStatus: () => JSON.stringify({ ok: true, configured: true, clientIdMasked: 'qa…test', itemReferenceCount: 1 }),
        saveCredentials: () => JSON.stringify({ ok: true, configured: true }),
        previewData: () => JSON.stringify(payload),
        clearCredentials: () => true,
        saveItemIds: () => JSON.stringify({ ok: true, itemReferenceCount: 1 })
      }
    });
  }, { institution });

  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.evaluate(() => { window.localCivilMonth = () => '2026-09'; });
  await page.waitForFunction(() => Number(window.SFPOpenFinanceBills?.version) >= 12);
}

async function applyAndRender(page) {
  await page.evaluate(() => {
    SFPOpenFinanceBills.apply(JSON.parse(PluggyBridge.previewData()));
    setPage('cartoes');
    renderAll();
  });
}

test('#216 Itaú: provider em outubro não avança enquanto setembro continua aberto', async ({ page }) => {
  await boot(page, itauState(), 'Itaú');
  await applyAndRender(page);

  const result = await page.evaluate(() => {
    const account = JSON.parse(PluggyBridge.previewData()).items[0].accounts[0];
    return {
      month: SFPOpenFinanceBills.currentCycleMonth(card(1)),
      cycle: SFPOpenFinanceBills.bankCycle(account, card(1))
    };
  });

  expect(result.month).toBe('2026-09');
  expect(result.cycle).toMatchObject({
    candidateMonth: '2026-10',
    localCandidateMonth: '2026-10',
    heldByUnsettledPrevious: true,
    advancedPastSettledCurrent: false
  });
  await expect(page.getByRole('button', { name: /Abrir detalhes de Itaú Click/ }).locator('.sfp-card-v2-primary'))
    .toContainText('Fatura atual · Setembro de 2026');
});

test('#216 Itaú: setembro liquidado permite rollover seguro para outubro', async ({ page }) => {
  await boot(page, itauState({ paid: true }), 'Itaú');
  await applyAndRender(page);

  const result = await page.evaluate(() => {
    const account = JSON.parse(PluggyBridge.previewData()).items[0].accounts[0];
    return {
      month: SFPOpenFinanceBills.currentCycleMonth(card(1)),
      cycle: SFPOpenFinanceBills.bankCycle(account, card(1))
    };
  });

  expect(result.month).toBe('2026-10');
  expect(result.cycle.heldByUnsettledPrevious).toBe(false);
  await expect(page.getByRole('button', { name: /Abrir detalhes de Itaú Click/ }).locator('.sfp-card-v2-primary'))
    .toContainText('Fatura atual · Outubro de 2026');
});

test('#216 seleção persistida de outubro não sobrepõe setembro ainda aberto', async ({ page }) => {
  await boot(page, itauState({ persistedOctober: true }), 'Itaú');
  await applyAndRender(page);

  expect(await page.evaluate(() => SFPOpenFinanceBills.currentCycleMonth(card(1)))).toBe('2026-09');
  await expect(page.getByRole('button', { name: /Abrir detalhes de Itaú Click/ }).locator('.sfp-card-v2-primary'))
    .toContainText('Fatura atual · Setembro de 2026');
});

test('#216 Nubank: provider em outubro sem Bill atual mantém setembro enquanto não liquidado', async ({ page }) => {
  await boot(page, nubankState(), 'Nubank');
  await applyAndRender(page);

  const result = await page.evaluate(() => {
    const account = JSON.parse(PluggyBridge.previewData()).items[0].accounts[0];
    const inv = invoiceStatus(1, '2026-09');
    return {
      month: SFPOpenFinanceBills.currentCycleMonth(card(1)),
      cycle: SFPOpenFinanceBills.bankCycle(account, card(1)),
      officialTotal: inv.officialTotal,
      pendingCredit: inv.openFinanceEstimate?.pendingCredit
    };
  });

  expect(result.month).toBe('2026-09');
  expect(result.cycle.heldByUnsettledPrevious).toBe(true);
  expect(result.officialTotal).toBeUndefined();
  expect(result.pendingCredit).toBe(81.64);
  await expect(page.getByRole('button', { name: /Abrir detalhes de Nubank/ }).locator('.sfp-card-v2-primary'))
    .toContainText('Fatura atual · Setembro de 2026');
});
