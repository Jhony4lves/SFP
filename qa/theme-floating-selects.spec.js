const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

async function boot(page){
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
}

test.describe('Issue #32 floating selects and theme consistency',()=>{
  test('custom select stays anchored to its field while the page scrolls',async({page})=>{
    await boot(page);
    await page.evaluate(()=>window.setPage('lancamentos'));
    const button=page.locator('.sfp-select-button:visible').first();
    await expect(button).toBeVisible();
    await button.click();
    const menu=page.locator('.sfp-select-menu:not([hidden])');
    await expect(menu).toBeVisible();

    const relation=await page.evaluate(()=>{
      const host=document.querySelector('.sfp-select:has(.sfp-select-menu:not([hidden]))');
      const b=host?.querySelector('.sfp-select-button')?.getBoundingClientRect();
      const m=host?.querySelector('.sfp-select-menu:not([hidden])')?.getBoundingClientRect();
      return b&&m?{offset:m.top-b.bottom,menuLeft:m.left,buttonLeft:b.left,menuWidth:m.width,buttonWidth:b.width,menuRight:m.right,viewportWidth:innerWidth}:null;
    });
    expect(relation).not.toBeNull();
    expect(Math.abs(relation.menuLeft-relation.buttonLeft)).toBeLessThanOrEqual(2);
    expect(relation.menuWidth).toBeGreaterThan(40);
    expect(relation.menuRight).toBeLessThanOrEqual(relation.viewportWidth-7);

    const before=await button.boundingBox();
    await page.evaluate(()=>window.scrollBy(0,120));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const afterButton=await button.boundingBox();
    const afterMenu=await menu.boundingBox();
    expect(before).not.toBeNull();
    expect(afterButton).not.toBeNull();
    expect(afterMenu).not.toBeNull();
    const afterOffset=afterMenu.y-afterButton.y-afterButton.height;
    expect(Math.abs(afterOffset-relation.offset)).toBeLessThanOrEqual(2);
    expect(Math.abs(afterButton.y-before.y)).toBeGreaterThan(20);
  });

  test('portrait dropdown stays clear of bottom nav and keeps long options readable',async({page})=>{
    await boot(page);
    await page.evaluate(()=>{
      const main=document.querySelector('main');
      const wrap=document.createElement('div');
      wrap.id='qaDropdownProbe';
      wrap.style.cssText='margin-top:1000px;padding-bottom:300px';
      const select=document.createElement('select');
      select.id='qaDropdownSelect';
      for(const label of ['Todos','Receitas','Despesas','Transferências']){
        const option=document.createElement('option');
        option.value=label;
        option.textContent=label;
        select.appendChild(option);
      }
      wrap.appendChild(select);
      main.appendChild(wrap);
    });
    const button=page.locator('#qaDropdownSelect + .sfp-select .sfp-select-button');
    await expect(button).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    await page.evaluate(()=>window.scrollBy(0,100));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await button.click();
    const menu=page.locator('#qaDropdownSelect + .sfp-select .sfp-select-menu:not([hidden])');
    await expect(menu).toBeVisible();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));

    const geometry=await page.evaluate(()=>{
      const menu=document.querySelector('#qaDropdownSelect + .sfp-select .sfp-select-menu:not([hidden])');
      const nav=document.querySelector('.sidebar');
      const transfer=Array.from(menu?.querySelectorAll('.sfp-select-option')||[]).find(item=>item.textContent==='Transferências');
      const m=menu?.getBoundingClientRect(),n=nav?.getBoundingClientRect();
      return m&&n&&transfer?{
        menuBottom:m.bottom,
        menuLeft:m.left,
        menuRight:m.right,
        navTop:n.top,
        viewportWidth:innerWidth,
        optionScrollWidth:transfer.scrollWidth,
        optionClientWidth:transfer.clientWidth
      }:null;
    });
    expect(geometry).not.toBeNull();
    expect(geometry.menuBottom).toBeLessThanOrEqual(geometry.navTop-3);
    expect(geometry.menuLeft).toBeGreaterThanOrEqual(7);
    expect(geometry.menuRight).toBeLessThanOrEqual(geometry.viewportWidth-7);
    expect(geometry.optionScrollWidth).toBeLessThanOrEqual(geometry.optionClientWidth+1);
  });

  test('new financial surfaces use active light theme tokens instead of dark hardcoded colors',async({page})=>{
    await boot(page);
    await page.evaluate(()=>{
      window.applyTheme('light');
      window.renderFinancialInsights?.();
      window.renderSafeSpendProjection?.();
    });
    const audit=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement);
      const surface=root.getPropertyValue('--color-surface-1').trim();
      const elevated=root.getPropertyValue('--color-surface-elevated').trim();
      const bg=selector=>{
        const el=document.querySelector(selector);
        return el?getComputedStyle(el).backgroundColor:null;
      };
      const probe=document.createElement('div');
      probe.style.backgroundColor=surface;document.body.appendChild(probe);
      const surfaceRgb=getComputedStyle(probe).backgroundColor;
      probe.style.backgroundColor=elevated;
      const elevatedRgb=getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        theme:document.documentElement.dataset.theme,
        surfaceRgb,elevatedRgb,
        select:bg('.sfp-select-button'),
        insight:bg('.financial-insight'),
        safeHero:bg('.safe-spend-hero'),
        safeChart:bg('.safe-spend-chart')
      };
    });
    expect(audit.theme).toBe('light');
    expect(audit.select).toBe(audit.surfaceRgb);
    if(audit.insight) expect(audit.insight).toBe(audit.surfaceRgb);
    if(audit.safeHero) expect(audit.safeHero).toBe(audit.surfaceRgb);
    if(audit.safeChart) expect(audit.safeChart).toBe(audit.elevatedRgb);
    for(const value of [audit.select,audit.insight,audit.safeHero,audit.safeChart].filter(Boolean)){
      expect(value).not.toBe('rgb(7, 20, 35)');
      expect(value).not.toBe('rgb(8, 22, 38)');
    }
  });

  test('portrait bottom navigation prioritizes destinations and leaves creation to the FAB',async({page})=>{
    await boot(page);
    const visible=await page.locator('.sidebar .nav button:visible').evaluateAll(buttons=>buttons.map(button=>{
      const span=button.querySelector('span');
      const style=getComputedStyle(button),labelStyle=span?getComputedStyle(span):null;
      return {page:button.dataset.page||null,id:button.id||null,label:button.textContent.trim(),flexDirection:style.flexDirection,textOverflow:labelStyle?.textOverflow||null,whiteSpace:labelStyle?.whiteSpace||null,labelFits:span?span.scrollWidth<=span.clientWidth+1:true};
    }));
    expect(visible.map(item=>item.page||item.id)).toEqual(['hoje','contas','cartoes','calendario','moreNavBtn']);
    expect(visible.map(item=>item.label)).toEqual(['Hoje','Contas','Cartões','Calendário','Mais']);
    expect(visible.every(item=>item.flexDirection==='column')).toBe(true);
    expect(visible.every(item=>item.textOverflow!=='ellipsis')).toBe(true);
    expect(visible.every(item=>item.whiteSpace==='nowrap')).toBe(true);
    expect(visible.every(item=>item.labelFits)).toBe(true);
    expect(visible.some(item=>item.page==='sophy')).toBe(false);
    expect(visible.some(item=>item.page==='lancamentos')).toBe(false);
    await expect(page.locator('.mobilefab')).toBeVisible();
    await expect(page.locator('#fabLabel')).toBeHidden();
  });

  test('Mais menu is grouped by purpose and uses one fixed visual text axis',async({page})=>{
    await boot(page);
    await page.locator('#moreNavBtn').click();
    await expect(page.locator('.sfp-more-modal')).toBeVisible();
    await expect(page.locator('.sfp-more-group-title')).toHaveText(['Planejar','Analisar','Dados','Assistência e sistema']);
    const titleXs=await page.locator('.sfp-more-copy strong').evaluateAll(nodes=>nodes.slice(0,10).map(node=>Math.round(node.getBoundingClientRect().left)));
    expect(new Set(titleXs).size).toBe(1);
    await expect(page.locator('[data-sfp-more-page="lancamentos"]')).toBeVisible();
    await expect(page.locator('[data-sfp-more-page="sophy"]')).toBeVisible();
  });

  test('portrait forms never widen the document beyond the viewport',async({page})=>{
    await boot(page);
    for(const target of ['lancamentos','contas','cartoes','dividas']){
      await page.evaluate(pageId=>window.setPage(pageId),target);
      await page.waitForTimeout(50);
      const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,body:document.body.scrollWidth}));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client+1);
      expect(widths.body).toBeLessThanOrEqual(widths.client+1);
    }
  });

  test('Sophy guard converts ISO dates before the local router can read them as subtraction',async({page})=>{
    await boot(page);
    await page.evaluate(()=>window.setPage('sophy'));
    await page.evaluate(()=>{Promise.resolve(window.sophySendMessage('Teste de contexto em 2026-09-11.')).catch(()=>{});});
    const userBubble=page.locator('.sophy-msg-row.user .sophy-bubble').last();
    await expect(userBubble).toContainText('11/09/2026');
    await expect(userBubble).not.toContainText('2026-09-11');
  });
});
