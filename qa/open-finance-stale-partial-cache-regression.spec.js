const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateWithStaleEstimate({withLaterPurchase=true}={}){
  const value=fixture('Open Finance stale partial cache');
  value.mesAtual='2026-10';
  value.baseDate='2026-10-05';
  value.cards=[{
    id:7,name:'Nubank',limit:5000,closeDay:3,dueDay:10,payAccountId:null,history:[],
    openFinanceBankBills:{
      '2026-10':{
        schema:4,amount:100,official:false,billId:null,
        source:'open-finance-posted-cycle',periodStart:'2026-09-04',periodEnd:'2026-10-03',
        transactionCount:1,pendingCount:0,debitAmount:100,creditAmount:0,paymentsExcluded:0,
        updatedAt:'2026-10-03T12:00:00.000Z'
      }
    }
  }];
  value.purchases=withLaterPurchase?[{
    id:701,cardId:7,desc:'Compra local posterior ao snapshot',total:150,installments:1,
    firstMonth:'2026-10',purchaseDate:'2026-10-04',status:'active',refunds:[]
  }]:[];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function boot(page,{withLaterPurchase=true}={}){
  await page.addInitScript(()=>{
    const account={
      id:'nu-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Nubank',marketingName:'Nubank',presentationName:'Nubank',
      balance:100,currencyCode:'BRL',transactionPreviewHasMore:true,transactionsError:false,
      creditData:{creditLimit:5000,availableCreditLimit:4900},bills:[],
      transactions:[{id:'old',date:'2026-10-03T10:00:00.000Z',description:'Snapshot parcial',amount:100,type:'DEBIT',status:'POSTED'}]
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:1,billCount:0,
      items:[{id:'nu-item',connectorName:'MeuPluggy',institution:'Nubank',status:'UPDATED',accounts:[account]}]};
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'xx…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  });
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,stateWithStaleEstimate({withLaterPurchase}));
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Open Finance stale partial cache');
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBankTruth?.version)>=7);
  await page.evaluate(async()=>{await SFPOpenFinancePersonal.preview();setPage('cartoes');renderAll();});
}

test('refresh parcial não deixa estimativa não oficial antiga dominar lançamentos locais novos',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const card=state.cards[0];
    return {
      local:invoiceCalculated(card.id,'2026-10'),
      truth:SFPOpenFinanceBankTruth.bankTruth(card,'2026-10'),
      shown:SFPOpenFinanceBankTruth.displayTotal(card,'2026-10')
    };
  });

  expect(result.local).toBe(150);
  expect(result.truth?.official).not.toBe(true);
  // A leitura corrente é explicitamente parcial. O cache antigo continua sendo evidência histórica,
  // mas não pode substituir silenciosamente o total local mais novo como se ainda fosse a fatura atual.
  expect(result.shown).toBe(150);
});

test('refresh parcial preserva última estimativa bancária quando não há lançamento local posterior',async({page})=>{
  await boot(page,{withLaterPurchase:false});
  const result=await page.evaluate(()=>{
    const card=state.cards[0];
    return {
      local:invoiceCalculated(card.id,'2026-10'),
      truth:SFPOpenFinanceBankTruth.bankTruth(card,'2026-10'),
      shown:SFPOpenFinanceBankTruth.displayTotal(card,'2026-10')
    };
  });

  expect(result.local).toBe(0);
  expect(result.truth?.official).not.toBe(true);
  expect(result.truth?.amount).toBe(100);
  // Sem evidência local mais nova, o cache continua útil como última leitura offline/parcial.
  expect(result.shown).toBe(100);
});
