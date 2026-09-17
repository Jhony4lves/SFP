const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

async function installRealCaseBridge(page) {
  await page.addInitScript(() => {
    const payload = {
      ok: true,
      provider: 'pluggy-personal',
      readOnly: true,
      itemCount: 2,
      accountCount: 2,
      transactionPreviewCount: 1,
      items: [
        {
          id: 'item-nubank', connectorName: 'MeuPluggy', institution: 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)', status: 'UPDATED',
          accounts: [{
            id: 'acc-nubank', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Nubank', marketingName: 'Nubank', presentationName: 'Nubank',
            balance: 0, currencyCode: 'BRL', transactionPreviewHasMore: false,
            transactions: [{ id: 'nubank-payment-17084', date: '2026-09-16T12:00:00.000Z', description: 'Pagamento de fatura', amount: 170.84, type: 'DEBIT', status: 'POSTED', currencyCode: 'BRL' }]
          }]
        },
        {
          id: 'item-itau', connectorName: 'MeuPluggy', institution: 'Itaú', status: 'UPDATED',
          accounts: [{
            id: 'acc-itau', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Itaú', marketingName: 'Itaú', presentationName: 'Itaú',
            balance: 532.21, currencyCode: 'BRL', transactionPreviewHasMore: false, transactions: []
          }]
        }
      ]
    };
    Object.defineProperty(window, 'PluggyBridge', {
      configurable: true,
      value: {
        getCredentialStatus: () => JSON.stringify({ ok:true, configured:true, clientIdMasked:'11111111…1111', itemReferenceCount:2 }),
        saveCredentials: () => JSON.stringify({ ok:true, configured:true }),
        previewData: () => JSON.stringify(payload),
        clearCredentials: () => true,
        saveItemIds: () => JSON.stringify({ ok:true, itemReferenceCount:2 })
      }
    });
  });
}

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.waitForFunction(() => window.SFPOpenFinanceUnifiedSync?.version === 2);
  await page.waitForFunction(() => window.SFPOpenFinanceRealRefresh?.version >= 7);
  await page.waitForFunction(() => window.SFPOpenFinanceFinancialTruth?.version === 1);
}

function realCaseState() {
  const value = fixture('open-finance-base.json');
  value.settings = value.settings || {};
  value.settings.name = 'Nubank saldo e fatura #242 #244';
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-15';
  value.accounts = [
    { id:1, name:'Nubank', type:'Conta corrente', initial:170.84, balanceMode:'snapshot', balanceDate:'2026-09-15', reconciled:null },
    { id:2, name:'Itaú', type:'Conta corrente', initial:532.21, balanceMode:'snapshot', balanceDate:'2026-09-15', reconciled:null },
    { id:3, name:'Mercado Pago', type:'Conta corrente', initial:0, balanceMode:'snapshot', balanceDate:'2026-09-15', reconciled:null }
  ];
  value.cards = [{ id:1, name:'Nubank', limit:600, closeDay:9, dueDay:16, payAccountId:1, history:[] }];
  value.transactions = [];
  value.purchases = [];
  value.transfers = [];
  value.invoices = [{
    id:701, cardId:1, month:'2026-09', status:'open', officialTotal:170.84, officialTotalSource:'open-finance-bill',
    paidAmount:0, accountId:1, payments:[], documentDueDate:'2026-09-16', closedAt:'2026-09-09T12:00:00.000Z'
  }];
  value.recurring = [];
  return value;
}

test('#242/#244 aplica saldo zero, preserva Itaú e quita fatura POSTED sem dupla contagem', async ({ page }) => {
  const errors = monitor(page);
  await installRealCaseBridge(page);
  const value = realCaseState();
  await boot(page, value);

  await expect.poll(() => page.evaluate(() => ({
    nubank: typeof accountBalance==='function'?accountBalance(1):null,
    itau: typeof accountBalance==='function'?accountBalance(2):null,
    total: typeof accountBalance==='function'?(window.state?.accounts||[]).reduce((sum,account) => sum + accountBalance(account.id), 0):null,
    paid: window.state?.invoices?.find(invoice => invoice.cardId===1&&invoice.month==='2026-09')?.paidAmount,
    status: window.state?.invoices?.find(invoice => invoice.cardId===1&&invoice.month==='2026-09')?.status,
    paymentCount: window.state?.invoices?.find(invoice => invoice.cardId===1&&invoice.month==='2026-09')?.payments?.length || 0
  }))).toEqual({ nubank:0, itau:532.21, total:532.21, paid:170.84, status:'paid', paymentCount:1 });

  const first = await page.evaluate(() => {
    const account = state.accounts.find(row => row.id===1);
    const invoice = state.invoices.find(row => row.cardId===1&&row.month==='2026-09');
    const events = financialCalendarEvents('2026-09');
    return {
      initial:account.initial,
      balanceDate:account.balanceDate,
      source:account.reconciled?.source,
      payment:invoice.payments[0],
      openInvoice:events.filter(event => event.source==='invoice'&&event.cardId===1).length,
      realizedPayment:events.filter(event => event.source==='invoice-payment'&&event.cardId===1&&event.realization==='realized').length
    };
  });

  expect(first.initial).toBe(0);
  expect(first.source).toBe('open-finance');
  expect(first.payment).toMatchObject({ date:'2026-09-16', amount:170.84, balanceImpact:false, economicImpact:'neutral', externalId:'pluggy:nubank-payment-17084', openFinanceStatus:'POSTED' });
  expect(first.openInvoice).toBe(0);
  expect(first.realizedPayment).toBe(1);

  await page.evaluate(() => window.SFPOpenFinanceRealRefresh.refresh());
  await expect.poll(() => page.evaluate(() => state.invoices.find(row => row.cardId===1&&row.month==='2026-09')?.payments?.length || 0)).toBe(1);
  expect(await page.evaluate(() => accountBalance(1))).toBe(0);
  expect(errors).toEqual([]);
});

test('#243 passado não resolvido deixa de ser Previsto: recorrência vira Revisar e obrigação vira Vencido', async ({ page }) => {
  const value = fixture('open-finance-base.json');
  value.settings = value.settings || {};
  value.settings.name = 'Histórico temporal #243';
  value.mesAtual = '2025-09';
  value.baseDate = '2025-09-01';
  value.accounts = [{ id:1, name:'Nubank', type:'Conta corrente', initial:0, balanceMode:'snapshot', balanceDate:'2025-09-01' }];
  value.cards = [{ id:1, name:'Nubank', limit:600, closeDay:9, dueDay:16, payAccountId:1, history:[] }];
  value.transactions = [{ id:10, accountId:1, kind:'expense', desc:'Conta antiga explícita', amount:25, date:'2025-09-20', status:'pending', balanceImpact:false, category:'Outros' }];
  value.purchases = [];
  value.transfers = [];
  value.invoices = [{ id:701, cardId:1, month:'2025-09', status:'open', officialTotal:58, paidAmount:0, accountId:1, payments:[], documentDueDate:'2025-09-16' }];
  value.recurring = [{ id:401, desc:'Assinatura histórica', type:'expense', amount:12, day:16, category:'Assinaturas', accountId:1, start:'2025-09', end:'', active:true, skips:[] }];

  await boot(page, value);
  const events = await page.evaluate(() => financialCalendarEvents('2025-09').map(event => ({ desc:event.desc, source:event.source, realization:event.realization, temporalStatus:event.temporalStatus })));
  const recurring = events.find(event => event.desc==='Assinatura histórica');
  const invoice = events.find(event => event.desc==='Fatura Nubank');
  const explicit = events.find(event => event.desc==='Conta antiga explícita');

  expect(recurring).toMatchObject({ source:'recurring', realization:'unreconciled', temporalStatus:'unreconciled' });
  expect(invoice).toMatchObject({ source:'invoice', realization:'overdue', temporalStatus:'overdue' });
  expect(explicit).toMatchObject({ source:'tx', realization:'overdue', temporalStatus:'overdue' });
  expect(events.filter(event => event.realization==='projected')).toHaveLength(0);

  await page.evaluate(() => { setPage('calendario'); renderCalendar(); });
  await expect(page.locator('#calendar .cal-dot.unreconciled')).toHaveCount(1);
  await expect(page.locator('#calendar .cal-dot.overdue')).toHaveCount(2);
  await expect(page.locator('#calendar .cal-dot.projected')).toHaveCount(0);
  await expect(page.locator('#calendario .calendar-legend')).toContainText('Vencido');
  await expect(page.locator('#calendario .calendar-legend')).toContainText('Revisar');
});
