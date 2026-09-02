const { test, expect }=require('@playwright/test');
const fs=require('fs');
const { fixture, expectBootComplete }=require('./helpers');

async function boot(page,width=390,height=844){
  await page.setViewportSize({width,height});
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
}

test('PHYS-143 Groq: migração falha sem destruir cópia recuperável',()=>{
  const bridge=fs.readFileSync('app/src/main/java/com/jhony/sfp/AndroidBridge.java','utf8');
  expect(bridge).toContain('stageLegacyApiKeyForRetry');
  expect(bridge).toContain('.putString(LEGACY_KEY_GROQ_SECRET, rawKey.trim())');
  expect(bridge).toContain('if (encryptAndSaveApiKey(trimmed))');
  expect(bridge).toContain('vaultPrefs.edit().remove(LEGACY_KEY_GROQ_SECRET).commit()');
});

test('PHYS-144 Android picker: OFX/CSV usam seletor amplo sem filtro MIME destrutivo',()=>{
  const activity=fs.readFileSync('app/src/main/java/com/jhony/sfp/MainActivity.java','utf8');
  expect(activity).toContain('requiresBroadFinancialPicker');
  expect(activity).toContain('type.equals(".ofx")');
  expect(activity).toContain('type.equals(".csv")');
  const broadStart=activity.indexOf('if (broadFinancialPicker) {');
  const broadEnd=activity.indexOf('} else if (acceptedMimeTypes.length == 1)',broadStart);
  expect(broadStart).toBeGreaterThanOrEqual(0);
  expect(broadEnd).toBeGreaterThan(broadStart);
  const broadBranch=activity.slice(broadStart,broadEnd);
  expect(broadBranch).toContain('intent.setType("*/*");');
  expect(broadBranch).not.toContain('EXTRA_MIME_TYPES');
});

test('PHYS-145 Três visões: rótulo, moeda e resumo não colidem no Galaxy S24',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    setPage('dashboard',{mode:'replace'});
    document.querySelector('#dashCashNet').textContent='R$ 90,51';
    document.querySelector('#dashCashSummary').textContent='Entradas R$ 178,26 · Saídas R$ 87,75';
    document.querySelector('#dashAccrualNet').textContent='-R$ 356,72';
    document.querySelector('#dashAccrualSummary').textContent='Receitas R$ 178,26 · Gastos R$ 534,98';
    document.querySelector('#dashCommitView').textContent='R$ 447,29';
    document.querySelector('#dashCommitViewSub').textContent='2 itens ainda exigem pagamento';
  });
  for(const card of await page.locator('#dashboard .sfp-view-card').all()){
    const info=await card.evaluate(el=>{
      const label=el.querySelector('small').getBoundingClientRect();
      const value=el.querySelector('strong').getBoundingClientRect();
      const summary=el.querySelector('span').getBoundingClientRect();
      const cs=getComputedStyle(el.querySelector('strong'));
      return {labelBottom:label.bottom,valueTop:value.top,valueBottom:value.bottom,summaryTop:summary.top,nowrap:cs.whiteSpace,left:value.left,right:value.right,vw:innerWidth};
    });
    expect(info.valueTop).toBeGreaterThanOrEqual(info.labelBottom-1);
    expect(info.summaryTop).toBeGreaterThanOrEqual(info.valueBottom-1);
    expect(info.nowrap).toBe('nowrap');
    expect(info.left).toBeGreaterThanOrEqual(-1);
    expect(info.right).toBeLessThanOrEqual(info.vw+1);
  }
});

test('PHYS-146 abrir select não altera scroll e não anima menu no mobile',async({page})=>{
  await boot(page);
  await page.evaluate(()=>setPage('lancamentos',{mode:'replace'}));
  const button=page.locator('.sfp-select[data-for-select="txCategory"] .sfp-select-button');
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(()=>window.scrollBy(0,-80));
  const before=await page.evaluate(()=>scrollY);
  await button.click();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const after=await page.evaluate(()=>scrollY);
  expect(Math.abs(after-before)).toBeLessThanOrEqual(1);
  const menu=page.locator('.sfp-select[data-for-select="txCategory"] .sfp-select-menu:not([hidden])');
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(el=>el.getAnimations().length)).toBe(0);
});

test('PHYS-146 fatura contém gesto horizontal e não cria largura rolável',async({page})=>{
  await boot(page);
  const value=fixture('Fatura física');
  value.mesAtual='2026-09';
  value.ui.invoiceMonthByCard={1:'2026-09'};
  value.purchases=[{id:9001,cardId:1,desc:'Compra QA física com descrição comprida',total:252.48,installments:1,firstMonth:'2026-09',purchaseDate:'2026-09-01',category:'Outros',status:'active',refunds:[]}];
  await page.evaluate(v=>{state=v;normalize();lastSavedState=clone(state);renderAll();setPage('cartoes',{mode:'replace'});openInvoiceDetail(1);},value);
  const focus=page.locator('#modalRoot .invoice-focus');
  await expect(focus).toBeVisible();
  const geometry=await focus.evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,overflowX:getComputedStyle(el).overflowX,touchAction:getComputedStyle(el).touchAction,doc:document.documentElement.scrollWidth,vw:innerWidth}));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
  expect(geometry.doc).toBeLessThanOrEqual(geometry.vw+2);
  expect(geometry.touchAction).toContain('pan-y');
  expect(['clip','hidden']).toContain(geometry.overflowX);
});
