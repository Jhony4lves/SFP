const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && lastSavedState);
}

test('GOAL-TRANSFER-01 aporte usa outra conta como origem quando ela existe', async ({ page }) => {
  const value = fixture('Aporte de meta');
  value.accounts = [
    { id: 1, name: 'Conta corrente', type: 'Conta corrente', initial: 1000 },
    { id: 2, name: 'Reserva', type: 'Reserva', initial: 0 }
  ];
  value.goals = [{ id: 3, name: 'Emergência', accountId: '2', target: 2000, initialAllocated: 0, history: [] }];
  await boot(page, value);

  const contribution = page.evaluate(() => goalTransfer(3));
  await page.locator('#dialogPromptInput').fill('250');
  await page.locator('#dialogConfirmBtn').click();
  await contribution;

  expect(await page.evaluate(() => ({
    transfer: state.transfers.at(-1),
    goal: goalBalance(state.goals[0]),
    balances: [accountBalance(1), accountBalance(2)]
  }))).toEqual({
    transfer: expect.objectContaining({ fromId: 1, toId: '2', amount: 250, goalId: 3 }),
    goal: 250,
    balances: [750, 250]
  });
});

test('GOAL-TRANSFER-02 aporte sem saldo exige confirmação antes de debitar', async ({ page }) => {
  const value = fixture('Aporte sem saldo');
  value.accounts = [
    { id: 1, name: 'Conta corrente', type: 'Conta corrente', initial: 100 },
    { id: 2, name: 'Reserva', type: 'Reserva', initial: 0 }
  ];
  value.goals = [{ id: 3, name: 'Emergência', accountId: 2, target: 2000, initialAllocated: 0, history: [] }];
  await boot(page, value);

  const contribution = page.evaluate(() => goalTransfer(3));
  await page.locator('#dialogPromptInput').fill('250');
  await page.locator('#dialogConfirmBtn').click();
  await expect(page.getByRole('heading', { name: 'Saldo Negativo' })).toBeVisible();
  await page.locator('#dialogCancelBtn').click();
  await contribution;

  expect(await page.evaluate(() => ({ transfers: state.transfers.length, goal: goalBalance(state.goals[0]), balance: accountBalance(1) })))
    .toEqual({ transfers: 0, goal: 0, balance: 100 });
});

test('GOAL-TRANSFER-03 aporte exige uma conta de origem distinta', async ({ page }) => {
  const value = fixture('Meta sem origem');
  value.accounts = [{ id: 2, name: 'Reserva', type: 'Reserva', initial: 100 }];
  value.goals = [{ id: 3, name: 'Emergência', accountId: '2', target: 2000, initialAllocated: 0, history: [] }];
  await boot(page, value);

  const contribution = page.evaluate(() => goalTransfer(3));
  await page.locator('#dialogPromptInput').fill('50');
  await page.locator('#dialogConfirmBtn').click();
  await contribution;

  expect(await page.evaluate(() => ({
    transfers: state.transfers.length,
    goal: goalBalance(state.goals[0]),
    balance: accountBalance(2)
  }))).toEqual({ transfers: 0, goal: 0, balance: 100 });
});
