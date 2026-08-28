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

test('diagnóstico da corrida pós-edição de transferência', async ({ page }) => {
  const value = fixture('Transferência P1 diag');
  value.accounts.push({ id: 2, name: 'Reserva', type: 'Reserva', initial: 300 });
  value.transfers.push({ id: 880, desc: 'Mover para reserva', amount: 50, date: `${value.mesAtual}-10`, fromId: 1, toId: 2, tags: ['reserva'], note: 'teste', balanceImpact: true });
  await boot(page, value);

  const row = page.locator('#txTable tr').filter({ hasText: 'Mover para reserva' });
  await row.getByRole('button', { name: 'Editar' }).click();
  await page.locator('#txAmount').fill('75');
  await page.locator('#txSubmit').click();

  await expect.poll(() => page.evaluate(() => state.transfers.find(t => t.id === 880)?.amount)).toBe(75);
  await page.evaluate(() => setPage('lancamentos'));

  const deleteButton = page.locator('#txTable tr').filter({ hasText: 'Mover para reserva' }).getByRole('button', { name: 'Excluir' });
  try {
    await expect(deleteButton).toHaveAttribute('onclick', 'trashTransfer(880)', { timeout: 1500 });
  } catch (error) {
    const diag = await page.evaluate(async () => ({
      activePage: document.querySelector('.tab.active')?.id || null,
      mesAtual: state.mesAtual,
      txFilter: document.querySelector('#txFilter')?.value || null,
      txSearch: document.querySelector('#txSearch')?.value || null,
      currentKind: typeof currentKind === 'undefined' ? null : currentKind,
      txEditId: document.querySelector('#txEditId')?.value || null,
      transferMemory: structuredClone(state.transfers.find(t => t.id === 880) || null),
      persistedTransfer: structuredClone((await dbGet()).value.transfers.find(t => t.id === 880) || null),
      tableText: document.querySelector('#txTable')?.innerText || '',
      tableHtml: document.querySelector('#txTable')?.innerHTML || '',
      transfersThisMonth: state.transfers.filter(t => ym(t.date) === state.mesAtual).map(t => ({ id:t.id, date:t.date, desc:t.desc, amount:t.amount }))
    }));
    console.log('TRANSFER_DIAGNOSTIC=' + JSON.stringify(diag));
    throw error;
  }
});
