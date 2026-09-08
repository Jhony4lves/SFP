const {test,expect}=require('@playwright/test');
const {fixture,writeIndexedDB}=require('./helpers');

async function boot(page,name='OCR AI contextual'){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
  await writeIndexedDB(page,fixture(name));
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
  await page.waitForFunction(()=>window.SFPInvoiceImageAIValidator&&window.__SFP_INVOICE_IMAGE_AI_VALIDATOR_INSTALLED===true&&window.__SFP_IMAGE_AI_IMPORT_KEY_GUARD_INSTALLED===true);
}

function splitAmazonOcr(){
  const lines=[
    {text:'Itaú Click',left:40,top:40,right:250,bottom:75},
    {text:'Fatura atual',left:40,top:100,right:280,bottom:135},
    {text:'R$ 39,90',left:40,top:150,right:220,bottom:190},
    {text:'Vencimento 10/09/2026',left:40,top:220,right:420,bottom:255},
    {text:'AMAZON',left:40,top:430,right:250,bottom:465},
    {text:'pedido 123456789 cliente@email.com',left:40,top:480,right:500,bottom:515},
    {text:'03/09/2026',left:40,top:600,right:250,bottom:635},
    {text:'BR',left:40,top:650,right:180,bottom:685},
    {text:'R$ 39,90',left:760,top:650,right:1000,bottom:685}
  ];
  return JSON.stringify({ok:true,text:lines.map(line=>line.text).join('\n'),width:1080,height:1200,engine:'mlkit-latin-bundled',lines});
}

function groqResponse({description='AMAZON BR',confidence=.98,action='reconstruct'}={}){
  return JSON.stringify({
    choices:[{message:{content:JSON.stringify({
      rows:[{index:0,action,description,confidence,evidence:['AMAZON','BR'],date:'1999-01-01',amount:9999}],
      warnings:[]
    })}}]
  });
}

test('IA contextual reconstrói AMAZON BR sem tocar em data/valor, sanitiza payload e preserva idempotência sem IA',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async({ocr,groq})=>{
    state.cards=[{...state.cards[0],id:2,name:'Itaú Click',limit:2000,closeDay:2,dueDay:10,history:[]}];
    state.purchases=[];state.invoices=[];state.invoiceImports=[];state.invoiceAdjustments=[];
    renderSelects();renderCards();
    document.querySelector('#cardImportCard').value='2';document.querySelector('#cardImportMonth').value='2026-09';
    let captured=null,aiEnabled=true;
    window.AndroidBridge={
      extractImageText:()=>ocr,
      hasSophyApiKey:()=>aiEnabled,
      callSophyGroq:payload=>{captured=JSON.parse(payload);return groq;}
    };
    await importCardFiles([new File(['imagem'],'amazon-cortada.png',{type:'image/png'})]);
    const first={
      desc:cardImportDraft.rows[0]?.desc,
      raw:cardImportDraft.rows[0]?.ocrRawDescription,
      amount:cardImportDraft.rows[0]?.amount,
      date:cardImportDraft.rows[0]?.date,
      reconstructed:cardImportDraft.meta?.aiDescriptionValidation?.reconstructed,
      validation:document.querySelector('#cardImportValidation').textContent,
      payload:JSON.stringify(captured),
      importKey:cardImportDraft.rows[0]?.importKey
    };
    await confirmCardImport();
    const afterFirst={count:state.purchases.length,desc:state.purchases[0]?.desc,key:state.purchases[0]?.invoiceImportKey};
    aiEnabled=false;
    await importCardFiles([new File(['imagem'],'amazon-cortada.png',{type:'image/png'})]);
    const second={desc:cardImportDraft.rows[0]?.desc,duplicate:cardImportDraft.rows[0]?.duplicate,importKey:cardImportDraft.rows[0]?.importKey};
    await confirmCardImport();
    return{first,afterFirst,second,afterSecond:state.purchases.length};
  },{ocr:splitAmazonOcr(),groq:groqResponse()});

  expect(result.first.desc).toBe('AMAZON BR');
  expect(result.first.raw).toBe('BR');
  expect(result.first.amount).toBe(39.9);
  expect(result.first.date).toBe('2026-09-03');
  expect(result.first.reconstructed).toBe(1);
  expect(result.first.validation).toContain('IA validadora reconstruiu 1');
  expect(result.first.payload).toContain('AMAZON');
  expect(result.first.payload).toContain('BR');
  expect(result.first.payload).not.toContain('39,90');
  expect(result.first.payload).not.toContain('123456789');
  expect(result.first.payload).not.toContain('cliente@email.com');
  expect(result.afterFirst).toMatchObject({count:1,desc:'AMAZON BR'});
  expect(result.second.desc).toBe('BR');
  expect(result.second.duplicate).toBe(true);
  expect(result.second.importKey).toBe(result.first.importKey);
  expect(result.afterFirst.key).toBe(result.first.importKey);
  expect(result.afterSecond).toBe(1);
});

test('alucinação sem evidência OCR é rejeitada e âncoras financeiras permanecem locais',async({page})=>{
  await boot(page,'OCR AI anti-alucinação');
  const result=await page.evaluate(groq=>{
    const input=[{width:1080,height:1000,lines:[
      {text:'03/09/2026',left:40,top:500,right:230,bottom:535,page:0},
      {text:'BR',left:40,top:650,right:160,bottom:685,page:0},
      {text:'R$ 39,90',left:760,top:650,right:1000,bottom:685,page:0}
    ]}];
    window.AndroidBridge={hasSophyApiKey:()=>true,callSophyGroq:()=>groq};
    const parsed=window.SFPInvoiceImageEngine.parse(input,{month:'2026-09'});
    return{row:parsed.rows[0],meta:parsed.meta.aiDescriptionValidation};
  },groqResponse());
  expect(result.row.desc).toBe('BR');
  expect(result.row.amount).toBe(39.9);
  expect(result.row.date).toBe('2026-09-03');
  expect(result.row.descriptionValidation.status).toBe('rejected');
  expect(result.meta.rejected).toBe(1);
});

test('validador aceita reconstrução UBER + DO BRASIL LTDA somente quando o token UBER existe no contexto',async({page})=>{
  await boot(page,'OCR AI Uber');
  const support=await page.evaluate(()=>({
    valid:SFPInvoiceImageAIValidator.proposalSupported('UBER DO BRASIL LTDA','DO BRASIL LTDA',[{text:'UBER'}]),
    invalid:SFPInvoiceImageAIValidator.proposalSupported('UBER DO BRASIL LTDA','DO BRASIL LTDA',[{text:'OUTRA EMPRESA'}])
  }));
  expect(support.valid).toBe(true);
  expect(support.invalid).toBe(false);
});
