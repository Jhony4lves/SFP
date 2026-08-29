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

    const before=await page.evaluate(()=>{
      const b=document.querySelector('.sfp-select-button[aria-expanded="true"]')?.getBoundingClientRect();
      const m=document.querySelector('.sfp-select-menu:not([hidden])')?.getBoundingClientRect();
      return b&&m?{buttonTop:b.top,buttonBottom:b.bottom,menuTop:m.top,menuBottom:m.bottom}:null;
    });
    expect(before).not.toBeNull();

    await page.evaluate(()=>window.scrollBy(0,120));
    await page.waitForTimeout(50);

    const after=await page.evaluate(()=>{
      const b=document.querySelector('.sfp-select-button[aria-expanded="true"]')?.getBoundingClientRect();
      const m=document.querySelector('.sfp-select-menu:not([hidden])')?.getBoundingClientRect();
      return b&&m?{buttonTop:b.top,buttonBottom:b.bottom,menuTop:m.top,menuBottom:m.bottom}:null;
    });
    expect(after).not.toBeNull();
    expect(Math.abs(after.menuTop-before.menuTop)).toBeGreaterThan(20);
    const distance=Math.min(Math.abs(after.menuTop-after.buttonBottom),Math.abs(after.buttonTop-after.menuBottom));
    expect(distance).toBeLessThanOrEqual(10);
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
});
