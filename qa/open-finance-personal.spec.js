const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_SECRET = 'qa-secret-never-persist';

async function installBridgeMock(page, { configured = false } = {}) {
  await page.addInitScript(({ configured }) => {
    let isConfigured = configured;
    window.__pluggyMock = { saveCalls: 0, previewCalls: 0, clearCalls: 0, lastClientId: '', lastSecret: '', partial: false };
    Object.defineProperty(window, 'PluggyBridge', {
      configurable: true,
      value: {
        getCredentialStatus() {
          return JSON.stringify({ ok: true, configured: isConfigured, clientIdMasked: isConfigured ? '11111111…1111' : '', itemReferenceCount: 3 });
        },
        saveCredentials(clientId, clientSecret) {
          window.__pluggyMock.saveCalls += 1;
          window.__pluggyMock.lastClientId = clientId;
          window.__pluggyMock.lastSecret = clientSecret;
          isConfigured = true;
          return JSON.stringify({ ok: true, configured: true });
        },
        previewData() {
          window.__pluggyMock.previewCalls += 1;
          return JSON.stringify({
            ok: true,
            provider: 'pluggy-personal',
            readOnly: true,
            itemCount: 3,
            accountCount: 6,
            transactionPreviewCount: 6,
            transactionWindowDays: 45,
            items: [
              {
                id: '11111111-1111-4111-8111-111111111111', connectorName: 'MeuPluggy', status: 'UPDATED', accounts: [
                  {
                    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'BANK', subtype: 'CHECKING_ACCOUNT',
                    name: 'Nubank', presentationName: 'Nubank', balance: 321.45, currencyCode: 'BRL', number: '00001234', lastFour: '1234',
                    transactionWindowDays: 45, transactions: [
                      { id: 'a0000000-0000-4000-8000-000000000001', date: '2026-09-03T12:00:00.000Z', description: 'Padaria Central', amount: 20, type: 'DEBIT', status: 'POSTED', currencyCode: 'BRL' },
                      { id: 'a0000000-0000-4000-8000-000000000002', date: '2026-09-04T12:00:00.000Z', description: 'PIX recebido', amount: 80, type: 'CREDIT', status: 'POSTED', currencyCode: 'BRL' }
                    ]
                  },
                  {
                    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', type: 'CREDIT', subtype: 'CREDIT_CARD',
                    name: 'null', marketingName: null, presentationName: 'Cartão de crédito • final 4415', balance: 359.54, currencyCode: 'BRL', number: '4415', lastFour: '4415',
                    creditData: { availableCreditLimit: 1640.46, creditLimit: 2000 }, transactionWindowDays: 45,
                    transactionPreviewHasMore: false,
                    transactions: [
                      { id: 'aa000000-0000-4000-8000-000000000003', date: '2026-09-04T12:00:00.000Z', description: 'Streaming QA', amount: 35.90, type: 'DEBIT', status: 'POSTED', currencyCode: 'BRL' }
                    ]
                  }
                ]
              },
              {
                id: '22222222-2222-4222-8222-222222222222', connectorName: 'MeuPluggy', status: 'UPDATED', accounts: [
                  {
                    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', type: 'BANK', subtype: 'PREPAID_ACCOUNT',
                    name: 'Mercado Pago (Conta Pré-paga)', presentationName: 'Mercado Pago (Conta Pré-paga)', balance: 80, currencyCode: 'BRL', lastFour: '5387',
                    transactionWindowDays: 45, transactions: []
                  },
                  {
                    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', type: 'CREDIT', subtype: 'CREDIT_CARD',
                    name: 'Mercado Pago', presentationName: 'Mercado Pago', balance: 0, currencyCode: 'BRL', number: '0300', lastFour: '0300',
                    transactionWindowDays: 45,
                    transactionPreviewHasMore: window.__pluggyMock.partial,
                    transactions: [
                      { id: 'c0000000-0000-4000-8000-000000000001', date: '2026-09-02T12:00:00.000Z', description: 'Mercado do Bairro', amount: 50, type: 'DEBIT', status: 'POSTED', currencyCode: 'BRL' },
                      { id: 'c0000000-0000-4000-8000-000000000002', date: '2026-09-04T12:00:00.000Z', description: 'Pagamento de fatura', amount: -100, type: 'CREDIT', status: 'POSTED', currencyCode: 'BRL' }
                    ]
                  }
                ]
              },
              {
                id: '33333333-3333-4333-8333-333333333333', connectorName: 'MeuPluggy', status: 'UPDATED', accounts: [
                  {
                    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', type: 'BANK', subtype: 'CHECKING_ACCOUNT',
                    name: null, marketingName: null, presentationName: 'Conta corrente • final 8849', balance: 144.9, currencyCode: 'BRL', number: '00078849', lastFour: '8849',
                    transactionWindowDays: 45, transactions: [
                      { id: 'd0000000-0000-4000-8000-000000000001', date: '2026-09-04T08:00:00.000Z', description: 'TED exemplo', amount: 30, type: 'DEBIT', status: 'POSTED', currencyCode: 'BRL' }
                    ]
                  },
                  {
                    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', type: 'CREDIT', subtype: 'CREDIT_CARD',
                    name: 'null', marketingName: 'null', presentationName: 'Cartão de crédito • final 6442', balance: 1428.26, currencyCode: 'BRL', number: '6442', lastFour: '6442',
                    transactionWindowDays: 45, transactions: []
                  }
                ]
              }
            ]
          });
        },
        clearCredentials() {
          window.__pluggyMock.clearCalls += 1;
          isConfigured = false;
          return true;
        }
      }
    });
  }, { configured });
}

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await expect(page.locator('#openFinancePersonalPanel')).toBeVisible();
}

function openFinanceState(name = 'Open Finance Sync') {
  const value = fixture(name);
  value.accounts = [
    { id: 1, name: 'Nubank', type: 'Conta corrente', initial: 987.65, balanceMode: 'snapshot', balanceDate: '2026-09-01' },
    { id: 2, name: 'Mercado Pago', type: 'Conta corrente', initial: 80, balanceMode: 'snapshot', balanceDate: '2026-09-01' },
    { id: 3, name: 'Itaú', type: 'Conta corrente', initial: 100, balanceMode: 'snapshot', balanceDate: '2026-09-01' }
  ];
  value.cards = [
    { id: 1, name: 'Nubank Platinum', limit: 2000, closeDay: 10, dueDay: 17, payAccountId: 1, history: [] },
    { id: 2, name: 'Mercado Pago', limit: 1000, closeDay: 10, dueDay: 17, payAccountId: 2, history: [] },
    { id: 3, name: 'Itaú Click', limit: 3000, closeDay: 10, dueDay: 17, payAccountId: 3, history: [] }
  ];
  value.transactions.push({ id: 10, kind: 'expense', desc: 'Padaria Central', amount: 20, date: '2026-09-03', accountId: 1, status: 'paid', balanceImpact: true });
  value.purchases.push({ id: 20, cardId: 2, desc: 'Mercado do Bairro', total: 50, purchaseDate: '2026-09-02', installments: 1, firstMonth: '2026-09', status: 'active', refunds: [] });
  return value;
}

test('OPEN-FINANCE-01 credenciais passam somente pela bridge nativa e somem do formulário', async ({ page }) => {
  const errors = monitor(page);
  await installBridgeMock(page);
  const value = fixture('Open Finance Cofre');
  await boot(page, value);

  await page.locator('#openFinanceClientId').fill(CLIENT_ID);
  await page.locator('#openFinanceClientSecret').fill(CLIENT_SECRET);
  await page.locator('#openFinanceSaveBtn').click();

  await expect(page.locator('#openFinanceStatus')).toContainText('Meu Pluggy configurado neste aparelho');
  await expect(page.locator('#openFinanceClientId')).toHaveValue('');
  await expect(page.locator('#openFinanceClientSecret')).toHaveValue('');
  await expect(page.locator('#openFinanceSyncBtn')).toBeVisible();

  const result = await page.evaluate(secret => ({
    mock: { ...window.__pluggyMock },
    stateContainsSecret: JSON.stringify(state).includes(secret),
    localContainsSecret: Object.values(localStorage).some(value => String(value).includes(secret)),
    sessionContainsSecret: Object.values(sessionStorage).some(value => String(value).includes(secret)),
    htmlContainsSecret: document.documentElement.innerHTML.includes(secret)
  }), CLIENT_SECRET);

  expect(result.mock.saveCalls).toBe(1);
  expect(result.mock.lastClientId).toBe(CLIENT_ID);
  expect(result.mock.lastSecret).toBe(CLIENT_SECRET);
  expect(result.stateContainsSecret).toBe(false);
  expect(result.localContainsSecret).toBe(false);
  expect(result.sessionContainsSecret).toBe(false);
  expect(result.htmlContainsSecret).toBe(false);
  expect(errors).toEqual([]);
});

test('OPEN-FINANCE-02 consulta lê 3 Items/6 contas/transações sem mutar o estado e sem renderizar null', async ({ page }) => {
  const errors = monitor(page);
  await installBridgeMock(page, { configured: true });
  const value = openFinanceState('Open Finance Preview');
  await boot(page, value);

  const before = await page.evaluate(() => JSON.stringify(state));
  await page.locator('#openFinancePreviewBtn').click();

  await expect(page.locator('#openFinancePreview')).toContainText('3 Item(s), 6 conta(s)/cartão(ões) e 6 transação(ões) recentes');
  await expect(page.locator('#openFinancePreview')).toContainText('Nubank');
  await expect(page.locator('#openFinancePreview')).toContainText('Mercado Pago');
  await expect(page.locator('#openFinancePreview')).toContainText('Conta corrente • final 8849');
  await expect(page.locator('#openFinancePreview')).toContainText('Cartão de crédito • final 6442');
  await expect(page.locator('#openFinancePreview')).toContainText('provável lançamento já existente');
  await expect(page.locator('#openFinancePreview')).toContainText('crédito/pagamento • revisar');

  const rendered = await page.locator('#openFinancePreview').innerText();
  expect(rendered).not.toMatch(/\bnull\b/i);

  await page.locator('#openFinancePreviewBtn').click();
  const after = await page.evaluate(() => JSON.stringify(state));
  const previewCalls = await page.evaluate(() => window.__pluggyMock.previewCalls);

  expect(after).toBe(before);
  expect(previewCalls).toBe(2);
  expect(errors).toEqual([]);
});

test('OPEN-FINANCE-03 versão web não tenta guardar segredo nem simular a bridge Android', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('Open Finance Web');
  await boot(page, value);

  await expect(page.locator('#openFinanceStatus')).toContainText('Disponível no aplicativo Android');
  await expect(page.locator('#openFinanceCredentialsForm')).toHaveClass(/hidden/);
  await expect(page.locator('#openFinancePreviewBtn')).toHaveClass(/hidden/);
  await expect(page.locator('#openFinanceSyncBtn')).toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});

test('OPEN-FINANCE-04 bridge nativa mantém segredos no Keystore, API key em memória e transações read-only allowlisted', async () => {
  const bridge = fs.readFileSync('app/src/main/java/com/jhony/sfp/PluggyBridge.java', 'utf8');
  const activity = fs.readFileSync('app/src/main/java/com/jhony/sfp/MainActivity.java', 'utf8');

  expect(bridge).toContain('AndroidKeyStore');
  expect(bridge).toContain('AES/GCM/NoPadding');
  expect(bridge).toContain('Context.MODE_PRIVATE');
  expect(bridge).toContain('sfp_open_finance_pluggy_v1');
  expect(bridge).toContain('private volatile String apiKey;');
  expect(bridge).not.toMatch(/putString\([^\n]*apiKey/i);
  expect(bridge).not.toMatch(/@JavascriptInterface\s+public\s+String\s+get[^\n]*Secret/i);
  expect(bridge).toContain('setInstanceFollowRedirects(false)');
  expect(bridge).toContain('"api.pluggy.ai".equalsIgnoreCase(url.getHost())');
  expect(bridge).toContain('"/v2/transactions".equals(path)');
  expect(bridge).toContain('TRANSACTION_WINDOW_DAYS = 45');
  expect(bridge).toContain('MAX_TRANSACTION_PREVIEW_PER_ACCOUNT = 30');
  expect(bridge).toContain('cleanString(JSONObject object, String key)');
  expect(bridge).toContain('creditData');
  expect(bridge).not.toContain('paymentData');
  expect(activity).toContain('addJavascriptInterface(new PluggyBridge(this), "PluggyBridge")');
});

test('OPEN-FINANCE-05 atualizar faturas importa compra nova, concilia existente e é idempotente', async ({ page }) => {
  const errors = monitor(page);
  await installBridgeMock(page, { configured: true });
  const value = openFinanceState('Open Finance Invoice Sync');
  await boot(page, value);

  const beforeCount = await page.evaluate(() => state.purchases.length);
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinanceStatus')).toContainText('Faturas atualizadas pelo Open Finance');

  const first = await page.evaluate(() => ({
    count: state.purchases.length,
    streaming: state.purchases.filter(p => p.desc === 'Streaming QA').map(p => ({
      cardId: p.cardId, total: p.total, installments: p.installments, purchaseDate: p.purchaseDate,
      firstMonth: p.firstMonth, category: p.category, tags: p.tags, externalId: p.externalId
    })),
    mercado: state.purchases.filter(p => p.cardId === 2 && p.desc === 'Mercado do Bairro').map(p => ({ ids: p.openFinanceExternalIds || [] })),
    paymentImported: state.purchases.some(p => /Pagamento de fatura/i.test(p.desc)),
    invoiceSep: invoiceTotal(1, '2026-09')
  }));

  expect(first.count).toBe(beforeCount + 1);
  expect(first.streaming).toHaveLength(1);
  expect(first.streaming[0]).toMatchObject({ cardId: 1, total: 35.9, installments: 1, purchaseDate: '2026-09-04', firstMonth: '2026-09' });
  expect(first.streaming[0].tags).toContain('open-finance');
  expect(first.streaming[0].externalId).toBe('pluggy:aa000000-0000-4000-8000-000000000003');
  expect(first.mercado).toHaveLength(1);
  expect(first.mercado[0].ids).toContain('pluggy:c0000000-0000-4000-8000-000000000001');
  expect(first.paymentImported).toBe(false);
  expect(first.invoiceSep).toBeGreaterThanOrEqual(35.9);

  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinanceStatus')).toContainText('Faturas atualizadas pelo Open Finance');
  const second = await page.evaluate(() => ({
    count: state.purchases.length,
    streaming: state.purchases.filter(p => p.desc === 'Streaming QA').length,
    mercado: state.purchases.filter(p => p.cardId === 2 && p.desc === 'Mercado do Bairro').length
  }));

  expect(second.count).toBe(first.count);
  expect(second.streaming).toBe(1);
  expect(second.mercado).toBe(1);
  expect(errors).toEqual([]);
});

test('OPEN-FINANCE-06 leitura parcial aborta o lote inteiro sem alterar faturas', async ({ page }) => {
  const errors = monitor(page);
  await installBridgeMock(page, { configured: true });
  const value = openFinanceState('Open Finance Partial Guard');
  await boot(page, value);
  await page.evaluate(() => { window.__pluggyMock.partial = true; });

  const before = await page.evaluate(() => JSON.stringify(state));
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinanceStatus')).toContainText('Faturas não foram alteradas');
  await expect(page.locator('#openFinanceStatus')).toContainText('leitura parcial');
  const after = await page.evaluate(() => JSON.stringify(state));

  expect(after).toBe(before);
  expect(errors).toEqual([]);
});