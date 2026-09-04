const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_SECRET = 'qa-secret-never-persist';

async function installBridgeMock(page, { configured = false } = {}) {
  await page.addInitScript(({ configured }) => {
    let isConfigured = configured;
    window.__pluggyMock = { saveCalls: 0, previewCalls: 0, clearCalls: 0, lastClientId: '', lastSecret: '' };
    Object.defineProperty(window, 'PluggyBridge', {
      configurable: true,
      value: {
        getCredentialStatus() {
          return JSON.stringify({ ok: true, configured: isConfigured, clientIdMasked: isConfigured ? '11111111…1111' : '' });
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
            items: [
              { id: '11111111-1111-4111-8111-111111111111', connectorName: 'MeuPluggy', status: 'UPDATED', accounts: [
                { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Nubank', balance: 321.45, currencyCode: 'BRL', number: '•••• 1234' }
              ] },
              { id: '22222222-2222-4222-8222-222222222222', connectorName: 'MeuPluggy', status: 'UPDATED', accounts: [
                { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Mercado Pago', balance: 80, currencyCode: 'BRL' },
                { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Mercado Pago', balance: 0, currencyCode: 'BRL', number: '0300' }
              ] },
              { id: '33333333-3333-4333-8333-333333333333', connectorName: 'MeuPluggy', status: 'UPDATED', accounts: [
                { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Itaú', balance: 144.9, currencyCode: 'BRL' }
              ] }
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

test('OPEN-FINANCE-02 prévia repetida é somente leitura e idempotente para o estado SFP', async ({ page }) => {
  const errors = monitor(page);
  await installBridgeMock(page, { configured: true });
  const value = fixture('Open Finance Preview');
  value.accounts[0].initial = 987.65;
  await boot(page, value);

  const before = await page.evaluate(() => JSON.stringify(state));
  await page.locator('#openFinancePreviewBtn').click();
  await expect(page.locator('#openFinancePreview')).toContainText('3 Item(s) e 4 conta(s)/cartão(ões)');
  await expect(page.locator('#openFinancePreview')).toContainText('Nubank');
  await expect(page.locator('#openFinancePreview')).toContainText('Mercado Pago');
  await expect(page.locator('#openFinancePreview')).toContainText('Itaú');

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
  expect(errors).toEqual([]);
});

test('OPEN-FINANCE-04 bridge nativa mantém segredos no Keystore e API key só em memória', async () => {
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
  expect(bridge).toContain('"/auth".equals(path) || "/items".equals(path) || "/accounts".equals(path)');
  expect(activity).toContain('addJavascriptInterface(new PluggyBridge(this), "PluggyBridge")');
});
