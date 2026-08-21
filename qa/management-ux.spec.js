const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value = fixture('UX-04')) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state?.settings?.name === 'UX-04');
}

test('MGMT-01/02/05/07: edições preservam entidades ricas', async ({ page }) => {
  const value = fixture('UX-04');
  value.accounts[0] = { ...value.accounts[0], reconciled: { balance: 900, date: '2026-01-10' }, metadata: { keep: 1 } };
  value.cards[0] = { ...value.cards[0], history: [{ id: 7, type: 'legacy' }], metadata: { keep: 2 } };
  value.debts.push({ id: 2, name: 'Banco', balance: 1000, payment: 100, rate: 1, firstDue: '2026-01-10', installments: 10, paidInstallments: 2, contractTotal: 1200, financedAmount: 1000, IOF: 30, CET: 2, paymentMethod: 'pix', history: [1], note: 'rica', metadata: { keep: 3 } });
  value.goals.push({ id: 3, name: 'Viagem', target: 5000, accountId: 1, plan: 200, targetDate: '2026-12', initialAllocated: 300, history: [1], metadata: { keep: 4 } });
  await boot(page, value);
  for (const [fn, input, submit, id, expected] of [
    ['editAccount', '#accountName', '#accountSubmit', 1, { metadata: { keep: 1 }, reconciled: { balance: 900, date: '2026-01-10' } }],
    ['editCard', '#cardName', '#cardSubmit', 1, { metadata: { keep: 2 } }],
    ['editDebt', '#debtName', '#debtSubmit', 2, { contractTotal: 1200, IOF: 30, metadata: { keep: 3 } }],
    ['editGoal', '#goalName', '#goalSubmit', 3, { initialAllocated: 300, history: [1], metadata: { keep: 4 } }]
  ]) {
    await page.evaluate(({ fn, id }) => window[fn](id), { fn, id });
    await page.locator(input).fill(`Editado ${fn}`); await page.locator(submit).click();
    const entity = await page.evaluate(({ fn, id }) => ({ editAccount: state.accounts, editCard: state.cards, editDebt: state.debts, editGoal: state.goals }[fn].find(x => x.id === id)), { fn, id });
    expect(entity).toMatchObject(expected);
  }
});

test('MGMT-03/04/09/10: fatura, compra, estados e bindings permanecem', async ({ page }) => {
  const value = fixture('UX-04'); value.purchases.push({ id: 9, cardId: 1, desc: 'Notebook', total: 1200, purchaseDate: '2026-01-05', installments: 3, firstMonth: '2026-01', status: 'active', refunds: [] });
  await boot(page, value); await page.evaluate(() => { setPage('cartoes'); document.querySelector('#invoiceMonth').value='2026-01'; renderCards(); });
  await expect(page.locator('#invoiceMobile')).toContainText('Notebook');
  for (const id of ['cardForm','cardsGrid','invoiceCard','invoiceMonth','closeInvoice','payInvoice','invoiceTable','invoiceMobile','cardImportFile','cardHistory']) await expect(page.locator(`#${id}`)).toHaveCount(1);
  await page.evaluate(() => { state.accounts=[]; state.cards=[]; state.debts=[]; state.goals=[]; renderAll(); });
  await expect(page.locator('#accountsGrid .empty-state')).toBeAttached(); await expect(page.locator('#goalGrid .empty-state')).toBeAttached();
});

test('MGMT-06/08: ações distintas de dívida e meta continuam disponíveis', async ({ page }) => {
  const value=fixture('UX-04'); value.debts.push({id:2,name:'Banco',balance:1000,payment:100,rate:0,firstDue:'2026-01-10',installments:10,paidInstallments:0,accountId:1,history:[]}); value.goals.push({id:3,name:'Reserva',target:1000,accountId:1,plan:100,initialAllocated:0,history:[]}); await boot(page,value);
  await page.evaluate(()=>{setPage('dividas');openDebtDetail(2)}); await expect(page.getByRole('button',{name:'Pagar parcela'})).toBeVisible(); await expect(page.getByRole('button',{name:'Amortizar'})).toBeVisible();
  await page.evaluate(()=>{closeProgressive();setPage('metas');openGoalDetail(3)}); await expect(page.getByRole('button',{name:'Fazer aporte'})).toBeVisible(); await expect(page.getByRole('button',{name:'Editar plano'})).toBeVisible();
});

test('MGMT-11/12: mobile usa cards e Back preserva navegação', async ({ page }) => {
  await boot(page); await page.setViewportSize({ width: 384, height: 854 }); await page.evaluate(()=>setPage('cartoes'));
  await expect(page.locator('#invoiceMobile')).toHaveCSS('display','grid'); await expect(page.locator('.desktop-table-mobile')).toBeHidden();
  expect(await page.evaluate(()=>handleAndroidBack())).toBe(true); await expect(page.locator('#hoje')).toHaveClass(/active/);
});
