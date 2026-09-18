const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function nubankState(){
  const value=fixture('Nubank closing-day current-cycle');
  value.mesAtual='2026-10';
  value.baseDate='2026-09-18';
  value.accounts=[{id:1,name:'Conta Nubank',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-18'}];
  value.cards=[{id:1,name:'Nubank',limit:600,closeDay:9,dueDay:16,payAccountId:1,history:[]}];
  value.purchases=[{
    id:77,
    cardId:1,
    desc:'Assb Comercio Varejist 1/3',
    total:283.08,
    installments:3,
    firstMonth:'2026-08',
    purchaseDate:'2026-08-11',
    category:'Outros',
    status:'active',
    refunds:[],
    externalId:'pluggy:assb-sep-2of3',
    openFinanceExternalIds:['pluggy:assb-sep-2of3'],
    openFinanceProvider:'pluggy',
    openFinanceAccountId:'nubank-credit',
    openFinanceItemId:'nubank-item',
    openFinanceStatus:'POSTED',
    openFinanceInstallment:{installmentNumber:2,totalInstallments:3}
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

async function installBridge(page){
  await page.addInitScript(()=>{
    const transactions=[
      {id:'merc18',date:'2026-09-18T12:00:00.000Z',description:'Mercatalimentacao',amount:16.20,type:'DEBIT',status:'POSTED'},
      {id:'merc16',date:'2026-09-16T12:00:00.000Z',description:'Mercatalimentacao',amount:9.34,type:'DEBIT',status:'POSTED'},
      {id:'pablo15',date:'2026-09-15T12:00:00.000Z',description:'Pablolanches',amount:8.00,type:'DEBIT',status:'POSTED'},
      {id:'merc15',date:'2026-09-15T13:00:00.000Z',description:'Mercatalimentacao',amount:9.75,type:'DEBIT',status:'POSTED'},
      {id:'mineiro13',date:'2026-09-13T12:00:00.000Z',description:'Mineiro',amount:86.90,type:'DEBIT',status:'POSTED'},
      {id:'janaina13',date:'2026-09-13T13:00:00.000Z',description:'Janainaconceicao',amount:26.00,type:'DEBIT',status:'POSTED'},
      {id:'lady12',date:'2026-09-12T12:00:00.000Z',description:'Lady Day',amount:11.99,type:'DEBIT',status:'POSTED'},
      {id:'suco10',date:'2026-09-10T12:00:00.000Z',description:'Mestre do Suco',amount:16.00,type:'DEBIT',status:'POSTED'},
      {id:'pablo10',date:'2026-09-10T13:00:00.000Z',description:'Pablo Lanches',amount:8.00,type:'DEBIT',status:'POSTED'},
      {id:'telegram10',date:'2026-09-10T14:00:00.000Z',description:'Google Telegram',amount:12.99,type:'DEBIT',status:'POSTED'},
      {id:'merc10',date:'2026-09-10T15:00:00.000Z',description:'Mercatalimentacao',amount:6.49,type:'DEBIT',status:'POSTED'},
      {
        id:'assb-sep-2of3',
        date:'2026-09-09T12:00:00.000Z',
        description:'Assb Comercio Varejist - Parcela 2/3',
        amount:94.35,
        type:'DEBIT',
        status:'POSTED',
        installment:{installmentNumber:2,totalInstallments:3}
      }
    ];
    const account={
      id:'nubank-credit',
      type:'CREDIT',
      subtype:'CREDIT_CARD',
      name:'Nubank',
      marketingName:'Nubank',
      presentationName:'Nubank',
      balance:400.36,
      currencyCode:'BRL',
      transactionPreviewHasMore:false,
      transactionsError:false,
      creditData:{creditLimit:600,availableCreditLimit:199.64},
      bills:[],
      transactions
    };
    const payload={
      ok:true,
      provider:'pluggy-personal',
      readOnly:true,
      itemCount:1,
      accountCount:1,
      transactionPreviewCount:transactions.length,
      billCount:0,
      items:[{id:'nubank-item',connectorName:'MeuPluggy',institution:'Nubank',status:'UPDATED',accounts:[account]}]
    };
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'nu…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),
      clearCredentials:()=>true,
      saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  });
}

async function boot(page){
  await installBridge(page);
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,nubankState());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Nubank closing-day current-cycle');
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBankTruth?.version)>=6);
  await page.evaluate(async()=>{await SFPOpenFinancePersonal.preview();setPage('cartoes');renderAll();});
}

test('Nubank: compra do dia do fechamento vinculada ao ciclo ativo completa R$ 306,01 sem duplicar setembro',async({page})=>{
  await boot(page);

  const result=await page.evaluate(()=>{
    const card=state.cards[0];
    const october=SFPOpenFinanceBankTruth.cycleTransactions(card,'2026-10');
    const september=SFPOpenFinanceBankTruth.cycleTransactions(card,'2026-09');
    const localOctober=purchaseInstallment(state.purchases[0],'2026-10');
    return{
      version:SFPOpenFinanceBankTruth.version,
      active:SFPOpenFinanceBankTruth.activeMonth(card),
      localOctober:localOctober?.amount,
      october:october&&{
        amount:october.amount,
        debitAmount:october.debitAmount,
        transactionCount:october.transactionCount
      },
      september:september&&{
        amount:september.amount,
        transactionCount:september.transactionCount
      },
      shown:SFPOpenFinanceBankTruth.displayTotal(card,'2026-10')
    };
  });

  expect(result.version).toBeGreaterThanOrEqual(6);
  expect(result.active).toBe('2026-10');
  expect(result.localOctober).toBe(94.36);
  expect(result.october).toEqual({amount:306.01,debitAmount:306.01,transactionCount:12});
  expect(result.september).toBeNull();
  expect(result.shown).toBe(306.01);

  const card=page.locator('#cardsGrid .management-card--interactive').first();
  await expect(card.locator('.sfp-card-v2-primary')).toContainText('R$ 306,01');
  await expect(card).not.toContainText('R$ 211,66');
});
