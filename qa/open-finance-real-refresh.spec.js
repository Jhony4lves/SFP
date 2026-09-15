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

test('refresh aplica o Bill novo do banco mesmo sem compras novas',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    const original=PluggyBridge.previewData;
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{...PluggyBridge,
      previewData:()=>{
        const payload=JSON.parse(original());
        if(window.__sfpRefreshCalls.status>0){
          payload.items[0].accounts[0].bills=[{id:'itau-sep',dueDate:'2026-09-21',
            billClosingDate:'2026-09-12',totalAmount:327.59,payments:[]}];
        }
        return JSON.stringify(payload);
      }
    }});
  });
  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(()=>page.evaluate(()=>invoiceStatus(2,'2026-09').officialTotal)).toBe(327.59);
  expect(await page.evaluate(()=>window.__sfpRefreshCalls.refresh)).toBe(1);
  await expect(page.locator('#openFinanceSyncBtn')).toBeEnabled();
  await page.reload();
  await expectBootComplete(page,expect,'Open Finance real refresh');
  expect(await page.evaluate(()=>invoiceStatus(2,'2026-09').officialTotal)).toBe(327.59);
});

test('recusa mostra HTTP e código sem incluir credenciais ou identificadores no diagnóstico',async({page})=>{
  await boot(page);
  await page.evaluate(()=>Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
    refreshItems:()=>JSON.stringify({ok:false,requested:1,started:0,apiKey:'secret-token',items:[
      {id:'private-item-id',accepted:false,status:403,providerCode:'FORBIDDEN',message:'secret-token'}
    ]})
  }}));
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinancePreview')).toContainText('HTTP 403 FORBIDDEN');
  await expect(page.getByRole('button',{name:'Exportar diagnóstico da sincronização'})).toBeVisible();
  const diagnostic=await page.evaluate(()=>SFPOpenFinanceRealRefresh.diagnostic());
  expect(diagnostic.outcome).toBe('rejected');
  expect(diagnostic.request.items[0].providerCode).toBe('FORBIDDEN');
  expect(JSON.stringify(diagnostic)).not.toMatch(/secret-token|private-item-id/);
});

test('erro terminal do provedor não é anunciado como atualização concluída',async({page})=>{
  await boot(page);
  await page.evaluate(()=>Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
    refreshItems:()=>JSON.stringify({ok:true,requested:1,started:1}),
    refreshStatus:()=>JSON.stringify({ok:true,complete:false,failed:true,items:[{status:'OUTDATED',executionStatus:'ERROR'}]})
  }}));
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinancePreview')).toContainText('erro ou dados parciais');
  expect(await page.evaluate(()=>SFPOpenFinanceRealRefresh.diagnostic().outcome)).toBe('provider-failed');
});

test('refresh de parte das instituições identifica a conexão recusada',async({page})=>{
  await boot(page);
  await page.evaluate(()=>Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
    refreshItems:()=>JSON.stringify({ok:true,requested:2,started:1,items:[{accepted:true,status:200},{accepted:false,status:429,code:'REFRESH_RATE_LIMITED'}]}),
    refreshStatus:()=>JSON.stringify({ok:true,complete:true,items:[{status:'UPDATED',executionStatus:'SUCCESS'}]})
  }}));
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinancePreview')).toContainText('Somente parte das conexões');
  await expect(page.locator('#openFinancePreview')).toContainText('HTTP 429');
  expect(await page.evaluate(()=>SFPOpenFinanceRealRefresh.diagnostic().outcome)).toBe('partially-refreshed');
});

test('app zerado informa vínculo pendente sem anunciar faturas recalculadas',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{state.cards=[];state.accounts=[];state.purchases=[];state.invoices=[];renderAll();});
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinancePreview')).toContainText('contas ou cartões sem vínculo');
  await expect(page.locator('#openFinanceStatus')).toContainText('Vínculos pendentes no SFP');
  await expect(page.locator('#openFinancePreview')).not.toContainText('faturas recalculadas');
  expect(await page.evaluate(()=>state.invoices.length)).toBe(0);
});

test('cartão recém-cadastrado sem total bancário não aparece como quitado',async({page})=>{
  await boot(page);
  await page.addScriptTag({url:'/open-finance-bank-truth-v2.js'});
  await page.waitForFunction(()=>Number(window.SFPOpenFinanceBankTruth?.version)>=4);
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinanceSyncBtn')).toBeEnabled();
  await page.evaluate(()=>setPage('cartoes'));
  await expect(page.locator('#cardsGrid .sfp-card-v2-primary').first()).toContainText('Fatura sem total confirmado');
  await expect(page.locator('#cardsGrid .sfp-card-v2-primary').first()).not.toContainText('quitada');
});

test('HTTP 400 sem código específico mostra a explicação sanitizada do provedor',async({page})=>{
  await boot(page);
  await page.evaluate(()=>Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
    refreshItems:()=>JSON.stringify({ok:false,requested:1,started:0,items:[{accepted:false,status:400,code:'REFRESH_NEEDS_ATTENTION',providerMessage:'Connector does not support updates'}]})
  }}));
  await page.locator('#openFinanceSyncBtn').click();
  await expect(page.locator('#openFinancePreview')).toContainText('Connector does not support updates');
  expect(await page.evaluate(()=>SFPOpenFinanceRealRefresh.diagnostic().request.items[0].providerMessage)).toBe('Connector does not support updates');
});

test('cartão sem compras locais mostra parcelas bancárias identificadas e não zera durante falha',async({page})=>{
  await boot(page);
  await page.addScriptTag({url:'/open-finance-bank-truth-v2.js'});
  await page.waitForFunction(()=>window.SFPOpenFinanceBankTruth);
  await page.evaluate(()=>{
    const original=PluggyBridge.previewData;
    PluggyBridge.previewData=()=>{
      const data=JSON.parse(original());
      data.items[0].accounts[0].transactions=[{id:'installment',description:'Compra parcelada',date:'2026-08-11',billForecastDate:'2026-09',amount:94.36,status:'PENDING',installment:{installmentNumber:1,totalInstallments:3}}];
      return JSON.stringify(data);
    };
  });
  await page.locator('#openFinanceSyncBtn').click();
  await page.evaluate(()=>{setPage('cartoes');renderCards();});
  await expect(page.locator('#cardsGrid')).toContainText('2 meses');
  await expect(page.locator('#cardsGrid')).toContainText('188,72');
  await page.waitForFunction(()=>SFPOpenFinanceRealRefresh.diagnostic().outcome==='completed');
  await page.evaluate(()=>{const grid=document.getElementById('cardsGrid');grid.innerHTML=grid.innerHTML.replace('2 meses','0');});
  await expect(page.locator('#cardsGrid')).toContainText('2 meses');
  await page.evaluate(()=>{
    const original=PluggyBridge.previewData;
    PluggyBridge.previewData=()=>{const data=JSON.parse(original());Object.assign(data.items[0].accounts[0],{transactions:[],transactionsError:true});return JSON.stringify(data);};
    setPage(document.getElementById('openFinanceSyncBtn').closest('.tab').id);
  });
  await page.locator('#openFinanceSyncBtn').click();
  await page.evaluate(()=>{setPage('cartoes');renderCards();});
  await page.waitForFunction(()=>SFPOpenFinanceRealRefresh.diagnostic().outcome==='apply-failed');
  await expect(page.locator('#cardsGrid')).toContainText('2 meses (última leitura)');
});
