const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await writeIndexedDB(page, value);
  await page.reload();
  await page.waitForFunction(() => window.state && window.lastSavedState);
}

test('ERR-029 tema claro/escuro/sistema não reabre onboarding com base populada', async ({ page }) => {
  const value = fixture('Tema populado');
  value.settings.onboardingDone = false;
  value.transactions = [{ id: 11, kind: 'income', desc: 'Receita existente', amount: 100, date: '2026-01-05', category: 'Trabalho', accountId: 1, status: 'paid', balanceImpact: true }];
  await boot(page, value);
  await expect(page.locator('#skipOnboard')).toHaveCount(0);
  await page.evaluate(async () => {
    await setThemePreference('system');
    applyTheme('light');
    applyTheme('dark');
    await setThemePreference('light');
    await setThemePreference('dark');
    showOnboarding();
  });
  await expect(page.locator('#skipOnboard')).toHaveCount(0);
  expect(await page.evaluate(() => ({ onboardingDone: state.settings.onboardingDone, accounts: state.accounts.length, tx: state.transactions.length }))).toEqual({ onboardingDone: true, accounts: 1, tx: 1 });
});

test('ERR-020 calcula último dia útil anterior aos dias 1 e 15 com virada de mês/ano', async ({ page }) => {
  await boot(page, fixture('Calendário salário'));
  expect(await page.evaluate(() => ({
    jan1: payrollDateForAnchor('2027-01', 1),
    feb1: payrollDateForAnchor('2026-02', 1),
    jun15: payrollDateForAnchor('2026-06', 15),
    aug15: payrollDateForAnchor('2026-08', 15),
  }))).toEqual({
    jan1: '2026-12-31',
    feb1: '2026-01-30',
    jun15: '2026-06-12',
    aug15: '2026-08-14',
  });
});

test('ERR-021 salário recorrente usa data útil e não duplica ocorrência', async ({ page }) => {
  const value = fixture('Salário recorrente');
  value.mesAtual = '2026-02';
  value.recurring = [{ id: 30, desc: 'Salário', type: 'income', amount: 3000, day: 1, payrollAnchor: 1, dateRule: 'business-day-before-anchor', category: 'Trabalho', accountId: 1, start: '2026-01', end: '', active: true, skips: [] }];
  value.transactions = [{ id: 31, recurringId: 30, kind: 'income', desc: 'Salário ajustado', amount: 3100, date: '2026-02-02', category: 'Trabalho', accountId: 1, status: 'pending', balanceImpact: false }];
  await boot(page, value);
  expect(await page.evaluate(() => ({ jan: recurringOccurrences('2026-01'), feb: recurringOccurrences('2026-02') }))).toEqual({
    jan: [expect.objectContaining({ desc: 'Salário', date: '2025-12-31', amount: 3000 })],
    feb: [],
  });
});

test('ERR-023 calcula aporte, prazo e valor projetado de metas', async ({ page }) => {
  const value = fixture('Cálculo metas');
  value.mesAtual = '2026-01';
  await boot(page, value);
  expect(await page.evaluate(() => ({
    plan: calculateGoalPlan({ target: 1200, targetDate: '2026-12', baseMonth: '2026-01' }),
    date: calculateGoalPlan({ target: 1000, plan: 250, baseMonth: '2026-01' }),
    target: calculateGoalPlan({ plan: 100, targetDate: '2026-03', baseMonth: '2026-01' }),
  }))).toEqual({
    plan: expect.objectContaining({ field: 'plan', value: 100, months: 12 }),
    date: expect.objectContaining({ field: 'targetDate', value: '2026-04', months: 4 }),
    target: expect.objectContaining({ field: 'target', value: 300, months: 3 }),
  });
});
