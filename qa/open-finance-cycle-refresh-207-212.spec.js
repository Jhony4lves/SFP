const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateFor({paid=true}={}){
  const value=fixture(paid?'Nubank rollover quitado':'Nubank rollover pendente');
  value.mesAtual='2026-09';
  value.baseDate='2026-09-18';
  value.accounts=[{id:1,name:'Nubank',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-18'}];
  value.cards=[{id:1,name:'Nubank',limit:600,closeDay:9,dueDay:16,payAccountId:1,history:[]}];
  value.purchases=[];
  value.invoiceAdjustments=[];
  value.invoices=[{
    id:90,cardId:1,month:'2026-09',status:'open',
    officialTotal:170.84,officialTotalSource:'open-finance-bill',
    paidAmount:paid?170.84:0,
    payments:paid?[{date:'2026-09-16',amount:170.84,source:'open-finance-card-payment',externalId:'nu-pay-17084'}]:[]
  }];
  return value;
}

async function installBridge(page){
  await page.addInitScript(()=>{
    const account={
      id:'nu-credit',type:'CREDIT',subtype:'CREDIT_CARD',name:'Nubank',marketingName:'Nubank',presentationName:'Nubank',
      balance:400.36,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
      // Snapshot de calendário deliberadamente atrasado no ciclo já quitado.
      creditData:{creditLimit:600,availableCreditLimit:199.64,balanceCloseDate:'2026-09-09',balanceDueDate:'2026-09-16'},
      bills:[{id:'nu-sep',dueDate:'2026-09-16',billClosingDate:'2026-09-09',totalAmount:170.84,payments:[]}],
      transactions:[
        {id:'oct-a',date:'2026-09-10T12:00:00.000Z',description:'Compras ciclo outubro',amount:211.66,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10'},
        {id:'oct-b',date:'2026-09-11T12:00:00.000Z',description:'Assb Comercio Varejist 2/3',amount:94.35,type:'DEBIT',status:'PENDING',billForecastDate:'2026-10',installment:{installmentNumber:2,totalInstallments:3}},
        {id:'nov-a',date:'2026-10-11T12:00:00.000Z',description:'Assb Comercio Varejist 3/3',amount:94.35,type:'DEBIT',status:'PENDING',billForecastDate:'2026-11',installment:{installmentNumber:3,totalInstallments:3}}
      ]
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:3,billCount:1,
      items:[{id:'nu-item',connectorName:'MeuPluggy',institution:'Nubank',status:'UPDATED',accounts:[account]}]};
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'nu…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),
      clearCredentials:()=>true,
      saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  });
}

async function boot(page,value){
  await page.clock.setFixedTime(new Date('2026-09-18T15:00:00Z'));
  await installBridge(page);
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,value.settings.name);
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBills?.version)>=12);
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBankTruth?.version)>=4);
  await page.evaluate(async()=>{
    const preview=await SFPOpenFinancePersonal.preview();
    SFPOpenFinanceBills.apply(preview);
    setPage('cartoes');
    renderAll();
    SFPOpenFinanceBankTruth.patchGrid();
  });
}

test('#212 fatura quitada avança setembro para outubro mesmo com datas Pluggy atrasadas',async({page})=>{
  await boot(page,stateFor({paid:true}));

  const result=await page.evaluate(()=>({
    cycle:SFPOpenFinanceBills.bankCycle(JSON.parse(PluggyBridge.previewData()).items[0].accounts[0],card(1)),
    compatibilityCycle:SFPOpenFinanceBills.cycleForCard(card(1),JSON.parse(PluggyBridge.previewData()).items[0].accounts[0]),
    month:SFPOpenFinanceBills.currentCycleMonth(card(1)),
    septemberStatus:invoiceDisplayStatus(1,'2026-09'),
    octoberBank:SFPOpenFinanceBankTruth.bankTruth(card(1),'2026-10'),
    used:card(1).openFinanceUsedAmount,
    available:card(1).openFinanceAvailableCreditLimit
  }));

  expect(result.month).toBe('2026-10');
  expect(result.compatibilityCycle.month).toBe('2026-10');
  expect(result.cycle).toMatchObject({
    month:'2026-10',
    candidateMonth:'2026-09',
    localCandidateMonth:'2026-10',
    advancedPastSettledCurrent:true,
    heldByUnsettledPrevious:false
  });
  expect(result.septemberStatus).toBe('paid');
  expect(result.octoberBank).toMatchObject({amount:306.01,official:false,bankBacked:true});
  expect(result.used).toBe(400.36);
  expect(result.available).toBe(199.64);

  const cardNode=page.locator('#cardsGrid .management-card--interactive').first();
  await expect(cardNode).toContainText('Fatura atual · Outubro de 2026');
  await expect(cardNode.locator('.sfp-card-v2-primary')).toContainText('R$ 306,01');
  await expect(cardNode).not.toContainText('Fatura atual · Setembro de 2026');

  await cardNode.click();
  expect(await page.evaluate(()=>state.ui.invoiceMonthByCard[1])).toBe('2026-10');
});

test('#212 fatura anterior ainda aberta impede avanço prematuro para o próximo ciclo',async({page})=>{
  await boot(page,stateFor({paid:false}));

  const result=await page.evaluate(()=>{
    const account=JSON.parse(PluggyBridge.previewData()).items[0].accounts[0];
    return {
      cycle:SFPOpenFinanceBills.bankCycle(account,card(1)),
      month:SFPOpenFinanceBills.currentCycleMonth(card(1))
    };
  });

  expect(result.month).toBe('2026-09');
  expect(result.cycle).toMatchObject({
    month:'2026-09',
    candidateMonth:'2026-09',
    localCandidateMonth:'2026-10',
    heldByUnsettledPrevious:true,
    advancedPastSettledCurrent:false
  });
});
