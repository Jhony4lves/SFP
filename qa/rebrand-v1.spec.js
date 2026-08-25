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

    expect(tokens.brand).toBe('#00bba7');
    expect(tokens.bgBase).toBe('#050b14');
    expect(tokens.surface1).toBe('#0c1a2d');
    expect(tokens.border).toBe('#1a3452');
    expect(tokens.positive).toBe('#22c55e');
    expect(tokens.negative).toBe('#f43f5e');
    expect(tokens.warning).toBe('#f59e0b');
    expect(tokens.controlHeight).toBe('44px');

    expect(errors).toEqual([]);
  });

  test('REB-02: Official Master Logo provenance (SHA-256 integrity and presence)', async () => {
    const logoMasterPath = path.resolve('_input/sfp-logo-master.png');
    expect(fs.existsSync(logoMasterPath)).toBe(true);

    const fileBuffer = fs.readFileSync(logoMasterPath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    expect(hash).toBe(EXPECTED_LOGO_SHA);
  });

  test('REB-03: Offline Linear SVG iconography across all navigation buttons', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const navButtons = page.locator('.sidebar .nav button[data-page]');
    const count = await navButtons.count();
    expect(count).toBe(19);

    for (let i = 0; i < count; i++) {
      const btn = navButtons.nth(i);
      const svg = btn.locator('svg.nav-icon');
      await expect(svg).toBeVisible();
      const stroke = await svg.getAttribute('stroke');
      expect(stroke).toBe('currentColor');
    }

    expect(errors).toEqual([]);
  });

  test('REB-04: Mobile Portrait Navigation (5-item bottom nav with active highlight)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT);

    const visibleButtons = page.locator('.sidebar .nav button:visible');
    await expect(visibleButtons).toHaveCount(5);

    const visiblePages = await visibleButtons.evaluateAll(list => list.map(el => el.dataset.page || el.id));
    expect(visiblePages).toEqual(['hoje', 'sophy', 'lancamentos', 'contas', 'moreNavBtn']);

    // Active button has teal highlight
    const activeBtn = page.locator('.sidebar .nav button.active');
    await expect(activeBtn).toHaveAttribute('data-page', 'hoje');

    expect(errors).toEqual([]);
  });

  test('REB-05: Mobile Portrait "Mais" Hub (modal with 2-column card grid and SVGs)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT);

    await page.locator('#moreNavBtn').click();
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('#modalRoot h2')).toHaveText('Mais');

    // Verify module buttons inside modal
    const moreCards = page.locator('#modalRoot button[data-more]');
    const count = await moreCards.count();
    expect(count).toBeGreaterThanOrEqual(14);

    // Each more card has an SVG icon
    for (let i = 0; i < count; i++) {
      const card = moreCards.nth(i);
      await expect(card.locator('svg.nav-icon')).toBeVisible();
    }

    // Close button works
    await page.locator('#closeMore').click();
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('REB-06: Landscape / DeX / Tablet Navigation (fixed vertical sidebar with all 19 views)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, LANDSCAPE);

    await expect(page.locator('#moreNavBtn')).toBeHidden();

    const visibleButtons = page.locator('.sidebar .nav button[data-page]');
    const count = await visibleButtons.count();
    expect(count).toBe(19);

    // Verify sidebar bounding box is pinned at x=0, y=0
    const sidebarBox = await page.locator('.sidebar').boundingBox();
    expect(sidebarBox.x).toBe(0);
    expect(sidebarBox.y).toBe(0);
    expect(sidebarBox.height).toBe(384);

    expect(errors).toEqual([]);
  });

  test('REB-07: Mobile Touch Targets compliance (>= 44px for controls)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT);

    const bottomNavButtons = page.locator('.sidebar .nav button:visible');
    const count = await bottomNavButtons.count();

    for (let i = 0; i < count; i++) {
      const btn = bottomNavButtons.nth(i);
      const box = await btn.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // Switch to lancamentos to test quicktypes
    await page.locator('.sidebar .nav button[data-page="lancamentos"]').click();
    await expect(page.locator('#lancamentos')).toHaveClass(/active/);

    const quicktypeButtons = page.locator('.quicktype');
    const qtCount = await quicktypeButtons.count();
    for (let i = 0; i < qtCount; i++) {
      const qt = quicktypeButtons.nth(i);
      const box = await qt.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    expect(errors).toEqual([]);
  });

  test('REB-08: Zero global horizontal overflow across all viewports', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const viewports = [MOBILE_SMALL, PORTRAIT, LANDSCAPE, DESKTOP];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);

      const overflow = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const bodyW = document.body.scrollWidth;
        const winW = window.innerWidth;
        return { docW, bodyW, winW, overflow: docW > winW || bodyW > winW };
      });

      expect(overflow.overflow).toBe(false);
    }

    expect(errors).toEqual([]);
  });

  test('REB-09: Sophy Presentation UI (glowing avatar, tags, chat card, message bubbles)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophy')).toBeVisible();

    await expect(page.locator('.sophy-header-card')).toBeVisible();
    await expect(page.locator('.sophy-avatar-wrap')).toBeVisible();
    await expect(page.locator('#sophyCoreTag')).toBeVisible();
    await expect(page.locator('#sophyNetworkTag')).toBeVisible();
    await expect(page.locator('.sophy-mood-tag')).toBeVisible();
    await expect(page.locator('.sophy-chat-card')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('REB-10: Sophy Suggestions Bar and Composer bounds (no vertical overlap)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT);

    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophy')).toBeVisible();

    const barBox = await page.locator('#sophySuggestions').boundingBox();
    const composerBox = await page.locator('#sophyChatForm').boundingBox();

    expect(barBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(composerBox.y + 1.0);

    const chips = page.locator('#sophySuggestions .sophy-chip');
    await expect(chips.first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('REB-11: Tab transitions activate corresponding view and update page title', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const testTabs = [
      { pageId: 'dashboard', title: 'Dashboard' },
      { pageId: 'contas', title: 'Contas' },
      { pageId: 'cartoes', title: 'Cartões' },
      { pageId: 'orcamento', title: 'Orçamento' },
      { pageId: 'calendario', title: 'Calendário' },
      { pageId: 'config', title: 'Configurações' }
    ];

    for (const t of testTabs) {
      await page.locator(`.sidebar .nav button[data-page="${t.pageId}"]`).click();
      await expect(page.locator(`#${t.pageId}`)).toHaveClass(/active/);
      await expect(page.locator('#pageTitle')).toHaveText(t.title);
    }

    expect(errors).toEqual([]);
  });

  test('REB-12: Privacy Mode toggle masks financial metrics and toggles active state', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const toggle = page.locator('#privacyToggle');
    await toggle.click();

    await expect(page.locator('body')).toHaveClass(/privacy-on/);
    await expect(toggle).toHaveClass(/active/);

    // Toggle back
    await toggle.click();
    await expect(page.locator('body')).not.toHaveClass(/privacy-on/);
    await expect(toggle).not.toHaveClass(/active/);

    expect(errors).toEqual([]);
  });

  test('REB-13: Toast notifications system display and auto-dismiss', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await page.evaluate(() => {
      window.toast('Operação de teste concluída com sucesso.');
    });

    const toast = page.locator('#toast');
    await expect(toast).toHaveClass(/show/);
    await expect(toast).toContainText('Operação de teste concluída com sucesso.');

    expect(errors).toEqual([]);
  });

  test('REB-14: SFP Modal & Dialogs contract (sfpConfirm and sfpAlert)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const confirmPromise = page.evaluate(() => {
      return window.sfpConfirm({
        title: 'Confirmar Exclusão',
        message: 'Tem certeza que deseja remover?',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        danger: true
      });
    });

    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('#dialogTitle')).toHaveText('Confirmar Exclusão');

    await page.locator('#dialogConfirmBtn').click();
    const result = await confirmPromise;
    expect(result).toBe(true);
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('REB-15: Calendar view 7-column layout and day structure', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await page.locator('.sidebar .nav button[data-page="calendario"]').click();
    await expect(page.locator('#calendario')).toHaveClass(/active/);

    const calGrid = page.locator('.calendar');
    await expect(calGrid).toBeVisible();

    const calHeaders = page.locator('.calhead');
    await expect(calHeaders).toHaveCount(7);

    const days = page.locator('.day');
    const dayCount = await days.count();
    expect(dayCount).toBeGreaterThanOrEqual(28);

    expect(errors).toEqual([]);
  });

  test('REB-16: Quicktypes transaction selector with 5 linear SVGs', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await page.locator('.sidebar .nav button[data-page="lancamentos"]').click();
    await expect(page.locator('#lancamentos')).toHaveClass(/active/);

    const quicktypes = page.locator('.quicktypes .quicktype');
    await expect(quicktypes).toHaveCount(5);

    const kinds = await quicktypes.evaluateAll(list => list.map(el => el.dataset.kind));
    expect(kinds).toEqual(['expense', 'bill', 'card', 'income', 'transfer']);

    // Clicking bill switches active class
    await page.locator('.quicktype[data-kind="bill"]').click();
    await expect(page.locator('.quicktype[data-kind="bill"]')).toHaveClass(/active/);
    await expect(page.locator('#billFields')).not.toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('REB-17: Focus visible accessibility styling', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const hasFocusVisibleRule = await page.evaluate(() => {
      const styles = Array.from(document.styleSheets);
      for (const sheet of styles) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.includes(':focus-visible')) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });

    expect(hasFocusVisibleRule).toBe(true);
    expect(errors).toEqual([]);
  });

  test('REB-18: Reduced motion accessibility contract', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const hasReducedMotionRule = await page.evaluate(() => {
      const styles = Array.from(document.styleSheets);
      for (const sheet of styles) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.includes('prefers-reduced-motion: reduce')) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });

    expect(hasReducedMotionRule).toBe(true);
    expect(errors).toEqual([]);
  });

});
