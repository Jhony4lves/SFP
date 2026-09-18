const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

const S24_PORTRAIT = { width: 390, height: 844 };
const MOBILE_WIDTHS = [320, 360, 390, 412];

async function expectPriorityBar(page) {
  const visibleButtons = page.locator('.sidebar .nav button:visible');
  await expect(visibleButtons).toHaveCount(5);
  expect(await visibleButtons.evaluateAll(list => list.map(el => el.dataset.page || el.id)))
    .toEqual(['hoje','contas','cartoes','calendario','moreNavBtn']);
}

async function expectCanonicalDataGroup(page) {
  const dataGroup = page.locator('.sfp-more-group').filter({
    has: page.locator('.sfp-more-group-title', { hasText: /^Dados$/ })
  });
  await expect(dataGroup).toHaveCount(1);

  const items = dataGroup.locator('[data-sfp-more-page]');
  await expect(items).toHaveCount(4);
  expect(await items.evaluateAll(list => list.map(el => ({
    page: el.dataset.sfpMorePage,
    label: el.querySelector('strong')?.textContent?.trim()
  })))).toEqual([
    { page: 'lancamentos', label: 'Lançamentos' },
    { page: 'extratos', label: 'Extratos' },
    { page: 'dados', label: 'Central de Dados' },
    { page: 'openfinance', label: 'Sincronização' }
  ]);

  await expect(page.locator('[data-sfp-more-page="openfinance"]')).toHaveCount(1);
  await expect(page.locator('[data-sfp-more-page="lancamentos"]')).toHaveCount(1);
}

test('Open Finance fica no Mais após a inicialização tardia sem criar sexto item', async ({ page }) => {
  const errors = monitor(page);
  await page.setViewportSize(S24_PORTRAIT);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');

  // A regressão física acontecia depois que initOther() reassumia o onclick legado.
  // Esperar além da janela de bootstrap garante que o teste exercite esse estado tardio.
  await page.waitForTimeout(3500);
  await expectPriorityBar(page);

  await page.locator('#moreNavBtn').click();
  await expectCanonicalDataGroup(page);

  const syncEntry = page.locator('[data-sfp-more-page="openfinance"]');
  await expect(syncEntry).toBeVisible();
  await expect(syncEntry).toContainText('Sincronização');

  await syncEntry.click();
  await expect(page.locator('#openfinance')).toHaveClass(/active/);
  await expect(page.locator('#pageTitle')).toHaveText('Sincronização');
  await expect(page.locator('#openFinanceSyncBtn')).toHaveText('Atualizar dados agora');
  expect(errors).toEqual([]);
});

test('menu Mais agrupado continua dono do clique mesmo se código legado sobrescrever onclick depois', async ({ page }) => {
  const errors = monitor(page);
  await page.setViewportSize(S24_PORTRAIT);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');

  await page.evaluate(() => {
    const more = document.getElementById('moreNavBtn');
    more.onclick = () => {
      const root = document.getElementById('modalRoot');
      root.className = 'modalback';
      root.innerHTML = '<div data-legacy-more="1">MENU LEGADO</div>';
    };
  });

  await page.locator('#moreNavBtn').click();
  await expect(page.locator('[data-legacy-more="1"]')).toHaveCount(0);
  await expectCanonicalDataGroup(page);
  expect(errors).toEqual([]);
});

test('Dados mantém itens únicos em 320/360/390/412 px', async ({ page }) => {
  const errors = monitor(page);

  for (const width of MOBILE_WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/index.html');
    await expect(page.locator('#pageTitle')).toHaveText('Hoje');
    await expectPriorityBar(page);
    await page.locator('#moreNavBtn').click();
    await expectCanonicalDataGroup(page);
    await page.locator('[data-sfp-more-close]').click();
  }

  expect(errors).toEqual([]);
});
