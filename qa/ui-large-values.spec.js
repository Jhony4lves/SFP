const { test, expect }=require('@playwright/test');
const { fixture, expectBootComplete }=require('./helpers');

function largeFixture(){
  const value=fixture('Fixture QA Valores Grandes');
  value.mesAtual='2026-01';
  value.accounts[0].initial=250000;
  value.cards[0]={...value.cards[0],name:'Cartão Internacional Platinum com nome muito comprido',limit:500000};
  value.transactions=[
    {id:7101,date:'2026-01-08',kind:'income',desc:'Receita extraordinária de valor muito alto',amount:101499.89,category:'Renda extra',accountId:1,status:'paid',balanceImpact:true,tags:[]},
    {id:7102,date:'2026-01-08',kind:'expense',desc:'Pagamento extraordinário de valor muito alto',amount:135802.45,category:'Casa',accountId:1,status:'paid',balanceImpact:true,tags:[]}
  ];
  value.purchases=[{id:7201,cardId:1,desc:'Compra extensa para estresse de fatura',total:135802.45,installments:1,firstMonth:'2026-01',purchaseDate:'2026-01-02',category:'Outros',status:'active',refunds:[]}];
  value.recurring=[{id:7301,desc:'Compromisso recorrente com origem extremamente longa para teste de layout',amount:12345.67,kind:'expense',type:'expense',category:'Casa',day:20,accountId:1,start:'2026-01',end:'',active:true,skips:[]}];
  value.ui.invoiceMonthByCard={1:'2026-01'};
  return value;
}

async function boot(page,width,height){
  await page.setViewportSize({width,height});
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await page.evaluate(value=>{
    state=value;normalize();lastSavedState=clone(state);renderAll();
    window.sfpNavigation?.reset('hoje');setPage('hoje',{mode:'replace'});
  },largeFixture());
}

function viewportProblems(page,selector){
  return page.locator(selector).evaluateAll(els=>els.filter(el=>{
    const cs=getComputedStyle(el),r=el.getBoundingClientRect();
    return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0;
  }).map(el=>{const r=el.getBoundingClientRect();return {name:el.id||el.className||el.tagName,left:r.left,right:r.right,width:r.width,vw:innerWidth};}).filter(x=>x.left<-2||x.right>x.vw+2));
}

test('Calendário: valores de seis dígitos usam forma compacta visível e preservam valor exato',async({page})=>{
  await boot(page,320,700);
  await page.evaluate(()=>setPage('calendario',{mode:'replace'}));
  const day=page.locator('.day[aria-label*="Dia 8,"]').first();
  await expect(day).toHaveAttribute('aria-label',/R\$\s*101\.499,89/);
  await expect(day).toHaveAttribute('aria-label',/R\$\s*135\.802,45/);
  const flows=day.locator('.cal-flow');
  await expect(flows).toHaveCount(2);
  for(let i=0;i<2;i++){
    const flow=flows.nth(i);
    await expect(flow.locator('.cal-flow-compact')).toBeVisible();
    await expect(flow.locator('.cal-flow-full')).toBeHidden();
    expect(await flow.getAttribute('title')).toMatch(/R\$/);
  }
  expect(await viewportProblems(page,'.day,.cal-flow,.cal-flow-compact')).toEqual([]);
});

for(const width of [320,360,390,412]){
  test(`Fatura: painel progressivo cabe em ${width}px com valores grandes`,async({page})=>{
    await boot(page,width,800);
    await page.evaluate(()=>{setPage('cartoes',{mode:'replace'});openInvoiceDetail(1);});
    await expect(page.locator('#payInvoice')).toBeVisible();
    const problems=await viewportProblems(page,'#modalRoot .modal,#progressiveSlot,.invoice-focus,.invoice-focus .head,.invoice-focus .actions,#payInvoice,#closeInvoice,.sfp-invoice-v2,.sfp-invoice-v2-head');
    expect(problems,JSON.stringify(problems,null,2)).toEqual([]);
  });
}

test('Card V2 e Visão Geral: valores grandes não aumentam a largura do documento',async({page})=>{
  await boot(page,854,384);
  for(const pageId of ['hoje','visao']){
    await page.evaluate(id=>setPage(id,{mode:'replace'}),pageId);
    await page.waitForTimeout(60);
    const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
    expect(overflow,`${pageId} overflow=${overflow}`).toBeLessThanOrEqual(2);
  }
  expect(await viewportProblems(page,'.sfp-card-v2-main,.sfp-card-v2-stat,.sfp-view-grid,.sfp-view-card')).toEqual([]);
});

test('Safe Spend landscape: evento preserva descrição/origem inteira sem ellipsis',async({page})=>{
  await boot(page,854,384);
  await page.evaluate(()=>setPage('hoje',{mode:'replace'}));
  const event=page.locator('.safe-spend-event').filter({hasText:/Compromisso recorrente|R\$\s*12\.345,67/}).first();
  await expect(event).toBeVisible();
  const desc=event.locator('.safe-spend-event-desc');
  const info=await desc.evaluate(el=>({text:el.textContent,title:el.title,whiteSpace:getComputedStyle(el).whiteSpace,overflow:getComputedStyle(el).overflow,textOverflow:getComputedStyle(el).textOverflow}));
  expect(info.title).toBe(info.text);
  expect(info.whiteSpace).not.toBe('nowrap');
  expect(info.textOverflow).not.toBe('ellipsis');
  expect(info.text).toMatch(/R\$\s*12\.345,67/);
});
