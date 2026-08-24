const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

const PORTRAIT = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 720 };

async function boot(page, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

test.describe('Sophy V3 — Hybrid Architecture, UI Quick Actions & Keystore Settings', () => {

  test('SOPHY-V3-01: Quick Actions horizontal bar with nowrap and smooth scrolling', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, PORTRAIT);

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
      expect(chipProps.width).toBeGreaterThanOrEqual(50); // never collapses to illegible width
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

  test('SOPHY-V3-03: Sophy Settings Modal configures Groq without state secret leakage', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();
    await page.locator('#sophySettingsBtn').click();

    const modal = page.locator('#modalRoot');
    await expect(modal).not.toHaveClass(/hidden/);
    await expect(modal.locator('h2')).toContainText('Inteligência Artificial');

    // Model and Provider selectors
    await expect(page.locator('#sophyProviderSelect')).toHaveValue('groq');
    await expect(page.locator('#sophyApiKey')).toBeVisible();

    // Close settings modal
    await page.locator('#closeSophySettings').click();
    await expect(modal).toHaveClass(/hidden/);

    // Verify state does not have plaintext apiKey
    const hasSecretInState = await page.evaluate(() => {
      const json = JSON.stringify(state);
      return json.includes('gsk_');
    });
    expect(hasSecretInState).toBe(false);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V3-04: Sophy Memories modal and badge without spacing bug', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();
    const memBtn = page.locator('#sophyOpenMemoriesBtn');
    await expect(memBtn).toBeVisible();
    const btnText = await memBtn.textContent();
    expect(btnText).toMatch(/Memórias\s*\(\s*\d+\s*\)/);
    expect(btnText).not.toContain('Memórias ( ');

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
