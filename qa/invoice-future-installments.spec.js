const {test,expect}=require('@playwright/test');
const {fixture,writeIndexedDB}=require('./helpers');

async function bootValue(page,value){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState&&typeof prepareCardImport==='function');
}

async function boot(page){
  await bootValue(page,fixture('Parcelas futuras de fatura'));
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

function legacyItauState(){
  const value=fixture('Parcelas antigas do Itaú');
  const payAccountId=value.accounts[0]?.id||null;
  value.mesAtual='2026-09';
  value.cards=[{id:2,name:'Itaú Click',limit:2090,closeDay:13,dueDay:20,payAccountId,history:[]}];
  value.purchases=[
    {id:201,cardId:2,desc:'Lite *vivoeasyanualsaopaulobra',total:40,installments:1,purchaseDate:'2026-08-10',firstMonth:'2026-09',category:'Assinaturas',status:'active',note:'Importado de captura de fatura após conferência local por OCR.',tags:['fatura-importada'],refunds:[],invoiceImportKey:'legacy-lite',invoiceImportAliases:[],importSource:'image-ocr',documentInstallment:{installment:1,installments:12,projection:'not-inferred'}},
    {id:202,cardId:2,desc:'00037 sh niteroi plazniteroibra',total:66.64,installments:1,purchaseDate:'2026-08-04',firstMonth:'2026-09',category:'Outros',status:'active',note:'Importado de captura de fatura após conferência local por OCR.',tags:['fatura-importada'],refunds:[],invoiceImportKey:'legacy-plaza',invoiceImportAliases:[],importSource:'image-ocr',documentInstallment:{installment:1,installments:3,projection:'not-inferred'}},
    {id:203,cardId:2,desc:'Mercado*mercadolivre limeirabra',total:19.29,installments:1,purchaseDate:'2026-07-28',firstMonth:'2026-09',category:'Outros',status:'active',note:'Importado de captura de fatura após conferência local por OCR.',tags:['fatura-importada'],refunds:[],invoiceImportKey:'legacy-mercado',invoiceImportAliases:[],importSource:'image-ocr',documentInstallment:{installment:2,installments:10,projection:'not-inferred'}},
    {id:204,cardId:2,desc:'Amazon br sao paulo bra',total:54.9,installments:1,purchaseDate:'2026-07-06',firstMonth:'2026-09',category:'Outros',status:'active',note:'Importado de captura de fatura após conferência local por OCR.',tags:['fatura-importada'],refunds:[],invoiceImportKey:'legacy-amazon',invoiceImportAliases:[],importSource:'image-ocr',documentInstallment:{installment:2,installments:10,projection:'not-inferred'}}
  ];
  value.invoices=[{id:301,cardId:2,month:'2026-09',status:'open',paidAmount:0,payments:[],officialTotal:222.38,officialTotalSource:'document'}];
  value.invoiceImports=[{id:401,cardId:2,card:'Itaú Click',month:'2026-09',file:'fatura-setembro.png',source:'image-ocr',count:7,purchases:7,payments:0,credits:0,duplicates:0,officialTotal:222.38,verificationStatus:'verified',importedAt:'2026-09-03T12:00:00.000Z'}];
  value.invoiceAdjustments=[];
  value.ui={...(value.ui||{}),invoiceMonthByCard:{2:'2026-09'},invoiceCardId:2};
  return value;
}

test('atualização promove parcelamentos legados no boot sem exigir reimportação',async({page})=>{
  await bootValue(page,legacyItauState());
  const first=await page.evaluate(()=>({
    next:invoiceTotal(2,'2026-10'),
    calculated:invoiceCalculated(2,'2026-10'),
    committed:cardOutstanding(2,new Date('2026-09-03T12:00:00')),
    purchases:state.purchases.map(p=>({id:p.id,total:p.total,installments:p.installments,firstMonth:p.firstMonth,schedule:p.installmentSchedule,documentInstallment:p.documentInstallment}))
  }));
  expect(first.next).toBe(180.83);
  expect(first.calculated).toBe(180.83);
  expect(first.committed).toBeGreaterThan(222.38);
  expect(first.purchases.map(p=>p.documentInstallment.projection)).toEqual(Array(4).fill('estimated-current-value'));
  expect(first.purchases.map(p=>p.installments)).toEqual([12,3,9,9]);
  expect(first.purchases[0].schedule).toEqual(Array(12).fill(40));
  expect(first.purchases[2].schedule).toEqual(Array(9).fill(19.29));

  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState&&typeof prepareCardImport==='function');
  const afterReload=await page.evaluate(()=>({next:invoiceTotal(2,'2026-10'),projections:state.purchases.map(p=>p.documentInstallment?.projection),installments:state.purchases.map(p=>p.installments)}));
  expect(afterReload).toEqual({next:180.83,projections:Array(4).fill('estimated-current-value'),installments:[12,3,9,9]});
});

test('reimportação também promove registro legado sem duplicar a compra',async({page})=>{
  await boot(page);await resetItau(page,'2026-09');
  const result=await page.evaluate(async meta=>{
    state.purchases=[{id:900,cardId:2,desc:'AMAZON BR',total:54.9,installments:1,purchaseDate:'2026-07-06',firstMonth:'2026-09',category:'Outros',status:'active',note:'Importado de fatura.',tags:['fatura-importada'],refunds:[],invoiceImportKey:'legacy-key',invoiceImportAliases:[],importSource:'pdf',documentInstallment:{installment:2,installments:10,projection:'not-inferred'}}];
    const rows=[{date:'2026-07-06',desc:'AMAZON BR',amount:54.9,invoiceKind:'purchase',installment:2,installments:10,currentChargeOnly:true}];
    prepareCardImport(rows,'itau-setembro.pdf',{documentType:'invoice',confidence:.99,signConvention:'debitPositive',signConfidence:.99,validator:'local'},meta);
    const duplicate=cardImportDraft.rows[0].duplicate;
    await confirmCardImport();
    const p=state.purchases[0];
    return{duplicate,count:state.purchases.length,total:p.total,installments:p.installments,firstMonth:p.firstMonth,projection:p.documentInstallment?.projection,next:invoiceCalculated(2,'2026-10')};
  },verifiedMeta({month:'2026-09'}));
  expect(result).toEqual({duplicate:true,count:1,total:494.1,installments:9,firstMonth:'2026-09',projection:'estimated-current-value',next:54.9});
});

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
