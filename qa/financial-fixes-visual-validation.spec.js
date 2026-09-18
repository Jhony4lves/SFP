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

async function expectWarningVisibleAndContained(page, fragment) {
  const toast = page.locator('#toast');
  await expect(toast).toHaveClass(/show/);
  await expect(toast).toContainText(fragment);
  const metrics = await toast.evaluate(el => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectModalContained(page) {
  await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
  const modal = page.locator('#modalRoot .modal').first();
  await expect(modal).toBeVisible();
  const metrics = await modal.evaluate(el => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.top).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.bottom).toBeGreaterThanOrEqual(0);
}

for (const viewport of [
  { name: 'compacto-320', width: 320, height: 700 },
  { name: 'galaxy-390', width: 390, height: 844 }
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('dívida bloqueada mantém formulário corrigível e aviso visível', async ({ page }) => {
      const value = fixture(`Visual dívida ${viewport.name}`);
      value.debts = [{
        id: 501,
        name: 'Empréstimo visual QA',
        balance: 200,
        rate: 0,
        payment: 100,
        installments: 3,
        paidInstallments: 1,
        firstDue: '2026-01-10',
        accountId: 1,
        paymentMethod: 'bank',
        amortizationMethod: 'manual',
        history: [{ id: 9001, type: 'payment', installment: 3, amount: 100, date: '2026-03-10' }]
      }];
      await boot(page, value);

      await page.evaluate(() => editDebt(501));
      await page.locator('#debtInstallments').fill('2');
      await page.locator('#debtForm').evaluate(form => form.requestSubmit());

      await expect.poll(() => page.evaluate(() => state.debts[0].installments)).toBe(3);
      await expect(page.locator('#debtInstallments')).toHaveValue('2');
      await expectModalContained(page);
      await expectWarningVisibleAndContained(page, 'parcela 3');
    });

    test('meta bloqueada mantém seleção tentada visível e aviso dentro da viewport', async ({ page }) => {
      const value = fixture(`Visual meta ${viewport.name}`);
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
      await page.locator('#goalForm').evaluate(form => form.requestSubmit());

      await expect.poll(() => page.evaluate(() => Number(state.goals[0].accountId))).toBe(2);
      await expect(page.locator('#goalAccount')).toHaveValue('3');
      await expectModalContained(page);
      await expectWarningVisibleAndContained(page, 'já possui aportes');
    });
  });
}
