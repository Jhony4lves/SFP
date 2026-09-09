const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

const BANK_TX_ID = '30000000-0000-4000-8000-000000000001';
const EXTERNAL_KEY = `pluggy:${BANK_TX_ID}`;

async function installBridge(page) {
  await page.addInitScript(({ bankTxId }) => {
    const payload = {
      ok: true,
      provider: 'pluggy-personal',
      readOnly: true,
      itemCount: 1,
      accountCount: 1,
      transactionPreviewCount: 1,
      items: [{
        id: '33333333-3333-4333-8333-333333333333',
        connectorName: 'MeuPluggy',
        institution: 'Nubank',
        status: 'UPDATED',
        accounts: [{
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Nubank', presentationName: 'Nubank',
          balance: 500, currencyCode: 'BRL', transactionPreviewHasMore: false,
          transactions: [{
            id: bankTxId,
            date: '2026-09-09T12:00:00.000Z',
            description: 'FACULDADE UNILASALLE',
            amount: 665.25,
            type: 'DEBIT',
            status: 'POSTED',
            currencyCode: 'BRL'
          }]
        }]
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
  }, { bankTxId: BANK_TX_ID });
}

function stateFor(name) {
  const value = fixture(name);
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-01';
  value.accounts = [{ id:1, name:'Nubank', type:'Conta corrente', initial:1000, balanceMode:'snapshot', balanceDate:'2026-09-01' }];
  value.cards = [];
  value.purchases = [];
  value.transfers = [];
  value.transactions = [];
  value.recurring = [{
    id:55,
    active:true,
    type:'expense',
    desc:'Faculdade',
    amount:665.25,
    day:10,
    category:'Faculdade',
    accountId:1,
    start:'2026-01',
    end:''
  }];
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
  await page.waitForFunction(() => window.SFPOpenFinanceRecurringReconcile?.version === 2);
}

async function sync(page) {
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinanceStatus')).toContainText('Contas e faturas sincronizadas');
}

test('#205 pagamento bancário antecipado materializa recorrência na data real e remove previsão do vencimento', async ({ page }) => {
  const errors = monitor(page);
  await installBridge(page);
  const value = stateFor('Open Finance recorrência virtual #205');
  await boot(page, value);

  await sync(page);
  await expect.poll(() => page.evaluate(() => state.transactions.length)).toBe(1);

  const result = await page.evaluate(() => {
    const tx = state.transactions[0];
    const events = financialCalendarEvents('2026-09');
    return {
      tx,
      virtuals: recurringOccurrences('2026-09').filter(item => item.recurringId === 55),
      day9: events.filter(item => item.date === '2026-09-09' && Math.abs(Number(item.amount) - 665.25) < .01),
      day10: events.filter(item => item.date === '2026-09-10' && Math.abs(Number(item.amount) - 665.25) < .01)
    };
  });

  expect(result.tx).toMatchObject({
    recurringId:55,
    recurrenceMonth:'2026-09',
    occurrenceKey:'55:2026-09',
    date:'2026-09-09',
    scheduledDate:'2026-09-10',
    dueDay:10,
    desc:'Faculdade',
    category:'Faculdade',
    status:'paid',
    externalId:EXTERNAL_KEY
  });
  expect(result.virtuals).toHaveLength(0);
  expect(result.day9).toHaveLength(1);
  expect(result.day10).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('#205 ocorrência já materializada no vencimento é realinhada para a data do banco sem duplicar', async ({ page }) => {
  await installBridge(page);
  const value = stateFor('Open Finance recorrência materializada #205');
  value.transactions = [{
    id:90,
    recurringId:55,
    recurrenceMonth:'2026-09',
    occurrenceKey:'55:2026-09',
    accountId:1,
    kind:'expense',
    desc:'Faculdade',
    amount:665.25,
    date:'2026-09-10',
    dueDay:10,
    category:'Faculdade',
    status:'paid',
    tags:['recorrente'],
    balanceImpact:true
  }];
  await boot(page, value);

  await sync(page);
  await expect.poll(() => page.evaluate(() => state.transactions.length)).toBe(1);

  const tx = await page.evaluate(() => state.transactions[0]);
  expect(tx).toMatchObject({ id:90, recurringId:55, recurrenceMonth:'2026-09', date:'2026-09-09', scheduledDate:'2026-09-10', externalId:EXTERNAL_KEY });
  expect(tx.openFinanceExternalIds).toContain(EXTERNAL_KEY);
});

test('#205 estado duplicado criado pela versão anterior é reparado mesmo quando a transação Pluggy já é conhecida', async ({ page }) => {
  await installBridge(page);
  const value = stateFor('Open Finance reparar duplicidade #205');
  value.transactions = [
    {
      id:90,
      recurringId:55,
      recurrenceMonth:'2026-09',
      occurrenceKey:'55:2026-09',
      accountId:1,
      kind:'expense',
      desc:'Faculdade',
      amount:665.25,
      date:'2026-09-10',
      dueDay:10,
      category:'Faculdade',
      status:'paid',
      tags:['recorrente'],
      balanceImpact:true
    },
    {
      id:91,
      accountId:1,
      kind:'expense',
      desc:'FACULDADE UNILASALLE',
      amount:665.25,
      date:'2026-09-09',
      dueDay:9,
      category:'Faculdade',
      status:'paid',
      tags:['open-finance','pluggy'],
      balanceImpact:true,
      externalId:EXTERNAL_KEY,
      openFinanceExternalIds:[EXTERNAL_KEY],
      openFinanceProvider:'pluggy',
      openFinanceAccountId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      openFinanceItemId:'33333333-3333-4333-8333-333333333333'
    }
  ];
  await boot(page, value);

  await sync(page);
  await expect.poll(() => page.evaluate(() => state.transactions.length)).toBe(1);

  const result = await page.evaluate(() => ({
    tx: state.transactions[0],
    day10: financialCalendarEvents('2026-09').filter(item => item.date === '2026-09-10' && Math.abs(Number(item.amount)-665.25)<.01).length
  }));
  expect(result.tx).toMatchObject({ id:90, recurringId:55, date:'2026-09-09', scheduledDate:'2026-09-10', externalId:EXTERNAL_KEY });
  expect(result.day10).toBe(0);
});

test('#205 match ambíguo não transforma lançamento bancário em recorrência automaticamente', async ({ page }) => {
  await installBridge(page);
  const value = stateFor('Open Finance recorrência ambígua #205');
  value.recurring.push({
    id:56,
    active:true,
    type:'expense',
    desc:'Faculdade extra',
    amount:665.25,
    day:11,
    category:'Faculdade',
    accountId:1,
    start:'2026-01',
    end:''
  });
  await boot(page, value);

  await sync(page);
  const tx = await page.evaluate(() => state.transactions.find(item => item.externalId === 'pluggy:30000000-0000-4000-8000-000000000001'));
  expect(tx).toBeTruthy();
  expect(tx.recurringId).toBeFalsy();
  expect(await page.evaluate(() => recurringOccurrences('2026-09').length)).toBe(2);
});

test('#205 módulo é carregado pela suíte principal e preserva janela segura de 3 dias', async () => {
  const safeSpend = fs.readFileSync('app/src/main/assets/www/safe-spend.js','utf8');
  const reconcile = fs.readFileSync('app/src/main/assets/www/open-finance-recurring-reconcile.js','utf8');
  expect(safeSpend).toContain("script.src='open-finance-recurring-reconcile.js'");
  expect(reconcile).toContain('const SAFE_WINDOW_DAYS=3');
  expect(reconcile).toContain('alignAlreadyLinkedRecurring');
  expect(reconcile).toContain("reason==='Sincronizar Open Finance'");
});
