const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { monitor } = require('./helpers');

const PORTRAIT = { width: 390, height: 844 };
const MOBILE_SMALL = { width: 384, height: 854 };
const LANDSCAPE = { width: 854, height: 384 };
const DESKTOP = { width: 1280, height: 720 };
const EXPECTED_LOGO_SHA = '79d98edae8bbecebca451ec8d37a838d926092621b4c20c55172c434ef71091d';

async function boot(page, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

async function setPage(page, id) {
  await page.evaluate(pageId => window.setPage(pageId), id);
  await expect(page.locator(`#${id}`)).toHaveClass(/active/);
}

test.describe('SFP Product Reload + Rebranding V1 QA Suite (REB-01 - REB-18)', () => {
  test('REB-01: Design tokens presence and Dark Navy & Teal palette', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        brand: style.getPropertyValue('--color-brand').trim(),
        bgBase: style.getPropertyValue('--color-bg-base').trim(),
        surface1: style.getPropertyValue('--color-surface-1').trim(),
        border: style.getPropertyValue('--color-border').trim(),
        positive: style.getPropertyValue('--color-positive').trim(),
        negative: style.getPropertyValue('--color-negative').trim(),
        warning: style.getPropertyValue('--color-warning').trim(),
        controlHeight: style.getPropertyValue('--control-height').trim()
      };
    });
    expect(tokens).toEqual({brand:'#00bba7',bgBase:'#050b14',surface1:'#0c1a2d',border:'#1a3452',positive:'#22c55e',negative:'#f43f5e',warning:'#f59e0b',controlHeight:'44px'});
    expect(errors).toEqual([]);
  });

  test('REB-02: Official Master Logo provenance (SHA-256 integrity and presence)', async () => {
    const logoMasterPath = path.resolve('_input/sfp-logo-master.png');
    expect(fs.existsSync(logoMasterPath)).toBe(true);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(logoMasterPath)).digest('hex');
    expect(hash).toBe(EXPECTED_LOGO_SHA);
  });

  test('REB-03: Offline Linear SVG iconography across all navigation buttons', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);
    const navButtons = page.locator('.sidebar .nav button[data-page]');
    expect(await navButtons.count()).toBe(19);
    for (let i=0;i<await navButtons.count();i++) {
      const svg=navButtons.nth(i).locator('svg.nav-icon');
      await expect(svg).toBeVisible();
      expect(await svg.getAttribute('stroke')).toBe('currentColor');
    }
    expect(errors).toEqual([]);
  });

  test('REB-04: Mobile Portrait Navigation (priority 5-item bottom nav with active highlight)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT);
    const visibleButtons=page.locator('.sidebar .nav button:visible');
    await expect(visibleButtons).toHaveCount(5);
    const visiblePages=await visibleButtons.evaluateAll(list=>list.map(el=>el.dataset.page||el.id));
    expect(visiblePages).toEqual(['hoje','contas','cartoes','calendario','moreNavBtn']);
    await expect(page.locator('.sidebar .nav button.active')).toHaveAttribute('data-page','hoje');
    expect(errors).toEqual([]);
  });

  test('REB-05: Mobile Portrait Mais Hub is grouped, aligned and keeps compatibility hooks', async ({ page }) => {
    const errors=monitor(page);
    await boot(page,PORTRAIT);
    await page.locator('#moreNavBtn').click();
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('#modalRoot h2')).toHaveText('Mais');
    await expect(page.locator('.sfp-more-group-title')).toHaveText(['Planejar','Analisar','Dados','Assistência e sistema']);
    const moreCards=page.locator('#modalRoot button[data-more]');
    expect(await moreCards.count()).toBeGreaterThanOrEqual(14);
    for(let i=0;i<await moreCards.count();i++) await expect(moreCards.nth(i).locator('svg.nav-icon')).toBeVisible();
    const axes=await page.locator('.sfp-more-copy strong').evaluateAll(nodes=>nodes.slice(0,10).map(n=>Math.round(n.getBoundingClientRect().left)));
    expect(new Set(axes).size).toBe(1);
    await page.locator('#closeMore').click();
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
  });

  test('REB-06: Landscape / DeX / Tablet Navigation keeps all 19 views', async ({ page }) => {
    const errors=monitor(page);
    await boot(page,LANDSCAPE);
    await expect(page.locator('#moreNavBtn')).toBeHidden();
    expect(await page.locator('.sidebar .nav button[data-page]').count()).toBe(19);
    const sidebarBox=await page.locator('.sidebar').boundingBox();
    expect(sidebarBox.x).toBe(0);expect(sidebarBox.y).toBe(0);expect(sidebarBox.height).toBe(384);
    expect(errors).toEqual([]);
  });

  test('REB-07: Mobile Touch Targets compliance (>= 44px for controls)', async ({ page }) => {
    const errors=monitor(page);
    await boot(page,PORTRAIT);
    const bottomNavButtons=page.locator('.sidebar .nav button:visible');
    for(let i=0;i<await bottomNavButtons.count();i++){const box=await bottomNavButtons.nth(i).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
    await setPage(page,'lancamentos');
    const quicktypeButtons=page.locator('.quicktype');
    for(let i=0;i<await quicktypeButtons.count();i++){const box=await quicktypeButtons.nth(i).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
    expect(errors).toEqual([]);
  });

  test('REB-08: Zero global horizontal overflow across all viewports', async ({ page }) => {
    const errors=monitor(page);
    await boot(page,DESKTOP);
    for(const vp of [MOBILE_SMALL,PORTRAIT,LANDSCAPE,DESKTOP]){
      await page.setViewportSize(vp);await page.waitForTimeout(100);
      const overflow=await page.evaluate(()=>({docW:document.documentElement.scrollWidth,bodyW:document.body.scrollWidth,winW:window.innerWidth}));
      expect(overflow.docW).toBeLessThanOrEqual(overflow.winW+1);expect(overflow.bodyW).toBeLessThanOrEqual(overflow.winW+1);
    }
    expect(errors).toEqual([]);
  });

  test('REB-09: Sophy Presentation UI', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);await setPage(page,'sophy');
    for(const sel of ['.sophy-header-card','.sophy-avatar-wrap','#sophyCoreTag','#sophyNetworkTag','.sophy-mood-tag','.sophy-chat-card']) await expect(page.locator(sel)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('REB-10: Sophy Suggestions Bar and Composer bounds (no vertical overlap)', async ({ page }) => {
    const errors=monitor(page);await boot(page,PORTRAIT);await setPage(page,'sophy');
    const barBox=await page.locator('#sophySuggestions').boundingBox(),composerBox=await page.locator('#sophyChatForm').boundingBox();
    expect(barBox).not.toBeNull();expect(composerBox).not.toBeNull();expect(barBox.y+barBox.height).toBeLessThanOrEqual(composerBox.y+1);
    await expect(page.locator('#sophySuggestions .sophy-chip').first()).toBeVisible();expect(errors).toEqual([]);
  });

  test('REB-11: Tab transitions activate corresponding view and update page title', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);
    for(const t of [{pageId:'dashboard',title:'Dashboard'},{pageId:'contas',title:'Contas'},{pageId:'cartoes',title:'Cartões'},{pageId:'orcamento',title:'Orçamento'},{pageId:'calendario',title:'Calendário'},{pageId:'config',title:'Configurações'}]){await setPage(page,t.pageId);await expect(page.locator('#pageTitle')).toHaveText(t.title);}
    expect(errors).toEqual([]);
  });

  test('REB-12: Privacy Mode toggle masks financial metrics and toggles active state', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);const toggle=page.locator('#privacyToggle');await toggle.click();await expect(page.locator('body')).toHaveClass(/privacy-on/);await expect(toggle).toHaveClass(/active/);await toggle.click();await expect(page.locator('body')).not.toHaveClass(/privacy-on/);expect(errors).toEqual([]);
  });

  test('REB-13: Toast notifications system display', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);await page.evaluate(()=>window.toast('Operação de teste concluída com sucesso.'));await expect(page.locator('#toast')).toHaveClass(/show/);await expect(page.locator('#toast')).toContainText('Operação de teste concluída com sucesso.');expect(errors).toEqual([]);
  });

  test('REB-14: SFP Modal & Dialogs contract', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);const confirmPromise=page.evaluate(()=>window.sfpConfirm({title:'Confirmar Exclusão',message:'Tem certeza que deseja remover?',confirmText:'Confirmar',cancelText:'Cancelar',danger:true}));await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);await expect(page.locator('#dialogTitle')).toHaveText('Confirmar Exclusão');await page.locator('#dialogConfirmBtn').click();expect(await confirmPromise).toBe(true);await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);expect(errors).toEqual([]);
  });

  test('REB-15: Calendar view 7-column layout and day structure', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);await setPage(page,'calendario');await expect(page.locator('.calendar')).toBeVisible();await expect(page.locator('.calhead')).toHaveCount(7);expect(await page.locator('.day').count()).toBeGreaterThanOrEqual(28);expect(errors).toEqual([]);
  });

  test('REB-16: Quicktypes transaction selector with 5 linear SVGs', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);await setPage(page,'lancamentos');const quicktypes=page.locator('.quicktypes .quicktype');await expect(quicktypes).toHaveCount(5);expect(await quicktypes.evaluateAll(list=>list.map(el=>el.dataset.kind))).toEqual(['expense','bill','card','income','transfer']);await page.locator('.quicktype[data-kind="bill"]').click();await expect(page.locator('.quicktype[data-kind="bill"]')).toHaveClass(/active/);await expect(page.locator('#billFields')).not.toHaveClass(/hidden/);expect(errors).toEqual([]);
  });

  test('REB-17: Focus visible accessibility styling', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);const has=await page.evaluate(()=>Array.from(document.styleSheets).some(sheet=>{try{return Array.from(sheet.cssRules||[]).some(rule=>rule.cssText?.includes(':focus-visible'));}catch{return false;}}));expect(has).toBe(true);expect(errors).toEqual([]);
  });

  test('REB-18: Reduced motion accessibility contract', async ({ page }) => {
    const errors=monitor(page);await boot(page,DESKTOP);const has=await page.evaluate(()=>Array.from(document.styleSheets).some(sheet=>{try{return Array.from(sheet.cssRules||[]).some(rule=>rule.cssText?.includes('prefers-reduced-motion: reduce'));}catch{return false;}}));expect(has).toBe(true);expect(errors).toEqual([]);
  });
});
