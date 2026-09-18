const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function itauState(){
  const value=fixture('Itaú cycle truth');
  value.mesAtual='2026-09';
  value.baseDate='2026-09-11';
  value.accounts=[{id:1,name:'Itaú',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-11'}];
  value.cards=[{id:1,name:'Itaú Click',limit:2090,closeDay:2,dueDay:10,payAccountId:1,history:[]}];
  value.purchases=[
    {id:201,cardId:1,desc:'Compras confirmadas do ciclo de setembro',total:321.24,installments:1,firstMonth:'2026-09',purchaseDate:'2026-09-01',status:'active',refunds:[]},
    {id:202,cardId:1,desc:'Parcelas futuras de outubro',total:180.82,installments:1,firstMonth:'2026-10',purchaseDate:'2026-08-01',status:'active',refunds:[]}
  ];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function installBridge(page){
  await page.addInitScript(()=>{
    const account={
      id:'itau-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Itaú Click',marketingName:'Itaú Click',presentationName:'Itaú Click',
      balance:1494.37,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
      creditData:{creditLimit:2090,availableCreditLimit:595.63,balanceDueDate:'2026-09-21'},
      transactions:[],bills:[]
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:0,billCount:0,items:[{id:'itau-item',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',accounts:[account]}]};
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'it…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  });
}

async function boot(page){
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,itauState());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Itaú cycle truth');
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBills?.version)>=12);
}

test('Itaú: vencimento bancário ancora setembro e outubro continua futuro',async({page})=>{
  await installBridge(page);
  await boot(page);
  await page.evaluate(()=>SFPOpenFinanceBills.apply(JSON.parse(PluggyBridge.previewData())));
  await page.evaluate(()=>{setPage('cartoes');renderAll()});

  const card=page.getByRole('button',{name:/Abrir detalhes de Itaú Click/});
  const current=card.locator('.sfp-card-v2-primary');
  const next=card.locator('.sfp-card-v2-stat').filter({hasText:'Próxima fatura'});
  await expect(current).toContainText('Fatura atual · Setembro de 2026');
  await expect(current).toContainText('R$ 321,24');
  await expect(current).not.toContainText('R$ 180,82');
  await expect(next).toContainText('R$ 180,82');

  const truth=await page.evaluate(()=>{
    const sep=invoiceStatus(1,'2026-09');
    return{
      officialTotal:sep.officialTotal,
      officialSource:sep.officialTotalSource,
      estimated:sep.openFinanceEstimate?.amount,
      cycleSource:sep.openFinanceEstimate?.cycleSource,
      bankUsed:state.cards[0].openFinanceUsedAmount,
      futureOct:invoiceCalculated(1,'2026-10')
    };
  });
  expect(truth.officialTotal).toBeUndefined();
  expect(truth.officialSource).toBeUndefined();
  expect(truth.estimated).toBe(321.24);
  expect(truth.cycleSource).toBe('balanceDueDate');
  expect(truth.bankUsed).toBe(1494.37);
  expect(truth.futureOct).toBe(180.82);

  await card.click();
  const modalCurrent=page.locator('#modalRoot .metric').filter({hasText:'Fatura atual'});
  await expect(modalCurrent).toContainText('R$ 321,24');
  await expect(modalCurrent).toContainText('Setembro de 2026');
  await expect(modalCurrent).not.toContainText('Outubro de 2026');
  await page.getByRole('button',{name:'Abrir fatura'}).click();

  const note=page.locator('#openFinanceInvoiceTruth');
  await expect(note).toBeVisible();
  await expect(note).toContainText('fatura estimada no SFP (não oficial): R$ 321,24');
  await expect(note).not.toContainText('fatura oficial:');
});


test('Nubank físico: setembro quitado faz a fatura atual avançar para outubro',async({page})=>{
  await page.addInitScript(()=>{
    const account={
      id:'nubank-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Nubank',marketingName:'Nubank',presentationName:'Nubank',
      balance:400.36,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
      creditData:{creditLimit:600,availableCreditLimit:199.64,balanceCloseDate:'2026-10-09',balanceDueDate:'2026-10-16'},
      transactions:[],bills:[]
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:0,billCount:0,items:[{id:'nubank-item',connectorName:'MeuPluggy',institution:'Nubank',status:'UPDATED',accounts:[account]}]};
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'nu…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  });
  const value=fixture('Nubank ciclo físico #212');
  value.mesAtual='2026-09';
  value.baseDate='2026-09-18';
  value.accounts=[{id:1,name:'Nubank',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-18'}];
  value.cards=[{id:1,name:'Nubank',limit:600,closeDay:9,dueDay:16,payAccountId:1,history:[]}];
  value.purchases=[
    {id:301,cardId:1,desc:'Fatura atual outubro',total:306.01,installments:1,firstMonth:'2026-10',purchaseDate:'2026-09-10',status:'active',refunds:[]},
    {id:302,cardId:1,desc:'Compromisso posterior',total:94.35,installments:1,firstMonth:'2026-11',purchaseDate:'2026-09-10',status:'active',refunds:[]}
  ];
  value.invoices=[{id:901,cardId:1,month:'2026-09',status:'paid',officialTotal:170.84,paidAmount:170.84,payments:[{date:'2026-09-16',amount:170.84,source:'open-finance-invoice-payment'}]}];
  value.invoiceAdjustments=[];

  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Nubank ciclo físico #212');
  await page.evaluate(()=>{window.localCivilMonth=()=> '2026-09';});
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBills?.version)>=12);

  await page.evaluate(()=>{
    SFPOpenFinanceBills.apply(JSON.parse(PluggyBridge.previewData()));
    setPage('cartoes');
    renderAll();
  });

  const card=page.getByRole('button',{name:/Abrir detalhes de Nubank/});
  await expect(card.locator('.sfp-card-v2-primary')).toContainText('Fatura atual · Outubro de 2026');
  await expect(card.locator('.sfp-card-v2-primary')).toContainText('R$ 306,01');
  await expect(card.locator('.sfp-card-v2-stat').filter({hasText:'Próxima fatura'})).toContainText('R$ 94,35');
  await expect(card).toContainText('R$ 199,64');

  const result=await page.evaluate(()=>({
    selected:state.ui.invoiceMonthByCard?.[1],
    september:invoiceDisplayStatus(1,'2026-09'),
    october:invoiceTotal(1,'2026-10'),
    used:state.cards[0].openFinanceUsedAmount,
    available:state.cards[0].openFinanceAvailableCreditLimit
  }));
  expect(result.september).toBe('paid');
  expect(result.october).toBe(306.01);
  expect(result.used).toBe(400.36);
  expect(result.available).toBe(199.64);
});
