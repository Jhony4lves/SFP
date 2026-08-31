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
