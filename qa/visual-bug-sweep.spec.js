const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'galaxy-s24', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
  { name: 'compact-landscape', width: 740, height: 360 },
  { name: 'landscape-s24', width: 844, height: 390 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
];

const PAGES = [
  'hoje','sophy','dashboard','visao','lancamentos','extratos','contas','cartoes',
  'recorrencias','orcamento','dividas','metas','patrimonio','calendario','relatorios',
  'simuladores','dados','auditoria','config'
];

async function boot(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
}

async function inspectVisualState(page, pageId, viewportName) {
  return page.evaluate(({ pageId, viewportName }) => {
    const problems = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible = el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) !== 0 && r.width > 0 && r.height > 0;
    };
    const describe = el => {
      const id = el.id ? `#${el.id}` : '';
      const cls = [...el.classList].slice(0, 3).map(x => `.${x}`).join('');
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` “${text}”` : ''}`;
    };
    const hasScrollableAncestor = el => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (/(auto|scroll)/.test(cs.overflowX) && node.scrollWidth > node.clientWidth + 2) return true;
        node = node.parentElement;
      }
      return false;
    };

    const docOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - vw;
    if (docOverflow > 2) problems.push(`[${viewportName}/${pageId}] documento excede viewport em ${Math.round(docOverflow)}px`);

    const root = document.querySelector(`#${CSS.escape(pageId)}.tab.active`) || document.body;
    root.querySelectorAll('*').forEach(el => {
      if (!visible(el)) return;
      if (el.closest('.sfp-select-menu[hidden], .hidden')) return;
      const r = el.getBoundingClientRect();
      if ((r.left < -2 || r.right > vw + 2) && !hasScrollableAncestor(el)) {
        problems.push(`[${viewportName}/${pageId}] fora da tela: ${describe(el)} rect=${Math.round(r.left)}..${Math.round(r.right)} viewport=${vw}`);
      }
    });

    const textSelector = 'button,h1,h2,h3,label,.badge,.metric strong,.metric span,.item b,.management-card b,.management-card strong,.head p,.top p,.section-actions button,.tileactions button';
    root.querySelectorAll(textSelector).forEach(el => {
      if (!visible(el) || el.matches('.sfp-select-label') || el.closest('.sfp-select-menu')) return;
      const cs = getComputedStyle(el);
      const clipX = el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX);
      const clipY = el.scrollHeight > el.clientHeight + 2 && /(hidden|clip)/.test(cs.overflowY);
      if (clipX || clipY) {
        problems.push(`[${viewportName}/${pageId}] texto cortado: ${describe(el)} client=${el.clientWidth}x${el.clientHeight} scroll=${el.scrollWidth}x${el.scrollHeight}`);
      }
    });

    root.querySelectorAll('.grid2,.grid3,.metric-grid,.two,.three,.management-layout,.management-card,.panel,.item,.head,.actions,.section-actions,.tileactions,.sfp-view-grid,.sfp-view-card').forEach(el => {
      if (!visible(el)) return;
      const minWidth = parseFloat(getComputedStyle(el).minWidth || '0');
      if (minWidth > vw && !hasScrollableAncestor(el)) {
        problems.push(`[${viewportName}/${pageId}] min-width impossível: ${describe(el)} min-width=${minWidth}px viewport=${vw}`);
      }
    });

    const active = document.querySelector(`#${CSS.escape(pageId)}.tab.active`);
    if (active) {
      const r = active.getBoundingClientRect();
      if (r.width > vw + 2) problems.push(`[${viewportName}/${pageId}] aba ativa mais larga que viewport: ${Math.round(r.width)}px > ${vw}px`);
    }

    if (document.documentElement.scrollHeight > 0 && vh < 450 && pageId === 'sophy') {
      const form = document.querySelector('#sophyChatForm');
      if (form && visible(form)) {
        const r = form.getBoundingClientRect();
        if (r.bottom > vh + 2) problems.push(`[${viewportName}/${pageId}] composer da Sophy abaixo da tela: bottom=${Math.round(r.bottom)} viewport=${vh}`);
      }
    }
    return problems;
  }, { pageId, viewportName });
}

for (const vp of VIEWPORTS) {
  test(`visual sweep ${vp.name}: todas as telas sem overflow ou texto cortado`, async ({ page }) => {
    await boot(page, vp);
    const all = [];
    for (const pageId of PAGES) {
      await page.evaluate(id => window.setPage(id, { mode: 'replace' }), pageId);
      await page.waitForTimeout(40);
      all.push(...await inspectVisualState(page, pageId, vp.name));
    }
    expect(all, all.join('\n')).toEqual([]);
  });
}

test('visual sweep Galaxy S24: formulários progressivos e diálogos permanecem dentro do viewport', async ({ page }) => {
  const vp = VIEWPORTS.find(x => x.name === 'galaxy-s24');
  await boot(page, vp);
  const all = [];
  for (const pageId of ['contas','cartoes','dividas','metas']) {
    await page.evaluate(id => { window.setPage(id, { mode: 'replace' }); window.openManagementAction(id); }, pageId);
    await page.waitForTimeout(50);
    all.push(...await page.evaluate(({ pageId, viewportName }) => {
      const problems = [];
      const vw = innerWidth;
      const modal = document.querySelector('#modalRoot:not(.hidden)');
      const panel = modal?.querySelector('.management-form-panel,.sfp-dialog,.progressive-panel') || document.querySelector(`#${pageId} .management-form-panel`);
      if (panel) {
        const r = panel.getBoundingClientRect();
        if (r.left < -2 || r.right > vw + 2) problems.push(`[${viewportName}/${pageId}] formulário fora da tela: ${Math.round(r.left)}..${Math.round(r.right)} viewport=${vw}`);
        panel.querySelectorAll('button,h2,h3,label').forEach(el => {
          const cs = getComputedStyle(el);
          const visible = cs.display !== 'none' && el.getBoundingClientRect().width > 0;
          if (visible && el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX)) problems.push(`[${viewportName}/${pageId}] texto cortado em formulário: ${(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,80)}`);
        });
      }
      if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > vw + 2) problems.push(`[${viewportName}/${pageId}] formulário causa overflow horizontal global`);
      return problems;
    }, { pageId, viewportName: vp.name }));
    await page.evaluate(() => { if (typeof window.closeProgressive === 'function') window.closeProgressive(false); const root=document.querySelector('#modalRoot'); if(root) root.classList.add('hidden'); });
  }
  expect(all, all.join('\n')).toEqual([]);
});

test('visual sweep Galaxy S24: seletor customizado de conta fica tematizado e contido', async ({ page }) => {
  const vp = VIEWPORTS.find(x => x.name === 'galaxy-s24');
  await boot(page, vp);
  await page.evaluate(() => { window.setPage('contas', { mode: 'replace' }); window.openManagementAction('contas'); });
  const select = page.locator('#accountType');
  await expect(select).toHaveClass(/sfp-review-native-select/);
  const host = page.locator('.sfp-select[data-for-select="accountType"]');
  await expect(host).toBeVisible();
  await host.locator('.sfp-select-button').click();
  const menu = host.locator('.sfp-select-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  const background = await menu.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe('rgb(255, 255, 255)');
});

test('visual sweep Galaxy S24: campo monetário seleciona zero e normaliza duas casas', async ({ page }) => {
  const vp = VIEWPORTS.find(x => x.name === 'galaxy-s24');
  await boot(page, vp);
  await page.evaluate(() => { window.setPage('contas', { mode: 'replace' }); window.openManagementAction('contas'); });
  const field = page.locator('#accountInitial');
  await field.fill('0,00');
  await field.blur();
  await field.focus();
  const selected = await field.evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length);
  expect(selected).toBe(true);
  await field.fill('25');
  await field.blur();
  await expect(field).toHaveValue(/25(?:,|\.)00/);
});
