const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

async function installBridge(page, { partialBank = false, partialCard = false } = {}) {
  await page.addInitScript(({ partialBank, partialCard }) => {
    const payload = {
      ok: true,
      provider: 'pluggy-personal',
      readOnly: true,
      itemCount: 1,
      accountCount: 2,
      transactionPreviewCount: 7,
      items: [{
        id: '11111111-1111-4111-8111-111111111111',
        connectorName: 'MeuPluggy',
        institution: 'Nubank',
        status: 'UPDATED',
        accounts: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Nubank', presentationName: 'Nubank',
            balance: 500, currencyCode: 'BRL', transactionPreviewHasMore: partialBank,
            transactions: [
              { id:'10000000-0000-4000-8000-000000000001', date:'2026-09-03T12:00:00.000Z', description:'Padaria Central', amount:20, type:'DEBIT', status:'POSTED', currencyCode:'BRL' },
              { id:'10000000-0000-4000-8000-000000000002', date:'2026-09-09T12:00:00.000Z', description:'FACULDADE UNILASALLE', amount:665.25, type:'DEBIT', status:'POSTED', currencyCode:'BRL' },
              { id:'10000000-0000-4000-8000-000000000003', date:'2026-09-09T13:00:00.000Z', description:'Hora extra', amount:100, type:'CREDIT', status:'POSTED', currencyCode:'BRL' },
              { id:'10000000-0000-4000-8000-000000000004', date:'2026-09-09T14:00:00.000Z', description:'Compra ainda pendente', amount:12, type:'DEBIT', status:'PENDING', currencyCode:'BRL' },
              { id:'10000000-0000-4000-8000-000000000005', date:'2026-09-09T15:00:00.000Z', description:'Pagamento de fatura Nubank', amount:200, type:'DEBIT', status:'POSTED', currencyCode:'BRL' }
            ]
          },
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Nubank', presentationName: 'Nubank',
            balance: 35.90, currencyCode: 'BRL', transactionPreviewHasMore: partialCard,
            transactions: [
              { id:'20000000-0000-4000-8000-000000000001', date:'2026-09-09T12:00:00.000Z', description:'Streaming QA', amount:35.90, type:'DEBIT', status:'POSTED', currencyCode:'BRL' },
              { id:'20000000-0000-4000-8000-000000000002', date:'2026-09-09T16:00:00.000Z', description:'Pagamento de fatura', amount:-100, type:'CREDIT', status:'POSTED', currencyCode:'BRL' }
            ]
          }
        ]
      }]
    };
    Object.defineProperty(window, 'PluggyBridge', {
      configurable: true,
      value: {
        getCredentialStatus: () => JSON.stringify({ ok:true, configured:true, clientIdMasked:'11111111…1111', itemReferenceCount:1 }),
        saveCredentials: () => JSON.stringify({ ok:true, configured:true }),
        previewData: () => JSON.stringify(payload),
        clearCredentials: () => true,
        saveItemIds: () => JSON.stringify({ ok:true, itemReferenceCount:1 })
      }
    });
  }, { partialBank, partialCard });
}

function stateFor(name) {
  const value = fixture(name);
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-01';
  value.accounts = [{ id:1, name:'Nubank', type:'Conta corrente', initial:1000, balanceMode:'snapshot', balanceDate:'2026-09-01' }];
  value.cards = [{ id:1, name:'Nubank Platinum', limit:2000, closeDay:10, dueDay:17, payAccountId:1, history:[] }];
  value.transactions = [{ id:10, accountId:1, kind:'expense', desc:'Padaria Central', amount:20, date:'2026-09-03', status:'paid', balanceImpact:true, category:'Alimentação' }];
  value.purchases = [];
  value.transfers = [];
  return value;
}

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.waitForFunction(() => window.SFPOpenFinanceUnifiedSync?.version === 1);
  await expect(page.locator('#openFinanceSyncBtn')).toHaveText('Sincronizar contas e faturas');
}

test('#203 separa prévia, importa conta + cartão, concilia existente e permanece idempotente', async ({ page }) => {
  const errors = monitor(page);
  await installBridge(page);
  const value = stateFor('Open Finance unificado #203');
  await boot(page, value);

  await page.locator('#openFinancePreviewBtn').click();
  await expect(page.locator('#openFinanceStagingSummary')).toContainText('Faturas:');
  await expect(page.locator('#openFinanceStagingSummary')).toContainText('Contas:');
  await expect(page.locator('#openFinanceStagingSummary')).toContainText('1 compra(s) nova(s)');
  await expect(page.locator('#openFinanceStagingSummary')).toContainText('2 lançamento(s) novo(s)');

  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(() => page.evaluate(() => state.transactions.filter(t => t.desc === 'FACULDADE UNILASALLE').length)).toBe(1);
  await expect(page.locator('#openFinanceStatus')).toContainText('Contas e faturas sincronizadas');

  const first = await page.evaluate(() => ({
    faculty: state.transactions.filter(t => t.desc === 'FACULDADE UNILASALLE'),
    extra: state.transactions.filter(t => t.desc === 'Hora extra'),
    pending: state.transactions.filter(t => t.desc === 'Compra ainda pendente'),
    cardPaymentAsExpense: state.transactions.filter(t => /Pagamento de fatura Nubank/i.test(t.desc)),
    streaming: state.purchases.filter(p => p.desc === 'Streaming QA'),
    cardPaymentAsPurchase: state.purchases.filter(p => /Pagamento de fatura/i.test(p.desc)),
    padaria: state.transactions.find(t => t.id === 10),
    counts: { transactions:state.transactions.length, purchases:state.purchases.length, transfers:state.transfers.length }
  }));

  expect(first.faculty).toHaveLength(1);
  expect(first.faculty[0]).toMatchObject({ accountId:1, kind:'expense', amount:665.25, date:'2026-09-09', category:'Faculdade', status:'paid', externalId:'pluggy:10000000-0000-4000-8000-000000000002' });
  expect(first.extra).toHaveLength(1);
  expect(first.extra[0]).toMatchObject({ accountId:1, kind:'income', amount:100, date:'2026-09-09' });
  expect(first.pending).toHaveLength(0);
  expect(first.cardPaymentAsExpense).toHaveLength(0);
  expect(first.streaming).toHaveLength(1);
  expect(first.streaming[0].externalId).toBe('pluggy:20000000-0000-4000-8000-000000000001');
  expect(first.cardPaymentAsPurchase).toHaveLength(0);
  expect(first.padaria.openFinanceExternalIds).toContain('pluggy:10000000-0000-4000-8000-000000000001');

  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('#openFinanceStatus')?.textContent || '')).toContain('sincronizadas');
  const second = await page.evaluate(() => ({
    faculty:state.transactions.filter(t => t.desc === 'FACULDADE UNILASALLE').length,
    extra:state.transactions.filter(t => t.desc === 'Hora extra').length,
    streaming:state.purchases.filter(p => p.desc === 'Streaming QA').length,
    counts:{transactions:state.transactions.length,purchases:state.purchases.length,transfers:state.transfers.length}
  }));
  expect(second.faculty).toBe(1);
  expect(second.extra).toBe(1);
  expect(second.streaming).toBe(1);
  expect(second.counts).toEqual(first.counts);
  expect(errors).toEqual([]);
});

test('#203 leitura parcial continua bloqueando o lote inteiro', async ({ page }) => {
  await installBridge(page, { partialBank:true });
  const value = stateFor('Open Finance parcial #203');
  await boot(page, value);
  const before = await page.evaluate(() => JSON.stringify(state));
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinanceStatus')).toContainText('leitura parcial');
  expect(await page.evaluate(() => JSON.stringify(state))).toBe(before);
});

test('#203 bridge pagina /v2/transactions por cursor em vez de truncar em 30', async () => {
  const bridge = fs.readFileSync('app/src/main/java/com/jhony/sfp/PluggyBridge.java', 'utf8');
  expect(bridge).toContain('MAX_TRANSACTION_PAGES_PER_ACCOUNT');
  expect(bridge).toContain('MAX_TRANSACTIONS_PER_ACCOUNT');
  expect(bridge).toContain('cleanString(root, "next")');
  expect(bridge).toContain('next.startsWith("?")');
  expect(bridge).not.toContain('MAX_TRANSACTION_PREVIEW_PER_ACCOUNT = 30');
});
