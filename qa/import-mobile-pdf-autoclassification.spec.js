const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
  const value=fixture('Importação RC3');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
}

test('inputs de extrato e fatura aceitam PDF',async({page})=>{
  await boot(page);
  expect(await page.locator('#stmtFile').getAttribute('accept')).toContain('.pdf');
  expect(await page.locator('#cardImportFile').getAttribute('accept')).toContain('.pdf');
});

test('PDF protegido pede senha local, permite nova tentativa e não persiste o segredo',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    window.pdfPasswordCalls=[];
    window.AndroidBridge={
      extractPdfText:()=>JSON.stringify({ok:false,passwordRequired:true,errorCode:'password_required',error:'Este PDF é protegido por senha.'}),
      extractPdfTextWithPassword:(_base64,password)=>{
        window.pdfPasswordCalls.push(password);
        if(password!=='senha-local-itau')return JSON.stringify({ok:false,passwordRequired:true,errorCode:'invalid_password',error:'Senha incorreta.'});
        return JSON.stringify({ok:true,pages:2,text:'31/08/2026 Compra validada R$ 25,00'});
      }
    };
    const file=new File(['pdf-protegido-sintetico'],'fatura-itau.pdf',{type:'application/pdf'});
    window.pdfPasswordResult=extractPdfTextLocal(file);
  });

  const input=page.locator('#dialogPromptInput');
  await expect(input).toHaveAttribute('type','password');
  await expect(input).toHaveAttribute('autocomplete','off');
  await expect(page.locator('#modalRoot')).toContainText('não será salva');
  await input.fill('senha-errada');
  await page.locator('#dialogConfirmBtn').click();

  await expect(page.locator('#modalRoot')).toContainText('Senha incorreta');
  await expect(page.locator('#dialogPromptInput')).toHaveValue('');
  await page.locator('#dialogPromptInput').fill('senha-local-itau');
  await page.locator('#dialogConfirmBtn').click();

  const result=await page.evaluate(async()=>{
    const text=await window.pdfPasswordResult;
    const calls=[...window.pdfPasswordCalls];
    delete window.pdfPasswordCalls;
    const persisted=JSON.stringify({state,local:{...localStorage},session:{...sessionStorage}});
    return {text,calls,persisted};
  });
  expect(result.text).toContain('Compra validada');
  expect(result.calls).toEqual(['senha-errada','senha-local-itau']);
  expect(result.persisted).not.toContain('senha-local-itau');
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
});

test('cancelar senha de PDF encerra a importação sem alterar a fatura',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    window.AndroidBridge={
      extractPdfText:()=>JSON.stringify({ok:false,passwordRequired:true,errorCode:'password_required'}),
      extractPdfTextWithPassword:()=>JSON.stringify({ok:false,passwordRequired:true,errorCode:'invalid_password'})
    };
    document.querySelector('#cardImportCard').value=String(state.cards[0].id);
    document.querySelector('#cardImportMonth').value='2026-09';
    window.pdfCancelBefore=JSON.stringify({purchases:state.purchases,invoices:state.invoices,imports:state.invoiceImports,revision:state.persistenceMeta.revision});
    window.pdfCancelResult=importCardCsv(new File(['pdf-protegido'],'fatura.pdf',{type:'application/pdf'}));
  });
  await expect(page.locator('#modalRoot')).toContainText('PDF protegido');
  await page.locator('#dialogCancelBtn').click();
  await page.evaluate(()=>window.pdfCancelResult);
  const result=await page.evaluate(()=>({before:window.pdfCancelBefore,after:JSON.stringify({purchases:state.purchases,invoices:state.invoices,imports:state.invoiceImports,revision:state.persistenceMeta.revision}),draft:cardImportDraft,toastVisible:document.querySelector('#toast').classList.contains('show')}));
  expect(result.after).toBe(result.before);
  expect(result.draft).toBeNull();
  expect(result.toastVisible).toBe(false);
});

test('parser local de PDF reconhece compra no débito e o classificador não exige revisão',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const rows=parsePdfFinancialText('01/08/2026 Compra no débito - SUPERMARKET 11,98\n02/08/2026 Compra no débito - JoseCarlosGanier 41,73',{intendedType:'statement',month:'2026-08'});
    const classified=rows.map(r=>({row:r,sem:semanticClassify(r.desc,r.amount)}));
    return {rows,classified,review:classified.map(x=>statementNeedsReview({...x.row,action:x.sem.action,category:x.sem.category,semanticClass:x.sem.semanticClass,economicImpact:x.sem.economicImpact,classificationConfidence:x.sem.confidence}))};
  });
  expect(result.rows.map(r=>r.amount)).toEqual([-11.98,-41.73]);
  expect(result.classified[0].sem).toMatchObject({action:'expense',category:'Alimentação',economicImpact:'economic'});
  expect(result.classified[1].sem).toMatchObject({action:'expense',economicImpact:'economic'});
  expect(result.review).toEqual([false,false]);
});

test('classificador reaproveita classificação manual anterior do mesmo estabelecimento',async({page})=>{
  await boot(page);
  const sem=await page.evaluate(()=>{
    state.transactions.push({id:99991,kind:'expense',desc:'Compra no débito - LOJA EXEMPLO',amount:20,date:'2026-07-10',category:'Lazer',accountId:1,economicImpact:'economic',semanticClass:'user_expense',classificationConfidence:1});
    return semanticClassify('Compra no débito - LOJA EXEMPLO FILIAL 2',-35);
  });
  expect(sem.action).toBe('expense');
  expect(sem.category).toBe('Lazer');
  expect(sem.semanticClass).toBe('historical_rule');
  expect(Number(sem.confidence)).toBeGreaterThanOrEqual(.9);
});

test('revisão de extrato vira cartões mobile sem arrastar a página para o lado',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  await page.evaluate(()=>{
    setPage('extratos');
    document.querySelector('#stmtAccount').value=String(state.accounts[0].id);
    prepareStatement([
      {date:'2026-08-01',desc:'Compra no débito - SUPERMARKET',amount:-11.98},
      {date:'2026-08-02',desc:'Compra no débito - JoseCarlosGanier',amount:-41.73}
    ],'teste.csv');
  });
  await expect(page.locator('#stmtMobile .stmt-review-card')).toHaveCount(2);
  await expect(page.locator('#stmtMobile')).toBeVisible();
  await expect(page.locator('#stmtReview .tablewrap')).toBeHidden();
  const overflow=await page.evaluate(()=>({review:document.querySelector('#stmtReview').scrollWidth-document.querySelector('#stmtReview').clientWidth,body:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
  expect(overflow.review).toBeLessThanOrEqual(2);
  expect(overflow.body).toBeLessThanOrEqual(2);
});


test('RC4 separa Valor de Saldo em extrato tabular e remove ID operacional da descrição',async({page})=>{
  await boot(page);
  const rows=await page.evaluate(()=>parsePdfFinancialText(`Data Descrição ID da operação Valor Saldo
07/08/2026 Pagamento Loja Exemplo 171601400157 R$ -28,00 R$ 1.068,67
08/08/2026 Pagamento Mercado Exemplo 171822116995 R$ -77,91 R$ 941,05`,{intendedType:'statement',month:'2026-08'}));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({date:'2026-08-07',desc:'Pagamento Loja Exemplo',amount:-28,fitid:'171601400157'});
  expect(rows[1]).toMatchObject({date:'2026-08-08',desc:'Pagamento Mercado Exemplo',amount:-77.91,fitid:'171822116995'});
  expect(rows.map(r=>r.amount)).not.toContain(1068.67);
  expect(rows.map(r=>r.amount)).not.toContain(941.05);
});

test('linhas de saldo são descartadas antes da revisão',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const parsed=parsePdfFinancialText(`Data Descrição ID da operação Valor Saldo
26/08/2026 SALDO DO DIA R$ -22,18
26/08/2026 Pagamento real 172000000001 R$ -22,18 R$ 100,00`,{intendedType:'statement',month:'2026-08'});
    document.querySelector('#stmtAccount').value=String(state.accounts[0].id);
    prepareStatement([...parsed,{date:'2026-08-26',desc:'Saldo atual',amount:100}], 'saldo.pdf');
    return {parsed,draft:statementDraft.map(r=>({desc:r.desc,amount:r.amount}))};
  });
  expect(result.parsed).toHaveLength(1);
  expect(result.parsed[0]).toMatchObject({desc:'Pagamento real',amount:-22.18});
  expect(result.draft).toEqual([{desc:'Pagamento real',amount:-22.18}]);
});

test('PDF extrai saldo final oficial sem transformar saldo em movimentação',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const text=`Período: 01/08/2026 a 31/08/2026\nSaldo inicial: R$ 100,00 Saldo final: R$ 699,98\n31/08/2026 Compra real 123456789012 R$ -25,00 R$ 699,98`;
    const rows=parsePdfFinancialText(text,{intendedType:'statement',month:'2026-08'});
    return {rows,meta:statementBalanceMeta(text,'pdf',rows)};
  });
  expect(result.rows).toHaveLength(1);
  expect(result.meta).toEqual({closingBalance:699.98,closingDate:'2026-08-31',source:'pdf'});
});

test('PDF de fatura extrai total, ciclo e limites sem transformar o resumo em compra',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const text=`Resumo da fatura
Total da fatura R$ 1.234,56
Vencimento 16/09/2026
Fechamento 09/09/2026
Pagamento mínimo R$ 185,18
Limite disponível R$ 765,44
Limite total R$ 2.000,00
31/08/2026 Compra real R$ 25,00`;
    const rows=parsePdfFinancialText(text,{intendedType:'invoice',month:'2026-09'});
    return {rows,meta:invoiceDocumentMeta(text,'pdf',rows,'2026-09')};
  });
  expect(result.rows).toEqual([{date:'2026-08-31',desc:'Compra real',amount:25,fitid:null}]);
  expect(result.meta).toEqual({source:'pdf',officialTotal:1234.56,minimumPayment:185.18,availableLimit:765.44,totalLimit:2000,dueDate:'2026-09-16',closingDate:'2026-09-09'});
});

test('fatura Itaú separa ciclo anterior, lançamentos atuais e parcelas futuras com prova contábil',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async()=>{
    const text=`Banco Itaú S.A.
Resumo da fatura em R$
Total da fatura anterior 537,16
Pagamento efetuado em 06/07/2026 -537,16
Saldo financiado 0,00
Lançamentos atuais 74,25
= Total desta fatura 74,25
Vencimento: 10/08/2026
O total da sua fatura é: R$ 74,25 Limite total de crédito: R$ 2.040,00
Pagamento mínimo: R$ 7,42
Pagamentos efetuados Encargos cobrados nesta fatura
DATA VALOR EM R$
06/07 PAGAMENTO -537,16
P Total dos pagamentos -537,16
Lançamentos: compras e saques
DATA ESTABELECIMENTO VALOR EM R$
06/07 AMAZON BR 01/10 54,90
28/07 MERCADO*MERCAD 01/10 19,35
outros LIMEIRA Juros e encargos financeiros até o momento 0,00
L Total dos lançamentos atuais 74,25
Compras parceladas - próximas faturas
DATA ESTABELECIMENTO VALOR EM R$
06/07 AMAZON BR 02/10 54,90
28/07 MERCADO*MERCAD 02/10 19,29
Próxima fatura 74,19
Total para próximas faturas 667,71
Limite disponível 1.298,04`;
    const parsed=parseInvoicePdfDocument(text,{month:'2026-08'});
    const payAccountId=state.accounts[0]?.id||null;
    state.cards=[
      {...state.cards[0],id:1,name:'Nubank'},
      {id:2,name:'Itaú',limit:2040,closeDay:2,dueDay:10,payAccountId,history:[]}
    ];
    state.purchases=[];state.invoices=[];state.invoiceImports=[];state.invoiceAdjustments=[];
    state.ui.invoiceMonthByCard={1:'2026-09',2:'2026-09'};renderSelects();renderCards();
    // Simula exatamente a falha física: cartão Nubank e setembro estavam
    // selecionados antes de abrir uma fatura Itaú com vencimento em agosto.
    document.querySelector('#cardImportCard').value='1';
    document.querySelector('#cardImportMonth').value='2026-09';
    const analysis={documentType:'invoice',confidence:.99,signConvention:'debitPositive',signConfidence:.99,validator:'local',warnings:[]};
    prepareCardImport(classifyInvoiceRows(parsed.rows,analysis),'fatura-itau.pdf',analysis,{...parsed.meta,profileId:parsed.profile.id,profileLabel:parsed.profile.label,integrity:parsed.integrity});
    const preview={
      profile:parsed.profile,
      meta:parsed.meta,
      integrity:parsed.integrity,
      rows:cardImportDraft.rows.map(row=>({desc:row.desc,kind:row.kind,amount:row.amount,total:row.total,installment:row.installment,installments:row.installments,schedule:row.installmentSchedule})),
      targetCardId:cardImportDraft.cardId,
      targetMonth:cardImportDraft.month,
      selectedCard:document.querySelector('#cardImportCard').value,
      selectedMonth:document.querySelector('#cardImportMonth').value,
      historyCard:document.querySelector('#cardHistorySelect').value,
      target:document.querySelector('#cardImportTarget').textContent,
      locked:document.querySelector('#cardImportCard').disabled&&document.querySelector('#cardImportMonth').disabled,
      blocked:document.querySelector('#cardImportConfirm').disabled,
      validation:document.querySelector('#cardImportValidation').textContent
    };
    await confirmCardImport();
    const current=state.invoices.find(invoice=>invoice.cardId===2&&invoice.month==='2026-08');
    return {...preview,persisted:{purchaseCards:state.purchases.map(purchase=>purchase.cardId),purchaseTotals:state.purchases.map(purchase=>purchase.total),august:invoiceCalculated(2,'2026-08'),september:invoiceCalculated(2,'2026-09'),official:current.officialTotal,paymentCount:state.invoices.flatMap(invoice=>invoice.payments||[]).length,wrongCardInvoices:state.invoices.filter(invoice=>invoice.cardId===1).length,importPayments:state.invoiceImports.at(-1).payments,profile:state.invoiceImports.at(-1).documentProfile,verification:state.invoiceImports.at(-1).verificationStatus,unlocked:!document.querySelector('#cardImportCard').disabled&&!document.querySelector('#cardImportMonth').disabled}};
  });
  expect(result.profile).toMatchObject({id:'itau-card-v1',confidence:.99});
  expect(result.meta).toMatchObject({officialTotal:74.25,previousInvoiceTotal:537.16,financedBalance:0,currentChargesTotal:74.25,futureInstallmentsTotal:667.71,nextInvoiceTotal:74.19,totalLimit:2040,dueDate:'2026-08-10'});
  expect(result.integrity).toMatchObject({status:'verified',importAllowed:true,currentRows:2,payments:1,futureRowsExcluded:2,currentNet:74.25});
  expect(result.rows.map(row=>({desc:row.desc,kind:row.kind,amount:row.amount}))).toEqual([
    {desc:'AMAZON BR',kind:'purchase',amount:54.9},
    {desc:'MERCADO*MERCAD outros LIMEIRA',kind:'purchase',amount:19.35}
  ]);
  expect(result.rows[0]).toMatchObject({total:549,installment:1,installments:10});
  expect(result.rows[1]).toMatchObject({total:192.96,installment:1,installments:10});
  expect(result.rows[1].schedule).toEqual([19.35,19.29,19.29,19.29,19.29,19.29,19.29,19.29,19.29,19.29]);
  expect(result).toMatchObject({targetCardId:2,targetMonth:'2026-08',selectedCard:'2',selectedMonth:'2026-08',historyCard:'2',locked:true});
  expect(result.target).toContain('Destino confirmado: Itaú');
  expect(result.target).toContain('Agosto de 2026');
  expect(result.blocked).toBe(false);
  expect(result.validation).toContain('Verificação contábil aprovada');
  expect(result.validation).toContain('pagamento(s) do ciclo anterior usado(s) somente na conferência');
  expect(result.persisted).toEqual({purchaseCards:[2,2],purchaseTotals:[549,192.96],august:74.25,september:74.19,official:74.25,paymentCount:0,wrongCardInvoices:0,importPayments:0,profile:'itau-card-v1',verification:'verified',unlocked:true});
});

test('fatura identificada não pode cair em cartão de outro emissor',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    state.cards=[{...state.cards[0],id:1,name:'Nubank'}];renderSelects();renderCards();
    document.querySelector('#cardImportCard').value='1';
    document.querySelector('#cardImportMonth').value='2026-09';
    let error='';
    try{
      prepareCardImport([{date:'2026-07-06',desc:'AMAZON BR',amount:54.9,invoiceKind:'purchase'}],'fatura-itau.pdf',{documentType:'invoice',confidence:.99,validator:'local'},{source:'pdf',profileId:'itau-card-v1',profileLabel:'Fatura Itaú',officialTotal:54.9,dueDate:'2026-08-10',integrity:{status:'verified',importAllowed:true,payments:0}});
    }catch(exception){error=exception.message}
    return{error,draft:cardImportDraft,month:document.querySelector('#cardImportMonth').value};
  });
  expect(result.error).toContain('fatura Itaú');
  expect(result.error).toContain('cartão selecionado é Nubank');
  expect(result.draft).toBeNull();
  expect(result.month).toBe('2026-09');
});

test('PDF com soma divergente fica bloqueado e não altera nenhum dado',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async()=>{
    const text=`Resumo da fatura
Total da fatura R$ 100,00
Vencimento 16/09/2026
Lançamentos: compras e saques
DATA ESTABELECIMENTO VALOR EM R$
31/08 Compra real 90,00
Total dos lançamentos atuais 90,00`;
    const parsed=parseInvoicePdfDocument(text,{month:'2026-09'});
    document.querySelector('#cardImportCard').value='1';
    document.querySelector('#cardImportMonth').value='2026-09';
    const analysis={documentType:'invoice',confidence:.9,signConvention:'debitPositive',signConfidence:.9,validator:'local',warnings:[]};
    prepareCardImport(classifyInvoiceRows(parsed.rows,analysis),'fatura-divergente.pdf',analysis,{...parsed.meta,profileId:parsed.profile.id,profileLabel:parsed.profile.label,integrity:parsed.integrity});
    const before=JSON.stringify({purchases:state.purchases,invoices:state.invoices,imports:state.invoiceImports});
    await confirmCardImport();
    return {integrity:parsed.integrity,disabled:document.querySelector('#cardImportConfirm').disabled,before,after:JSON.stringify({purchases:state.purchases,invoices:state.invoices,imports:state.invoiceImports})};
  });
  expect(result.integrity.status).toBe('blocked');
  expect(result.integrity.importAllowed).toBe(false);
  expect(result.integrity.checks).toEqual(expect.arrayContaining([expect.objectContaining({id:'official_total',status:'fail',actual:90,expected:100})]));
  expect(result.disabled).toBe(true);
  expect(result.after).toBe(result.before);
});

test('transferência não exibe categoria e receita usa apenas categorias de entrada',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  await page.evaluate(()=>{
    statementReviewMode='all';
    document.querySelector('#stmtAccount').value=String(state.accounts[0].id);
    prepareStatement([
      {date:'2026-08-17',desc:'PIX TRANSF CONTA PROPRIA',amount:-50},
      {date:'2026-08-21',desc:'SALARIO EMPRESA',amount:1000}
    ],'categorias.csv');
  });
  const cards=page.locator('#stmtMobile .stmt-review-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('[data-sc]')).toHaveCount(0);
  const incomeSelect=cards.nth(1).locator('[data-sc]');
  await expect(incomeSelect).toHaveCount(1);
  const labels=await incomeSelect.locator('option').allTextContents();
  expect(labels).toContain('Trabalho');
  expect(labels).toContain('Rendimentos');
  expect(labels).not.toContain('Faculdade');
  expect(labels).not.toContain('Saúde');
  expect(labels).not.toContain('Assinaturas');
  expect(labels).not.toContain('Dívida');
});
