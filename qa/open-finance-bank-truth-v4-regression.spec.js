const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function realItauState(){
  const value=fixture('Bank truth v4 regression');
  value.mesAtual='2026-09';
  value.baseDate='2026-09-14';
  value.accounts=[{id:2,name:'Itaú',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-14'}];
  value.cards=[{id:2,name:'Itaú',limit:2090,closeDay:2,dueDay:10,payAccountId:2,history:[]}];
  value.purchases=[{
    id:201,cardId:2,desc:'Base local Itaú',total:180.83,installments:1,
    firstMonth:'2026-09',purchaseDate:'2026-08-15',status:'active',refunds:[]
  }];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function installBridge(page){
  await page.addInitScript(()=>{
    const account={
      id:'it-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',
      balance:1494.37,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
      // Snapshot deliberadamente antigo: era exatamente o que chegou no diagnóstico físico de 14/09.
      creditData:{creditLimit:2090,availableCreditLimit:595.63,balanceDueDate:'2026-08-10'},
      bills:[{id:'it-aug',dueDate:'2026-08-10',billClosingDate:'2026-08-03',totalAmount:74.25,payments:[]}],
      transactions:[
        {id:'it-aug5',date:'2026-08-05T12:00:00.000Z',description:'Compra agosto',amount:66.64,type:'DEBIT',status:'PENDING'},
        {id:'it-pay',date:'2026-08-10T12:00:00.000Z',description:'Pagamento recebido',amount:-74.25,type:'CREDIT',status:'PENDING'},
        {id:'it-vivo',date:'2026-08-10T13:00:00.000Z',description:'Vivo',amount:40,type:'DEBIT',status:'PENDING'},
        {id:'it-aug29',date:'2026-08-29T12:00:00.000Z',description:'Compra 29/08',amount:13.98,type:'DEBIT',status:'PENDING'},
        {id:'it-sep1-a',date:'2026-09-01T12:00:00.000Z',description:'Compra 01/09 A',amount:18.58,type:'DEBIT',status:'PENDING'},
        {id:'it-sep1-b',date:'2026-09-01T13:00:00.000Z',description:'Compra 01/09 B',amount:8.99,type:'DEBIT',status:'PENDING'},
        {id:'it-sep2-a',date:'2026-09-02T12:00:00.000Z',description:'Compra 02/09 A',amount:3.5,type:'DEBIT',status:'PENDING'},
        {id:'it-sep2-b',date:'2026-09-02T13:00:00.000Z',description:'Compra 02/09 B',amount:3.5,type:'DEBIT',status:'PENDING'},
        // R$ 132,78 em setembro. O bug antigo somava tudo isso aos R$ 180,83 locais e exibia R$ 313,61.
        {id:'it-sep3',date:'2026-09-03T12:00:00.000Z',description:'Depois do fechamento',amount:22,type:'DEBIT',status:'PENDING'},
        {id:'it-sep4',date:'2026-09-04T12:00:00.000Z',description:'Depois do fechamento 2',amount:31.64,type:'DEBIT',status:'PENDING'},
        {id:'it-sep5',date:'2026-09-05T12:00:00.000Z',description:'Depois do fechamento 3',amount:18.98,type:'DEBIT',status:'PENDING'},
        {id:'it-sep8',date:'2026-09-08T12:00:00.000Z',description:'Depois do fechamento 4',amount:4.8,type:'DEBIT',status:'PENDING'},
        {id:'it-sep9',date:'2026-09-09T12:00:00.000Z',description:'Depois do fechamento 5',amount:14.44,type:'DEBIT',status:'PENDING'},
        {id:'it-sep11',date:'2026-09-11T12:00:00.000Z',description:'Depois do fechamento 6',amount:6.35,type:'DEBIT',status:'PENDING'}
      ]
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:14,billCount:1,
      items:[{id:'it-item',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',accounts:[account]}]};
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'xx…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  });
}

async function boot(page){
  await installBridge(page);
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,realItauState());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Bank truth v4 regression');
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBankTruth?.version)>=4);
  await page.evaluate(async()=>{await SFPOpenFinancePersonal.preview();setPage('cartoes');renderAll();});
}

test('não soma R$ 180,83 local com R$ 132,78 pendentes e respeita fechamento do ciclo',async({page})=>{
  await boot(page);

  const result=await page.evaluate(()=>({
    local:invoiceCalculated(2,'2026-09'),
    calendar:SFPOpenFinanceBankTruth.bankCalendar(state.cards[0],'2026-09'),
    bounds:SFPOpenFinanceBankTruth.cycleBounds(state.cards[0],'2026-09'),
    truth:SFPOpenFinanceBankTruth.bankTruth(state.cards[0],'2026-09'),
    shown:SFPOpenFinanceBankTruth.displayTotal(state.cards[0],'2026-09')
  }));

  expect(result.local).toBe(180.83);
  expect(result.calendar.dueDate).toBe('2026-09-10');
  expect(result.calendar.closeDate).toBe('2026-09-02');
  expect(result.calendar.bankDueDate).toBeNull();
  expect(result.bounds.startDate).toBe('2026-08-03');
  expect(result.bounds.endDate).toBe('2026-09-02');
  expect(result.truth.source).toBe('open-finance-cycle-transactions');
  expect(result.truth.debitAmount).toBe(155.19);
  expect(result.truth.paymentsExcluded).toBe(74.25);
  expect(result.shown).toBe(155.19);
  expect(result.shown).not.toBe(313.61);

  const card=page.locator('#cardsGrid .management-card--interactive').first();
  await expect(card.locator('.sfp-card-v2-primary')).toContainText('R$ 155,19');
  await expect(card.locator('.sfp-card-v2-primary')).not.toContainText('R$ 313,61');
});
