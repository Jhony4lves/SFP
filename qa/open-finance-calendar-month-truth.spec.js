const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function calendarState(){
  const value=fixture('Open Finance calendar truth');
  value.mesAtual='2026-09';
  value.baseDate='2026-09-14';
  value.accounts=[{id:1,name:'Itaú',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-14'}];
  value.cards=[{id:1,name:'Itaú',limit:2090,closeDay:2,dueDay:10,payAccountId:1,history:[]}];
  value.purchases=[
    {id:101,cardId:1,desc:'Compra manual de setembro',total:100,installments:1,firstMonth:'2026-09',purchaseDate:'2026-09-01',status:'active',refunds:[]},
    {
      id:102,cardId:1,desc:'Compra Open Finance após fechamento local',total:50,installments:1,
      firstMonth:'2026-10',purchaseDate:'2026-09-11',status:'active',refunds:[],
      externalId:'pluggy:posted-sep',openFinanceProvider:'pluggy',tags:['open-finance','pluggy'],
      note:'Importado automaticamente pelo Open Finance (Pluggy).'
    }
  ];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function installBridge(page){
  await page.addInitScript(()=>{
    const account={
      id:'itau-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',
      balance:500,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
      creditData:{creditLimit:2090,availableCreditLimit:1590,balanceCloseDate:'2026-08-02',balanceDueDate:'2026-08-10'},
      transactions:[
        {id:'pending-sep',date:'2026-09-12T12:00:00.000Z',description:'Compra pendente setembro',amount:25,type:'DEBIT',status:'PENDING',currencyCode:'BRL'},
        {id:'pending-credit',date:'2026-09-12T13:00:00.000Z',description:'Crédito em revisão',amount:-10,type:'CREDIT',status:'PENDING',currencyCode:'BRL'}
      ],
      bills:[]
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:2,billCount:0,items:[{id:'itau-item',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',accounts:[account]}]};
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
  await writeIndexedDB(page,calendarState());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Open Finance calendar truth');
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceCalendarTruth?.version)>=1);
}

async function previewAndApply(page){
  await page.evaluate(async()=>{
    const result=await SFPOpenFinancePersonal.preview();
    SFPOpenFinanceBills.apply(result);
  });
}

test('mês selecionado vence disputa com balanceDueDate antigo e soma compras do mês',async({page})=>{
  await installBridge(page);
  await boot(page);
  await previewAndApply(page);
  await page.evaluate(()=>{setPage('cartoes');renderAll()});

  const truth=await page.evaluate(()=>({
    firstMonth:state.purchases.find(p=>p.id===102)?.firstMonth,
    pending:SFPOpenFinanceCalendarTruth.pendingDebit(state.cards[0],'2026-09'),
    total:SFPOpenFinanceCalendarTruth.displayTotal(state.cards[0],'2026-09'),
    closed:SFPOpenFinanceCalendarTruth.duePassed(state.cards[0],'2026-09','2026-09-14')
  }));
  expect(truth.firstMonth).toBe('2026-09');
  expect(truth.pending).toBe(25);
  expect(truth.total).toBe(175);
  expect(truth.closed).toBe(true);

  const card=page.getByRole('button',{name:/Abrir detalhes de Itaú/});
  const current=card.locator('.sfp-card-v2-primary');
  await expect(current).toContainText('Fatura atual · Setembro de 2026');
  await expect(current).toContainText('R$ 175,00');
  await expect(current).toContainText('Fechada');
  await expect(current).not.toContainText('Agosto de 2026');
  await expect(current).not.toContainText('Outubro de 2026');
});

test('vencimento muda apenas o status: antes vence aberta, depois Fechada',async({page})=>{
  await installBridge(page);
  await boot(page);
  const result=await page.evaluate(()=>{
    const itau=state.cards[0];
    const nubank={...itau,dueDay:16};
    return{
      itau:SFPOpenFinanceCalendarTruth.duePassed(itau,'2026-09','2026-09-14'),
      nubank:SFPOpenFinanceCalendarTruth.duePassed(nubank,'2026-09','2026-09-14')
    };
  });
  expect(result.itau).toBe(true);
  expect(result.nubank).toBe(false);
});
