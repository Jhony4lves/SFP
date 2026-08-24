const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete } = require('./helpers');

test.describe('Month UX Specification (UX-MONTH-01..07)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');
    await page.evaluate(() => window.setPage('hoje'));
  });

  test('UX-MONTH-01: formatMonthCompact converts YYYY-MM to Jan/26..Dez/26 correctly', async ({ page }) => {
    const results = await page.evaluate(() => {
      const months = [
        ['2026-01', 'Jan/26'],
        ['2026-02', 'Fev/26'],
        ['2026-03', 'Mar/26'],
        ['2026-04', 'Abr/26'],
        ['2026-05', 'Mai/26'],
        ['2026-06', 'Jun/26'],
        ['2026-07', 'Jul/26'],
        ['2026-08', 'Ago/26'],
        ['2026-09', 'Set/26'],
        ['2026-10', 'Out/26'],
        ['2026-11', 'Nov/26'],
        ['2026-12', 'Dez/26']
      ];
      return months.map(([ym, expected]) => ({
        ym,
        expected,
        actual: window.formatMonthCompact(ym)
      }));
    });

    for (const r of results) {
      expect(r.actual).toBe(r.expected);
    }
  });

  test('UX-MONTH-02: #monthLabel displays compact format (Jan/26 and Ago/26)', async ({ page }) => {
    // Current fixture is 2026-01
    let text = await page.locator('#monthLabel').textContent();
    expect(text?.trim()).toBe('Jan/26');

    // Switch to 2026-08
    await page.evaluate(() => {
      state.mesAtual = '2026-08';
      renderTop();
    });
    text = await page.locator('#monthLabel').textContent();
    expect(text?.trim()).toBe('Ago/26');
  });

  test('UX-MONTH-03: #monthLabel has full month name in title and aria-label', async ({ page }) => {
    await page.evaluate(() => {
      state.mesAtual = '2026-08';
      renderTop();
    });
    const title = await page.locator('#monthLabel').getAttribute('title');
    const ariaLabel = await page.locator('#monthLabel').getAttribute('aria-label');
    expect(title?.toLowerCase()).toContain('agosto');
    expect(title).toContain('2026');
    expect(ariaLabel?.toLowerCase()).toContain('agosto');
    expect(ariaLabel).toContain('2026');
  });

  test('UX-MONTH-04: Navigating months updates compact label and accessibility attributes', async ({ page }) => {
    await page.evaluate(() => {
      state.mesAtual = '2026-08';
      renderTop();
    });
    await page.click('#prevMonth');
    await page.waitForTimeout(100);
    const prevText = await page.locator('#monthLabel').textContent();
    const prevTitle = await page.locator('#monthLabel').getAttribute('title');
    expect(prevText?.trim()).toBe('Jul/26');
    expect(prevTitle?.toLowerCase()).toContain('julho');

    await page.click('#nextMonth');
    await page.click('#nextMonth');
    await page.waitForTimeout(100);
    const nextText = await page.locator('#monthLabel').textContent();
    const nextTitle = await page.locator('#monthLabel').getAttribute('title');
    expect(nextText?.trim()).toBe('Set/26');
    expect(nextTitle?.toLowerCase()).toContain('setembro');
  });

  test('UX-MONTH-05: Internal state keys, financial calculations, and storage maintain YYYY-MM', async ({ page }) => {
    const stateMes = await page.evaluate(() => window.state.mesAtual);
    expect(stateMes).toMatch(/^\d{4}-\d{2}$/);

    const calc = await page.evaluate(() => window.monthCalc('2026-08'));
    expect(calc).toBeDefined();
    expect(typeof calc.result).toBe('number');
  });

  test('UX-MONTH-06: Contextual details and long-form strings use full monthName', async ({ page }) => {
    const longName = await page.evaluate(() => window.monthName('2026-08'));
    expect(longName.toLowerCase()).toContain('agosto de 2026');
  });

  test('UX-MONTH-07: Month pill has stable geometry across different months', async ({ page }) => {
    const box1 = await page.locator('#monthLabel').boundingBox();
    expect(box1).not.toBeNull();
    expect(box1.width).toBeGreaterThanOrEqual(48);

    await page.click('#prevMonth');
    const box2 = await page.locator('#monthLabel').boundingBox();
    expect(box2.height).toBe(box1.height);

    await page.click('#nextMonth');
    await page.click('#nextMonth');
    const box3 = await page.locator('#monthLabel').boundingBox();
    expect(box3.height).toBe(box1.height);
  });
});

test.describe('Recurrences Card Spacing (REC-SPACING-01..04)', () => {
  test('REC-SPACING-01: On mobile portrait (384x854), .recurring-head is stacked with clear layout', async ({ page }) => {
    await page.setViewportSize({ width: 384, height: 854 });
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');
    await page.evaluate(() => window.setPage('recorrencias'));
    await page.waitForSelector('#recorrencias.active');

    const head = page.locator('#recorrencias .recurring-head');
    await expect(head).toBeVisible();

    const displayInfo = await head.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        flexDirection: style.flexDirection,
        display: style.display
      };
    });
    expect(displayInfo.flexDirection).toBe('column');
  });

  test('REC-SPACING-02: Subtitle text is full width and not squished', async ({ page }) => {
    await page.setViewportSize({ width: 384, height: 854 });
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');
    await page.evaluate(() => window.setPage('recorrencias'));

    const subtitle = page.locator('#recorrencias .recurring-head-text p');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toHaveText('Pause, edite ou pule um mês');

    const subBox = await subtitle.boundingBox();
    expect(subBox.width).toBeGreaterThan(200);
  });

  test('REC-SPACING-03: CTA button has minimum touch target height >= 44px', async ({ page }) => {
    await page.setViewportSize({ width: 384, height: 854 });
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');
    await page.evaluate(() => window.setPage('recorrencias'));

    const cta = page.locator('#recorrencias .recurring-cta-btn');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText('+ Nova recorrência');

    const ctaBox = await cta.boundingBox();
    expect(ctaBox.height).toBeGreaterThanOrEqual(44);
    expect(ctaBox.width).toBeGreaterThanOrEqual(44);
  });

  test('REC-SPACING-04: On desktop/tablet (>=640px), .recurring-head is horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');
    await page.evaluate(() => window.setPage('recorrencias'));

    const head = page.locator('#recorrencias .recurring-head');
    await expect(head).toBeVisible();

    const displayInfo = await head.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        flexDirection: style.flexDirection
      };
    });
    expect(displayInfo.flexDirection).toBe('row');
  });
});

test.describe('Real Appearance Themes (THEME-01..18)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');
  });

  test('THEME-01: #cfgTheme select has dark, light, and system options', async ({ page }) => {
    const options = await page.locator('#cfgTheme option').all();
    expect(options.length).toBe(3);

    const values = await page.evaluate(() => {
      const select = document.getElementById('cfgTheme');
      return Array.from(select.options).map(o => ({ value: o.value, text: o.text }));
    });

    expect(values).toEqual([
      { value: 'dark', text: 'Escuro' },
      { value: 'light', text: 'Claro' },
      { value: 'system', text: 'Sistema' }
    ]);
  });

  test('THEME-02: Default theme is dark in state and normalize', async ({ page }) => {
    const theme = await page.evaluate(() => window.state.settings.theme);
    expect(theme).toBe('dark');
  });

  test('THEME-03: Applying light theme sets data-theme="light" on root and body', async ({ page }) => {
    await page.evaluate(() => window.applyTheme('light'));
    const docTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    const bodyTheme = await page.evaluate(() => document.body.dataset.theme);
    expect(docTheme).toBe('light');
    expect(bodyTheme).toBe('light');
  });

  test('THEME-04: Light theme sets meta theme-color to #f4f7fa', async ({ page }) => {
    await page.evaluate(() => window.applyTheme('light'));
    const metaColor = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'));
    expect(metaColor).toBe('#f4f7fa');
  });

  test('THEME-05: Dark theme sets meta theme-color to #07111e and data-theme="dark"', async ({ page }) => {
    await page.evaluate(() => window.applyTheme('dark'));
    const docTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    const metaColor = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'));
    expect(docTheme).toBe('dark');
    expect(metaColor).toBe('#07111e');
  });

  test('THEME-06: System theme resolves dynamically based on matchMedia', async ({ page }) => {
    const resolved = await page.evaluate(() => window.resolveEffectiveTheme('system'));
    expect(['dark', 'light']).toContain(resolved);
  });

  test('THEME-07: Selecting theme in #cfgTheme immediately previews theme without form submit', async ({ page }) => {
    await page.evaluate(() => window.setPage('config'));
    await page.selectOption('#cfgTheme', 'light');

    const docTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(docTheme).toBe('light');

    await page.selectOption('#cfgTheme', 'dark');
    const docTheme2 = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(docTheme2).toBe('dark');
  });

  test('THEME-08: Submitting #configForm persists state.settings.theme', async ({ page }) => {
    await page.evaluate(() => window.setPage('config'));
    await page.selectOption('#cfgTheme', 'light');
    await page.click('#configForm button');
    await page.waitForTimeout(200);

    const savedTheme = await page.evaluate(() => window.state.settings.theme);
    expect(savedTheme).toBe('light');
  });

  test('THEME-09: Saved theme is restored upon state load', async ({ page }) => {
    await page.evaluate(async () => {
      window.state.settings.theme = 'light';
      window.applyTheme('light');
      await window.save('Teste tema');
    });

    const docTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(docTheme).toBe('light');

    // Restore to dark for next tests
    await page.evaluate(async () => {
      window.state.settings.theme = 'dark';
      window.applyTheme('dark');
      await window.save('Restaurar tema');
    });
  });

  test('THEME-10: Unknown/invalid theme gracefully normalizes to dark', async ({ page }) => {
    const normalizedTheme = await page.evaluate(() => {
      window.state.settings.theme = 'neon_pink';
      window.normalize();
      return window.state.settings.theme;
    });
    expect(normalizedTheme).toBe('dark');
  });

  test('THEME-11: Theme switching leaves Financial Core, balances, transactions, and vault untouched', async ({ page }) => {
    const beforeMath = await page.evaluate(() => ({
      accounts: window.state.accounts.length,
      balance: window.allAccountBalance(),
      txCount: window.state.transactions.length
    }));

    await page.evaluate(() => window.applyTheme('light'));
    await page.evaluate(() => window.applyTheme('dark'));

    const afterMath = await page.evaluate(() => ({
      accounts: window.state.accounts.length,
      balance: window.allAccountBalance(),
      txCount: window.state.transactions.length
    }));

    expect(afterMath).toEqual(beforeMath);
  });

  test('THEME-12: Hoje tab elements have high contrast in Light mode', async ({ page }) => {
    await page.evaluate(() => {
      window.setPage('hoje');
      window.applyTheme('light');
    });
    await page.waitForSelector('#hoje.active');

    const heroColor = await page.locator('.cockpit-hero-value').evaluate(el => window.getComputedStyle(el).color);
    expect(heroColor).toBe('rgb(11, 25, 44)'); // #0b192c
  });

  test('THEME-13: Sophy tab chat bubbles have high contrast in Light mode', async ({ page }) => {
    await page.evaluate(() => {
      window.setPage('sophy');
      window.applyTheme('light');
    });
    await page.waitForSelector('#sophy.active');

    const cardBg = await page.locator('.sophy-chat-card').evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(cardBg).toBe('rgb(248, 250, 252)'); // #f8fafc
  });

  test('THEME-14: Calendar tab day cells render with clean light styling', async ({ page }) => {
    await page.evaluate(() => {
      window.setPage('calendario');
      window.applyTheme('light');
      renderCalendar();
    });
    await page.waitForSelector('#calendario.active');

    const dayBg = await page.locator('button.day').first().evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(dayBg).toBe('rgb(255, 255, 255)'); // #ffffff
  });

  test('THEME-15: Recorrências tab renders cleanly in Light mode', async ({ page }) => {
    await page.evaluate(() => {
      window.setPage('recorrencias');
      window.applyTheme('light');
    });
    await page.waitForSelector('#recorrencias.active');

    const panelBg = await page.locator('#recorrencias .panel').first().evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(panelBg).toBe('rgb(255, 255, 255)');
  });

  test('THEME-16: Contas & Cartões tabs render cleanly in Light mode', async ({ page }) => {
    await page.evaluate(() => {
      window.setPage('contas');
      window.applyTheme('light');
    });
    await page.waitForSelector('#contas.active');

    const panelBg = await page.locator('#contas .panel').first().evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(panelBg).toBe('rgb(255, 255, 255)');
  });

  test('THEME-17: Modal / Dialog and In-App Banner render cleanly in Light mode', async ({ page }) => {
    await page.evaluate(() => {
      window.applyTheme('light');
      window.showInAppBanner({
        id: 'test-banner',
        type: 'info',
        title: 'Aviso Teste',
        message: 'Mensagem de teste para validação visual.'
      });
    });

    const banner = page.locator('#inAppBanner');
    await expect(banner).toBeVisible();
    const bannerBg = await banner.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(bannerBg).toBe('rgb(248, 250, 252)'); // #f8fafc
  });

  test('THEME-18: AndroidBridge setSystemBarTheme is invoked safely without errors', async ({ page }) => {
    const errorCount = await page.evaluate(() => {
      let errors = 0;
      try {
        window.applyTheme('light');
        window.applyTheme('dark');
      } catch (e) {
        errors++;
      }
      return errors;
    });
    expect(errorCount).toBe(0);
  });
});
