const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function initialState(){
  const value=fixture('Live balance pipeline');
  value.settings={...(value.settings||{}),name:'Live balance pipeline'};
  value.mesAtual='2026-09';
  value.baseDate='2026-09-24';
  value.accounts=[
    {id:1,name:'Itaú',type:'Conta corrente',initial:532.22,balanceMode:'snapshot',balanceDate:'2026-09-22',reconciled:{balance:532.22,date:'2026-09-22',difference:0,source:'open-finance',providerUpdatedAt:'2026-09-22T18:00:00.000Z'}},
    {id:2,name:'Nubank',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-22'},
    {id:3,name:'Mercado Pago',type:'Conta corrente',initial:10.06,balanceMode:'snapshot',balanceDate:'2026-09-22'}
  ];
  value.cards=[];value.transactions=[];value.transfers=[];value.purchases=[];value.invoices=[];value.recurring=[];
  return value;
}

async function installPhysicalBridge(page){
  await page.addInitScript(()=>{
    const ids={item:'11111111-1111-4111-8111-111111111111',itau:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nubank:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',meli:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',missing:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
    let liveCache=null;
    const account=(id,name,balance,updatedAt,extra={})=>({id,itemId:ids.item,type:'BANK',subtype:'CHECKING_ACCOUNT',name,marketingName:name,presentationName:name,balance,updatedAt,currencyCode:'BRL',transactionPreviewHasMore:false,transactions:[],...extra});
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true}),clearCredentials:()=>true,saveItemIds:()=>JSON.stringify({ok:true}),
      refreshBankBalances:()=>{
        // Espelha o cache nativo criado com as respostas reais de /balance.
        liveCache={
          [ids.itau]:{balance:274.82,updateDateTime:'2026-09-24T12:20:00.000Z',readAt:'2026-09-24T12:20:01.000Z'},
          [ids.nubank]:{balance:0,updateDateTime:'2026-09-24T12:20:00.000Z',readAt:'2026-09-24T12:20:01.000Z'},
          [ids.meli]:{balance:10.05,updateDateTime:'2026-09-24T12:20:00.000Z',readAt:'2026-09-24T12:20:01.000Z'}
        };
        return JSON.stringify({ok:true,requested:4,refreshed:3,unavailable:1,accounts:[{account:1,ok:true,status:200},{account:2,ok:true,status:200},{account:3,ok:true,status:200},{account:4,ok:false,status:404}]});
      },
      previewData:()=>{
        const merge=(row)=>liveCache?.[row.id]?{...row,accountBalance:row.balance,balance:liveCache[row.id].balance,liveBalance:liveCache[row.id].balance,balanceEvidence:'live-balance',liveBalanceUpdatedAt:liveCache[row.id].updateDateTime,liveBalanceReadAt:liveCache[row.id].readAt}:row;
        return JSON.stringify({ok:true,items:[{id:ids.item,institution:'MeuPluggy',connectorName:'MeuPluggy',updatedAt:'2026-09-22T18:00:00.000Z',accounts:[
          merge(account(ids.itau,'Itaú',532.22,'2026-09-22T18:00:00.000Z')),
          merge(account(ids.nubank,'Nubank',0,'2026-09-22T18:00:00.000Z')),
          merge(account(ids.meli,'Mercado Pago',10.06,'2026-09-22T18:00:00.000Z')),
          account(ids.missing,'Instituição sem cadastro',0,'2026-09-24T12:20:00.000Z')
        ]}]});
      }
    }});
    Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
      refreshItems:()=>JSON.stringify({ok:true,requested:1,started:0,providerManaged:1,code:'REFRESH_PROVIDER_MANAGED',items:[{code:'REFRESH_PROVIDER_MANAGED'}]}),
      refreshStatus:()=>JSON.stringify({ok:true,complete:true,items:[]})
    }});
  });
}

test('refresh físico atravessa bridge, reconciliação, IndexedDB e reload sem restaurar snapshot antigo',async({page})=>{
  await installPhysicalBridge(page);
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,initialState());
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,'Live balance pipeline');
  await page.waitForFunction(()=>window.SFPOpenFinanceRealRefresh?.version>=10&&window.SFPOpenFinanceFinancialTruth?.version===1);

  await page.evaluate(()=>setPage('openfinance'));
  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(()=>page.evaluate(()=>accountBalance(1))).toBe(274.82);

  const beforeReload=await page.evaluate(async()=>{
    // Uma leitura posterior stale não pode ganhar de live-balance já persistido.
    const stale=JSON.parse(PluggyBridge.previewData());
    stale.items[0].accounts=stale.items[0].accounts.map(a=>({...a,balance:a.accountBalance??a.balance,balanceEvidence:undefined,liveBalance:undefined,liveBalanceUpdatedAt:undefined,liveBalanceReadAt:undefined}));
    await SFPOpenFinanceFinancialTruth.reconcileSnapshot(stale);
    const persisted=await dbGet();
    return {accounts:state.accounts.map(a=>({name:a.name,initial:a.initial,balanceDate:a.balanceDate,reconciled:a.reconciled,balance:accountBalance(a.id)})),persisted:persisted.value.accounts.map(a=>({name:a.name,initial:a.initial,reconciled:a.reconciled}))};
  });
  expect(beforeReload.accounts).toHaveLength(3);
  expect(beforeReload.accounts[0]).toMatchObject({name:'Itaú',initial:274.82,balanceDate:'2026-09-24',balance:274.82,reconciled:{balance:274.82,balanceEvidence:'live-balance'}});
  expect(beforeReload.accounts[1]).toMatchObject({name:'Nubank',initial:0,balance:0});
  expect(beforeReload.accounts[2]).toMatchObject({name:'Mercado Pago',initial:10.05,balance:10.05});
  expect(beforeReload.persisted[0]).toMatchObject({name:'Itaú',initial:274.82,reconciled:{balance:274.82,balanceEvidence:'live-balance'}});

  await page.reload();
  await expectBootComplete(page,expect,'Live balance pipeline');
  await page.evaluate(()=>setPage('contas'));
  await expect(page.locator('#accountsGrid')).toContainText('R$ 274,82');
  await expect(page.locator('#accountsGrid')).toContainText('R$ 10,05');
  await expect(page.locator('#accountsGrid')).toContainText('Última leitura bancária:');
  await page.screenshot({path:'build/reports/open-finance-accounts.png',fullPage:true});
  expect(await page.evaluate(()=>({balance:accountBalance(1),initial:state.accounts[0].initial,count:state.accounts.length}))).toEqual({balance:274.82,initial:274.82,count:3});
});
