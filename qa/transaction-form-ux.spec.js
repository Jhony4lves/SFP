const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value = fixture('UX-03')) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(value => localStorage.setItem('sfp_final_fallback', JSON.stringify(value)), value);
  await page.reload();
  await page.waitForFunction(name => typeof state !== 'undefined' && state?.settings?.name === name && typeof lastSavedState !== 'undefined' && lastSavedState, value.settings.name);
  await page.evaluate(() => setPage('lancamentos'));
}

async function fillEssential(page, { kind, description, amount }) {
  await page.locator(`[data-kind="${kind}"]`).click();
  await page.locator('#txDesc').fill(description);
  await page.locator('#txAmount').fill(amount);
  await page.locator('#txDate').fill('2026-01-20');
}

test('UXFORM-01/06: cria receita e preserva centavos', async ({ page }) => {
  await boot(page);
  await fillEssential(page, { kind: 'income', description: 'Freela UX', amount: '123.45' });
  await page.locator('#txIncomeStatus').selectOption('pending');
  await page.locator('#txSubmit').click();
  await expect(page.locator('#hoje')).toHaveClass(/active/);
  expect(await page.evaluate(() => state.transactions.at(-1))).toMatchObject({ kind: 'income', desc: 'Freela UX', amount: 123.45, status: 'pending' });
});

test('UXFORM-02/05: cria despesa e retorna pelo fluxo replace sem quebrar Back', async ({ page }) => {
  await boot(page);
  await fillEssential(page, { kind: 'expense', description: 'Mercado UX', amount: '49.90' });
  await page.locator('#txSubmit').click();
  expect(await page.evaluate(() => state.transactions.at(-1))).toMatchObject({ kind: 'expense', amount: 49.9, status: 'paid' });
  await expect.poll(() => page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje']);
  await expect(page.locator('#hoje')).toHaveClass(/active/);
  expect(await page.evaluate(() => handleAndroidBack())).toBe(true); // fecha primeiro o feedback transitório
  expect(await page.evaluate(() => handleAndroidBack())).toBe(false);
});

test('UXFORM-03: edição mantém metadados e apresenta valores existentes', async ({ page }) => {
  const value = fixture('UX-03 edição');
  value.transactions.push({ id: 77, kind: 'income', desc: 'Original', amount: 10.25, date: '2026-01-10', category: 'Trabalho', accountId: 1, status: 'pending', dueDay: 10, note: 'nota', tags: ['legado'], balanceImpact: false, createdAt: 123, statementKey: 'opaque-key', futureMetadata: { keep: true } });
  await boot(page, value);
  await page.evaluate(() => editTx(77));
  await expect(page.locator('#txFormTitle')).toHaveText('Editar lançamento');
  await expect(page.locator('#txAmount')).toHaveValue('10.25');
  await expect(page.locator('#txIncomeStatus')).toHaveValue('pending');
  await page.locator('#txDesc').fill('Editado');
  await page.locator('#txSubmit').click();
  expect(await page.evaluate(() => state.transactions.find(t => t.id === 77))).toMatchObject({ desc: 'Editado', createdAt: 123, statementKey: 'opaque-key', futureMetadata: { keep: true } });
});

test('UXFORM-04: campos condicionais seguem o tipo selecionado', async ({ page }) => {
  await boot(page);
  await page.locator('[data-kind="card"]').click();
  await expect(page.locator('#cardFields')).toBeVisible();
  await expect(page.locator('#transferFields')).toBeHidden();
  await page.locator('[data-kind="transfer"]').click();
  await expect(page.locator('#transferFields')).toBeVisible();
  await expect(page.locator('#normalFields')).toBeHidden();
  await page.locator('[data-kind="bill"]').click();
  await expect(page.locator('#billFields')).toBeVisible();
});

test('UXFORM-07: falha de persistência restaura estado salvo', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const original = dbSet;
    const before = JSON.stringify(state.transactions);
    state.transactions.push({ id: 999, kind: 'expense', desc: 'Não persistir', amount: 1, date: '2026-01-20', accountId: 1, status: 'paid' });
    dbSet = async () => { throw Error('falha UXFORM'); };
    try { await save('Falha esperada'); } catch {}
    dbSet = original;
    return { before, after: JSON.stringify(state.transactions) };
  });
  expect(result.after).toBe(result.before);
});

test('UXFORM-08: IDs, bindings e semântica acessível críticos permanecem', async ({ page }) => {
  await boot(page);
  for (const id of ['txForm','txEditId','txDesc','txAmount','txDate','txCategory','txAccount','txStatus','txCard','txInstallments','txFrom','txTo','txNote','txTags','txRecurring','txSubmit']) await expect(page.locator(`#${id}`)).toHaveCount(1);
  await expect(page.locator('.transaction-type')).toHaveAttribute('role', 'group');
  await expect(page.locator('[data-kind="expense"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#txAmount')).toHaveAttribute('inputmode', 'decimal');
});
