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
