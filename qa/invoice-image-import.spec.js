const {test,expect}=require('@playwright/test');
const {fixture,writeIndexedDB}=require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
  await writeIndexedDB(page,fixture('Importação de captura de fatura'));
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
}

function ocrResult({complete=true}={}){
  const lines=[
    {text:'Itaú',left:40,top:40,right:200,bottom:80},
    {text:'Fatura atual',left:40,top:120,right:300,bottom:160},
    {text:'R$ 74,25',left:40,top:175,right:250,bottom:225},
    {text:'Vencimento 10/08/2026',left:40,top:250,right:450,bottom:290},
    {text:'AMAZON BR 01/10',left:40,top:500,right:500,bottom:545},
    {text:'- R$ 54,90',left:730,top:500,right:1000,bottom:545},
    {text:'06/07/2026',left:40,top:555,right:260,bottom:590}
  ];
  if(complete)lines.push(
    {text:'MERCADO*MERCAD outros LIMEIRA',left:40,top:760,right:650,bottom:805},
    {text:'- R$ 19,35',left:730,top:760,right:1000,bottom:805},
    {text:'28/07/2026',left:40,top:815,right:260,bottom:850}
  );
  return JSON.stringify({ok:true,text:lines.map(line=>line.text).join('\n'),width:1080,height:2200,engine:'mlkit-latin-bundled',lines});
}

test('seletor de fatura aceita imagens e várias capturas',async({page})=>{
  await boot(page);
  const input=page.locator('#cardImportFile');
  await expect(input).toHaveAttribute('multiple','');
  const accept=await input.getAttribute('accept');
  expect(accept).toContain('.jpg');expect(accept).toContain('.png');expect(accept).toContain('.webp');
});

test('captura Itaú passa por OCR local, escolhe destino e importa somente após conferência',async({page})=>{
  await boot(page);
  const preview=await page.evaluate(async raw=>{
    const payAccountId=state.accounts[0]?.id||null;
    state.cards=[
      {...state.cards[0],id:1,name:'Nubank'},
      {id:2,name:'Itaú Click',limit:2040,closeDay:2,dueDay:10,payAccountId,history:[]}
    ];
    state.purchases=[];state.invoices=[];state.invoiceImports=[];state.invoiceAdjustments=[];
    state.ui.invoiceMonthByCard={1:'2026-09',2:'2026-09'};renderSelects();renderCards();
    document.querySelector('#cardImportCard').value='1';document.querySelector('#cardImportMonth').value='2026-09';
    window.AndroidBridge={extractImageText:()=>raw};
    await importCardFiles([new File(['imagem'],'fatura-aberta.png',{type:'image/png'})]);
    return{
      card:cardImportDraft.cardId,month:cardImportDraft.month,rows:cardImportDraft.rows.map(row=>({desc:row.desc,amount:row.amount,duplicate:row.duplicate,documentInstallment:row.documentInstallment})),
      source:cardImportDraft.meta.source,integrity:cardImportDraft.integrity,target:document.querySelector('#cardImportTarget').textContent,validation:document.querySelector('#cardImportValidation').textContent,button:document.querySelector('#cardImportConfirm').textContent,disabled:document.querySelector('#cardImportConfirm').disabled
    };
  },ocrResult());
  expect(preview).toMatchObject({card:2,month:'2026-08',source:'image-ocr',button:'Conferi e importar',disabled:false});
  expect(preview.integrity).toMatchObject({status:'verified',importAllowed:true,currentNet:74.25});
  expect(preview.rows).toEqual([
    {desc:'AMAZON BR',amount:54.9,duplicate:false,documentInstallment:{installment:1,installments:10,projection:'not-inferred'}},
    {desc:'MERCADO*MERCAD outros LIMEIRA',amount:19.35,duplicate:false,documentInstallment:undefined}
  ]);
  expect(preview.target).toContain('Itaú Click');expect(preview.target).toContain('Agosto de 2026');
  expect(preview.validation).toContain('OCR local no aparelho');expect(preview.validation).toContain('Confira visualmente');

  const persisted=await page.evaluate(async()=>{
    await confirmCardImport();
    const inv=state.invoices.find(invoice=>invoice.cardId===2&&invoice.month==='2026-08');
    return{purchases:state.purchases.map(p=>({desc:p.desc,total:p.total,installments:p.installments,source:p.importSource,note:p.note})),invoice:inv.officialTotal,source:state.invoiceImports[0].source,imports:state.invoiceImports.length};
  });
  expect(persisted.invoice).toBe(74.25);expect(persisted.source).toBe('image-ocr');expect(persisted.imports).toBe(1);
  expect(persisted.purchases).toHaveLength(2);expect(persisted.purchases[0]).toMatchObject({desc:'AMAZON BR',total:54.9,installments:1,source:'image-ocr'});

  const reconciliation=await page.evaluate(async raw=>{
    await importCardFiles([new File(['imagem'],'fatura-aberta.png',{type:'image/png'})]);
    const imageDuplicates=cardImportDraft.rows.map(row=>row.duplicate);await confirmCardImport();
    const schedule=[54.9,54.9,54.9,54.9,54.9,54.9,54.9,54.9,54.9,54.9];
    const rows=[
      {date:'2026-07-06',desc:'AMAZON BR',amount:54.9,invoiceKind:'purchase',installment:1,installments:10,installmentSchedule:schedule,authoritativeInstallmentPlan:true},
      {date:'2026-07-28',desc:'MERCADO*MERCAD outros LIMEIRA',amount:19.35,invoiceKind:'purchase'}
    ];
    const integrity={status:'verified',importAllowed:true,currentRows:2,payments:0,currentNet:74.25,reason:'Documento conferido.',checks:[]};
    prepareCardImport(rows,'fatura-fechada.pdf',{documentType:'invoice',confidence:.99,signConvention:'debitPositive',signConfidence:.99,validator:'local'},{source:'pdf',profileId:'itau-card-v1',profileLabel:'Fatura Itaú',officialTotal:74.25,dueDate:'2026-08-10',integrity});
    const pdfDuplicates=cardImportDraft.rows.map(row=>row.duplicate);await confirmCardImport();
    const amazon=state.purchases.find(p=>p.desc==='AMAZON BR');
    return{imageDuplicates,pdfDuplicates,count:state.purchases.length,imports:state.invoiceImports.length,amazon:{total:amazon.total,installments:amazon.installments,schedule:amazon.installmentSchedule,aliases:amazon.invoiceImportAliases,projection:amazon.documentInstallment?.projection,source:amazon.importSource}};
  },ocrResult());
  expect(reconciliation.imageDuplicates).toEqual([true,true]);
  expect(reconciliation.pdfDuplicates).toEqual([true,true]);
  expect(reconciliation.count).toBe(2);
  expect(reconciliation.amazon).toMatchObject({total:549,installments:10,projection:'document-verified',source:'image-ocr+document'});
  expect(reconciliation.amazon.schedule).toHaveLength(10);expect(reconciliation.amazon.aliases).toHaveLength(1);
});

test('captura incompleta falha fechada e não grava dinheiro',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async raw=>{
    state.cards[0].name='Itaú Click';state.purchases=[];state.invoices=[];state.invoiceImports=[];state.invoiceAdjustments=[];renderSelects();renderCards();
    document.querySelector('#cardImportCard').value=String(state.cards[0].id);document.querySelector('#cardImportMonth').value='2026-08';
    window.AndroidBridge={extractImageText:()=>raw};
    const before=JSON.stringify({purchases:state.purchases,invoices:state.invoices,imports:state.invoiceImports,revision:state.persistenceMeta.revision});
    await importCardFiles([new File(['imagem'],'captura-incompleta.jpg',{type:'image/jpeg'})]);
    const preview={status:cardImportDraft.integrity.status,disabled:document.querySelector('#cardImportConfirm').disabled,reason:cardImportDraft.integrity.reason};
    await confirmCardImport();
    return{before,after:JSON.stringify({purchases:state.purchases,invoices:state.invoices,imports:state.invoiceImports,revision:state.persistenceMeta.revision}),preview};
  },ocrResult({complete:false}));
  expect(result.preview.status).toBe('blocked');expect(result.preview.disabled).toBe(true);expect(result.preview.reason).toContain('fatura inteira');expect(result.after).toBe(result.before);
});
