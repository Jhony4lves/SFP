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

async function visibleFeedback(page) {
  return page.evaluate(() => {
    const candidates = [
      document.querySelector('#feedbackCard'),
      document.querySelector('#toast'),
      document.querySelector('#inAppBanner')
    ].filter(Boolean);
    const shown = candidates.filter(el => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 &&
        (el.classList.contains('show') || !el.classList.contains('hidden'));
    });
    return shown.map(el => ({ id: el.id, text: (el.textContent || '').trim().replace(/\s+/g, ' ') }));
  });
}

async function expectSingleMeaningfulFeedback(page, label) {
  await expect.poll(() => visibleFeedback(page), { message: `${label} deve gerar feedback visual` })
    .toHaveLength(1);
  const feedback = await visibleFeedback(page);
  expect(feedback[0].text.length, `${label} não pode gerar feedback vazio`).toBeGreaterThan(3);
}

test('criar conta gera feedback visual único e fecha o fluxo', async ({ page }) => {
  const value = fixture('Feedback conta QA');
  value.accounts = [];
  await boot(page, value);

  await page.evaluate(() => openManagementAction('contas'));
  await page.locator('#accountName').fill('Conta Feedback');
  await page.locator('#accountInitial').fill('250');
  await page.locator('#accountForm button[type="submit"], #accountSubmit').first().click();

  await expect.poll(() => page.evaluate(() => state.accounts.some(a => a.name === 'Conta Feedback'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expectSingleMeaningfulFeedback(page, 'criação de conta');
});

test('criar dívida gera feedback visual único e fecha o fluxo', async ({ page }) => {
  const value = fixture('Feedback dívida QA');
  value.debts = [];
  await boot(page, value);

  await page.evaluate(() => openManagementAction('dividas'));
  await page.locator('#debtName').fill('Dívida Feedback');
  await page.locator('#debtBalance').fill('1000');
  await page.locator('#debtRate').fill('1');
  await page.locator('#debtPayment').fill('100');
  await page.locator('#debtFirstDue').fill('2026-10-10');
  await page.locator('#debtInstallments').fill('10');
  await page.locator('#debtDay').fill('10');
  const account = page.locator('#debtAccount');
  if (await account.locator('option').count()) await account.selectOption({ index: 0 });
  await page.locator('#debtForm button[type="submit"], #debtSubmit').first().click();

  await expect.poll(() => page.evaluate(() => state.debts.some(d => d.name === 'Dívida Feedback'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expectSingleMeaningfulFeedback(page, 'criação de dívida');
});

test('criar recorrência gera feedback visual único e atualiza a lista', async ({ page }) => {
  const value = fixture('Feedback recorrência QA');
  value.recurring = [];
  await boot(page, value);

  await page.evaluate(() => openRecurringForm());
  await page.locator('#recDesc').fill('Internet Feedback');
  await page.locator('#recAmount').fill('120');
  await page.locator('#recDay').fill('8');
  await page.locator('#recStart').fill('2026-09');
  await page.locator('#recForm button[type="submit"], #recForm button').first().click();

  await expect.poll(() => page.evaluate(() => state.recurring.some(r => r.desc === 'Internet Feedback'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect(page.locator('#recList')).toContainText('Internet Feedback');
  await expectSingleMeaningfulFeedback(page, 'criação de recorrência');
});
