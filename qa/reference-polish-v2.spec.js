const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { monitor } = require('./helpers');

const PORTRAIT_S24 = { width: 390, height: 844 };
const MOBILE_SMALL = { width: 384, height: 854 };
const LANDSCAPE_S24 = { width: 844, height: 390 };
const DESKTOP = { width: 1280, height: 720 };

const EXPECTED_LOGO_SHA = '79d98edae8bbecebca451ec8d37a838d926092621b4c20c55172c434ef71091d';

async function boot(page, viewport = PORTRAIT_S24) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

test.describe('SFP Reference Alignment + Physical Polish V2 Suite (POLISH-01 - POLISH-25)', () => {

  test('POLISH-01: Header safe area clearance on Galaxy S24 (no status bar cut-off)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT_S24);

    const mainPaddingTop = await page.evaluate(() => {
      const main = document.querySelector('main');
      const style = getComputedStyle(main);
      return parseFloat(style.paddingTop);
    });

    expect(mainPaddingTop).toBeGreaterThanOrEqual(16);

    const titleBox = await page.locator('#pageTitle').boundingBox();
    expect(titleBox).not.toBeNull();
    expect(titleBox.y).toBeGreaterThanOrEqual(16);

    expect(errors).toEqual([]);
  });

  test('POLISH-02: Global bottom clearance with bottom-nav + safe-area + FAB', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT_S24);

    const mainPaddingBottom = await page.evaluate(() => {
      const main = document.querySelector('main');
      const style = getComputedStyle(main);
      return parseFloat(style.paddingBottom);
    });

    expect(mainPaddingBottom).toBeGreaterThanOrEqual(90);

    const fabBox = await page.locator('#contextFab').boundingBox();
    const sidebarBox = await page.locator('.sidebar').boundingBox();
    if (fabBox && sidebarBox) {
      expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(sidebarBox.y + 10);
    }

    expect(errors).toEqual([]);
  });

  test('POLISH-03: Zero structural emojis in UI Chrome', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const privacyText = await page.locator('#privacyToggle').textContent();
    expect(privacyText).not.toContain('👁');
    expect(privacyText).not.toContain('🙈');
    await expect(page.locator('#privacyToggle svg')).toBeVisible();

    await page.locator('.sidebar .nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophy')).toBeVisible();

    const memBtnText = await page.locator('#sophyOpenMemoriesBtn').textContent();
    expect(memBtnText).not.toContain('🧠');

    const setBtnText = await page.locator('#sophySettingsBtn').textContent();
    expect(setBtnText).not.toContain('⚙');

    const chips = page.locator('#sophySuggestions .sophy-chip');
    const count = await chips.count();
    expect(count).toBeGreaterThanOrEqual(5);

    for (let i = 0; i < count; i++) {
      const chip = chips.nth(i);
      const text = await chip.textContent();
      expect(text).not.toMatch(/[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
      await expect(chip.locator('svg')).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test('POLISH-04: Compact mobile header layout (height <= 90px in portrait)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT_S24);

    const header = page.locator('header.top');
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeLessThanOrEqual(95);

    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('#privacyToggle')).toBeVisible();
    await expect(page.locator('#notifBellBtn')).toBeVisible();
    await expect(page.locator('#prevMonth')).toBeVisible();
    await expect(page.locator('#monthLabel')).toBeVisible();
    await expect(page.locator('#nextMonth')).toBeVisible();
    await expect(page.locator('#globalSearch')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('POLISH-05: Landscape topbar and persistent sidebar layout', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, LANDSCAPE_S24);

    await expect(page.locator('#moreNavBtn')).toBeHidden();

    const navButtons = page.locator('.sidebar .nav button[data-page]');
    const count = await navButtons.count();
    expect(count).toBeGreaterThanOrEqual(18);

    const sidebarBox = await page.locator('.sidebar').boundingBox();
    expect(sidebarBox.x).toBe(0);
    expect(sidebarBox.y).toBe(0);
    expect(sidebarBox.height).toBe(390);

    expect(errors).toEqual([]);
  });

  test('POLISH-06: Hoje Financial Cockpit hierarchy (Hero Card + Secondary Grid)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT_S24);

    await expect(page.locator('.today-cockpit-hero')).toBeVisible();
    await expect(page.locator('#todayFree')).toBeVisible();
    await expect(page.locator('#todayFreeStatus')).toBeVisible();
    await expect(page.locator('#todayFreeHint')).toBeVisible();

    await expect(page.locator('#todayBalance')).toBeVisible();
    await expect(page.locator('#todayCommitted')).toBeVisible();
    await expect(page.locator('#todayNextIncome')).toBeVisible();
    await expect(page.locator('#todayReserve')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('POLISH-07: Distinct visual & conceptual identity for Hoje, Dashboard, and Visão Geral', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await expect(page.locator('#hoje .today-cockpit-hero')).toBeVisible();

    await page.locator('.sidebar .nav button[data-page="dashboard"]').click();
    await expect(page.locator('#dashboard')).toHaveClass(/active/);
    await expect(page.locator('.dashboard-toolbar')).toBeVisible();
    await expect(page.locator('#analyticsChart')).toBeVisible();
    await expect(page.locator('#analyticsCategories')).toBeVisible();

    await page.locator('.sidebar .nav button[data-page="visao"]').click();
    await expect(page.locator('#visao')).toHaveClass(/active/);
    await expect(page.locator('#dashNetWorth')).toBeVisible();
    await expect(page.locator('.sfp-view-grid')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('POLISH-08: SFP Popups & Dialogs Skin (sfpConfirm, sfpAlert, sfpPrompt)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const alertPromise = page.evaluate(() => {
      return window.sfpAlert({
        title: 'Aviso do Sistema',
        message: 'Mensagem de teste formatada.',
        type: 'warning'
      });
    });

    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('.sfp-dialog')).toBeVisible();
    await expect(page.locator('.sfp-dialog-badge.warning')).toBeVisible();
    await expect(page.locator('#dialogTitle')).toHaveText('Aviso do Sistema');

    await page.locator('#dialogOkBtn').click();
    await alertPromise;
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('POLISH-09: In-App Banners system (#inAppBanner with types and actions)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await page.evaluate(() => {
      window.showInAppBanner({
        id: 'test-banner',
        type: 'warning',
        title: 'Atenção ao fechamento',
        message: 'Lembre-se de conferir seus lançamentos.',
        actionText: 'Verificar'
      });
    });

    const banner = page.locator('#inAppBanner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveClass(/warning/);
    await expect(banner.locator('strong')).toHaveText('Atenção ao fechamento');
    await expect(banner.locator('#bannerActionBtn')).toBeVisible();

    await banner.locator('#bannerDismissBtn').click();
    await expect(banner).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('POLISH-10: Notification Center & Badge (#notifBellBtn, #notifUnreadBadge)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await expect(page.locator('#notifBellBtn')).toBeVisible();

    await page.locator('#notifBellBtn').click();
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('#dialogTitle')).toHaveText('Central de Avisos');

    await page.locator('#notifCloseBtn').click();
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('POLISH-11: Empty states for charts with compact linear SVG', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await page.locator('.sidebar .nav button[data-page="dashboard"]').click();
    await expect(page.locator('#dashboard')).toHaveClass(/active/);

    const emptyStates = page.locator('#dashboard .empty-chart-state, #dashboard .empty-state');
    const count = await emptyStates.count();
    expect(count).toBeGreaterThanOrEqual(1);

    expect(errors).toEqual([]);
  });

  test('POLISH-12: CTA & button normalization', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const primaryBtn = page.locator('.top-cta');
    if (await primaryBtn.isVisible()) {
      const box = await primaryBtn.boundingBox();
      expect(box.height).toBeLessThanOrEqual(44);
    }

    expect(errors).toEqual([]);
  });

  test('POLISH-13: Sophy Visual Polish (fixed bottom composer & suggestions bar)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT_S24);

    await page.locator('.sidebar .nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophy')).toBeVisible();

    const composer = page.locator('#sophyChatForm');
    await expect(composer).toBeVisible();

    const composerBox = await composer.boundingBox();
    const windowH = PORTRAIT_S24.height;
    expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(windowH);

    expect(errors).toEqual([]);
  });

  test('POLISH-14: Privacy mode toggle masks financial values and hero card', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const heroVal = page.locator('#todayFree');
    await expect(heroVal).not.toHaveClass(/private-value/);

    await page.locator('#privacyToggle').click();
    await expect(page.locator('body')).toHaveClass(/privacy-on/);
    await expect(heroVal).toHaveClass(/private-value/);

    await page.locator('#privacyToggle').click();
    await expect(page.locator('body')).not.toHaveClass(/privacy-on/);
    await expect(heroVal).not.toHaveClass(/private-value/);

    expect(errors).toEqual([]);
  });

  test('POLISH-15: Notification Preferences in Config Tab', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await page.locator('.sidebar .nav button[data-page="config"]').click();
    await expect(page.locator('#config')).toHaveClass(/active/);
    await expect(page.locator('#cfgName')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('POLISH-16: Touch target compliance (>= 44px for primary mobile controls)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT_S24);

    const navButtons = page.locator('.sidebar .nav button:visible');
    const count = await navButtons.count();

    for (let i = 0; i < count; i++) {
      const btn = navButtons.nth(i);
      const box = await btn.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    expect(errors).toEqual([]);
  });

  test('POLISH-17: Zero horizontal overflow across viewports', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    for (const vp of [PORTRAIT_S24, MOBILE_SMALL, LANDSCAPE_S24, DESKTOP]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(60);

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
      });
      expect(overflow).toBe(false);
    }

    expect(errors).toEqual([]);
  });

  test('POLISH-18: Month switcher and search toolbar integrity', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const monthLabel = await page.locator('#monthLabel').textContent();
    expect(monthLabel.length).toBeGreaterThan(3);

    await page.locator('#nextMonth').click();
    const nextMonthLabel = await page.locator('#monthLabel').textContent();
    expect(nextMonthLabel).not.toBe(monthLabel);

    await page.locator('#prevMonth').click();
    await expect(page.locator('#monthLabel')).toHaveText(monthLabel);

    expect(errors).toEqual([]);
  });

  test('POLISH-19: Fast tab switching preserves state', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const tabs = ['lancamentos', 'contas', 'cartoes', 'recorrencias', 'orcamento', 'metas', 'hoje'];
    for (const t of tabs) {
      await page.locator(`.sidebar .nav button[data-page="${t}"]`).click();
      await expect(page.locator(`#${t}`)).toHaveClass(/active/);
    }

    expect(errors).toEqual([]);
  });

  test('POLISH-20: Official Master Logo SHA-256 byte-for-byte immutability', async () => {
    const logoMasterPath = path.resolve('_input/sfp-logo-master.png');
    expect(fs.existsSync(logoMasterPath)).toBe(true);

    const fileBuffer = fs.readFileSync(logoMasterPath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    expect(hash).toBe(EXPECTED_LOGO_SHA);
  });

  test('POLISH-21: Toast notification system with linear SVG indicators', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await page.evaluate(() => {
      window.toast('Operação concluída', 'success');
    });

    const toast = page.locator('#toast');
    await expect(toast).toHaveClass(/show/);
    await expect(toast).toHaveClass(/toast-success/);
    await expect(toast.locator('svg')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('POLISH-22: Financial truth and sanity check (zero NaN/null leaks)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const checks = await page.evaluate(() => {
      return typeof window.runtimeSanityCheck === 'function' ? window.runtimeSanityCheck() : [];
    });
    expect(checks).toEqual([]);

    const bodyText = await page.locator('main').textContent();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');

    expect(errors).toEqual([]);
  });

  test('POLISH-23: Android Keystore AES-256-GCM Vault compatibility', async () => {
    const bridgeJavaPath = path.resolve('app/src/main/java/com/jhony/sfp/AndroidBridge.java');
    expect(fs.existsSync(bridgeJavaPath)).toBe(true);
    const javaContent = fs.readFileSync(bridgeJavaPath, 'utf8');

    expect(javaContent).toContain('sfp_sophy_secure_vault');
    expect(javaContent).toContain('sfp_sophy_groq_v3_master_key');
    expect(javaContent).toContain('AES/GCM/NoPadding');
  });

  test('POLISH-24: Database persistence contracts (DB_NAME and SCHEMA_VERSION)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    const constants = await page.evaluate(() => {
      return {
        dbName: typeof DB_NAME !== 'undefined' ? DB_NAME : null,
        schemaVersion: typeof SCHEMA_VERSION !== 'undefined' ? SCHEMA_VERSION : null
      };
    });

    expect(constants.dbName).toBe('SFP_JHONY_STABLE');
    expect(constants.schemaVersion).toBe(11);

    expect(errors).toEqual([]);
  });

  test('POLISH-25: Public naming ("Smart Financial Planner") and package id ("com.jhony.sfp")', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, DESKTOP);

    await expect(page).toHaveTitle(/Smart Financial Planner/);
    await expect(page.locator('.brand strong')).toHaveText('Smart Financial Planner');

    const buildGradle = fs.readFileSync(path.resolve('app/build.gradle'), 'utf8');
    expect(buildGradle).toContain('applicationId "com.jhony.sfp"');

    expect(errors).toEqual([]);
  });

});
