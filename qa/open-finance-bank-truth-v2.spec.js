const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateFromRealScreens(){
  const value=fixture('Bank truth v2');
  value.mesAtual='2026-09';
  value.baseDate='2026-09-14';
  value.accounts=[
    {id:1,name:'Nubank',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-14'},
    {id:2,name:'Itaú',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-14'}
  ];
  value.cards=[
    {id:1,name:'Nubank',limit:600,closeDay:9,dueDay:16,payAccountId:1,history:[]},
    {id:2,name:'Itaú',limit:2090,closeDay:2,dueDay:10,payAccountId:2,history:[]}
  ];
  value.purchases=[
    {id:101,cardId:1,desc:'Base local Nubank',total:241.49,installments:1,firstMonth:'2026-09',purchaseDate:'2026-09-01',status:'active',refunds:[]},
    {id:201,cardId:2,desc:'Base local Itaú',total:313.61,installments:1,firstMonth:'2026-09',purchaseDate:'2026-09-01',status:'active',refunds:[]}
  ];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function installBridge(page,{nubankBills=[],itauBills=[]}={}){
  await page.addInitScript(({nubankBills,itauBills})=>{
    const nubank={
      id:'nu-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Nubank',marketingName:'Nubank',presentationName:'Nubank',
      balance:527.91,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
      creditData:{creditLimit:600,availableCreditLimit:72.09,balanceCloseDate:'2026-09-09',balanceDueDate:'2026-09-16'},
      transactions:[
        {id:'nu-a',billId:'nu-bill-sep',date:'2026-09-01T12:00:00.000Z',description:'Compra A',amount:100,type:'DEBIT',status:'POSTED',currencyCode:'BRL'},
        {id:'nu-b',billId:'nu-bill-sep',date:'2026-09-08T12:00:00.000Z',description:'Compra B',amount:70.84,type:'DEBIT',status:'POSTED',currencyCode:'BRL'},
        {id:'nu-next',date:'2026-09-10T12:00:00.000Z',description:'Compra próxima fatura',amount:94.36,type:'DEBIT',status:'PENDING',currencyCode:'BRL'},
        {id:'nu-pay',date:'2026-09-10T13:00:00.000Z',description:'Pagamento antecipado',amount:-81.64,type:'CREDIT',status:'PENDING',currencyCode:'BRL'}
      ],
      bills:nubankBills
    };
    const itau={
      id:'it-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',
      balance:1494.37,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
      creditData:{creditLimit:2090,availableCreditLimit:595.63,balanceCloseDate:'2026-09-12',balanceDueDate:'2026-09-21'},
      transactions:[
        {id:'it-a',billId:'it-bill-sep',date:'2026-09-01T12:00:00.000Z',description:'Compra C',amount:200,type:'DEBIT',status:'POSTED',currencyCode:'BRL'},
        {id:'it-b',billId:'it-bill-sep',date:'2026-09-11T12:00:00.000Z',description:'Compra D',amount:127.59,type:'DEBIT',status:'POSTED',currencyCode:'BRL'}
      ],
      bills:itauBills
    };
    const payload={
      ok:true,provider:'pluggy-personal',readOnly:true,itemCount:2,accountCount:2,transactionPreviewCount:6,billCount:nubankBills.length+itauBills.length,
      items:[
        {id:'nu-item',connectorName:'MeuPluggy',institution:'Nubank',status:'UPDATED',accounts:[nubank]},
        {id:'it-item',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',accounts:[itau]}
      ]
    };
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'xx…test',itemReferenceCount:2}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:2})
    }});
  },{nubankBills,itauBills});
}

async function boot(page,options={}){
  await installBridge(page,options);
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,stateFromRealScreens());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Bank truth v2');
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBankTruth?.version)>=2);
  await page.evaluate(async()=>{await SFPOpenFinancePersonal.preview();setPage('cartoes');renderAll();});
}

test('fallback bancário por billId reproduz os valores reais das telas',async({page})=>{
  await boot(page);

  const cards=page.locator('#cardsGrid .management-card--interactive');
  const nubank=cards.nth(0);
  const itau=cards.nth(1);

  await expect(nubank).toContainText('Fecha dia 9 · vence dia 16');
  await expect(nubank.locator('.sfp-card-v2-primary')).toContainText('Fatura atual · Setembro de 2026');
  await expect(nubank.locator('.sfp-card-v2-primary')).toContainText('R$ 170,84');
  await expect(nubank.locator('.sfp-card-v2-primary')).toContainText('Fechada');
  await expect(nubank.locator('.sfp-card-v2-primary')).not.toContainText('R$ 241,49');

  await expect(itau).toContainText('Fecha dia 12 · vence dia 21');
  await expect(itau.locator('.sfp-card-v2-primary')).toContainText('R$ 327,59');
  await expect(itau.locator('.sfp-card-v2-primary')).toContainText('Fechada');
  await expect(itau.locator('.sfp-card-v2-primary')).not.toContainText('R$ 313,61');

  const truth=await page.evaluate(()=>({
    nubank:SFPOpenFinanceBankTruth.bankTruth(state.cards[0],'2026-09'),
    itau:SFPOpenFinanceBankTruth.bankTruth(state.cards[1],'2026-09')
  }));
  expect(truth.nubank.amount).toBe(170.84);
  expect(truth.nubank.source).toBe('open-finance-linked-transactions');
  expect(truth.itau.amount).toBe(327.59);
  expect(truth.itau.source).toBe('open-finance-linked-transactions');
});

test('Bill oficial continua acima do fallback por transações',async({page})=>{
  await boot(page,{nubankBills:[{
    id:'nu-official-sep',dueDate:'2026-09-16',billClosingDate:'2026-09-09',totalAmount:170.84,payments:[]
  }]});

  const truth=await page.evaluate(()=>SFPOpenFinanceBankTruth.bankTruth(state.cards[0],'2026-09'));
  expect(truth.amount).toBe(170.84);
  expect(truth.source).toBe('open-finance-bill');
  expect(truth.official).toBe(true);
});

test('pagamento pendente não reduz a fatura fechada',async({page})=>{
  await boot(page);
  const amount=await page.evaluate(()=>SFPOpenFinanceBankTruth.displayTotal(state.cards[0],'2026-09'));
  expect(amount).toBe(170.84);
});
