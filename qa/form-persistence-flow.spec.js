// Regressão do fluxo seguro: persistir antes de limpar e fechar formulários.
const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
}

async function delayNextPersistence(page) {
  await page.evaluate(() => {
    window.__qaOriginalDbSet = dbSet;
    window.__qaPendingDbSet = null;
    dbSet = async value => new Promise((resolve, reject) => {
      const snapshot = structuredClone(value);
      window.__qaPendingDbSet = async () => {
        try {
          const result = await window.__qaOriginalDbSet(snapshot);
          resolve(result);
          return result;
        } catch (error) {
          reject(error);
          throw error;
        }
      };
    });
  });
}

async function releasePersistence(page) {
  await page.evaluate(async () => {
    const release = window.__qaPendingDbSet;
    if (!release) throw new Error('Persistência QA não ficou pendente.');
    window.__qaPendingDbSet = null;
    await release();
  });
}

async function restorePersistence(page) {
  await page.evaluate(() => {
    if (window.__qaOriginalDbSet) dbSet = window.__qaOriginalDbSet;
    delete window.__qaOriginalDbSet;
    delete window.__qaPendingDbSet;
  });
}

test('cartão só limpa e fecha depois da persistência concluir', async ({ page }) => {
  const value = fixture('Persistência cartão QA');
  value.accounts = [{ id: 1, name: 'Principal', type: 'Conta corrente', initial: 1000 }];
  await boot(page, value);

  await page.evaluate(() => openManagementAction('cartoes'));
  await page.locator('#modalRoot #cardName').fill('Cartão QA');
  await page.locator('#modalRoot #cardLimit').fill('2500');
  await page.locator('#modalRoot #cardClose').fill('10');
  await page.locator('#modalRoot #cardDue').fill('17');
  await page.locator('#modalRoot #cardPayAccount').selectOption('1');

  await delayNextPersistence(page);
  await page.locator('#modalRoot #cardForm button').click();

  await expect(page.locator('#modalRoot')).toHaveClass('modalback');
  await expect(page.locator('#modalRoot #cardName')).toHaveValue('Cartão QA');

  await releasePersistence(page);
  await expect.poll(() => page.evaluate(async () => (await dbGet()).value.cards.some(card => card.name === 'Cartão QA'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass('hidden');
  await expect(page.locator('#cardName')).toHaveValue('');
  await restorePersistence(page);
});

test('meta só limpa e fecha depois da persistência concluir', async ({ page }) => {
  const value = fixture('Persistência meta QA');
  value.accounts = [{ id: 1, name: 'Reserva', type: 'Reserva', initial: 500 }];
  await boot(page, value);

  await page.evaluate(() => openManagementAction('metas'));
  await page.locator('#modalRoot #goalName').fill('Viagem QA');
  await page.locator('#modalRoot #goalTarget').fill('6000');
  await page.locator('#modalRoot #goalAccount').selectOption('1');

  await delayNextPersistence(page);
  await page.locator('#modalRoot #goalForm button').click();

  await expect(page.locator('#modalRoot')).toHaveClass('modalback');
  await expect(page.locator('#modalRoot #goalName')).toHaveValue('Viagem QA');

  await releasePersistence(page);
  await expect.poll(() => page.evaluate(async () => (await dbGet()).value.goals.some(goal => goal.name === 'Viagem QA'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass('hidden');
  await expect(page.locator('#goalName')).toHaveValue('');
  await restorePersistence(page);
});

test('patrimônio usa painel progressivo e só finaliza após persistir', async ({ page }) => {
  const value = fixture('Persistência patrimônio QA');
  value.assets = [{ id: 91, name: 'Notebook antigo', value: 1200 }];
  await boot(page, value);

  await page.evaluate(() => editAsset(91));
  await expect(page.locator('#modalRoot')).toHaveClass('modalback');
  await page.locator('#modalRoot #assetName').fill('Notebook atualizado');
  await page.locator('#modalRoot #assetValue').fill('1800');

  await delayNextPersistence(page);
  await page.locator('#modalRoot #assetForm button').click();

  await expect(page.locator('#modalRoot')).toHaveClass('modalback');
  await expect(page.locator('#modalRoot #assetName')).toHaveValue('Notebook atualizado');

  await releasePersistence(page);
  await expect.poll(() => page.evaluate(async () => (await dbGet()).value.assets.find(asset => asset.id === 91)?.value)).toBe(1800);
  await expect(page.locator('#modalRoot')).toHaveClass('hidden');
  await expect(page.locator('#assetName')).toHaveValue('');
  await restorePersistence(page);
});
