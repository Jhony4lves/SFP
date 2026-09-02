const { test } = require('@playwright/test');
const fs = require('node:fs');
const { fixture, writeIndexedDB } = require('./helpers');

async function loadState(page,value){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderAll==='function'&&typeof dbGet==='function');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderAll==='function'&&typeof lastSavedState!=='undefined'&&lastSavedState);
}

function base(name){
  const s=fixture(name);
  s.mesAtual='2026-09';
  s.baseDate='2026-09-02';
  s.settings={...(s.settings||{}),onboardingDone:true};
  s.accounts=[{id:1,name:'Conta origem',type:'Conta corrente',initial:10000,balanceMode:'snapshot',balanceDate:'2026-09-02'}];
  s.cards=[];s.transactions=[];s.transfers=[];s.transferEvidence=[];s.purchases=[];s.invoiceAdjustments=[];s.invoices=[];s.recurring=[];s.debts=[];s.goals=[];s.assets=[];s.trash=[];
  return s;
}

async function bankDebtReservedCase(page){
  const s=base('Invariant reserved bank debt');
  s.accounts[0].initial=2000;
  s.debts=[{id:301,name:'Parcela bancária',balance:800,payment:800,rate:0,ratePeriod:'monthly',amortizationMethod:'manual',installments:1,paidInstallments:0,firstDue:'2026-09-03',dueDay:3,accountId:1,paymentMethod:'bank',history:[]}];
  s.recurring=[{id:401,desc:'Receita futura',type:'income',amount:1000,day:10,category:'Trabalho',accountId:1,start:'2026-09',end:'',active:true,skips:[]}];
  await loadState(page,s);
  return page.evaluate(()=>{
    const reference=new Date('2026-09-02T12:00:00');
    const future=upcomingEvents(20,reference).map(e=>({date:e.date,type:e.type,source:e.source,sourceId:e.sourceId,amount:e.amount}));
    const snap=financialContextSnapshot({reference,months:3});
    return {future,reservedCents:snap.reserved?.amountCents,freeCents:snap.free?.amountCents,availableCents:snap.availableCents,nextIncome:snap.nextIncome};
  });
}

async function bankDebtPaymentCase(page,{price=false}={}){
  const s=base(price?'Invariant price debt':'Invariant bank debt cash');
  const payment=price?88.85:1000;
  s.debts=[{id:301,name:price?'Price 1%':'Dívida bancária',balance:price?1000:5000,payment,rate:price?1:0,ratePeriod:'monthly',amortizationMethod:price?'price':'manual',installments:price?12:5,paidInstallments:0,firstDue:'2026-09-03',dueDay:3,accountId:1,paymentMethod:'bank',history:[]}];
  await loadState(page,s);
  return page.evaluate(async({price})=>{
    const before={account:accountBalance(1),debt:state.debts[0].balance,netWorth:netWorth()};
    await payDebtInstallment(301);
    const after={account:accountBalance(1),debt:state.debts[0].balance,netWorth:netWorth(),history:structuredClone(state.debts[0].history),paidInstallments:state.debts[0].paidInstallments};
    const expectedPriceBalance=price?Math.round((1000+(1000*.01)-88.85)*100)/100:null;
    return {before,after,expectedPriceBalance};
  },{price});
}

async function goalTransferDeleteCase(page){
  const s=base('Invariant goal contribution');
  s.accounts.push({id:2,name:'Reserva meta',type:'Reserva',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-02'});
  s.goals=[{id:401,name:'Meta',target:10000,accountId:2,plan:1500,targetDate:'2027-12',initialAllocated:0,history:[{date:'2026-09-02',amount:1500}]}];
  s.transfers=[{id:901,desc:'Aporte — Meta',amount:1500,date:'2026-09-02',fromId:1,toId:2,tags:['aporte'],goalId:401,balanceImpact:true}];
  await loadState(page,s);
  return page.evaluate(async()=>{
    const before={goal:goalBalance(state.goals[0]),from:accountBalance(1),to:accountBalance(2),transfers:state.transfers.length};
    await trashTransfer(901);
    const after={goal:goalBalance(state.goals[0]),from:accountBalance(1),to:accountBalance(2),transfers:state.transfers.length,trash:structuredClone(state.trash)};
    return {before,after};
  });
}

async function orphanAccountCase(page){
  const s=base('Invariant account orphan');
  s.recurring=[{id:401,desc:'Mensalidade',type:'expense',amount:100,day:5,category:'Outros',accountId:1,start:'2026-09',end:'',active:true,skips:[]}];
  s.debts=[{id:301,name:'Dívida',balance:500,payment:100,rate:0,installments:5,paidInstallments:0,firstDue:'2026-09-10',accountId:1,paymentMethod:'bank',history:[]}];
  s.goals=[{id:501,name:'Meta órfã',target:1000,accountId:1,plan:100,targetDate:'2027-01',history:[]}];
  s.invoices=[{id:701,cardId:999,month:'2026-09',status:'paid',officialTotal:50,paidAmount:50,accountId:1,payments:[{date:'2026-09-01',amount:50,balanceImpact:false,targetMonth:'2026-09'}]}];
  await loadState(page,s);
  return page.evaluate(async()=>{
    const before={accounts:state.accounts.map(a=>a.id),recAccount:state.recurring[0].accountId,debtAccount:state.debts[0].accountId,goalAccount:state.goals[0].accountId,invoiceAccount:state.invoices[0].accountId};
    await removeAccount(1);
    const after={accounts:state.accounts.map(a=>a.id),recAccount:state.recurring[0]?.accountId,debtAccount:state.debts[0]?.accountId,goalAccount:state.goals[0]?.accountId,invoiceAccount:state.invoices[0]?.accountId};
    return {before,after};
  });
}

async function orphanCardCase(page){
  const s=base('Invariant card orphan');
  s.cards=[{id:201,name:'Cartão histórico',limit:1000,closeDay:5,dueDay:10,payAccountId:1,history:[]}];
  s.invoices=[{id:701,cardId:201,month:'2026-08',status:'paid',officialTotal:150,paidAmount:150,accountId:1,payments:[{date:'2026-08-10',amount:150,balanceImpact:false,targetMonth:'2026-08'}]}];
  s.invoiceAdjustments=[{id:801,cardId:201,month:'2026-08',date:'2026-08-05',desc:'Crédito histórico',amount:-10,source:'manual'}];
  await loadState(page,s);
  return page.evaluate(async()=>{
    const before={cards:state.cards.map(c=>c.id),invoiceCard:state.invoices[0].cardId,adjustmentCard:state.invoiceAdjustments[0].cardId};
    await removeCard(201);
    const after={cards:state.cards.map(c=>c.id),invoiceCard:state.invoices[0]?.cardId,adjustmentCard:state.invoiceAdjustments[0]?.cardId};
    return {before,after};
  });
}

async function auditDuplicateCrossAccountCase(page){
  const s=base('Invariant audit duplicate');
  s.accounts.push({id:2,name:'Outra conta',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-02'});
  s.transactions=[
    {id:11,kind:'expense',desc:'Compra igual',amount:50,date:'2026-09-02',category:'Outros',accountId:1,status:'paid',balanceImpact:true,createdAt:1},
    {id:12,kind:'expense',desc:'Compra igual',amount:50,date:'2026-09-02',category:'Outros',accountId:2,status:'paid',balanceImpact:true,createdAt:2}
  ];
  await loadState(page,s);
  return page.evaluate(()=>{const audit=auditData();return {warnings:audit.warnings,dups:audit.dups,duplicateTexts:audit.issues.filter(i=>/duplicata/i.test(i.text||'')).map(i=>i.text)};});
}

async function destructiveDuplicateCase(page){
  const s=base('Invariant exact duplicate remover');
  s.transactions=[
    {id:11,kind:'expense',desc:'Duas passagens iguais',amount:7.10,date:'2026-09-02',category:'Transporte',accountId:1,status:'paid',balanceImpact:true,createdAt:1},
    {id:12,kind:'expense',desc:'Duas passagens iguais',amount:7.10,date:'2026-09-02',category:'Transporte',accountId:1,status:'paid',balanceImpact:true,createdAt:2}
  ];
  await loadState(page,s);
  return page.evaluate(async()=>{
    const before={transactions:state.transactions.map(t=>t.id),balance:accountBalance(1),trash:state.trash.length};
    await removeExactDuplicates();
    const after={transactions:state.transactions.map(t=>t.id),balance:accountBalance(1),trash:state.trash.map(x=>({type:x.type,id:x.item?.id??x.data?.id??null}))};
    return {before,after};
  });
}

test('DEEP-FINANCIAL-INVARIANTS evidence map',async({page},testInfo)=>{
  test.setTimeout(120000);
  const report={
    generatedAt:new Date().toISOString(),
    bankDebtReserved:await bankDebtReservedCase(page),
    bankDebtPayment:await bankDebtPaymentCase(page),
    priceDebtPayment:await bankDebtPaymentCase(page,{price:true}),
    goalTransferDelete:await goalTransferDeleteCase(page),
    orphanAccountDelete:await orphanAccountCase(page),
    orphanCardDelete:await orphanCardCase(page),
    auditCrossAccountDuplicate:await auditDuplicateCrossAccountCase(page),
    destructiveDuplicateRemoval:await destructiveDuplicateCase(page)
  };
  const out=testInfo.outputPath('deep-financial-invariants.json');
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  await testInfo.attach('deep-financial-invariants.json',{path:out,contentType:'application/json'});
});
