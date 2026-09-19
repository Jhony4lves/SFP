const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function creditPayload({ totalAmount } = {}) {
  const installment = { installmentNumber:3, totalInstallments:9 };
  if (totalAmount != null) installment.totalAmount = totalAmount;
  return {
    ok:true,
    provider:'pluggy-personal',
    readOnly:true,
    itemCount:1,
    accountCount:1,
    transactionPreviewCount:1,
    items:[{
      id:'item-nubank',
      connectorName:'MeuPluggy',
      institution:'Nubank',
      status:'UPDATED',
      accounts:[{
        id:'credit-nubank',
        type:'CREDIT',
        subtype:'CREDIT_CARD',
        name:'Nubank',
        marketingName:'Nubank',
        presentationName:'Nubank',
        currencyCode:'BRL',
        transactionPreviewHasMore:false,
        transactions:[{
          id:'purchase-3-of-9',
          date:'2026-09-10T12:00:00.000Z',
          billForecastDate:'2026-09',
          description:'COMPRA PARCELADA TESTE 3/9',
          amount:100,
          type:'DEBIT',
          status:'POSTED',
          currencyCode:'BRL',
          installment
        }]
      }]
    }]
  };
}


function nubankLegacyFirstMonthPayload() {
  return {
    ok:true,
    provider:'pluggy-personal',
    readOnly:true,
    itemCount:1,
    accountCount:1,
    transactionPreviewCount:1,
    items:[{
      id:'nubank-item',
      connectorName:'MeuPluggy',
      institution:'Nubank',
      status:'UPDATED',
      accounts:[{
        id:'nubank-credit',
        type:'CREDIT',
        subtype:'CREDIT_CARD',
        name:'Nubank',
        presentationName:'Nubank',
        currencyCode:'BRL',
        transactionPreviewHasMore:false,
        transactions:[{
          id:'assb-original-1of3',
          date:'2026-08-11T20:52:51.001Z',
          billForecastDate:'2026-09',
          description:'Assb Comercio Varejist 1/3',
          amount:94.36,
          type:'DEBIT',
          status:'POSTED',
          currencyCode:'BRL',
          installment:{installmentNumber:1,totalInstallments:3}
        }]
      }]
    }]
  };
}

async function installBridge(page, payload) {
  await page.addInitScript(initial => {
    window.__qaPluggyPayload = initial;
    Object.defineProperty(window, 'PluggyBridge', {
      configurable:true,
      value:{
        getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'qa',itemReferenceCount:1}),
        saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
        previewData:()=>JSON.stringify(window.__qaPluggyPayload),
        clearCredentials:()=>true,
        saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
      }
    });
  }, payload);
}

function stateBase() {
  const value = fixture('open-finance-base.json');
  value.settings = value.settings || {};
  value.settings.name = 'Parcelas futuras #246';
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-17';
  value.accounts = [{id:1,name:'Itaú',type:'Conta corrente',initial:1000,balanceMode:'snapshot',balanceDate:'2026-09-17'}];
  value.cards = [{id:1,name:'Nubank',limit:3000,closeDay:12,dueDay:20,payAccountId:1,history:[]}];
  value.transactions = [];
  value.transfers = [];
  value.purchases = [];
  value.invoices = [];
  value.invoiceAdjustments = [];
  value.recurring = [];
  value.debts = [];
  value.creditFacilities = [];
  return value;
}

async function boot(page, value, payload) {
  await installBridge(page, payload);
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.waitForFunction(() => window.SFPOpenFinanceUnifiedSync?.version === 2);
  await page.waitForFunction(() => window.SFPFinancialIntegrityV2?.version === 2);
  await expect.poll(() => page.evaluate(() => state.purchases?.length || 0)).toBe(1);
}

test('#246 n/total sem totalAmount projeta parcelas futuras no calendário e no Safe-to-Spend', async ({ page }) => {
  const value = stateBase();
  await boot(page, value, creditPayload());

  const result = await page.evaluate(() => {
    const purchase=state.purchases[0];
    const october=financialCalendarEvents('2026-10');
    const octoberInvoice=october.find(event=>event.source==='invoice'&&event.cardId===1);
    const liquidity=SFPFinancialIntegrityV2.liquiditySnapshot({reference:new Date(2026,8,17,12,0,0),days:365});
    return {
      count:state.purchases.length,
      installments:purchase.installments,
      total:purchase.total,
      firstMonth:purchase.firstMonth,
      estimated:purchase.openFinanceInstallmentEstimated,
      september:invoiceCalculated(1,'2026-09'),
      october:invoiceCalculated(1,'2026-10'),
      octoberInvoice:octoberInvoice?{amount:octoberInvoice.amount,date:octoberInvoice.date,realization:octoberInvoice.realization}:null,
      safe:liquidity.safeToSpendCents,
      projected:liquidity.projection.projectedCents,
      invoiceEvents:liquidity.projection.allEvents.filter(event=>event.source==='invoice').map(event=>({date:event.date,amount:event.amount}))
    };
  });

  expect(result).toMatchObject({
    count:1,
    installments:9,
    total:900,
    firstMonth:'2026-07',
    estimated:true,
    september:100,
    october:100,
    octoberInvoice:{amount:100,date:'2026-10-20',realization:'projected'},
    safe:30000,
    projected:30000
  });
  expect(result.invoiceEvents.filter(event=>event.amount===100)).toHaveLength(7);
});

test('#246 registro legado importado como 1x é promovido no re-sync sem duplicar', async ({ page }) => {
  const value = stateBase();
  value.purchases = [{
    id:77,
    cardId:1,
    desc:'COMPRA PARCELADA TESTE 3/9',
    total:100,
    installments:1,
    purchaseDate:'2026-09-10',
    firstMonth:'2026-09',
    category:'Outros',
    status:'active',
    note:'Importado automaticamente pelo Open Finance (Pluggy). Parcela 3 / 9; total original não foi informado, então somente a cobrança atual foi registrada.',
    tags:['open-finance','pluggy'],
    refunds:[],
    externalId:'pluggy:purchase-3-of-9',
    openFinanceExternalIds:['pluggy:purchase-3-of-9'],
    openFinanceProvider:'pluggy',
    openFinanceAccountId:'credit-nubank',
    openFinanceItemId:'item-nubank',
    openFinanceStatus:'POSTED',
    openFinanceInstallment:{installmentNumber:3,totalInstallments:9}
  }];

  await installBridge(page, creditPayload());
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.waitForFunction(() => window.SFPOpenFinanceUnifiedSync?.version === 2);
  await page.evaluate(() => window.SFPOpenFinanceUnifiedSync.syncAll());

  await expect.poll(() => page.evaluate(() => ({
    count:state.purchases.length,
    installments:state.purchases[0]?.installments,
    total:state.purchases[0]?.total,
    firstMonth:state.purchases[0]?.firstMonth,
    estimated:state.purchases[0]?.openFinanceInstallmentEstimated
  }))).toEqual({count:1,installments:9,total:900,firstMonth:'2026-07',estimated:true});

  await page.evaluate(() => window.SFPOpenFinanceUnifiedSync.syncAll());
  const again = await page.evaluate(() => ({
    count:state.purchases.length,
    installments:state.purchases[0].installments,
    total:state.purchases[0].total,
    externalIds:state.purchases[0].openFinanceExternalIds
  }));
  expect(again.count).toBe(1);
  expect(again.installments).toBe(9);
  expect(again.total).toBe(900);
  expect(again.externalIds).toEqual(['pluggy:purchase-3-of-9']);
});

test('#246 totalAmount posterior substitui a estimativa sem criar nova compra', async ({ page }) => {
  const value = stateBase();
  await boot(page, value, creditPayload());
  expect(await page.evaluate(() => state.purchases[0].openFinanceInstallmentEstimated)).toBe(true);

  await page.evaluate(next => { window.__qaPluggyPayload = next; }, creditPayload({totalAmount:899.91}));
  await page.evaluate(() => window.SFPOpenFinanceUnifiedSync.syncAll());

  const result = await page.evaluate(() => ({
    count:state.purchases.length,
    total:state.purchases[0].total,
    installments:state.purchases[0].installments,
    estimated:state.purchases[0].openFinanceInstallmentEstimated,
    october:invoiceCalculated(1,'2026-10')
  }));
  expect(result.count).toBe(1);
  expect(result.total).toBe(899.91);
  expect(result.installments).toBe(9);
  expect(result.estimated).toBe(false);
  expect(result.october).toBeCloseTo(99.99,2);
});


test('#263 re-sync repara firstMonth legado com externalId exato e billForecastDate explícito', async ({ page }) => {
  const value = stateBase();
  value.settings.name = 'Nubank firstMonth legado #263';
  value.mesAtual = '2026-10';
  value.cards = [{id:1,name:'Nubank',limit:600,closeDay:9,dueDay:16,payAccountId:1,history:[]}];
  value.purchases = [{
    id:303,
    cardId:1,
    desc:'Assb Comercio Varejist 1/3',
    total:283.08,
    installments:3,
    purchaseDate:'2026-08-11',
    firstMonth:'2026-08',
    category:'Outros',
    status:'active',
    refunds:[],
    tags:['open-finance','pluggy'],
    externalId:'pluggy:assb-original-1of3',
    openFinanceExternalIds:['pluggy:assb-original-1of3'],
    openFinanceProvider:'pluggy',
    openFinanceAccountId:'nubank-credit',
    openFinanceItemId:'nubank-item',
    openFinanceStatus:'POSTED',
    openFinanceInstallment:{installmentNumber:1,totalInstallments:3}
  }];

  await installBridge(page, nubankLegacyFirstMonthPayload());
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.waitForFunction(() => window.SFPOpenFinanceUnifiedSync?.version === 2);
  await page.evaluate(() => window.SFPOpenFinanceUnifiedSync.syncAll());

  const repaired = await page.evaluate(() => ({
    count:state.purchases.length,
    firstMonth:state.purchases[0].firstMonth,
    installments:state.purchases[0].installments,
    estimated:state.purchases[0].openFinanceInstallmentEstimated,
    observedNumber:state.purchases[0].openFinanceInstallmentObservedNumber,
    observedMonth:state.purchases[0].openFinanceInstallmentObservedMonth,
    august:invoiceCalculated(1,'2026-08'),
    september:invoiceCalculated(1,'2026-09'),
    october:invoiceCalculated(1,'2026-10'),
    november:invoiceCalculated(1,'2026-11')
  }));
  expect(repaired).toEqual({
    count:1,
    firstMonth:'2026-09',
    installments:3,
    estimated:true,
    observedNumber:1,
    observedMonth:'2026-09',
    august:0,
    september:94.36,
    october:94.36,
    november:94.36
  });

  await page.evaluate(() => window.SFPOpenFinanceUnifiedSync.syncAll());
  const again = await page.evaluate(() => ({
    count:state.purchases.length,
    firstMonth:state.purchases[0].firstMonth,
    externalIds:state.purchases[0].openFinanceExternalIds
  }));
  expect(again).toEqual({count:1,firstMonth:'2026-09',externalIds:['pluggy:assb-original-1of3']});
});
