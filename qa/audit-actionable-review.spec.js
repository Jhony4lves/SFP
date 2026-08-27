const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state?.settings?.name === value.settings.name);
}

test('AUDIT-REVIEW-01: Revisar é ação real e permite confirmar Pix como transferência sem mudar valor/data', async ({ page }) => {
  const value = fixture('Auditoria acionável');
  value.transactions.push({
    id: 91,
    kind: 'expense',
    desc: 'Pix enviado para minha conta reserva',
    amount: 125.40,
    date: '2026-01-08',
    category: 'Transferência',
    accountId: 1,
    status: 'paid',
    balanceImpact: true,
    semanticClass: 'possible_transfer',
    economicImpact: 'review',
    classificationConfidence: 'medium',
    classificationReason: 'Possível transferência.'
  });
  await boot(page, value);

  await page.evaluate(() => setPage('auditoria'));
  const review = page.locator('#financialAuditIssues [data-fin-review="transaction:91"]');
  await expect(review).toBeVisible();
  await expect(review).toHaveText('Revisar');
  await review.click();

  await expect(page.getByRole('dialog', { name: 'Revisar classificação financeira' })).toBeVisible();
  await page.locator('#financialReviewNature').selectOption('transfer');
  await page.locator('#financialReviewSave').click();

  await expect.poll(() => page.evaluate(() => state.transactions.find(t => t.id === 91)?.economicImpact)).toBe('neutral');
  const result = await page.evaluate(() => {
    const t = state.transactions.find(x => x.id === 91);
    return {
      amount: t.amount,
      date: t.date,
      category: t.category,
      semanticClass: t.semanticClass,
      confidence: t.classificationConfidence,
      stillNeedsReview: financialAuditData().issues.some(i => i.itemKind === 'transaction' && i.itemId === 91)
    };
  });
  expect(result).toMatchObject({
    amount: 125.40,
    date: '2026-01-08',
    category: 'Transferência',
    semanticClass: 'user_transfer',
    confidence: 1,
    stillNeedsReview: false
  });
});

test('AUDIT-REVIEW-02: Pix no Crédito pode ser neutro economicamente sem sair da fatura', async ({ page }) => {
  const value = fixture('Pix cartão revisável');
  value.purchases.push({
    id: 77,
    cardId: 1,
    desc: 'Pix no Crédito - Ana Carolina',
    total: 80,
    installments: 1,
    purchaseDate: '2026-01-05',
    firstMonth: '2026-01',
    category: 'Transferência',
    status: 'active',
    refunds: [],
    tags: ['fatura-importada'],
    semanticClass: 'possible_transfer',
    economicImpact: 'review',
    classificationConfidence: 'medium'
  });
  await boot(page, value);

  const before = await page.evaluate(() => ({
    invoice: invoiceTotal(1, '2026-01'),
    economicInvoice: invoiceEconomicTotal(1, '2026-01'),
    expense: monthCalc('2026-01').exp
  }));
  expect(before).toMatchObject({ invoice: 80, economicInvoice: 80, expense: 80 });

  await page.evaluate(() => setPage('auditoria'));
  const review = page.locator('#financialAuditIssues [data-fin-review="purchase:77"]');
  await expect(review).toBeVisible();
  await review.click();
  await page.locator('#financialReviewNature').selectOption('transfer');
  await page.locator('#financialReviewSave').click();

  const after = await page.evaluate(() => {
    const p = state.purchases.find(x => x.id === 77);
    return {
      invoice: invoiceTotal(1, '2026-01'),
      economicInvoice: invoiceEconomicTotal(1, '2026-01'),
      expense: monthCalc('2026-01').exp,
      impact: p.economicImpact,
      semanticClass: p.semanticClass,
      stillNeedsReview: financialAuditData().issues.some(i => i.itemKind === 'purchase' && i.itemId === 77)
    };
  });
  expect(after).toMatchObject({
    invoice: 80,
    economicInvoice: 0,
    expense: 0,
    impact: 'neutral',
    semanticClass: 'user_card_transfer',
    stillNeedsReview: false
  });
});

test('AUDIT-DATA-01: pagamento histórico sem compras não vira falso crítico e oferece correção segura', async ({ page }) => {
  const value = fixture('Fatura histórica');
  value.invoices.push({
    id: 81,
    cardId: 1,
    month: '2026-01',
    status: 'paid',
    paidAmount: 8,
    officialTotal: 8,
    accountId: 1,
    payments: [{
      date: '2026-02-01',
      amount: 8,
      balanceImpact: false,
      targetMonth: '2026-01',
      sourceDesc: 'Pagamento recebido'
    }]
  });
  await boot(page, value);

  const initial = await page.evaluate(() => auditData());
  expect(initial.critical).toBe(0);
  expect(initial.issues.some(i => i.type === 'invoice-overpaid')).toBe(false);
  expect(initial.issues.some(i => i.type === 'historical-invoice-placeholder' && i.repairable)).toBe(true);

  await page.evaluate(() => setPage('auditoria'));
  await expect(page.locator('#auditIssues')).toContainText('Como resolver:');
  const repair = page.locator('#auditIssues [data-audit-repair="81"]');
  await expect(repair).toBeVisible();
  await repair.click();
  await page.getByRole('button', { name: 'Corrigir registro' }).click();

  await expect.poll(() => page.evaluate(() => state.invoices.find(i => i.id === 81)?.historicalOnly)).toBe(true);
  const result = await page.evaluate(() => {
    const inv = state.invoices.find(i => i.id === 81);
    return {
      officialTotal: inv.officialTotal,
      paidAmount: inv.paidAmount,
      paymentCount: inv.payments.length,
      balanceImpact: inv.payments[0].balanceImpact,
      remainingIssues: auditData().issues.filter(i => i.invoiceId === 81).length
    };
  });
  expect(result).toMatchObject({
    officialTotal: null,
    paidAmount: 8,
    paymentCount: 1,
    balanceImpact: false,
    remainingIssues: 0
  });
});

test('AUDIT-DATA-02: inconsistência real informa solução e leva à fatura correta', async ({ page }) => {
  const value = fixture('Fatura com divergência');
  value.purchases.push({
    id: 50, cardId: 1, desc: 'Compra QA', total: 10, installments: 1,
    purchaseDate: '2026-01-05', firstMonth: '2026-01', category: 'Outros', status: 'active', refunds: []
  });
  value.invoices.push({
    id: 82, cardId: 1, month: '2026-01', status: 'open', paidAmount: 0,
    officialTotal: 20, accountId: 1, payments: []
  });
  await boot(page, value);

  await page.evaluate(() => setPage('auditoria'));
  await expect(page.locator('#auditIssues')).toContainText('Como resolver:');
  const open = page.locator('#auditIssues [data-audit-invoice="1:2026-01"]');
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.locator('#cartoes')).toHaveClass(/active/);
  await expect(page.locator('#invoiceCard')).toHaveValue('1');
  await expect(page.locator('#invoiceMonth')).toHaveValue('2026-01');
});
