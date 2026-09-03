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

function itauCarouselOcrResult(){
  const lines=[
    {text:'Itaú Click M ••••6442',left:40,top:40,right:400,bottom:75},
    {text:'Ago',left:80,top:120,right:150,bottom:155},{text:'Set',left:450,top:120,right:520,bottom:155},{text:'Out',left:800,top:120,right:870,bottom:155},
    {text:'R$ 74,25',left:55,top:170,right:180,bottom:205},{text:'R$ 194,81',left:420,top:170,right:560,bottom:205},{text:'R$ 180,82',left:770,top:170,right:910,bottom:205},
    {text:'29 de agosto',left:40,top:360,right:260,bottom:395},{text:'LADY DAY',left:40,top:430,right:300,bottom:465},{text:'R$ 13,98',left:800,top:430,right:1000,bottom:465},
    {text:'10 de agosto',left:40,top:560,right:260,bottom:595},{text:'Pagamento pix',left:40,top:630,right:300,bottom:665},{text:'-R$ 74,25',left:800,top:630,right:1000,bottom:665},
    {text:'LITE VIVO',left:40,top:800,right:300,bottom:835},{text:'R$ 40,00',left:800,top:800,right:1000,bottom:835},{text:'Parcela 1 de 12',left:40,top:850,right:300,bottom:885},
    {text:'4 de agosto',left:40,top:1010,right:260,bottom:1045},{text:'PLAZA NITEROI',left:40,top:1080,right:320,bottom:1115},{text:'R$ 66,64',left:800,top:1080,right:1000,bottom:1115},{text:'Parcela 1 de 3',left:40,top:1130,right:300,bottom:1165},
    {text:'28 de julho',left:40,top:1280,right:260,bottom:1315},{text:'MERCADO LIVRE',left:40,top:1350,right:340,bottom:1385},{text:'R$ 19,29',left:800,top:1350,right:1000,bottom:1385},{text:'Parcela 2 de 10',left:40,top:1400,right:300,bottom:1435},
    {text:'6 de julho',left:40,top:1550,right:260,bottom:1585},{text:'AMAZON BR',left:40,top:1620,right:300,bottom:1655},{text:'R$ 54,90',left:800,top:1620,right:1000,bottom:1655},{text:'Parcela 2 de 10',left:40,top:1670,right:300,bottom:1705}
  ];
  return JSON.stringify({ok:true,text:lines.map(line=>line.text).join('\n'),width:1080,height:1900,engine:'mlkit-latin-bundled',lines});
}

test('seletor de fatura aceita imagens e várias capturas',async({page})=>{
  await boot(page);
  const input=page.locator('#cardImportFile');
  await expect(input).toHaveAttribute('multiple','');
  const accept=await input.getAttribute('accept');
  expect(accept).toContain('.jpg');expect(accept).toContain('.png');expect(accept).toContain('.webp');
});

test('carrossel Itaú usa Set como total de setembro e nunca vira lançamento',async({page})=>{
  await boot(page);
  const preview=await page.evaluate(async raw=>{
    state.cards=[{...state.cards[0],id:2,name:'Itaú Click',limit:2040,closeDay:2,dueDay:10,history:[]}];state.purchases=[];state.invoices=[];state.invoiceImports=[];state.invoiceAdjustments=[];
    renderSelects();renderCards();document.querySelector('#cardImportCard').value='2';document.querySelector('#cardImportMonth').value='2026-08';
    window.AndroidBridge={extractImageText:()=>raw};await importCardFiles([new File(['imagem'],'fatura-setembro.png',{type:'image/png'})]);
    return{month:cardImportDraft.month,total:cardImportDraft.meta.officialTotal,invoiceMonth:cardImportDraft.meta.invoiceMonth,status:cardImportDraft.integrity.status,payments:cardImportDraft.integrity.payments,rows:cardImportDraft.rows.map(row=>({date:row.date,desc:row.desc,amount:row.amount,kind:row.kind})),target:document.querySelector('#cardImportTarget').textContent,disabled:document.querySelector('#cardImportConfirm').disabled};
  },itauCarouselOcrResult());
  expect(preview).toMatchObject({month:'2026-09',invoiceMonth:'2026-09',total:194.81,status:'verified',payments:1,disabled:false});
  expect(preview.rows).toHaveLength(5);expect(preview.rows.map(row=>row.amount)).toEqual([13.98,40,66.64,19.29,54.9]);expect(preview.rows.every(row=>row.kind==='purchase')).toBe(true);
  expect(preview.rows.some(row=>/ago set out/i.test(row.desc))).toBe(false);expect(preview.rows[1].date).toBe('2026-08-10');expect(preview.target).toContain('Setembro de 2026');
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
    {desc:'AMAZON BR',amount:54.9,duplicate:false,documentInstallment:{installment:1,installments:10,projection:'estimated-current-value'}},
    {desc:'MERCADO*MERCAD outros LIMEIRA',amount:19.35,duplicate:false,documentInstallment:undefined}
  ]);
  expect(preview.target).toContain('Itaú Click');expect(preview.target).toContain('Agosto de 2026');
  expect(preview.validation).toContain('OCR local no aparelho');expect(preview.validation).toContain('Confira visualmente');

  const persisted=await page.evaluate(async()=>{
    await confirmCardImport();
    const inv=state.invoices.find(invoice=>invoice.cardId===2&&invoice.month==='2026-08');
    const amazon=state.purchases.find(p=>p.desc==='AMAZON BR');
    return{purchases:state.purchases.map(p=>({desc:p.desc,total:p.total,installments:p.installments,source:p.importSource,note:p.note,projection:p.documentInstallment?.projection})),invoice:inv.officialTotal,source:state.invoiceImports[0].source,imports:state.invoiceImports.length,amazonFuture:{sep:invoiceCalculated(2,'2026-09'),oct:invoiceCalculated(2,'2026-10'),octPart:purchaseInstallment(amazon,'2026-10')}};
  });
  expect(persisted.invoice).toBe(74.25);expect(persisted.source).toBe('image-ocr');expect(persisted.imports).toBe(1);
  expect(persisted.purchases).toHaveLength(2);expect(persisted.purchases[0]).toMatchObject({desc:'AMAZON BR',total:549,installments:10,source:'image-ocr',projection:'estimated-current-value'});
  expect(persisted.amazonFuture.sep).toBe(54.9);expect(persisted.amazonFuture.oct).toBe(54.9);expect([persisted.amazonFuture.octPart.n,persisted.amazonFuture.octPart.total]).toEqual([3,10]);

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
    return{imageDuplicates,pdfDuplicates,count:state.purchases.length,imports:state.invoiceImports.length,amazon:{total:amazon.total,installments:amazon.installments,schedule:amazon.installmentSchedule,aliases:amazon.invoiceImportAliases||[],projection:amazon.documentInstallment?.projection,source:amazon.importSource}};
  },ocrResult());
  expect(reconciliation.imageDuplicates).toEqual([true,true]);
  expect(reconciliation.pdfDuplicates).toEqual([true,true]);
  expect(reconciliation.count).toBe(2);
  expect(reconciliation.amazon).toMatchObject({total:549,installments:10,projection:'document-verified',source:'image-ocr+document'});
  expect(reconciliation.amazon.schedule).toHaveLength(10);expect(reconciliation.amazon.aliases).toHaveLength(0);
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
