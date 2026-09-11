const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function nubankState(name='Nubank truth regression'){
  const value=fixture(name);
  value.mesAtual='2026-09';
  value.baseDate='2026-09-11';
  value.accounts=[{id:1,name:'Nubank',type:'Conta corrente',initial:21.15,balanceMode:'snapshot',balanceDate:'2026-09-11'}];
  value.cards=[{id:1,name:'Nubank',limit:600,closeDay:9,dueDay:16,payAccountId:1,history:[]}];
  value.purchases=[
    {id:10,cardId:1,desc:'Compras do ciclo já confirmadas no SFP',total:147.13,installments:1,firstMonth:'2026-09',purchaseDate:'2026-08-16',status:'active',refunds:[]},
    {id:11,cardId:1,desc:'ASSB Comércio Varejista',total:283.08,installments:3,firstMonth:'2026-09',purchaseDate:'2026-08-12',status:'active',refunds:[]}
  ];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function installBridge(page,{bills=[]}={}){
  await page.addInitScript(({bills})=>{
    const transactions=[
      {id:'nu-credit-8164',date:'2026-09-09T12:00:00.000Z',description:'Pagamento antecipado',amount:-81.64,type:'CREDIT',status:'PENDING',currencyCode:'BRL'}
    ];
    const account={
      id:'nu-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Nubank',marketingName:'Nubank',presentationName:'Nubank',
      balance:403.02,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
      creditData:{creditLimit:600,availableCreditLimit:196.98,balanceCloseDate:'2026-09-09',balanceDueDate:'2026-09-16'},
      transactions,bills
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:transactions.length,billCount:bills.length,items:[{id:'nu-item',connectorName:'MeuPluggy',institution:'Nubank',status:'UPDATED',accounts:[account]}]};
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'nu…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  },{bills});
}

async function boot(page,value){
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,value.settings.name);
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBills?.version)>=4);
}

async function apply(page){
  return page.evaluate(()=>SFPOpenFinanceBills.apply(JSON.parse(PluggyBridge.previewData())));
}

test('Nubank: crédito PENDING é evidência de revisão, nunca pagamento confirmado',async({page})=>{
  await installBridge(page);
  await boot(page,nubankState());

  expect(await page.evaluate(()=>invoiceCalculated(1,'2026-09'))).toBe(241.49);
  await apply(page);

  const result=await page.evaluate(()=>{
    const inv=invoiceStatus(1,'2026-09');
    return{
      calculated:invoiceCalculated(1,'2026-09'),
      officialTotal:inv.officialTotal,
      officialSource:inv.officialTotalSource,
      pendingCredit:inv.openFinanceEstimate?.pendingCredit,
      pendingDebit:inv.openFinanceEstimate?.pendingDebit,
      bankStatus:inv.openFinanceEstimate?.bankStatus,
      payments:(inv.payments||[]).length,
      adjustments:(state.invoiceAdjustments||[]).length
    };
  });

  expect(result.calculated).toBe(241.49);
  expect(result.officialTotal).toBeUndefined();
  expect(result.officialSource).toBeUndefined();
  expect(result.pendingCredit).toBe(81.64);
  expect(result.pendingDebit).toBe(0);
  expect(result.bankStatus).toBe('unconfirmed-without-current-bill');
  expect(result.payments).toBe(0);
  expect(result.adjustments).toBe(0);
});

test('Nubank: sem Bill atual a UI declara estimativa não oficial e status bancário não confirmado',async({page})=>{
  await installBridge(page);
  await boot(page,nubankState('Nubank UI truth'));
  await apply(page);
  await page.evaluate(()=>{setPage('cartoes');state.ui.invoiceCardId=1;state.mesAtual='2026-09';renderAll()});

  const note=page.locator('#openFinanceInvoiceTruth');
  await expect(note).toBeVisible();
  await expect(note).toContainText('fatura estimada no SFP (não oficial): R$ 241,49');
  await expect(note).toContainText('status bancário: não confirmado sem Bill atual');
  await expect(note).toContainText('créditos/pagamentos pendentes no banco: R$ 81,64');
  await expect(note).not.toContainText('fatura oficial:');
});

test('Nubank: Bill atual é a única fonte Open Finance que torna R$ 170,84 oficial',async({page})=>{
  const bills=[{
    id:'bill-sep-2026',dueDate:'2026-09-16',billClosingDate:'2026-09-09',totalAmount:170.84,
    payments:[{id:'pay-8164',paymentDate:'2026-09-09',amount:81.64,paymentMode:'EARLY',valueType:'CREDIT'}]
  }];
  await installBridge(page,{bills});
  await boot(page,nubankState('Nubank official Bill'));
  await apply(page);

  const inv=await page.evaluate(()=>invoiceStatus(1,'2026-09'));
  expect(inv.officialTotal).toBe(170.84);
  expect(inv.officialTotalSource).toBe('open-finance-bill');
  expect(inv.openFinanceBillId).toBe('bill-sep-2026');
  expect(inv.openFinanceEstimate).toBeUndefined();
  expect(await page.evaluate(()=>invoiceTotal(1,'2026-09'))).toBe(170.84);
});
