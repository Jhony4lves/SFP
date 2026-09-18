const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
}

test('OPEN-FINANCE-CARD-MAP-01 mapeia Platinum da Nu Pagamentos pelo nome e pela conta pagadora', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('Open Finance Platinum mapping');
  value.accounts = [
    { id: 1, name: 'Nubank', type: 'Conta corrente', initial: 0 },
    { id: 2, name: 'Itaú', type: 'Conta corrente', initial: 0 }
  ];
  value.cards = [
    { id: 10, name: 'Platinum', limit: 4000, closeDay: 10, dueDay: 17, payAccountId: 1, history: [] },
    { id: 20, name: 'Itaú Click', limit: 3000, closeDay: 10, dueDay: 17, payAccountId: 2, history: [] }
  ];
  await boot(page, value);

  const match = await page.evaluate(() => {
    const result = window.SFPOpenFinancePersonal.suggestSfpEntity({
      id: 'pluggy-card-nu', type: 'CREDIT', subtype: 'CREDIT_CARD',
      name: 'platinum', marketingName: 'platinum', presentationName: 'platinum', lastFour: '1234'
    }, 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)');
    return result ? { id: result.entity.id, name: result.entity.name, score: result.score } : null;
  });

  expect(match).not.toBeNull();
  expect(match.id).toBe(10);
  expect(match.name).toBe('Platinum');
  expect(match.score).toBeGreaterThanOrEqual(8);
  expect(errors).toEqual([]);
});

test('OPEN-FINANCE-CARD-MAP-02 não chuta quando dois cartões da mesma instituição empatam', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('Open Finance ambiguous mapping');
  value.accounts = [{ id: 1, name: 'Nubank', type: 'Conta corrente', initial: 0 }];
  value.cards = [
    { id: 10, name: 'Cartão A', limit: 4000, closeDay: 10, dueDay: 17, payAccountId: 1, history: [] },
    { id: 11, name: 'Cartão B', limit: 4000, closeDay: 10, dueDay: 17, payAccountId: 1, history: [] }
  ];
  await boot(page, value);

  const match = await page.evaluate(() => window.SFPOpenFinancePersonal.suggestSfpEntity({
    id: 'pluggy-card-generic', type: 'CREDIT', subtype: 'CREDIT_CARD',
    name: null, marketingName: null, presentationName: 'Cartão de crédito', lastFour: '9999'
  }, 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)'));

  expect(match).toBeNull();
  expect(errors).toEqual([]);
});

test('OPEN-FINANCE-CARD-MAP-03 final conhecido desempata cartões da mesma instituição', async ({ page }) => {
  const errors = monitor(page);
  const value = fixture('Open Finance last four mapping');
  value.accounts = [{ id: 1, name: 'Nubank', type: 'Conta corrente', initial: 0 }];
  value.cards = [
    { id: 10, name: 'Nubank final 1234', limit: 4000, closeDay: 10, dueDay: 17, payAccountId: 1, history: [] },
    { id: 11, name: 'Nubank final 5678', limit: 4000, closeDay: 10, dueDay: 17, payAccountId: 1, history: [] }
  ];
  await boot(page, value);

  const match = await page.evaluate(() => {
    const result = window.SFPOpenFinancePersonal.suggestSfpEntity({
      id: 'pluggy-card-last-four', type: 'CREDIT', subtype: 'CREDIT_CARD',
      name: 'platinum', marketingName: 'platinum', presentationName: 'Cartão de crédito • final 5678', lastFour: '5678'
    }, 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)');
    return result ? result.entity.id : null;
  });

  expect(match).toBe(11);
  expect(errors).toEqual([]);
});
