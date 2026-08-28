const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(
    name => typeof state !== 'undefined' && state?.settings?.name === name,
    value.settings.name
  );
}

async function openReview(page) {
  await page.evaluate(() => setPage('auditoria'));
  const review = page.locator('#financialAuditIssues [data-fin-review="transaction:91"]');
  await expect(review).toBeVisible();
  await review.click();
  await expect(page.getByRole('dialog', { name: 'Revisar classificação financeira' })).toBeVisible();
}

test('REVIEW-UI-01: seletor da revisão usa UI do SFP sem popup nativo visível', async ({ page }) => {
  const value = fixture('Revisão visual');
  value.transactions.push({
    id: 91,
    kind: 'expense',
    desc: 'Pagamento recebido',
    amount: 150,
    date: '2026-08-09',
    category: 'Lazer',
    accountId: 1,
    status: 'paid',
    balanceImpact: true,
    semanticClass: 'possible_income',
    economicImpact: 'review',
    classificationConfidence: 'medium'
  });
  await boot(page, value);
  await openReview(page);

  const native = page.locator('#financialReviewNature');
  await expect(native).toHaveClass(/sfp-review-native-select/);
  await expect(page.locator('.sfp-review-select-button').first()).toBeVisible();
  await page.locator('.sfp-review-select-button').first().click();
  await expect(page.locator('.sfp-review-select-menu').first()).toBeVisible();
  await expect(page.locator('.sfp-review-select-menu').first()).toContainText('Receita real');
});

test('REVIEW-SEM-01: receita real troca categorias e remove categorias de despesa', async ({ page }) => {
  const value = fixture('Revisão semântica');
  value.transactions.push({
    id: 91,
    kind: 'expense',
    desc: 'Pagamento recebido',
    amount: 150,
    date: '2026-08-09',
    category: 'Lazer',
    accountId: 1,
    status: 'paid',
    balanceImpact: true,
    semanticClass: 'possible_income',
    economicImpact: 'review',
    classificationConfidence: 'medium'
  });
  await boot(page, value);
  await openReview(page);

  await page.locator('#financialReviewNature').selectOption('income');
  const categories = await page.locator('#financialReviewCategory option').allTextContents();
  expect(categories).toContain('Salário');
  expect(categories).toContain('Hora extra');
  expect(categories).toContain('Reembolso');
  expect(categories).not.toContain('Lazer');
  expect(categories).not.toContain('Dívida');
  expect(categories).not.toContain('Assinaturas');
  await expect(page.locator('#financialReviewCategory')).toHaveValue('Outros');

  await page.locator('#financialReviewCategory').selectOption('Salário');
  await page.locator('#financialReviewSave').click();
  const saved = await page.evaluate(() => state.transactions.find(t => t.id === 91));
  expect(saved).toMatchObject({ kind: 'income', category: 'Salário', economicImpact: 'economic' });
});

test('REVIEW-SEM-02: voltar para despesa restaura apenas categorias de despesa', async ({ page }) => {
  const value = fixture('Revisão reversível');
  value.transactions.push({
    id: 91,
    kind: 'expense',
    desc: 'Movimento a revisar',
    amount: 80,
    date: '2026-08-09',
    category: 'Lazer',
    accountId: 1,
    status: 'paid',
    balanceImpact: true,
    semanticClass: 'possible_transfer',
    economicImpact: 'review',
    classificationConfidence: 'medium'
  });
  await boot(page, value);
  await openReview(page);

  await page.locator('#financialReviewNature').selectOption('income');
  await page.locator('#financialReviewCategory').selectOption('Salário');
  await page.locator('#financialReviewNature').selectOption('expense');
  const categories = await page.locator('#financialReviewCategory option').allTextContents();
  expect(categories).toContain('Lazer');
  expect(categories).toContain('Dívida');
  expect(categories).not.toContain('Salário');
  await expect(page.locator('#financialReviewCategory')).toHaveValue('Outros');
});
