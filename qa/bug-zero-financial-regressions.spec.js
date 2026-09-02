const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

async function loadState(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
}

test('dívida Price bancária reduz caixa pelo pagamento e passivo somente pelo principal', async ({ page }) => {
  const value = fixture('Price QA');
  value.mesAtual = '2026-01';
  value.debts = [{
    id: 50, name: 'Price QA', balance: 1000, rate: 10, ratePeriod: 'monthly',
    payment: 200, installments: 12, paidInstallments: 0, firstDue: '2026-01-15',
    paymentMethod: 'bank', amortizationMethod: 'price', accountId: 1, history: []
  }];
  await loadState(page, value);
  const errors = monitor(page);

  const beforeCash = await page.evaluate(() => accountBalance(1));
  await page.evaluate(async () => payDebtInstallment(50));
  const result = await page.evaluate(() => ({
    cash: accountBalance(1),
    debt: structuredClone(state.debts[0]),
    cashTx: structuredClone(state.transactions.find(t => t.debtId === 50)),
    debtCategory: categoriesSpent('2026-01')['Dívida'],
    source: dueEvents('2026-01').find(e => e.debtId === 50)?.source
  }));

  expect(beforeCash - result.cash).toBeCloseTo(200, 2);
  expect(result.debt.balance).toBeCloseTo(900, 2);
  expect(result.debt.history[0]).toMatchObject({ amount: 200, interest: 100, principal: 100, method: 'bank' });
  expect(result.cashTx).toMatchObject({ amount: 200, economicImpact: 'neutral', debtId: 50 });
  expect(result.debtCategory).toBeCloseTo(200, 2);
  expect(result.source).toBe('debt');
  expect(errors).toEqual([]);
});

test('dívida não convergente não vira prazo fictício de 999 meses', async ({ page }) => {
  const value = fixture('Não converge QA');
  value.debts = [{ id: 60, name: 'Inviável', balance: 1000, rate: 20, ratePeriod: 'monthly', payment: 100, installments: 24, paidInstallments: 0, firstDue: '2026-01-10', paymentMethod: 'bank', amortizationMethod: 'price', accountId: 1, history: [] }];
  await loadState(page, value);
  const result = await page.evaluate(() => ({ projection: debtProjection(state.debts[0]), label: debtMonthsLabel(state.debts[0]) }));
  expect(result.projection.status).toBe('not_converged');
  expect(result.projection.months).toBeNull();
  expect(result.label).toContain('não amortiza');
  expect(result.label).not.toContain('999');
});

test('aporte em meta exige origem explícita e o progresso segue a transferência real', async ({ page }) => {
  const value = fixture('Meta QA');
  value.accounts.push({ id: 2, name: 'Reserva QA', type: 'Reserva', initial: 0, balanceMode: 'snapshot', balanceDate: '2026-01-01' });
  value.goals = [{ id: 70, name: 'Moto', target: 5000, accountId: 2, plan: 200, targetDate: '2027-12-01', initialAllocated: 0, history: [] }];
  await loadState(page, value);

  await page.evaluate(() => { window.__goalPromise = goalTransfer(70); });
  await page.locator('#dialogPromptInput').fill('150');
  await page.locator('#dialogConfirmBtn').click();
  await expect(page.locator('#dialogTitle')).toHaveText('Confirmar conta de origem');
  await page.locator('#dialogConfirmBtn').click();
  await page.evaluate(async () => { await window.__goalPromise; delete window.__goalPromise; });

  let result = await page.evaluate(() => ({ transfer: structuredClone(state.transfers[0]), balance: goalBalance(state.goals[0]) }));
  expect(result.transfer).toMatchObject({ fromId: 1, toId: 2, goalId: 70, amount: 150 });
  expect(result.transfer.goalContributionId).toContain('goal:70:');
  expect(result.balance).toBe(150);

  await page.evaluate(async id => trashTransfer(id), result.transfer.id);
  result = await page.evaluate(() => ({ transfers: state.transfers.length, balance: goalBalance(state.goals[0]) }));
  expect(result.transfers).toBe(0);
  expect(result.balance).toBe(0);
});

test('conciliação deixa de dizer Conciliada quando o saldo muda depois', async ({ page }) => {
  const value = fixture('Conciliação QA');
  value.accounts[0].reconciled = { balance: 1000, date: '2026-01-01', difference: 0 };
  await loadState(page, value);
  expect(await page.evaluate(() => reconciliationStatus(state.accounts[0]).state)).toBe('reconciled');

  await page.evaluate(() => {
    state.transactions.push({ id: 90, kind: 'expense', desc: 'Depois da conciliação', amount: 100, date: '2026-01-02', category: 'Outros', accountId: 1, status: 'paid', balanceImpact: true, createdAt: Date.now() });
  });
  const result = await page.evaluate(() => reconciliationStatus(state.accounts[0]));
  expect(result.state).toBe('difference');
  expect(result.difference).toBeCloseTo(100, 2);
  await page.evaluate(() => renderAccounts());
  await expect(page.locator('#accountsGrid')).toContainText('Divergência');
});

test('exclusões de conta e cartão são bloqueadas por referências indiretas', async ({ page }) => {
  const value = fixture('Refs QA');
  value.recurring = [{ id: 1, desc: 'Conta fixa', type: 'expense', amount: 10, day: 5, category: 'Casa', accountId: 1, start: '2026-01', end: '', active: true, skips: [] }];
  value.invoices = [{ id: 10, cardId: 1, month: '2026-01', paidAmount: 0, payments: [] }];
  await loadState(page, value);

  const refs = await page.evaluate(() => ({ account: accountReferenceSummary(1), card: cardReferenceSummary(1) }));
  expect(refs.account.some(x => x.startsWith('recorrências:'))).toBe(true);
  expect(refs.card.some(x => x.startsWith('faturas:'))).toBe(true);
  await page.evaluate(async () => { await removeAccount(1); await removeCard(1); });
  expect(await page.evaluate(() => ({ accounts: state.accounts.length, cards: state.cards.length }))).toEqual({ accounts: 1, cards: 1 });
});

test('orçamento remove limite inválido e preset altera metas reais do mês', async ({ page }) => {
  const value = fixture('Budget QA');
  value.categoryBudgets = { Lazer: -10, Casa: 500 };
  value.transactions = [{ id: 1, kind: 'income', desc: 'Salário', amount: 2000, date: '2026-01-05', category: 'Salário', accountId: 1, status: 'paid', balanceImpact: true }];
  await loadState(page, value);

  expect(await page.evaluate(() => state.categoryBudgets)).toEqual({ Casa: 500 });
  const before = await page.evaluate(() => budgetModelSnapshot('2026-01'));
  expect(before.needs.target).toBe(1000);
  expect(before.wants.target).toBe(600);
  expect(before.save.target).toBe(400);

  const after = await page.evaluate(() => {
    Object.assign(state.settings, { budgetPreset: '601020', needs: 60, wants: 20, save: 20 });
    return budgetModelSnapshot('2026-01');
  });
  expect(after.needs.target).toBe(1200);
  expect(after.wants.target).toBe(400);
  expect(after.save.target).toBe(400);
});

test('auditoria de duplicata considera conta e remoção automática exige identidade forte', async ({ page }) => {
  const value = fixture('Duplicatas QA');
  value.accounts.push({ id: 2, name: 'Conta 2', type: 'Conta corrente', initial: 0, balanceMode: 'snapshot', balanceDate: '2026-01-01' });
  value.transactions = [
    { id: 1, kind: 'expense', desc: 'Mercado', amount: 50, date: '2026-01-05', category: 'Casa', accountId: 1, status: 'paid' },
    { id: 2, kind: 'expense', desc: 'Mercado', amount: 50, date: '2026-01-05', category: 'Casa', accountId: 2, status: 'paid' }
  ];
  await loadState(page, value);
  expect(await page.evaluate(() => auditData().dups)).toBe(0);

  const identities = await page.evaluate(() => ({
    first: strongMovementIdentity(state.transactions[0]),
    second: strongMovementIdentity(state.transactions[1]),
    heuristicFirst: duplicateHeuristicKey(state.transactions[0]),
    heuristicSecond: duplicateHeuristicKey(state.transactions[1])
  }));
  expect(identities.first).not.toBe(identities.second);
  expect(identities.heuristicFirst).not.toBe(identities.heuristicSecond);
});
