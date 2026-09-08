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

    return candidates
      .filter(el => {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
        if (el.id === 'feedbackCard' || el.id === 'toast') return el.classList.contains('show');
        if (el.id === 'inAppBanner') return !el.classList.contains('hidden');
        return false;
      })
      .map(el => ({ id: el.id, text: (el.textContent || '').trim().replace(/\s+/g, ' ') }))
      .filter(item => item.text.length > 0);
  });
}

async function expectSingleMeaningfulFeedback(page, label, expectedText) {
  await expect.poll(() => visibleFeedback(page), { message: `${label} deve gerar feedback visual` })
    .toHaveLength(1);
  const feedback = await visibleFeedback(page);
  expect(feedback[0].text.length, `${label} não pode gerar feedback vazio`).toBeGreaterThan(3);
  if (expectedText) expect(feedback[0].text).toContain(expectedText);
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
  await expectSingleMeaningfulFeedback(page, 'criação de conta', 'Conta salva com sucesso.');
});

test('editar conta gera feedback visual único sem criar duplicata', async ({ page }) => {
  const value = fixture('Feedback edição conta QA');
  value.accounts = [{ id: 81, name: 'Conta Antiga', type: 'Conta corrente', initial: 100, balanceMode: 'snapshot', balanceDate: '2026-09-01' }];
  await boot(page, value);

  await page.evaluate(() => editAccount(81));
  await page.locator('#accountName').fill('Conta Editada');
  await page.locator('#accountForm button[type="submit"], #accountSubmit').first().click();

  await expect.poll(() => page.evaluate(() => state.accounts.find(a => a.id === 81)?.name)).toBe('Conta Editada');
  await expect.poll(() => page.evaluate(() => state.accounts.length)).toBe(1);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expectSingleMeaningfulFeedback(page, 'edição de conta', 'Conta atualizada com sucesso.');
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
  await page.locator('#debtForm button[type="submit"], #debtSubmit').first().click();

  await expect.poll(() => page.evaluate(() => state.debts.some(d => d.name === 'Dívida Feedback'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expectSingleMeaningfulFeedback(page, 'criação de dívida', 'Dívida salva com sucesso.');
});

test('editar dívida gera feedback visual único sem criar duplicata', async ({ page }) => {
  const value = fixture('Feedback edição dívida QA');
  value.debts = [{ id: 82, name: 'Dívida Antiga', balance: 1000, rate: 1, payment: 100, firstDue: '2026-10-10', installments: 10, paidInstallments: 0, paymentMethod: 'bank', history: [] }];
  await boot(page, value);

  await page.evaluate(() => editDebt(82));
  await page.locator('#debtName').fill('Dívida Editada');
  await page.locator('#debtForm button[type="submit"], #debtSubmit').first().click();

  await expect.poll(() => page.evaluate(() => state.debts.find(d => d.id === 82)?.name)).toBe('Dívida Editada');
  await expect.poll(() => page.evaluate(() => state.debts.length)).toBe(1);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expectSingleMeaningfulFeedback(page, 'edição de dívida', 'Dívida atualizada com sucesso.');
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
  await expectSingleMeaningfulFeedback(page, 'criação de recorrência', 'Recorrência salva com sucesso.');
});

test('editar recorrência gera feedback visual único sem criar duplicata', async ({ page }) => {
  const value = fixture('Feedback edição recorrência QA');
  value.recurring = [{ id: 83, desc: 'Recorrência Antiga', amount: 120, day: 8, start: '2026-09', kind: 'expense', active: true }];
  await boot(page, value);

  await page.evaluate(() => editRecurring(83));
  await page.locator('#recDesc').fill('Recorrência Editada');
  await page.locator('#recForm button[type="submit"], #recForm button').first().click();

  await expect.poll(() => page.evaluate(() => state.recurring.find(r => r.id === 83)?.desc)).toBe('Recorrência Editada');
  await expect.poll(() => page.evaluate(() => state.recurring.length)).toBe(1);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect(page.locator('#recList')).toContainText('Recorrência Editada');
  await expectSingleMeaningfulFeedback(page, 'edição de recorrência', 'Recorrência atualizada com sucesso.');
});
