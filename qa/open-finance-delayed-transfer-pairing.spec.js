const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

async function installBridge(page) {
  await page.addInitScript(() => {
    window.__sfpDelayedTransferPhase = 1;

    const outgoing = {
      id: '90000000-0000-4000-8000-000000000001',
      date: '2026-09-15T12:00:00.000Z',
      description: 'PIX TRANSFERENCIA ENVIADA',
      amount: 250,
      type: 'DEBIT',
      status: 'POSTED',
      currencyCode: 'BRL'
    };
    const incoming = {
      id: '90000000-0000-4000-8000-000000000002',
      date: '2026-09-15T12:01:00.000Z',
      description: 'PIX TRANSFERENCIA RECEBIDA',
      amount: 250,
      type: 'CREDIT',
      status: 'POSTED',
      currencyCode: 'BRL'
    };

    const payload = () => ({
      ok: true,
      provider: 'pluggy-personal',
      readOnly: true,
      itemCount: 2,
      accountCount: 2,
      transactionPreviewCount: window.__sfpDelayedTransferPhase >= 2 ? 2 : 1,
      items: [
        {
          id: 'item-itau',
          connectorName: 'MeuPluggy',
          institution: 'Itaú',
          status: 'UPDATED',
          accounts: [{
            id: 'account-itau',
            type: 'BANK', subtype: 'CHECKING_ACCOUNT',
            name: 'Itaú', presentationName: 'Itaú', marketingName: 'Itaú',
            balance: 750, currencyCode: 'BRL', transactionPreviewHasMore: false,
            transactions: [outgoing]
          }]
        },
        {
          id: 'item-nubank',
          connectorName: 'MeuPluggy',
          institution: 'Nubank',
          status: 'UPDATED',
          accounts: [{
            id: 'account-nubank',
            type: 'BANK', subtype: 'CHECKING_ACCOUNT',
            name: 'Nubank', presentationName: 'Nubank', marketingName: 'Nubank',
            balance: 1250, currencyCode: 'BRL', transactionPreviewHasMore: false,
            transactions: window.__sfpDelayedTransferPhase >= 2 ? [incoming] : []
          }]
        }
      ]
    });

    Object.defineProperty(window, 'PluggyBridge', {
      configurable: true,
      value: {
        // Mantém o auto-sync desligado neste teste; as duas rodadas são disparadas de forma determinística.
        getCredentialStatus: () => JSON.stringify({ ok: true, configured: false }),
        saveCredentials: () => JSON.stringify({ ok: true, configured: true }),
        previewData: () => JSON.stringify(payload()),
        clearCredentials: () => true,
        saveItemIds: () => JSON.stringify({ ok: true, itemReferenceCount: 2 })
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
  await page.waitForFunction(() => typeof window.SFPOpenFinanceUnifiedSync?.syncAll === 'function');
}

test('#229 promove ponta bancária antiga para transferência quando a contraparte chega depois', async ({ page }) => {
  const errors = monitor(page);
  await installBridge(page);

  const value = fixture('Transferência Open Finance atrasada #229');
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-01';
  value.accounts = [
    { id: 1, name: 'Itaú', type: 'Conta corrente', initial: 1000, balanceMode: 'snapshot', balanceDate: '2026-09-15' },
    { id: 2, name: 'Nubank', type: 'Conta corrente', initial: 1000, balanceMode: 'snapshot', balanceDate: '2026-09-01' }
  ];
  value.cards = [];
  value.transactions = [];
  value.transfers = [];
  value.purchases = [];

  await boot(page, value);

  const firstResult = await page.evaluate(() => window.SFPOpenFinanceUnifiedSync.syncAll());
  expect(firstResult.ok).toBe(true);

  const first = await page.evaluate(() => ({
    transactions: state.transactions.map(row => ({ ...row })),
    transfers: state.transfers.map(row => ({ ...row }))
  }));

  expect(first.transfers).toHaveLength(0);
  expect(first.transactions).toHaveLength(1);
  expect(first.transactions[0]).toMatchObject({
    accountId: 1,
    kind: 'expense',
    amount: 250,
    externalId: 'pluggy:90000000-0000-4000-8000-000000000001',
    balanceImpact: false
  });

  // Muda a âncora depois da primeira importação para provar que a promoção preserva
  // o impacto já decidido para a ponta antiga, em vez de recalculá-lo retroativamente.
  await page.evaluate(() => {
    state.accounts.find(account => String(account.id) === '1').balanceDate = '2026-09-01';
    window.__sfpDelayedTransferPhase = 2;
  });

  const secondResult = await page.evaluate(() => window.SFPOpenFinanceUnifiedSync.syncAll());
  expect(secondResult.ok).toBe(true);
  expect(secondResult.bankApplied.transfers).toBe(1);
  expect(secondResult.bankApplied.promoted).toBe(1);

  const second = await page.evaluate(() => ({
    transactions: state.transactions.map(row => ({ ...row })),
    transfers: state.transfers.map(row => ({ ...row }))
  }));

  expect(second.transactions.filter(row => row.openFinanceExternalIds?.some(id => id.startsWith('pluggy:90000000-')))).toHaveLength(0);
  expect(second.transfers).toHaveLength(1);
  expect(second.transfers[0]).toMatchObject({
    fromId: 1,
    toId: 2,
    amount: 250,
    matchedBy: 'open-finance-bank-pair',
    balanceImpact: true
  });
  expect(second.transfers[0].openFinanceExternalIds.sort()).toEqual([
    'pluggy:90000000-0000-4000-8000-000000000001',
    'pluggy:90000000-0000-4000-8000-000000000002'
  ]);
  expect(second.transfers[0].balanceImpactByAccount['1']).toBe(false);
  expect(second.transfers[0].balanceImpactByAccount['2']).toBe(true);

  const countsBeforeThird = { transactions: second.transactions.length, transfers: second.transfers.length };
  const thirdResult = await page.evaluate(() => window.SFPOpenFinanceUnifiedSync.syncAll());
  expect(thirdResult.ok).toBe(true);

  const third = await page.evaluate(() => ({
    transactions: state.transactions.length,
    transfers: state.transfers.length
  }));
  expect(third).toEqual(countsBeforeThird);
  expect(errors).toEqual([]);
});
