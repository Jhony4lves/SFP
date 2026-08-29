const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(expectedName => typeof state !== 'undefined' && state?.settings?.name === expectedName, value.settings.name);
  await page.evaluate(() => {
    const tab = document.querySelector('#rulesList')?.closest('.tab');
    if (tab?.id) setPage(tab.id);
  });
}

test('ERR-027 regra aprendida mostra padrão, efeito, origem e pode ser editada sem reescrever histórico', async ({ page }) => {
  const value = fixture('Regras transparentes');
  value.classificationRules = [{ pattern: 'Mercado Central', action: 'expense', category: 'Alimentação', source: 'learned', learnedAt: '2026-08-20T10:00:00.000Z', example: 'Mercado Central Loja 123' }];
  value.transactions.push({ id: 301, kind: 'expense', desc: 'Mercado Central Loja 123', amount: 42.50, date: '2026-08-20', category: 'Alimentação', accountId: 1, status: 'paid', balanceImpact: true });

  await boot(page, value);
  await expect(page.locator('#rulesSummary')).toContainText('1 regra ativa');
  const item = page.locator('#rulesList [data-rule-index="0"]');
  await expect(item).toContainText('Mercado Central');
  await expect(item).toContainText('Despesa');
  await expect(item).toContainText('Categoria: Alimentação');
  await expect(item).toContainText('Aprendida em importação');
  await expect(item).toContainText('Mercado Central Loja 123');

  const beforeTx = await page.evaluate(() => ({ ...state.transactions.find(t => t.id === 301) }));
  await item.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar regra de classificação' })).toBeVisible();
  await page.locator('#ruleEditPattern').fill('Salario ACME');
  await page.locator('#ruleEditAction').selectOption('income');
  await page.locator('#ruleEditCategory').selectOption('Salário');
  await page.locator('#ruleEditSave').click();

  await expect.poll(() => page.evaluate(() => state.classificationRules[0]?.pattern)).toBe('Salario ACME');
  const result = await page.evaluate(() => ({ rule: state.classificationRules[0], matched: ruleFor('SALARIO ACME AGOSTO'), tx: state.transactions.find(t => t.id === 301) }));
  expect(result.rule).toMatchObject({ pattern: 'Salario ACME', action: 'income', category: 'Salário', editedByUser: true });
  expect(result.rule.updatedAt).toBeTruthy();
  expect(result.matched).toMatchObject({ action: 'income', category: 'Salário' });
  expect(result.tx).toMatchObject(beforeTx);
  await expect(page.locator('#rulesList [data-rule-index="0"]')).toContainText('Editada por você');
});

test('ERR-027 exclusão de regra pede confirmação e deixa efeito explícito', async ({ page }) => {
  const value = fixture('Excluir regra');
  value.classificationRules = [{ pattern: 'UBER', action: 'expense', category: 'Transporte', source: 'learned' }];
  await boot(page, value);
  await page.locator('#rulesList [data-rule-index="0"]').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('dialog', { name: 'Excluir regra de classificação' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Excluir regra de classificação' })).toContainText('novas importações');
  await page.getByRole('button', { name: 'Excluir regra' }).click();
  await expect.poll(() => page.evaluate(() => state.classificationRules.length)).toBe(0);
  await expect(page.locator('#rulesList')).toContainText('Nenhuma regra aprendida');
});

test('ERR-027 regra de transferência aprendida permanece neutra economicamente', async ({ page }) => {
  const value = fixture('Regra transferência');
  value.classificationRules = [{ pattern: 'PIX MINHA CONTA', action: 'transfer', category: 'Outros', source: 'learned' }];
  await boot(page, value);
  const semantic = await page.evaluate(() => semanticClassify('Pix Minha Conta reserva', -150));
  expect(semantic).toMatchObject({ action: 'transfer', semanticClass: 'learned_rule', economicImpact: 'neutral', confidence: 'high' });
});

test('ERR-027 editor preserva categoria aprendida fora da lista padrão', async ({ page }) => {
  const value = fixture('Categoria aprendida preservada');
  value.classificationRules = [{ pattern: 'APORTE CDB', action: 'expense', category: 'Investimentos', source: 'learned' }];
  await boot(page, value);
  const item = page.locator('#rulesList [data-rule-index="0"]');
  await item.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#ruleEditCategory')).toHaveValue('Investimentos');
  await page.locator('#ruleEditPattern').fill('APORTE RENDA FIXA');
  await page.locator('#ruleEditSave').click();
  const rule = await page.evaluate(() => state.classificationRules[0]);
  expect(rule).toMatchObject({ pattern: 'APORTE RENDA FIXA', category: 'Investimentos' });
});
