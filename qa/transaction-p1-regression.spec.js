const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.evaluate(() => setPage('lancamentos'));
}

test('P1 lançamentos: conta a pagar preserva identidade, vencimento e status ao editar', async ({ page }) => {
  const value = fixture('Conta a pagar P1');
  value.transactions.push({
    id: 701,
    kind: 'expense',
    desc: 'Faculdade legada',
    amount: 450,
    date: `${value.mesAtual}-05`,
    category: 'Faculdade',
    accountId: 1,
    status: 'pending',
    dueDay: 20,
    note: 'mensalidade',
    tags: [],
    balanceImpact: false,
    createdAt: 123
  });
  await boot(page, value);

  await page.evaluate(() => editTx(701));
  await expect(page.locator('[data-kind="bill"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#txDueDay')).toHaveValue('20');
  await expect(page.locator('#txStatus')).toHaveValue('pending');
  await expect(page.locator('[data-kind="expense"]')).toBeDisabled();

  await page.locator('#txDesc').fill('Faculdade editada');
  await page.locator('#txSubmit').click();

  const saved = await page.evaluate(() => structuredClone(state.transactions.find(t => t.id === 701)));
  expect(saved).toMatchObject({
    kind: 'expense',
    entryType: 'bill',
    desc: 'Faculdade editada',
    status: 'pending',
    dueDay: 20,
    createdAt: 123
  });
  const persisted = await page.evaluate(async () => (await dbGet()).value.transactions.find(t => t.id === 701));
  expect(persisted).toMatchObject({ entryType: 'bill', status: 'pending', dueDay: 20 });
});

test('P1 lançamentos: transferência da tabela pode ser editada sem duplicar e excluída', async ({ page }) => {
  const value = fixture('Transferência P1');
  value.accounts.push({ id: 2, name: 'Reserva', type: 'Reserva', initial: 300 });
  value.transfers.push({
    id: 880,
    desc: 'Mover para reserva',
    amount: 50,
    date: `${value.mesAtual}-10`,
    fromId: 1,
    toId: 2,
    tags: ['reserva'],
    note: 'teste',
    balanceImpact: true
  });
  await boot(page, value);

  const row = page.locator('#txTable tr').filter({ hasText: 'Mover para reserva' });
  await row.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('[data-kind="transfer"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#txFrom')).toHaveValue('1');
  await expect(page.locator('#txTo')).toHaveValue('2');
  await page.locator('#txAmount').fill('75');
  await page.locator('#txSubmit').click();

  let transfers = await page.evaluate(() => structuredClone(state.transfers));
  expect(transfers).toHaveLength(1);
  expect(transfers[0]).toMatchObject({ id: 880, amount: 75, fromId: 1, toId: 2 });

  await page.evaluate(() => setPage('lancamentos'));
  const updatedRow = page.locator('#txTable tr').filter({ hasText: 'Mover para reserva' });
  await updatedRow.getByRole('button', { name: 'Excluir' }).click();
  await expect.poll(() => page.evaluate(() => state.transfers.length)).toBe(0);
  expect(await page.evaluate(() => state.trash.some(item => item.type === 'transfer' && item.item?.id === 880))).toBe(true);
});

test('P1 lançamentos: não exibe controles que a operação ignora', async ({ page }) => {
  const value = fixture('Controles contextuais P1');
  await boot(page, value);

  await page.locator('[data-kind="card"]').click();
  await expect(page.locator('#cardFields')).toBeVisible();
  await expect(page.locator('#txAccountField')).toBeHidden();
  await expect(page.locator('#txRecurringField')).toBeHidden();
  await expect(page.locator('#txFormSubtitle')).toContainText('fatura');

  await page.locator('[data-kind="transfer"]').click();
  await expect(page.locator('#transferFields')).toBeVisible();
  await expect(page.locator('#txRecurringField')).toBeHidden();
  await expect(page.locator('#txClassificationSection')).toBeHidden();

  await page.locator('[data-kind="income"]').click();
  await expect(page.locator('#incomeFields')).toBeVisible();
  await expect(page.locator('#txRecurringField')).toBeHidden();
  await expect(page.locator('#txAccountField')).toBeVisible();
  await expect(page.locator('#txAccountLabel')).toContainText('recebimento');

  await page.locator('[data-kind="bill"]').click();
  await expect(page.locator('#txRecurringField')).toBeVisible();
  await expect(page.locator('#billFields')).toBeVisible();
  await expect(page.locator('#txDescLabel')).toContainText('Conta');

  await page.locator('[data-kind="expense"]').click();
  await expect(page.locator('#txRecurringField')).toBeVisible();
  await expect(page.locator('#txAccountLabel')).toContainText('pagamento');
});

test('P1 lançamentos: nova conta a pagar recebe marcador semântico verificável', async ({ page }) => {
  const value = fixture('Marcador conta P1');
  await boot(page, value);

  await page.locator('[data-kind="bill"]').click();
  await page.locator('#txDesc').fill('Internet');
  await page.locator('#txAmount').fill('99.90');
  await page.locator('#txDate').fill(`${value.mesAtual}-08`);
  await page.locator('#txDueDay').fill('15');
  await page.locator('#txStatus').selectOption('planned');
  await page.locator('#txAccount').selectOption('1');
  await page.locator('#txSubmit').click();

  const created = await page.evaluate(() => structuredClone(state.transactions.at(-1)));
  expect(created).toMatchObject({
    kind: 'expense',
    entryType: 'bill',
    desc: 'Internet',
    amount: 99.9,
    status: 'planned',
    dueDay: 15
  });
});
