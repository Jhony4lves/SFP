const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 700 },
  { name: 'galaxy-s24', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 }
];

async function boot(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

async function pageNames(page) {
  return page.evaluate(() => [...document.querySelectorAll('.sidebar .nav button[data-page]')]
    .map(button => button.dataset.page)
    .filter((value, index, values) => value && values.indexOf(value) === index));
}

async function inspectControls(page, pageName, viewportName) {
  return page.evaluate(({ pageName, viewportName }) => {
    const root = document.querySelector(`#${CSS.escape(pageName)}.tab.active`);
    if (!root) return [`[${viewportName}/${pageName}] aba ativa não encontrada`];

    const problems = [];
    const visible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) !== 0 && r.width > 0 && r.height > 0;
    };
    const textOfIds = (ids) => String(ids || '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
    const labelText = (el) => {
      const aria = (el.getAttribute('aria-label') || '').trim();
      if (aria) return aria;
      const labelled = textOfIds(el.getAttribute('aria-labelledby'));
      if (labelled) return labelled;
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        const text = (label?.textContent || '').trim();
        if (text) return text;
      }
      const wrapping = el.closest('label');
      const wrapped = (wrapping?.textContent || '').trim();
      if (wrapped) return wrapped;
      return '';
    };
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = [...el.classList].slice(0, 2).map(x => `.${x}`).join('');
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    root.querySelectorAll('button,[role="button"],[role="switch"],a[href]').forEach(el => {
      if (!visible(el) || el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return;
      const name = [
        (el.getAttribute('aria-label') || '').trim(),
        textOfIds(el.getAttribute('aria-labelledby')),
        (el.textContent || '').replace(/\s+/g, ' ').trim(),
        (el.getAttribute('title') || '').trim()
      ].find(Boolean) || '';
      if (!name) problems.push(`[${viewportName}/${pageName}] controle sem nome acessível: ${describe(el)}`);
    });

    root.querySelectorAll('input:not([type="hidden"]),textarea,select').forEach(el => {
      if (!visible(el) || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('disabled')) return;
      if (!labelText(el)) problems.push(`[${viewportName}/${pageName}] campo sem label associado: ${describe(el)} type=${el.getAttribute('type') || el.tagName.toLowerCase()}`);
    });

    root.querySelectorAll('[role="button"][tabindex="0"], [role="switch"][tabindex="0"]').forEach(el => {
      if (!visible(el)) return;
      const name = (el.getAttribute('aria-label') || '').trim() || textOfIds(el.getAttribute('aria-labelledby')) || (el.textContent || '').trim();
      if (!name) problems.push(`[${viewportName}/${pageName}] pseudo-controle focável sem nome: ${describe(el)}`);
    });

    return problems;
  }, { pageName, viewportName });
}

test.describe('SFP accessibility controls matrix', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: controles visíveis têm nome acessível e campos têm label`, async ({ page }) => {
      const errors = monitor(page);
      await boot(page, viewport);
      const pages = await pageNames(page);
      const problems = [];

      for (const pageName of pages) {
        await page.evaluate(name => window.setPage(name), pageName);
        await page.waitForTimeout(30);
        problems.push(...await inspectControls(page, pageName, viewport.name));
      }

      expect(problems, problems.join('\n')).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
