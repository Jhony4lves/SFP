const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateBase(){
  const value=fixture('Nubank missing installment reconciliation');
  value.mesAtual='2026-10';
  value.baseDate='2026-09-18';
  value.accounts=[{id:1,name:'Conta Nubank',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-18'}];
  value.cards=[{id:1,name:'Nubank',limit:600,closeDay:9,dueDay:16,payAccountId:1,history:[]}];
  value.purchases=[{
    id:303,
    cardId:1,
    desc:'ASSB Comércio Varejista',
    total:283.08,
    installments:3,
    purchaseDate:'2026-08-12',
    firstMonth:'2026-09',
    category:'Outros',
    status:'active',
    refunds:[],
    externalId:null,
    openFinanceStatus:null
  }];
  value.invoices=[];
  value.invoiceAdjustments=[];
  value.transactions=[];
  value.transfers=[];
  value.recurring=[];
  value.debts=[];
  value.creditFacilities=[];
  return value;
}

function payload({includeCurrent=false,includeOriginal=false}={}){
  const current=[
    {id:'merc18',date:'2026-09-18T12:00:00.000Z',description:'Mercatalimentacao',amount:16.20,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'merc16',date:'2026-09-16T12:00:00.000Z',description:'Mercatalimentacao',amount:9.34,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'pablo15',date:'2026-09-15T12:00:00.000Z',description:'Pablolanches',amount:8.00,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'merc15',date:'2026-09-15T13:00:00.000Z',description:'Mercatalimentacao',amount:9.75,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'mineiro13',date:'2026-09-13T12:00:00.000Z',description:'Mineiro',amount:86.90,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'janaina13',date:'2026-09-13T13:00:00.000Z',description:'Janainaconceicao',amount:26.00,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'lady12',date:'2026-09-12T12:00:00.000Z',description:'Lady Day',amount:11.99,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'suco10',date:'2026-09-10T12:00:00.000Z',description:'Mestre do Suco',amount:16.00,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'pablo10',date:'2026-09-10T13:00:00.000Z',description:'Pablo Lanches',amount:8.00,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'telegram10',date:'2026-09-10T14:00:00.000Z',description:'Google Telegram',amount:12.99,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
    {id:'merc10',date:'2026-09-10T15:00:00.000Z',description:'Mercatalimentacao',amount:6.49,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'}
  ];
  if(includeCurrent){
    current.push({
      id:'assb-current-2of3',
      date:'2026-09-11T03:00:00.000Z',
      description:'Assb Comercio Varejist 2/3',
      amount:94.35,
      type:'DEBIT',
      status:'PENDING',
      billForecastDate:'2026-10',
      installment:{installmentNumber:2,totalInstallments:3}
    });
  }
  if(includeOriginal){
    current.push({
      id:'assb-original-1of3',
      date:'2026-08-11T20:52:51.001Z',
      description:'Assb Comercio Varejist 1/3',
      amount:94.36,
      type:'DEBIT',
      status:'POSTED',
      billForecastDate:'2026-09',
      installment:{installmentNumber:1,totalInstallments:3}
    });
  }
  current.push({
    id:'assb-future-3of3',
    date:'2026-10-11T03:00:00.000Z',
    description:'Assb Comercio Varejist 3/3',
    amount:94.35,
    type:'DEBIT',
    status:'PENDING',
    billForecastDate:'2026-11',
    installment:{installmentNumber:3,totalInstallments:3}
  });
  const account={
    id:'nubank-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Nubank',presentationName:'Nubank',
    balance:400.36,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
    creditData:{creditLimit:600,availableCreditLimit:199.64},
    bills:[],transactions:current
  };
  return {ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:current.length,billCount:0,
    items:[{id:'nubank-item',connectorName:'MeuPluggy',institution:'Nubank',status:'UPDATED',accounts:[account]}]};
}

async function installBridge(page,initial){
  await page.addInitScript(data=>{
    window.__qaPayload=data;
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'nu…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(window.__qaPayload),
      clearCredentials:()=>true,
      saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  },initial);
}

async function boot(page,initial){
  await installBridge(page,initial);
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,stateBase());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Nubank missing installment reconciliation');
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBankTruth?.version)>=7);
  await page.evaluate(async()=>{await SFPOpenFinancePersonal.preview();setPage('cartoes');renderAll();});
}

test('snapshot sem 2/3 usa a 3/3 adjacente para completar outubro em R$ 306,01',async({page})=>{
  await boot(page,payload());

  const result=await page.evaluate(()=>{
    const card=state.cards[0],truth=SFPOpenFinanceBankTruth.cycleTransactions(card,'2026-10');
    return{
      local:invoiceCalculated(1,'2026-10'),
      installment:purchaseInstallment(state.purchases[0],'2026-10'),
      truth,
      shown:SFPOpenFinanceBankTruth.displayTotal(card,'2026-10'),
      future:SFPOpenFinanceBankTruth.futureCommitments(card,'2026-10')
    };
  });

  expect(result.local).toBe(94.36);
  expect(result.installment.n).toBe(2);
  expect(result.installment.total).toBe(3);
  expect(result.truth.bankDebitAmount).toBe(211.66);
  expect(result.truth.localSupplementAmount).toBe(94.35);
  expect(result.truth.localSupplementCount).toBe(1);
  expect(result.truth.localSupplementEvidence[0]).toMatchObject({
    purchaseId:303,
    installmentNumber:2,
    totalInstallments:3,
    localAmount:94.36,
    providerAmount:94.35,
    adjacentTransactionId:'assb-future-3of3',
    adjacentInstallmentNumber:3
  });
  expect(result.truth.amount).toBe(306.01);
  expect(result.shown).toBe(306.01);
  expect(result.future.nextAmount).toBe(94.35);

  const card=page.locator('#cardsGrid .management-card--interactive').first();
  await expect(card.locator('.sfp-card-v2-primary')).toContainText('R$ 306,01');

  await page.evaluate(()=>{
    state.ui??={};
    state.ui.invoiceCardId=1;
    state.ui.invoiceMonthByCard??={};
    state.ui.invoiceMonthByCard[1]='2026-10';
    const cardSelect=document.getElementById('invoiceCard');
    const monthInput=document.getElementById('invoiceMonth');
    if(cardSelect)cardSelect.value='1';
    if(monthInput)monthInput.value='2026-10';
    renderCards();
  });

  await expect(page.locator('#invoiceTotalView')).toHaveText('R$ 306,01');

  const breakdown=page.locator('#invoiceV2Breakdown');
  await expect(breakdown.locator('.sfp-invoice-v2-head strong').first()).toHaveText('R$ 306,01');
  await expect(breakdown).toContainText('Reconciliação bancária');
  await expect(breakdown).toContainText('R$ 211,65');
  await expect(breakdown).toContainText('estimativa bancária reconciliada de R$ 306,01');

  const item=breakdown.locator('.sfp-invoice-item').first();
  await expect(item.locator('.sfp-invoice-item-top b')).toHaveText('Assb Comercio Varejist');
  await expect(item).toContainText('Parcela 2/3');
  await expect(item.locator('.sfp-invoice-item-top b')).not.toContainText('1/3');

  await expect(page.locator('#invoiceMobile')).toHaveClass(/hidden/);
  await expect(page.locator('#openFinanceInvoiceTruth')).toContainText('fatura estimada no SFP (não oficial): R$ 306,01');
});

test('quando 2/3 reaparece no snapshot, não duplica a parcela reconciliada',async({page})=>{
  await boot(page,payload({includeCurrent:true}));

  const result=await page.evaluate(()=>{
    const card=state.cards[0],truth=SFPOpenFinanceBankTruth.cycleTransactions(card,'2026-10');
    return{truth,shown:SFPOpenFinanceBankTruth.displayTotal(card,'2026-10')};
  });

  expect(result.truth.bankDebitAmount).toBe(306.01);
  expect(result.truth.localSupplementAmount).toBe(0);
  expect(result.truth.localSupplementCount).toBe(0);
  expect(result.truth.amount).toBe(306.01);
  expect(result.shown).toBe(306.01);
});


test('#263 estado físico legado é reparado antes de reconciliar outubro em R$ 306,01',async({page})=>{
  const initial=stateBase();
  initial.settings=initial.settings||{};
  initial.settings.name='Nubank firstMonth legado físico #263';
  initial.purchases=[{
    id:1789578727685,
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

  await installBridge(page,payload({includeOriginal:true}));
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,initial);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Nubank firstMonth legado físico #263');
  await page.waitForFunction(()=>window.SFPOpenFinanceUnifiedSync?.version===2);
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBankTruth?.version)>=7);
  await page.evaluate(()=>window.SFPOpenFinanceUnifiedSync.syncAll());

  const result=await page.evaluate(()=>{
    const purchase=state.purchases[0];
    const installment=purchaseInstallment(purchase,'2026-10');
    const truth=SFPOpenFinanceBankTruth.cycleTransactions(state.cards[0],'2026-10');
    return{
      count:state.purchases.length,
      firstMonth:purchase.firstMonth,
      estimated:purchase.openFinanceInstallmentEstimated,
      installment:{n:installment?.n,total:installment?.total,amount:installment?.amount},
      truth:{
        bankDebitAmount:truth?.bankDebitAmount,
        localSupplementAmount:truth?.localSupplementAmount,
        localSupplementCount:truth?.localSupplementCount,
        amount:truth?.amount
      },
      shown:SFPOpenFinanceBankTruth.displayTotal(state.cards[0],'2026-10')
    };
  });

  expect(result.count).toBe(1);
  expect(result.firstMonth).toBe('2026-09');
  expect(result.estimated).toBe(true);
  expect(result.installment).toEqual({n:2,total:3,amount:94.36});
  expect(result.truth).toEqual({
    bankDebitAmount:211.66,
    localSupplementAmount:94.35,
    localSupplementCount:1,
    amount:306.01
  });
  expect(result.shown).toBe(306.01);

  const card=page.locator('#cardsGrid .management-card--interactive').first();
  await expect(card.locator('.sfp-card-v2-primary')).toContainText('R$ 306,01');
});
