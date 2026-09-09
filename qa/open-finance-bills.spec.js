const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateFor(name){
  const value=fixture(name);
  value.mesAtual='2026-09';
  value.baseDate='2026-09-01';
  value.accounts=[{id:1,name:'Itaú',type:'Conta corrente',initial:1000,balanceMode:'snapshot',balanceDate:'2026-09-01'}];
  value.cards=[{id:1,name:'Itaú Click',limit:2090,closeDay:13,dueDay:20,payAccountId:1,history:[]}];
  value.purchases=[
    {id:10,cardId:1,desc:'Compras da fatura atual',total:222.38,installments:1,firstMonth:'2026-09',purchaseDate:'2026-09-05',status:'active',refunds:[]},
    {id:11,cardId:1,desc:'Parcelas futuras',total:1166.80,installments:1,firstMonth:'2026-10',purchaseDate:'2026-09-21',status:'active',refunds:[]}
  ];
  value.invoices=[];
  value.invoiceAdjustments=[];
  return value;
}

async function installBridge(page,{bill=false,partial=false,error=false}={}){
  await page.addInitScript(({bill,partial,error})=>{
    const credit={
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',type:'CREDIT',subtype:'CREDIT_CARD',name:'Itaú Click',marketingName:'Itaú Click',presentationName:'Itaú Click',
      balance:1473.58,currencyCode:'BRL',transactionPreviewHasMore:partial,transactionsError:error,
      creditData:{creditLimit:2090,availableCreditLimit:616.42,balanceDueDate:'2026-09-20',balanceCloseDate:'2026-09-13'},
      transactions:[
        {id:'20000000-0000-4000-8000-000000000001',date:'2026-09-09T12:00:00.000Z',description:'Compra pendente',amount:84.42,type:'DEBIT',status:'PENDING',currencyCode:'BRL'}
      ],
      bills:bill?[{id:'30000000-0000-4000-8000-000000000001',dueDate:'2026-09-20T00:00:00.000Z',billClosingDate:'2026-09-13T00:00:00.000Z',totalAmount:306.80,totalAmountCurrencyCode:'BRL',payments:[],financeCharges:[]}]:[]
    };
    const payload={ok:true,provider:'pluggy-personal',readOnly:true,itemCount:1,accountCount:1,transactionPreviewCount:1,billCount:credit.bills.length,items:[{id:'11111111-1111-4111-8111-111111111111',connectorName:'MeuPluggy',institution:'Itaú',status:'UPDATED',accounts:[credit]}]};
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'11111111…1111',itemReferenceCount:1}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      previewData:()=>JSON.stringify(payload),
      clearCredentials:()=>true,
      saveItemIds:()=>JSON.stringify({ok:true,itemReferenceCount:1})
    }});
  },{bill,partial,error});
}

async function boot(page,value){
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,value.settings.name);
  await page.waitForFunction(()=>window.SFPOpenFinanceBills?.version===1);
}

async function openOpenFinance(page){
  await page.evaluate(()=>setPage('config'));
  await expect(page.locator('#openFinancePersonalPanel')).toBeVisible();
  await expect(page.locator('#openFinanceSyncBtn')).toBeVisible();
}

test('#207 fatura aberta concilia pelo limite usado menos compromissos futuros',async({page})=>{
  await installBridge(page);
  await boot(page,stateFor('Open Finance Bills inferência #207'));
  const before=await page.evaluate(()=>({invoice:invoiceTotal(1,'2026-09'),outstanding:cardOutstanding(1)}));
  expect(before).toEqual({invoice:222.38,outstanding:1389.18});
  await openOpenFinance(page);
  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(()=>page.evaluate(()=>invoiceTotal(1,'2026-09'))).toBe(306.78);
  const after=await page.evaluate(()=>({invoice:invoiceStatus(1,'2026-09'),outstanding:cardOutstanding(1),card:card(1)}));
  expect(after.invoice.officialTotal).toBe(306.78);
  expect(after.invoice.officialTotalSource).toBe('open-finance-used-minus-future');
  expect(after.outstanding).toBe(1473.58);
  expect(after.card.openFinanceUsedAmount).toBe(1473.58);
});

test('#207 Bill oficial prevalece sobre inferência da fatura aberta',async({page})=>{
  await installBridge(page,{bill:true});
  await boot(page,stateFor('Open Finance Bill oficial #207'));
  await openOpenFinance(page);
  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(()=>page.evaluate(()=>invoiceTotal(1,'2026-09'))).toBe(306.80);
  const inv=await page.evaluate(()=>invoiceStatus(1,'2026-09'));
  expect(inv.officialTotal).toBe(306.80);
  expect(inv.officialTotalSource).toBe('open-finance-bill');
  expect(inv.openFinanceBillId).toBe('30000000-0000-4000-8000-000000000001');
  expect(inv.documentDueDate).toBe('2026-09-20');
});

test('#207 leitura parcial não usa inferência do limite',async({page})=>{
  await installBridge(page,{partial:true});
  await boot(page,stateFor('Open Finance parcial #207'));
  const result=await page.evaluate(()=>SFPOpenFinanceBills.apply(JSON.parse(PluggyBridge.previewData())));
  expect(result.inferred).toBe(0);
  expect(await page.evaluate(()=>invoiceTotal(1,'2026-09'))).toBe(222.38);
});

test('#208 exporta diagnóstico da fatura sem credenciais ou identidade',async({page})=>{
  await installBridge(page,{bill:true});
  await boot(page,stateFor('Diagnóstico de fatura #208'));
  await openOpenFinance(page);
  await page.locator('#openFinanceSyncBtn').click();
  await page.evaluate(()=>setPage('cartoes'));
  await page.evaluate(()=>openInvoiceDetail(1));
  await expect(page.locator('#exportInvoiceDiagnostic')).toBeVisible();
  const diagnostic=await page.evaluate(()=>SFPOpenFinanceBills.diag(1,'2026-09'));
  expect(diagnostic.schema).toBe('sfp-invoice-diagnostic-v1');
  expect(diagnostic.invoice.totalShown).toBe(306.80);
  expect(diagnostic.openFinance.usage.amount).toBe(1473.58);
  expect(diagnostic.openFinance.bills).toHaveLength(1);
  expect(diagnostic.openFinance.pendingTransactions).toHaveLength(1);
  expect(diagnostic.privacy).toEqual({credentials:false,identity:false,fullCardNumber:false});
  const raw=JSON.stringify(diagnostic).toLowerCase();
  expect(raw).not.toContain('clientsecret');
  expect(raw).not.toContain('apikey');
  expect(raw).not.toContain('cpf');
  expect(raw).not.toContain('telefone');
  expect(raw).not.toContain('email');
});

test('#207 bridge nativa allowlista e sanitiza Bills da Pluggy',async()=>{
  const bridge=fs.readFileSync('app/src/main/java/com/jhony/sfp/PluggyBridge.java','utf8');
  const loader=fs.readFileSync('app/src/main/assets/www/safe-spend.js','utf8');
  expect(bridge).toContain('"/bills".equals(path)');
  expect(bridge).toContain('listBillsInternal');
  expect(bridge).toContain('summarizeBill');
  expect(bridge).toContain('summary.put("billId", billId)');
  expect(bridge).toContain('result.put("billCount", billCount)');
  expect(loader).toContain("script.src='open-finance-bills.js'");
});
