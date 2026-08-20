const { test, expect } = require('@playwright/test');
const { fixture } = require('./helpers');

async function candidates(page, transactions, rows) {
  await page.goto('/index.html');
  return page.evaluate(({ value, transactions, rows }) => {
    state = value; state.transactions = transactions; normalize();
    return rows.map(r => reconcileCandidate(r, 1)?.id ?? null);
  }, { value: fixture('Matching QA'), transactions, rows });
}

test('MATCH-01/02 polaridade impede receita-débito e despesa-crédito', async ({ page }) => {
  const tx = [
    { id: 1, kind: 'income', desc: 'Salário Empresa', amount: 100, date: '2026-02-10', accountId: 1 },
    { id: 2, kind: 'expense', desc: 'Mercado Central', amount: 100, date: '2026-02-10', accountId: 1 }
  ];
  expect(await candidates(page, tx, [
    { desc: 'Salário Empresa', amount: -100, date: '2026-02-10' },
    { desc: 'Mercado Central', amount: 100, date: '2026-02-10' }
  ])).toEqual([null, null]);
});

test('MATCH-03/04 descrição incompatível e empate não escolhem arbitrariamente', async ({ page }) => {
  const tx = [
    { id: 1, kind: 'expense', desc: 'Academia Fit', amount: 80, date: '2026-02-10', accountId: 1 },
    { id: 2, kind: 'expense', desc: 'Academia Fit', amount: 80, date: '2026-02-10', accountId: 1 }
  ];
  expect(await candidates(page, tx, [
    { desc: 'Restaurante Praia', amount: -80, date: '2026-02-10' },
    { desc: 'Academia Fit', amount: -80, date: '2026-02-10' }
  ])).toEqual([null, null]);
});

test('MATCH-05 proximidade inequívoca vence e conciliado não é reutilizado', async ({ page }) => {
  const tx = [
    { id: 1, kind: 'expense', desc: 'Mercado Central Loja', amount: 50, date: '2026-02-10', accountId: 1 },
    { id: 2, kind: 'expense', desc: 'Mercado Central', amount: 50, date: '2026-02-13', accountId: 1 },
    { id: 3, kind: 'expense', desc: 'Mercado Central Loja', amount: 50, date: '2026-02-10', accountId: 1, statementKey: 'usado' }
  ];
  expect(await candidates(page, tx, [{ desc: 'Mercado Central Loja', amount: -50, date: '2026-02-10' }])).toEqual([1]);
});
