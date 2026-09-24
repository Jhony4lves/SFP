const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function baseState(name='Saldo Itaú #270'){
  const value=fixture(name);
  value.settings={...(value.settings||{}),name};
  value.mesAtual='2026-09';
  value.baseDate='2026-09-23';
  value.accounts=[{id:1,name:'Itaú',type:'Conta corrente',initial:532.22,balanceMode:'snapshot',balanceDate:'2026-09-22',reconciled:{balance:532.22,date:'2026-09-22',difference:0,source:'open-finance'}}];
  value.cards=[];
  value.transactions=[];
  value.transfers=[];
  value.purchases=[];
  value.invoices=[];
  value.recurring=[];
  return value;
}

async function boot(page,value=baseState()){
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,value.settings.name);
  await page.waitForFunction(()=>window.SFPOpenFinanceRealRefresh?.version>=10);
  await page.waitForFunction(()=>window.SFPOpenFinanceFinancialTruth?.version===1);
}

test('#270 MeuPluggy atualizado: botão consulta saldo em tempo real e troca 532,22 por 274,82',async({page})=>{
  await page.addInitScript(()=>{
    window.__sfp270={balance:532.22,updatedAt:'2026-09-22T18:00:00.000Z',refreshCalls:0,previewCalls:0,toasts:[]};
    window.toast=(text,kind='')=>window.__sfp270.toasts.push({text:String(text||''),kind:String(kind||'')});
    const payload=()=>({ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:0,billCount:0,items:[{id:'11111111-1111-4111-8111-111111111111',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',updatedAt:window.__sfp270.updatedAt,accounts:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',itemId:'11111111-1111-4111-8111-111111111111',type:'BANK',subtype:'CHECKING_ACCOUNT',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',balance:window.__sfp270.balance,updatedAt:window.__sfp270.updatedAt,currencyCode:'BRL',transactionPreviewHasMore:false,transactions:[]}]}]});
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'qa',itemReferenceCount:1}),saveCredentials:()=>JSON.stringify({ok:true,configured:true}),previewData:()=>{window.__sfp270.previewCalls++;return JSON.stringify(payload());},refreshBankBalances:()=>{window.__sfp270.refreshCalls++;window.__sfp270.balance=274.82;window.__sfp270.updatedAt='2026-09-23T12:20:00.000Z';return JSON.stringify({ok:true,requested:1,refreshed:1,rateLimited:0,unavailable:0,failed:0,latestUpdateAt:'2026-09-23T12:20:00.000Z',accounts:[{account:1,ok:true,status:200,updateDateTime:'2026-09-23T12:20:00.000Z'}]});},clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})}});
    Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{refreshItems:()=>JSON.stringify({ok:true,requested:1,started:0,providerManaged:1,needsUser:false,code:'REFRESH_PROVIDER_MANAGED',items:[{accepted:false,code:'REFRESH_PROVIDER_MANAGED',providerMessage:'Atualização automática gerenciada pelo MeuPluggy.'}]}),refreshStatus:()=>JSON.stringify({ok:true,complete:true,items:[]})}});
  });
  await boot(page);
  await expect.poll(()=>page.evaluate(()=>accountBalance(1))).toBe(532.22);
  await page.evaluate(()=>setPage('openfinance'));
  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(()=>page.evaluate(()=>accountBalance(1))).toBe(274.82);
  const result=await page.evaluate(()=>({calls:{...window.__sfp270},diagnostic:SFPOpenFinanceRealRefresh.diagnostic(),account:state.accounts.find(row=>row.id===1)}));
  expect(result.calls.refreshCalls).toBe(1);
  expect(result.diagnostic.outcome).toBe('provider-managed');
  expect(result.diagnostic.balanceRefresh).toMatchObject({ok:true,requested:1,refreshed:1,rateLimited:0,unavailable:0,failed:0,latestUpdateAt:'2026-09-23T12:20:00.000Z'});
  expect(result.account.initial).toBe(274.82);
  expect(result.account.balanceDate).toBe('2026-09-23');
  expect(result.account.reconciled).toMatchObject({balance:274.82,source:'open-finance',providerUpdatedAt:'2026-09-23T12:20:00.000Z'});
  const serialized=JSON.stringify(result.diagnostic);
  expect(serialized).not.toContain('11111111-1111-4111-8111-111111111111');
  expect(serialized).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(result.calls.toasts.some(row=>row.text.includes('Saldo em tempo real consultado em 1 conta(s) e aplicado ao SFP'))).toBe(true);
});

test('#270 snapshot antigo não sobrescreve snapshot mais recente da mesma conta',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async()=>{const report=await SFPOpenFinanceFinancialTruth.reconcileSnapshot({ok:true,items:[{id:'item-itau-novo',institution:'Itaú',connectorName:'MeuPluggy',updatedAt:'2026-09-23T12:20:00.000Z',accounts:[{id:'acc-itau-novo',type:'BANK',subtype:'CHECKING_ACCOUNT',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',balance:274.82,updatedAt:'2026-09-23T12:20:00.000Z',transactions:[]}]},{id:'item-itau-antigo',institution:'Itaú',connectorName:'MeuPluggy',updatedAt:'2026-09-22T18:00:00.000Z',accounts:[{id:'acc-itau-antigo',type:'BANK',subtype:'CHECKING_ACCOUNT',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',balance:532.22,updatedAt:'2026-09-22T18:00:00.000Z',transactions:[]}]}]});const account=state.accounts.find(row=>row.id===1);return{report,balance:accountBalance(1),initial:account.initial,balanceDate:account.balanceDate,reconciled:account.reconciled};});
  expect(result.report.ok).toBe(true);expect(result.balance).toBe(274.82);expect(result.initial).toBe(274.82);expect(result.balanceDate).toBe('2026-09-23');expect(result.reconciled).toMatchObject({balance:274.82,source:'open-finance',providerUpdatedAt:'2026-09-23T12:20:00.000Z'});
});

test('#270 seleção do saldo mais novo independe da ordem dos Items',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async()=>{await SFPOpenFinanceFinancialTruth.reconcileSnapshot({ok:true,items:[{id:'item-itau-antigo',institution:'Itaú',connectorName:'MeuPluggy',updatedAt:'2026-09-22T18:00:00.000Z',accounts:[{id:'acc-old',type:'BANK',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',balance:532.22,updatedAt:'2026-09-22T18:00:00.000Z',transactions:[]}]},{id:'item-itau-novo',institution:'Itaú',connectorName:'MeuPluggy',updatedAt:'2026-09-23T12:20:00.000Z',accounts:[{id:'acc-new',type:'BANK',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',balance:274.82,updatedAt:'2026-09-23T12:20:00.000Z',transactions:[]}]}]});return{balance:accountBalance(1),providerUpdatedAt:state.accounts[0].reconciled?.providerUpdatedAt};});
  expect(result).toEqual({balance:274.82,providerUpdatedAt:'2026-09-23T12:20:00.000Z'});
});
