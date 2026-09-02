const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

const CASES = [
  { name: 'galaxy-s24-light', width: 390, height: 844 },
  { name: 'tablet-768-light', width: 768, height: 1024 },
  { name: 'landscape-s24-light', width: 844, height: 390 },
];

const PAGES = [
  'hoje','sophy','dashboard','visao','lancamentos','extratos','contas','cartoes',
  'recorrencias','orcamento','dividas','metas','patrimonio','calendario','relatorios',
  'simuladores','dados','auditoria','config'
];

for (const vp of CASES) {
  test(`${vp.name}: telas principais permanecem contidas`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      document.body.dataset.theme = 'light';
    });

    const problems = [];
    for (const pageId of PAGES) {
      await page.evaluate(id => window.setPage(id, { mode: 'replace' }), pageId);
      await page.waitForTimeout(35);
      const issue = await page.evaluate(({ pageId, name }) => {
        const vw = innerWidth;
        const overflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - vw;
        const active = document.querySelector(`#${CSS.escape(pageId)}.tab.active`);
        const activeWidth = active?.getBoundingClientRect().width || 0;
        return {
          pageId,
          name,
          overflow: Math.round(overflow),
          activeWidth: Math.round(activeWidth),
          viewport: vw,
        };
      }, { pageId, name: vp.name });
      if (issue.overflow > 2 || issue.activeWidth > vp.width + 2) problems.push(issue);
    }
    expect(problems).toEqual([]);
  });
}
