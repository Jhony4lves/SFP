const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(name => typeof state !== 'undefined' && state?.settings?.name === name, value.settings.name);
}

test('AUDIT-OF-239-01: total oficial Open Finance sem detalhe local não é divergência', async ({ page }) => {
  const value = fixture('Open Finance sem fatura importada');
  value.invoices.push({
    id: 9001, cardId: 1, month: '2026-09', status: 'open', paidAmount: 0,
    officialTotal: 170.84, officialTotalSource: 'open-finance-bill', openFinanceBillId: 'bill-sep', payments: []
  });
  await boot(page, value);
  const issue = await page.evaluate(() => auditData().issues.find(i => i.invoiceId === 9001));
  expect(issue).toBeUndefined();
});

test('AUDIT-OF-239-02: divergência continua visível quando existem compras locais', async ({ page }) => {
  const value = fixture('Open Finance com detalhe divergente');
  value.purchases.push({
    id: 9002, cardId: 1, desc: 'Compra local', total: 252.48, installments: 1,
    purchaseDate: '2026-08-05', firstMonth: '2026-08', category: 'Outros', status: 'active', refunds: []
  });
  value.invoices.push({
    id: 9003, cardId: 1, month: '2026-08', status: 'closed', paidAmount: 0,
    officialTotal: 59.99, officialTotalSource: 'open-finance-bill', openFinanceBillId: 'bill-aug', payments: []
  });
  await boot(page, value);
  const issue = await page.evaluate(() => auditData().issues.find(i => i.invoiceId === 9003));
  expect(issue).toMatchObject({ type: 'invoice-total-mismatch', level: 'warning' });
});

test('AUDIT-ID-239-03: IDs duplicados sem referência são reindexados sem mudar saldo ou lançamentos', async ({ page }) => {
  const value = fixture('IDs duplicados seguros');
  value.transactions.push(
    { id: 9911, kind: 'expense', desc: 'Duplicado A', amount: 10, date: '2026-09-10', category: 'Outros', accountId: 1, status: 'paid', balanceImpact: true },
    { id: 9911, kind: 'expense', desc: 'Duplicado B', amount: 20, date: '2026-09-11', category: 'Outros', accountId: 1, status: 'paid', balanceImpact: true }
  );
  await boot(page, value);
  const before = await page.evaluate(() => ({ balance: accountBalance(1), count: state.transactions.length }));
  await page.evaluate(() => setPage('auditoria'));
  const button = page.locator('#repairSafeDuplicateTransactionIds');
  await expect(button).toBeEnabled();
  await expect(button).toContainText('Corrigir 1 ID duplicado com segurança');
  await button.click();
  await page.getByRole('button', { name: 'Corrigir IDs' }).click();
  await expect.poll(() => page.evaluate(() => new Set(state.transactions.map(t => String(t.id))).size)).toBe(value.transactions.length);
  const after = await page.evaluate(() => ({
    balance: accountBalance(1), count: state.transactions.length,
    duplicateIssue: auditData().issues.some(i => /ID duplicado em transactions/i.test(i.text)),
    rows: state.transactions.filter(t => ['Duplicado A','Duplicado B'].includes(t.desc)).map(t => ({ id: t.id, desc: t.desc, amount: t.amount }))
  }));
  expect(after.balance).toBe(before.balance);
  expect(after.count).toBe(before.count);
  expect(after.duplicateIssue).toBe(false);
  expect(after.rows.map(r => r.amount).sort((a,b)=>a-b)).toEqual([10,20]);
  expect(new Set(after.rows.map(r => String(r.id))).size).toBe(2);
});

test('AUDIT-ID-239-04: ID duplicado referenciado não é alterado automaticamente', async ({ page }) => {
  const value = fixture('ID duplicado ambíguo');
  value.transactions.push(
    { id: 9922, kind: 'expense', desc: 'Ambíguo A', amount: 10, date: '2026-09-10', category: 'Outros', accountId: 1, status: 'paid' },
    { id: 9922, kind: 'expense', desc: 'Ambíguo B', amount: 20, date: '2026-09-11', category: 'Outros', accountId: 1, status: 'paid' }
  );
  value.transfers.push({ id: 9933, desc: 'Referência existente', amount: 10, date: '2026-09-10', fromId: 1, toId: 2, sourceTransactionId: 9922 });
  await boot(page, value);
  const issue = await page.evaluate(() => auditData().issues.find(i => /ID duplicado em transactions: 9922/i.test(i.text)));
  expect(issue.solution).toMatch(/não vai reindexá-lo automaticamente/i);
  await page.evaluate(() => setPage('auditoria'));
  await expect(page.locator('#repairSafeDuplicateTransactionIds')).toBeDisabled();
});

test('OF-ID-239-05: gerador Open Finance permanece único mesmo com relógio congelado', async ({ page }) => {
  const value = fixture('IDs Open Finance');
  await boot(page, value);
  const ids = await page.evaluate(() => {
    const originalNow = Date.now;
    Date.now = () => 1789424856875;
    try {
      state.transactions.push({ id: 1789424856875, kind: 'expense', desc: 'ID já usado', amount: 1, date: '2026-09-01', category: 'Outros', accountId: 1, status: 'paid' });
      return Array.from({ length: 50 }, () => SFPOpenFinanceUnifiedSync.nextInternalId());
    } finally {
      Date.now = originalNow;
    }
  });
  expect(new Set(ids.map(String)).size).toBe(50);
  expect(ids.map(String)).not.toContain('1789424856875');
  const source = fs.readFileSync('app/src/main/assets/www/open-finance-sync-accounts.js', 'utf8');
  expect(source).not.toContain("Date.now()+Math.floor(Math.random()*1000)");
  expect((source.match(/id:nextInternalId\(\),/g) || []).length).toBe(2);
});
