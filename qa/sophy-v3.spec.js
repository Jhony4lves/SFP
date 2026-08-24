const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

const VIEWPORTS = [
  { name: 'Portrait 360x780 (Standard Mobile)', width: 360, height: 780, isLandscape: false },
  { name: 'Portrait 384x854 (Medium Mobile)', width: 384, height: 854, isLandscape: false },
  { name: 'Portrait 412x915 (Galaxy S24 / Modern)', width: 412, height: 915, isLandscape: false },
  { name: 'Landscape 780x360 (Standard Mobile)', width: 780, height: 360, isLandscape: true },
  { name: 'Landscape 854x384 (Medium Mobile)', width: 854, height: 384, isLandscape: true },
  { name: 'Landscape 915x412 (Galaxy S24 / Modern)', width: 915, height: 412, isLandscape: true }
];

const DESKTOP = { width: 1280, height: 720 };

async function boot(page, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

test.describe('Sophy V3 — Hybrid Architecture, UI Quick Actions & Keystore Settings', () => {

  for (const vp of VIEWPORTS) {
    test(`SOPHY-V3-BOUNDS: Bounding-box verification on ${vp.name} (PHYS-07, PHYS-08)`, async ({ page }) => {
      const errors = monitor(page);
      await boot(page, { width: vp.width, height: vp.height });

      await page.locator('.nav button[data-page="sophy"]').click();
      await expect(page.locator('#sophyChatList')).toBeVisible();

      const suggestionsBar = page.locator('#sophySuggestions');
      const composerForm = page.locator('#sophyChatForm');
      const chips = suggestionsBar.locator('.sophy-chip');

      await expect(suggestionsBar).toBeVisible();
      await expect(composerForm).toBeVisible();
      await expect(chips.first()).toBeVisible();

      const barBox = await suggestionsBar.boundingBox();
      const composerBox = await composerForm.boundingBox();

      expect(barBox).not.toBeNull();
      expect(composerBox).not.toBeNull();

      // Quick Actions must be strictly above Composer Form (no vertical overlap)
      expect(barBox.y + barBox.height).toBeLessThanOrEqual(composerBox.y + 1.0);

      // Verify every chip is within the suggestions bar and strictly above composer
      const chipCount = await chips.count();
      for (let i = 0; i < chipCount; i++) {
        const chip = chips.nth(i);
        const chipBox = await chip.boundingBox();
        if (chipBox) {
          expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(composerBox.y + 1.0);
          expect(chipBox.height).toBeGreaterThanOrEqual(24);
        }
      }

      // Composer must stay within viewport
      expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(vp.height + 1.0);

      expect(errors).toEqual([]);
    });
  }

  test('SOPHY-V3-01: Quick Actions horizontal bar with nowrap and smooth scrolling', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, { width: 390, height: 844 });

    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophyChatList')).toBeVisible();

    const bar = page.locator('#sophySuggestions');
    await expect(bar).toBeVisible();

    // Verify container styles
    const barStyles = await bar.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        flexWrap: s.flexWrap,
        overflowX: s.overflowX,
        display: s.display,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      };
    });
    expect(barStyles.flexWrap).toBe('nowrap');
    expect(['auto', 'scroll']).toContain(barStyles.overflowX);

    // Verify chips exist, have flex-shrink: 0, and readable min-width
    const chips = bar.locator('.sophy-chip');
    await expect(chips.first()).toBeVisible();
    const count = await chips.count();
    expect(count).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < count; i++) {
      const chip = chips.nth(i);
      const chipProps = await chip.evaluate((el) => {
        const s = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          flexShrink: s.flexShrink,
          width: rect.width,
          whiteSpace: s.whiteSpace
        };
      });
      expect(chipProps.flexShrink).toBe('0');
      expect(chipProps.width).toBeGreaterThanOrEqual(50);
    }

    // Scroll to the last chip in mobile viewport and ensure it is fully reachable
    const lastChip = chips.last();
    await lastChip.scrollIntoViewIfNeeded();
    await expect(lastChip).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('SOPHY-V3-02: Status badges display Local Core and Network status', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophyCoreTag')).toBeVisible();
    await expect(page.locator('#sophyNetworkTag')).toBeVisible();

    await expect(page.locator('#sophyCoreTag')).toContainText('Local Core');
    await expect(page.locator('#sophyNetworkTag')).toContainText(/Online|Offline/);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V3-03: Sophy Settings Modal configures Groq model read-only and tests connection (PHYS-02, PHYS-09)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();
    await page.locator('#sophySettingsBtn').click();

    const modal = page.locator('#modalRoot');
    await expect(modal).not.toHaveClass(/hidden/);
    await expect(modal.locator('h2')).toContainText('Inteligência Artificial');

    // Provider select
    const provSelect = page.locator('#sophyProviderSelect');
    await expect(provSelect).toHaveValue('groq');

    // Model is auto-populated with openai/gpt-oss-120b and read-only
    const modelInput = page.locator('#sophyModel');
    await expect(modelInput).toBeVisible();
    await expect(modelInput).toHaveValue('openai/gpt-oss-120b');
    await expect(modelInput).toHaveAttribute('readonly', '');

    // API Key input
    const apiKeyInput = page.locator('#sophyApiKey');
    await expect(apiKeyInput).toBeVisible();

    // Type a key and test connection immediately
    await apiKeyInput.fill('gsk_mock_test_key_12345');
    await page.locator('#sophyTestConnectionBtn').click();

    // Verify key was masked and saved into secure storage
    const placeholder = await apiKeyInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/••••|gsk_/);

    // Close settings modal
    await page.locator('#closeSophySettings').click();
    await expect(modal).toHaveClass(/hidden/);

    // Verify state does not leak secret into localStorage state
    const hasSecretInState = await page.evaluate(() => {
      const json = JSON.stringify(state);
      return json.includes('gsk_mock_test_key_12345');
    });
    expect(hasSecretInState).toBe(false);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V3-04: Sophy Memories modal and badge text spacing formatting (PHYS-06)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();
    const memBtn = page.locator('#sophyOpenMemoriesBtn');
    await expect(memBtn).toBeVisible();
    const btnText = (await memBtn.textContent()).trim();
    
    // Exactly "🧠 Memórias (0)" without extra spaces inside parentheses like "Memórias ( 0 )"
    expect(btnText).toMatch(/^🧠\s*Memórias\s*\(\d+\)$/);
    expect(btnText).not.toContain('( ');
    expect(btnText).not.toContain(' )');

    await memBtn.click();
    const modal = page.locator('#modalRoot');
    await expect(modal).not.toHaveClass(/hidden/);
    await expect(modal.locator('h2')).toContainText('Memórias da Sophy');

    await page.locator('#closeSophyMemories').click();
    await expect(modal).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V3-05: Financial questions get rich answers from Local Financial Core', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();
    await page.locator('#sophyInput').fill('Qual meu saldo?');
    await page.locator('#sophySendBtn').click();

    const lastReply = page.locator('.sophy-msg-row.sophy').last();
    await expect(lastReply).toBeVisible();
    await expect(lastReply).toContainText('R$');

    expect(errors).toEqual([]);
  });

});
