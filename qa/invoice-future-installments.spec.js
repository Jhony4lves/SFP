const {test,expect}=require('@playwright/test');
const {fixture,writeIndexedDB}=require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
  await writeIndexedDB(page,fixture('Parcelas futuras de fatura'));
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState&&typeof prepareCardImport==='function');
}

function verifiedMeta({month='2026-08',source='pdf'}={}){
  return {
    source,
    profileId:'itau-card-v1',
    profileLabel:'Fatura Itaú',
    invoiceMonth:month,
    officialTotal:54.9,
    dueDate:`${month}-10`,
    integrity:{status:'verified',importAllowed:true,currentRows:1,payments:0,currentNet:54.9,reason:'Documento conferido.',checks:[]}
  };
}

async function resetItau(page,month='2026-08'){
  await page.evaluate(month=>{
    const payAccountId=state.accounts[0]?.id||null;
    state.cards=[{id:2,name:'Itaú Click',limit:2040,closeDay:2,dueDay:10,payAccountId,history:[]}];
    state.purchases=[];state.invoices=[];state.invoiceImports=[];state.invoiceAdjustments=[];
    state.ui.invoiceMonthByCard={2:month};
    renderSelects();renderCards();
    document.querySelector('#cardImportCard').value='2';
    document.querySelector('#cardImportMonth').value=month;
  },month);
}

test('fatura de agosto 1/10 projeta setembro e outubro sem tratá-los como zero',async({page})=>{
  await boot(page);await resetItau(page,'2026-08');
  const result=await page.evaluate(async meta=>{
    const rows=[{date:'2026-07-06',desc:'AMAZON BR',amount:54.9,invoiceKind:'purchase',installment:1,installments:10,currentChargeOnly:true}];
    prepareCardImport(rows,'itau-agosto.pdf',{documentType:'invoice',confidence:.99,signConvention:'debitPositive',signConfidence:.99,validator:'local'},meta);
    const preview={...cardImportDraft.rows[0],documentInstallment:{...cardImportDraft.rows[0].documentInstallment}};
    await confirmCardImport();
    const p=state.purchases[0],aug=purchaseInstallment(p,'2026-08'),sep=purchaseInstallment(p,'2026-09'),oct=purchaseInstallment(p,'2026-10');
    return{
      preview:{installments:preview.installments,total:preview.total,authoritative:preview.authoritativeInstallmentPlan,documentInstallment:preview.documentInstallment},
      purchase:{total:p.total,installments:p.installments,firstMonth:p.firstMonth,schedule:p.installmentSchedule,documentInstallment:p.documentInstallment},
      invoices:{aug:invoiceCalculated(2,'2026-08'),sep:invoiceCalculated(2,'2026-09'),oct:invoiceCalculated(2,'2026-10')},
      labels:{aug:[aug.n,aug.total],sep:[sep.n,sep.total],oct:[oct.n,oct.total]}
    };
  },verifiedMeta({month:'2026-08'}));
  expect(result.preview).toMatchObject({installments:10,total:549,authoritative:false,documentInstallment:{installment:1,installments:10,projection:'estimated-current-value'}});
  expect(result.purchase).toMatchObject({total:549,installments:10,firstMonth:'2026-08',documentInstallment:{installment:1,installments:10,projection:'estimated-current-value'}});
  expect(result.purchase.schedule).toHaveLength(10);
  expect(result.invoices).toEqual({aug:54.9,sep:54.9,oct:54.9});
  expect(result.labels).toEqual({aug:[1,10],sep:[2,10],oct:[3,10]});
});

test('importar a partir de 3/10 projeta apenas o restante e preserva a numeração documental',async({page})=>{
  await boot(page);await resetItau(page,'2026-10');
  const result=await page.evaluate(async meta=>{
    const rows=[{date:'2026-07-06',desc:'AMAZON BR',amount:54.9,invoiceKind:'purchase',installment:3,installments:10,currentChargeOnly:true}];
    prepareCardImport(rows,'itau-outubro.pdf',{documentType:'invoice',confidence:.99,signConvention:'debitPositive',signConfidence:.99,validator:'local'},meta);
    await confirmCardImport();
    const p=state.purchases[0],oct=purchaseInstallment(p,'2026-10'),nov=purchaseInstallment(p,'2026-11');
    return{
      purchase:{total:p.total,installments:p.installments,firstMonth:p.firstMonth,documentInstallment:p.documentInstallment},
      invoices:{aug:invoiceCalculated(2,'2026-08'),sep:invoiceCalculated(2,'2026-09'),oct:invoiceCalculated(2,'2026-10'),nov:invoiceCalculated(2,'2026-11')},
      labels:{oct:[oct.n,oct.total],nov:[nov.n,nov.total]}
    };
  },verifiedMeta({month:'2026-10'}));
  expect(result.purchase).toMatchObject({total:439.2,installments:8,firstMonth:'2026-10',documentInstallment:{installment:3,installments:10,projection:'estimated-current-value'}});
  expect(result.invoices).toEqual({aug:0,sep:0,oct:54.9,nov:54.9});
  expect(result.labels).toEqual({oct:[3,10],nov:[4,10]});
});

test('fatura seguinte refina a projeção existente sem duplicar a compra',async({page})=>{
  await boot(page);await resetItau(page,'2026-08');
  const result=await page.evaluate(async metas=>{
    const analysis={documentType:'invoice',confidence:.99,signConvention:'debitPositive',signConfidence:.99,validator:'local'};
    prepareCardImport([{date:'2026-07-06',desc:'AMAZON BR',amount:54.9,invoiceKind:'purchase',installment:1,installments:10,currentChargeOnly:true}],'itau-agosto.pdf',analysis,metas.aug);
    await confirmCardImport();
    document.querySelector('#cardImportCard').value='2';document.querySelector('#cardImportMonth').value='2026-09';
    prepareCardImport([{date:'2026-07-06',desc:'AMAZON BR',amount:55,invoiceKind:'purchase',installment:2,installments:10,currentChargeOnly:true}],'itau-setembro.pdf',analysis,metas.sep);
    const duplicate=cardImportDraft.rows[0].duplicate;
    await confirmCardImport();
    const p=state.purchases[0];
    return{
      duplicate,count:state.purchases.length,imports:state.invoiceImports.length,aliases:p.invoiceImportAliases||[],
      schedule:p.installmentSchedule,total:p.total,projection:p.documentInstallment?.projection,
      invoices:{aug:invoiceCalculated(2,'2026-08'),sep:invoiceCalculated(2,'2026-09'),oct:invoiceCalculated(2,'2026-10')}
    };
  },{aug:verifiedMeta({month:'2026-08'}),sep:{...verifiedMeta({month:'2026-09'}),officialTotal:55,integrity:{status:'verified',importAllowed:true,currentRows:1,payments:0,currentNet:55,reason:'Documento conferido.',checks:[]}}});
  expect(result.duplicate).toBe(true);
  expect(result.count).toBe(1);
  expect(result.imports).toBe(2);
  expect(result.aliases).toHaveLength(1);
  expect(result.schedule[0]).toBe(54.9);
  expect(result.schedule.slice(1)).toEqual(Array(9).fill(55));
  expect(result.total).toBe(549.9);
  expect(result.projection).toBe('estimated-current-value');
  expect(result.invoices).toEqual({aug:54.9,sep:55,oct:55});
});
