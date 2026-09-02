const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

async function boot(page, width=390, height=844){
  await page.setViewportSize({ width, height });
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
}

function luminance([r,g,b]){
  const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
function rgb(value){
  const m=String(value).match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
  return m?[Number(m[1]),Number(m[2]),Number(m[3])]:null;
}
function contrast(a,b){
  const l1=luminance(a),l2=luminance(b);
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}

for(const vp of [
  {name:'mobile-320',width:320,height:700},
  {name:'mobile-360',width:360,height:800},
  {name:'mobile-384',width:384,height:824},
  {name:'mobile-412',width:412,height:915},
]){
  test(`${vp.name}: controles funcionais não escapam do viewport`, async ({page})=>{
    await boot(page,vp.width,vp.height);
    const pages=['hoje','dashboard','lancamentos','contas','cartoes','calendario','sophy'];
    const problems=[];
    for(const pageId of pages){
      await page.evaluate(id=>window.setPage(id,{mode:'replace'}),pageId);
      await page.waitForTimeout(50);
      problems.push(...await page.evaluate(({pageId,vw})=>{
        const root=document.querySelector(`#${CSS.escape(pageId)}.tab.active`)||document.body;
        const out=[];
        const visible=el=>{const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};
        root.querySelectorAll('button,input,select,textarea,a,[role="button"],.sfp-select-button').forEach(el=>{
          if(!visible(el))return;
          const r=el.getBoundingClientRect();
          if(r.left<-2||r.right>vw+2)out.push(`${pageId}: ${(el.id&&'#'+el.id)||el.className||el.tagName} ${Math.round(r.left)}..${Math.round(r.right)} / ${vw}`);
        });
        return out;
      },{pageId,vw:vp.width}));
    }
    expect(problems,problems.join('\n')).toEqual([]);
  });
}

test('mobile: touch targets críticos respeitam 44px', async ({page})=>{
  await boot(page,390,844);
  const checks=[];
  async function collect(pageId, selector, requireWidth=false){
    await page.evaluate(id=>window.setPage(id,{mode:'replace'}),pageId);
    await page.waitForTimeout(40);
    const rows=await page.locator(selector).evaluateAll((els,requireWidth)=>els.map(el=>{
      const cs=getComputedStyle(el),r=el.getBoundingClientRect();
      return {text:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,40),display:cs.display,visibility:cs.visibility,width:r.width,height:r.height,requireWidth};
    }),requireWidth);
    checks.push(...rows.filter(x=>x.display!=='none'&&x.visibility!=='hidden'&&x.width>0&&x.height>0));
  }
  await collect('hoje','.month-nav-btn',true);
  await collect('dashboard','.period-selector button');
  await collect('sophy','.sophy-chip');
  await collect('sophy','.sophy-brief-actions button');
  await collect('hoje','.financial-insight-actions button');
  await collect('hoje','.safe-spend-foot button');
  for(const c of checks){
    expect(c.height,`${c.text} height=${c.height}`).toBeGreaterThanOrEqual(43.5);
    if(c.requireWidth)expect(c.width,`${c.text} width=${c.width}`).toBeGreaterThanOrEqual(43.5);
  }
});

test('mobile: busca, filtro e toast possuem semântica acessível e não colidem com bottom nav', async ({page})=>{
  await boot(page,360,800);
  await expect(page.locator('#globalSearch')).toHaveAttribute('aria-label',/Buscar/);
  await page.evaluate(()=>window.setPage('lancamentos',{mode:'replace'}));
  await expect(page.locator('#txSearch')).toHaveAttribute('aria-label',/Buscar lançamentos/);
  await expect(page.locator('#txFilter')).toHaveAttribute('aria-label',/Filtrar lançamentos/);
  await page.evaluate(()=>window.toast?.('Mensagem de QA para testar área segura.'));
  const toast=page.locator('#toast');
  await expect(toast).toHaveAttribute('role','status');
  await expect(toast).toHaveAttribute('aria-live','polite');
  const boxes=await page.evaluate(()=>{
    const t=document.getElementById('toast')?.getBoundingClientRect();
    const nav=document.querySelector('.sidebar')?.getBoundingClientRect();
    return {toast:t&&{top:t.top,bottom:t.bottom},nav:nav&&{top:nav.top,bottom:nav.bottom}};
  });
  expect(boxes.toast.bottom).toBeLessThanOrEqual(boxes.nav.top+1);
});

test('custom select: opções longas quebram linha e expõem conteúdo completo', async ({page})=>{
  await boot(page,320,700);
  await page.evaluate(()=>{window.setPage('contas',{mode:'replace'});window.openManagementAction('contas');});
  const button=page.locator('.sfp-select[data-for-select="accountType"] .sfp-select-button');
  await button.click();
  const option=page.locator('.sfp-select[data-for-select="accountType"] .sfp-select-option').first();
  await expect(option).toBeVisible();
  const style=await option.evaluate(el=>({whiteSpace:getComputedStyle(el).whiteSpace,wrap:getComputedStyle(el).overflowWrap,title:el.getAttribute('title')}));
  expect(style.whiteSpace).not.toBe('nowrap');
  expect(['anywhere','break-word']).toContain(style.wrap);
  expect(style.title).toBeTruthy();
});

test('light theme: superfícies críticas usam contraste legível', async ({page})=>{
  await boot(page,390,844);
  await page.evaluate(()=>{
    document.documentElement.dataset.theme='light';document.body.dataset.theme='light';
    const host=document.createElement('div');host.id='uiContrastContract';
    host.innerHTML='<div class="sfp-invoice-item">Texto financeiro</div><div class="sfp-drill-row">Detalhe financeiro</div><div class="sophy-brief-evidence"><span>Resumo Sophy</span></div>';
    document.body.appendChild(host);
  });
  for(const selector of ['#uiContrastContract .sfp-invoice-item','#uiContrastContract .sfp-drill-row','#uiContrastContract .sophy-brief-evidence span']){
    const computed=await page.locator(selector).evaluate(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
    const fg=rgb(computed.color),bg=rgb(computed.bg);
    expect(fg,`${selector} sem cor RGB`).toBeTruthy();
    expect(bg,`${selector} sem fundo RGB`).toBeTruthy();
    expect(contrast(fg,bg),`${selector} contraste ${computed.color} / ${computed.bg}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('microtexto funcional possui piso de 11px', async ({page})=>{
  await boot(page,390,844);
  await page.evaluate(()=>{
    const host=document.createElement('div');host.id='uiFontContract';
    host.innerHTML='<span class="sfp-invoice-chip">Parcela 1/12</span><div class="sfp-invoice-piece"><small>Parcelas</small><span>12 itens</span></div><div class="safe-spend-equation"><small>Disponível</small></div><span class="financial-insight-severity">Atenção</span><div class="sophy-brief-evidence"><span>Saldo</span></div>';
    document.body.appendChild(host);
  });
  const sizes=await page.locator('#uiFontContract *').evaluateAll(els=>els.filter(el=>(el.textContent||'').trim()).map(el=>({text:el.textContent.trim(),size:parseFloat(getComputedStyle(el).fontSize)})));
  for(const item of sizes)expect(item.size,`${item.text} font=${item.size}`).toBeGreaterThanOrEqual(11);
});

test('landscape baixo: brief da Sophy permanece disponível', async ({page})=>{
  await boot(page,740,360);
  await page.evaluate(()=>window.setPage('sophy',{mode:'replace'}));
  const brief=page.locator('#sophyProactiveBrief');
  await expect(brief).toBeVisible();
  const box=await brief.boundingBox();
  expect(box.height).toBeGreaterThan(0);
});
