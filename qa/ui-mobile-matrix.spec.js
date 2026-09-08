const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

const VIEWPORTS = [
  { name: 'compact-320', width: 320, height: 700 },
  { name: 'short-landscape', width: 568, height: 320 }
];

async function boot(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

async function pageNames(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.sidebar .nav button[data-page]')]
      .map(button => button.dataset.page)
      .filter((value, index, values) => value && values.indexOf(value) === index);
  });
}

async function overflowSnapshot(page, pageName) {
  return page.evaluate((activePage) => {
    const viewportWidth = window.innerWidth;
    const docWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth
    );

    const section = document.getElementById(activePage);
    const sectionRect = section?.getBoundingClientRect() || null;

    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') return false;
        if (!el.getClientRects().length) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 1 && (rect.right > viewportWidth + 1 || rect.left < -1);
      })
      .slice(0, 8)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          className: String(el.className || '').slice(0, 100),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      });

    return {
      viewportWidth,
      docWidth,
      sectionRect: sectionRect ? {
        left: Math.round(sectionRect.left),
        right: Math.round(sectionRect.right),
        width: Math.round(sectionRect.width)
      } : null,
      offenders
    };
  }, pageName);
}

test.describe('SFP compact mobile UI gap coverage', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: todas as páginas permanecem sem overflow horizontal`, async ({ page }) => {
      const errors = monitor(page);
      await boot(page, viewport);

      const pages = await pageNames(page);
      expect(pages.length).toBeGreaterThanOrEqual(19);

      for (const pageName of pages) {
        await page.evaluate((name) => window.setPage(name), pageName);
        await page.waitForTimeout(40);

        await expect(page.locator(`#${pageName}`), `${pageName} deve estar ativa em ${viewport.name}`).toHaveClass(/active/);

        const snapshot = await overflowSnapshot(page, pageName);
        expect(
          snapshot.docWidth,
          `${pageName} excedeu ${snapshot.viewportWidth}px em ${viewport.name}. Offenders: ${JSON.stringify(snapshot.offenders)}`
        ).toBeLessThanOrEqual(snapshot.viewportWidth + 1);

        if (snapshot.sectionRect) {
          expect(
            snapshot.sectionRect.right,
            `${pageName} saiu pela direita em ${viewport.name}: ${JSON.stringify(snapshot.sectionRect)}`
          ).toBeLessThanOrEqual(snapshot.viewportWidth + 1);
          expect(
            snapshot.sectionRect.left,
            `${pageName} saiu pela esquerda em ${viewport.name}: ${JSON.stringify(snapshot.sectionRect)}`
          ).toBeGreaterThanOrEqual(-1);
        }
      }

      expect(errors).toEqual([]);
    });
  }

  test('320px: confirmação e prompt ficam contidos, focáveis e fecham por teclado', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, VIEWPORTS[0]);

    const confirmPromise = page.evaluate(() => window.sfpConfirm({
      title: 'Confirmar ação',
      message: 'Esta é uma mensagem longa para validar quebra de linha e contenção do diálogo em uma tela compacta.',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    }));

    const dialog = page.locator('.sfp-dialog');
    await expect(dialog).toBeVisible();

    const confirmBox = await dialog.boundingBox();
    expect(confirmBox).not.toBeNull();
    expect(confirmBox.x).toBeGreaterThanOrEqual(0);
    expect(confirmBox.x + confirmBox.width).toBeLessThanOrEqual(320);
    expect(confirmBox.y).toBeGreaterThanOrEqual(0);
    expect(confirmBox.y + confirmBox.height).toBeLessThanOrEqual(700);

    await expect(page.locator('#dialogConfirmBtn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmPromise).resolves.toBe(false);

    const promptPromise = page.evaluate(() => window.sfpPrompt({
      title: 'Descrição',
      message: 'Digite uma descrição para continuar.',
      defaultValue: 'Teste'
    }));

    await expect(page.locator('#dialogPromptInput')).toBeFocused();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Valor atualizado');
    await page.keyboard.press('Enter');
    await expect(promptPromise).resolves.toBe('Valor atualizado');

    expect(errors).toEqual([]);
  });
});
