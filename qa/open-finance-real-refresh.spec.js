const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateForRefresh(){
  const value=fixture('Open Finance real refresh');
  value.mesAtual='2026-09';
  value.baseDate='2026-09-14';
  value.accounts=[{id:1,name:'Itaú',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-14'}];
  value.cards=[{id:2,name:'Itaú',limit:2090,closeDay:2,dueDay:10,payAccountId:1,history:[]}];
  value.purchases=[];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function installBridges(page){
  await page.addInitScript(()=>{
    window.__sfpRefreshCalls={refresh:0,status:0,preview:0};
    const payload={
      ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:1,billCount:0,
      items:[{id:'item-1',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',accounts:[{
        id:'credit-1',type:'CREDIT',subtype:'CREDIT_CARD',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',
        balance:1494.37,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
        creditData:{creditLimit:2090,availableCreditLimit:595.63},transactions:[],bills:[]
      }]}]
    };
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'xx…test',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>{window.__sfpRefreshCalls.preview++;return JSON.stringify(payload);},
      clearCredentials:()=>true,
      saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
    Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
      refreshItems:()=>{window.__sfpRefreshCalls.refresh++;return JSON.stringify({ok:true,requested:1,started:1,items:[{id:'item-1',accepted:true,status:200}]});},
      refreshStatus:()=>{window.__sfpRefreshCalls.status++;return JSON.stringify({ok:true,complete:true,needsUser:false,items:[{id:'item-1',status:'UPDATED',executionStatus:'SUCCESS'}]});}
    }});
  });
}

async function boot(page){
  await installBridges(page);
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,stateForRefresh());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Open Finance real refresh');
  await page.addScriptTag({url:'/open-finance-real-refresh.js'});
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceRealRefresh?.version)>=1);
  await page.waitForFunction(()=>document.getElementById('openFinanceSyncBtn')?.dataset?.sfpRealRefresh==='1');
}

test('Atualizar faturas solicita refresh da instituição antes de reler a Pluggy',async({page})=>{
  await boot(page);
  const before=await page.evaluate(()=>({...window.__sfpRefreshCalls}));
  const button=page.locator('#openFinanceSyncBtn');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Sincronizar contas e faturas');

  await button.click();

  await page.waitForFunction(beforePreview=>window.__sfpRefreshCalls.refresh===1&&window.__sfpRefreshCalls.status>=1&&window.__sfpRefreshCalls.preview>beforePreview,before.preview);
  const after=await page.evaluate(()=>({...window.__sfpRefreshCalls}));
  expect(after.refresh).toBe(1);
  expect(after.status).toBeGreaterThanOrEqual(1);
  expect(after.preview).toBeGreaterThan(before.preview);
  await expect(page.locator('#openFinancePreview')).toContainText('Dados atualizados diretamente da instituição');
});

test('refresh bloqueado não dispara segundo PATCH e preserva leitura disponível',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
      refreshItems:()=>{window.__sfpRefreshCalls.refresh++;return JSON.stringify({ok:false,requested:1,started:0,message:'rate limit',items:[{id:'item-1',accepted:false,status:429,code:'REFRESH_RATE_LIMITED'}]});},
      refreshStatus:()=>{window.__sfpRefreshCalls.status++;return JSON.stringify({ok:true,complete:true,items:[]});}
    }});
  });
  const beforePreview=await page.evaluate(()=>window.__sfpRefreshCalls.preview);
  await page.locator('#openFinanceSyncBtn').click();
  await page.waitForFunction(before=>window.__sfpRefreshCalls.refresh===1&&window.__sfpRefreshCalls.preview>before,beforePreview);
  const calls=await page.evaluate(()=>({...window.__sfpRefreshCalls}));
  expect(calls.refresh).toBe(1);
  expect(calls.status).toBe(0);
  await expect(page.locator('#openFinancePreview')).toContainText('limite de frequência');
});
