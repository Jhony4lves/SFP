const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateForRefresh(){
  const value=fixture('Open Finance refresh recovery #268');
  value.mesAtual='2026-09';
  value.baseDate='2026-09-22';
  value.accounts=[{id:1,name:'Itaú',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-22'}];
  value.cards=[{id:2,name:'Itaú',limit:2090,closeDay:2,dueDay:10,payAccountId:1,history:[]}];
  value.purchases=[];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function boot(page){
  await page.addInitScript(()=>{
    window.__sfpRefreshCalls={refresh:0,status:0,preview:0};
    const payload={
      ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:0,billCount:0,
      items:[{id:'current-item',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',accounts:[{
        id:'credit-1',type:'CREDIT',subtype:'CREDIT_CARD',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',
        balance:1494.37,currencyCode:'BRL',transactionPreviewHasMore:false,transactionsError:false,
        creditData:{creditLimit:2090,availableCreditLimit:595.63},transactions:[],bills:[]
      }]}]
    };

    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'qa',itemReferenceCount:2}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>{window.__sfpRefreshCalls.preview++;return JSON.stringify(payload);},
      clearCredentials:()=>true,
      saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:2})
    }});

    Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
      refreshItems:()=>{
        window.__sfpRefreshCalls.refresh++;
        return JSON.stringify({
          ok:true,requested:3,started:0,providerManaged:2,needsUser:false,
          staleReferencesRemoved:1,rediscovered:0,referenceCount:2,referencesUpdated:true,
          code:'REFRESH_PROVIDER_MANAGED',
          message:'O MeuPluggy gerencia a atualização destas conexões.',
          items:[
            {id:'11111111-1111-4111-8111-111111111111',accepted:false,status:400,code:'REFRESH_PROVIDER_MANAGED',providerMessage:'MeuPluggy item cant be updated'},
            {id:'22222222-2222-4222-8222-222222222222',accepted:false,status:404,code:'REFRESH_ITEM_NOT_FOUND',providerMessage:'item not found'},
            {id:'33333333-3333-4333-8333-333333333333',accepted:false,status:400,code:'REFRESH_PROVIDER_MANAGED',providerMessage:'MeuPluggy item cant be updated'}
          ]
        });
      },
      refreshStatus:()=>{window.__sfpRefreshCalls.status++;return JSON.stringify({ok:true,complete:true,items:[]});}
    }});
  });

  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,stateForRefresh());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Open Finance refresh recovery #268');
  await page.addScriptTag({url:'/open-finance-real-refresh.js'});
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceRealRefresh?.version)>=9);
  await page.waitForFunction(()=>document.getElementById('openFinanceSyncBtn')?.dataset?.sfpRealRefresh==='1');
  await page.waitForFunction(()=>window.__sfpRefreshCalls.preview>=1);
  await page.waitForFunction(()=>!document.getElementById('openFinanceSyncBtn')?.disabled);
  await page.evaluate(()=>setPage('openfinance'));
}

test('#268 diagnóstico físico 400/404/400 vira provider-managed e limpa referência morta',async({page})=>{
  await boot(page);
  const before=await page.evaluate(()=>window.__sfpRefreshCalls.preview);

  await page.locator('#openFinanceSyncBtn').click();
  await page.waitForFunction(beforePreview=>window.__sfpRefreshCalls.preview>beforePreview,before);

  const result=await page.evaluate(()=>({
    calls:{...window.__sfpRefreshCalls},
    diagnostic:SFPOpenFinanceRealRefresh.diagnostic()
  }));

  expect(result.calls.refresh).toBe(1);
  expect(result.calls.status).toBe(0);
  expect(result.diagnostic.outcome).toBe('provider-managed');
  expect(result.diagnostic.polls).toBe(0);
  expect(result.diagnostic.request).toMatchObject({
    ok:true,
    requested:3,
    started:0,
    providerManaged:2,
    staleReferencesRemoved:1,
    referenceCount:2,
    referencesUpdated:true,
    code:'REFRESH_PROVIDER_MANAGED'
  });
  expect(result.diagnostic.application?.ok).toBe(true);

  const serialized=JSON.stringify(result.diagnostic);
  expect(serialized).not.toContain('11111111-1111-4111-8111-111111111111');
  expect(serialized).not.toContain('22222222-2222-4222-8222-222222222222');
  expect(serialized).not.toContain('33333333-3333-4333-8333-333333333333');

  await expect(page.locator('#openFinancePreview')).toContainText('MeuPluggy gerencia a atualização');
  await expect(page.locator('#openFinancePreview')).toContainText('1 referência(s) obsoleta(s)');
});

test('#268 autenticação interativa não é confundida com refresh gerenciado',async({page})=>{
  await boot(page);
  await page.evaluate(()=>Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
    refreshItems:()=>JSON.stringify({
      ok:false,requested:1,started:0,providerManaged:0,needsUser:true,
      code:'REFRESH_NEEDS_USER',
      items:[{accepted:false,status:400,code:'REFRESH_NEEDS_USER',providerCode:'MFA_REQUIRED',providerMessage:'Waiting user input'}]
    }),
    refreshStatus:()=>JSON.stringify({ok:true,complete:true,items:[]})
  }}));

  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(()=>page.evaluate(()=>SFPOpenFinanceRealRefresh.diagnostic()?.outcome)).toBe('needs-user');
  await expect(page.locator('#openFinancePreview')).toContainText('precisa de autenticação ou ação do usuário');
});
