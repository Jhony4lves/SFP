const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateFor(name,{officialTotal,officialTotalSource}={}){
  const value=fixture(name);
  value.mesAtual='2026-09';
  value.baseDate='2026-09-01';
  value.accounts=[{id:1,name:'Itaú',type:'Conta corrente',initial:1000,balanceMode:'snapshot',balanceDate:'2026-09-01'}];
  value.cards=[{id:1,name:'Itaú Click',limit:2090,closeDay:13,dueDay:20,payAccountId:1,history:[]}];
  value.purchases=[{id:10,cardId:1,desc:'Compras confirmadas',total:180.83,installments:1,firstMonth:'2026-09',purchaseDate:'2026-09-05',status:'active',refunds:[]}];
  value.invoices=[];
  if(officialTotal!==undefined){
    const inv={id:20,cardId:1,month:'2026-09',status:'open',paidAmount:0,payments:[],officialTotal};
    if(officialTotalSource!==undefined)inv.officialTotalSource=officialTotalSource;
    value.invoices.push(inv);
  }
  value.invoiceAdjustments=[];
  return value;
}

async function installBridge(page,{transactions=[],creditData={creditLimit:2090,availableCreditLimit:616.42},balance=1473.58,bills=[]}={}){
  await page.addInitScript(({transactions,creditData,balance,bills})=>{
    const account={
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',type:'CREDIT',subtype:'CREDIT_CARD',name:'Itaú Click',marketingName:'Itaú Click',presentationName:'Itaú Click',
      balance,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,creditData,transactions,bills
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:transactions.length,billCount:bills.length,items:[{id:'11111111-1111-4111-8111-111111111111',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',accounts:[account]}]};
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'11111111…1111',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  },{transactions,creditData,balance,bills});
}

async function boot(page,value){
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,value.settings.name);
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBills?.version)>=3);
}

async function apply(page){
  return page.evaluate(()=>SFPOpenFinanceBills.apply(JSON.parse(PluggyBridge.previewData())));
}

test('total legado sem fonte que apenas replica o cálculo deixa de prender fatura aberta',async({page})=>{
  await installBridge(page);
  await boot(page,stateFor('Legacy sem fonte',{officialTotal:180.83}));
  expect(await page.evaluate(()=>invoiceTotal(1,'2026-09'))).toBe(180.83);
  const report=await apply(page);
  const after=await page.evaluate(()=>({inv:invoiceStatus(1,'2026-09'),total:invoiceTotal(1,'2026-09')}));
  expect(report.clearedInferred).toBe(1);
  expect(after.inv.officialTotal).toBeUndefined();
  expect(after.inv.officialTotalSource).toBeUndefined();
  expect(after.total).toBe(180.83);
});

test('calculated-import nunca permanece como verdade oficial de fatura aberta',async({page})=>{
  await installBridge(page);
  await boot(page,stateFor('Calculated import legado',{officialTotal:999,officialTotalSource:'calculated-import'}));
  const report=await apply(page);
  const after=await page.evaluate(()=>({inv:invoiceStatus(1,'2026-09'),total:invoiceTotal(1,'2026-09')}));
  expect(report.clearedInferred).toBe(1);
  expect(after.inv.officialTotal).toBeUndefined();
  expect(after.inv.officialTotalSource).toBeUndefined();
  expect(after.total).toBe(180.83);
});

test('total oficial vindo de documento permanece preservado sem Bill Open Finance',async({page})=>{
  await installBridge(page);
  await boot(page,stateFor('Documento oficial',{officialTotal:306.80,officialTotalSource:'document'}));
  await apply(page);
  const inv=await page.evaluate(()=>invoiceStatus(1,'2026-09'));
  expect(inv.officialTotal).toBe(306.80);
  expect(inv.officialTotalSource).toBe('document');
  expect(await page.evaluate(()=>invoiceTotal(1,'2026-09'))).toBe(306.80);
});

test('pendências antigas não inflam o valor pendente do ciclo atual',async({page})=>{
  const transactions=[
    {id:'current',date:'2026-09-05T12:00:00.000Z',description:'Compra atual',amount:84.42,type:'DEBIT',status:'PENDING',currencyCode:'BRL'},
    {id:'old',date:'2026-08-05T12:00:00.000Z',description:'Pendente antigo',amount:500,type:'DEBIT',status:'PENDING',currencyCode:'BRL'}
  ];
  await installBridge(page,{transactions});
  await boot(page,stateFor('Pendência por ciclo'));
  await apply(page);
  const inv=await page.evaluate(()=>invoiceStatus(1,'2026-09'));
  expect(inv.openFinanceEstimate.pending).toBe(84.42);
});

test('campos de limite ausentes não viram uso bancário zero artificial',async({page})=>{
  await installBridge(page,{creditData:{creditLimit:null,availableCreditLimit:null},balance:null});
  await boot(page,stateFor('Limite ausente'));
  const report=await apply(page);
  const cardState=await page.evaluate(()=>card(1));
  expect(cardState.openFinanceUsedAmount).toBeUndefined();
  expect(report.estimated).toBe(0);
});

test('cartão conectado mostra uso e limite do banco sem confundir com compromissos futuros',async({page})=>{
  const value=stateFor('Cartão conectado com verdade bancária');
  value.cards[0].limit=600;
  value.purchases=[{id:10,cardId:1,desc:'Parcelas futuras grandes',total:1403.99,installments:1,firstMonth:'2026-10',purchaseDate:'2026-09-20',status:'active',refunds:[]}];
  await installBridge(page,{creditData:{creditLimit:600,availableCreditLimit:196.98},balance:403.02});
  await boot(page,value);
  await apply(page);
  await page.evaluate(()=>{setPage('cartoes');renderCards()});
  const cardText=await page.locator('#cardsGrid .management-card--interactive').first().innerText();
  expect(cardText).toContain('Uso atual do limite');
  expect(cardText).toContain('R$ 403,02');
  expect(cardText).toContain('Limite disponível');
  expect(cardText).toContain('R$ 196,98');
  expect(cardText).toContain('67,2% do limite usado');
  expect(cardText).toContain('R$ 1.403,99 em faturas futuras');
  const summary=await page.locator('#cardsOutstandingTotal').evaluate(el=>({label:el.parentElement.querySelector('span')?.textContent,hint:el.parentElement.querySelector('small')?.textContent}));
  expect(summary).toEqual({label:'Compromissos projetados',hint:'faturas atuais e futuras no SFP'});
});

test('alerta de 80% usa o consumo bancário, não parcelas futuras projetadas',async({page})=>{
  const value=stateFor('Alerta bancário correto');
  value.cards[0].limit=600;
  value.purchases=[{id:10,cardId:1,desc:'Futuro acima do limite',total:1403.99,installments:1,firstMonth:'2026-10',purchaseDate:'2026-09-20',status:'active',refunds:[]}];
  await installBridge(page,{creditData:{creditLimit:600,availableCreditLimit:196.98},balance:403.02});
  await boot(page,value);
  await apply(page);
  const alerts=await page.evaluate(()=>healthAlerts().map(x=>x.t));
  expect(alerts.some(text=>/80% do limite está comprometido/i.test(text))).toBe(false);
  expect(alerts.some(text=>/uso do limite informado pelo banco está acima de 80%/i.test(text))).toBe(false);
});
