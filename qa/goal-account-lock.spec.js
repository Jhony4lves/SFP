const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && lastSavedState);
}

test('meta com aporte real não pode trocar de conta apenas editando o cadastro', async ({ page }) => {
  const value = fixture('Meta com aporte');
  value.accounts = [
    { id: 1, name: 'Corrente', type: 'Conta corrente', initial: 1000 },
    { id: 2, name: 'Reserva A', type: 'Reserva', initial: 0 },
    { id: 3, name: 'Reserva B', type: 'Reserva', initial: 0 }
  ];
  value.goals = [{ id: 70, name: 'Moto', target: 5000, accountId: 2, plan: 200, targetDate: '2027-12', initialAllocated: 0, history: [] }];
  value.transfers = [{ id: 90, goalContributionId: 'goal:70:90', goalId: 70, desc: 'Aporte — Moto', amount: 250, date: '2026-09-08', fromId: 1, toId: 2, balanceImpact: true, tags: ['aporte'] }];
  await boot(page, value);

  await page.evaluate(() => editGoal(70));
  await page.locator('#goalAccount').selectOption('3');
  await page.locator('#goalName').fill('Moto atualizada');
  await page.locator('#goalForm').evaluate(form => form.requestSubmit());

  expect(await page.evaluate(() => ({
    accountId: state.goals[0].accountId,
    name: state.goals[0].name,
    progress: goalBalance(state.goals[0]),
    balances: [accountBalance(1), accountBalance(2), accountBalance(3)],
    warning: $('toast').textContent
  }))).toEqual({
    accountId: 2,
    name: 'Moto',
    progress: 250,
    balances: [750, 250, 0],
    warning: expect.stringContaining('já possui aportes')
  });

  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && lastSavedState);
  expect(await page.evaluate(() => ({ accountId: state.goals[0].accountId, progress: goalBalance(state.goals[0]) })))
    .toEqual({ accountId: 2, progress: 250 });
});

test('meta sem aportes pode trocar a conta vinculada normalmente', async ({ page }) => {
  const value = fixture('Meta sem aporte');
  value.accounts = [
    { id: 1, name: 'Corrente', type: 'Conta corrente', initial: 1000 },
    { id: 2, name: 'Reserva A', type: 'Reserva', initial: 0 },
    { id: 3, name: 'Reserva B', type: 'Reserva', initial: 0 }
  ];
  value.goals = [{ id: 70, name: 'Moto', target: 5000, accountId: 2, plan: 200, targetDate: '2027-12', initialAllocated: 0, history: [] }];
  await boot(page, value);

  await page.evaluate(() => editGoal(70));
  await page.locator('#goalAccount').selectOption('3');
  await page.locator('#goalForm').evaluate(form => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => Number(state.goals[0].accountId))).toBe(3);
});
