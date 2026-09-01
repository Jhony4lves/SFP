const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  const errors = monitor(page);
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await page.evaluate(async value => {
    state = value;
    normalize();
    await dbSet(state);
    lastSavedState = clone(state);
    renderAll();
  }, value);
  return errors;
}

async function persisted(page, predicate) {
  await expect.poll(() => page.evaluate(async predicate => {
    const saved = await dbGet();
    return saved.status === 'ok' && Function('s', `return (${predicate})(s)`)(saved.value);
  }, String(predicate))).toBe(true);
}

async function refundPurchaseThroughDialog(page, purchaseId, amount) {
  await page.evaluate(purchaseId => {
    window.__qaRefundPromise = refundPurchase(purchaseId);
  }, purchaseId);
  await page.locator('#dialogPromptInput').fill(String(amount));
  await page.locator('#dialogConfirmBtn').click();
  await page.evaluate(async () => {
    await window.__qaRefundPromise;
    delete window.__qaRefundPromise;
  });
}

function cardFixture() {
  const value = fixture('Fixture QA');
  value.mesAtual = '2026-01';
  value.purchases = [{ id: 10, cardId: 1, desc: 'Notebook', total: 300, installments: 3, firstMonth: '2026-01', purchaseDate: '2026-01-02', category: 'Outros', status: 'active', refunds: [], metadata: { future: true } }];
  return value;
}

test('CARD-01/02 fatura fechada conserva snapshot e estorno reduz apenas obrigação prospectiva', async ({ page }) => {
  const value = cardFixture();
  const errors = await boot(page, value);
  await page.evaluate(() => {
    const inv = ensureInvoice(1, '2026-01');
    inv.officialTotal = invoiceCalculated(1, '2026-01');
    inv.closedAt = new Date().toISOString(); inv.status = 'closed';
    state.mesAtual = '2026-02';
  });
  await refundPurchaseThroughDialog(page, 10, '50');
  const result = await page.evaluate(() => ({ historical: invoiceTotal(1, '2026-01'), feb: invoiceTotal(1, '2026-02'), outstanding: cardOutstanding(1, new Date(2026, 0, 15)), refunds: state.purchases[0].refunds }));
  expect(result.historical).toBe(100);
  expect(result.feb).toBe(50);
  expect(result.outstanding).toBe(250); // R$ 100 fechados e não pagos + R$ 150 prospectivos
  expect(result.refunds).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('CARD-03 múltiplos estornos são limitados ao elegível e nunca criam fatura negativa', async ({ page }) => {
  const errors = await boot(page, cardFixture());
  for (const amount of ['180', '180']) {
    await refundPurchaseThroughDialog(page, 10, amount);
  }
  const result = await page.evaluate(() => ({ refunds: state.purchases[0].refunds.map(r => r.amount), totals: ['2026-01', '2026-02', '2026-03'].map(m => invoiceTotal(1, m)), limit: card(1).limit - cardOutstanding(1, new Date(2025, 11, 15)) }));
  expect(result.refunds).toEqual([180, 120]);
  expect(result.totals).toEqual([0, 0, 0]);
  expect(result.limit).toBe(2000);
  expect(errors).toEqual([]);
});

test('CARD-04/05 pagamentos parcial e integral liquidam uma vez, sem competência duplicada, e persistem', async ({ page }) => {
  const value = cardFixture();
  value.invoices = [{ id: 20, cardId: 1, month: '2026-01', officialTotal: 100, paidAmount: 0, accountId: 1, payments: [], status: 'closed', closedAt: '2026-01-10T12:00:00Z' }];
  const errors = await boot(page, value);
  for (const amount of ['40', '60']) {
    const payPromise = page.evaluate(async () => { document.querySelector('#invoiceCard').value = '1'; document.querySelector('#invoiceMonth').value = '2026-01'; await document.querySelector('#payInvoice').onclick(); });
    await page.locator('#dialogPromptInput').fill(amount);
    await page.locator('#dialogConfirmBtn').click();
    await payPromise;
  }
  await persisted(page, s => s.invoices[0].paidAmount === 100 && s.invoices[0].payments.length === 2);
  const before = await page.evaluate(() => ({ remaining: invoiceRemaining(1, '2026-01'), cash: cashView(new Date().toISOString().slice(0, 7)).expense, accrual: accrualView('2026-01').expense, payments: state.invoices[0].payments.length }));
  expect(before).toEqual({ remaining: 0, cash: 100, accrual: 100, payments: 2 });
  await page.reload(); await expectBootComplete(page, expect, 'Fixture QA');
  expect(await page.evaluate(() => ({ paid: state.invoices[0].paidAmount, remaining: invoiceRemaining(1, '2026-01'), payments: state.invoices[0].payments.length }))).toEqual({ paid: 100, remaining: 0, payments: 2 });
  expect(errors).toEqual([]);
});

test('CARD-05B pagamento no segundo cartão preserva cartão e mês exibidos após salvar', async ({ page }) => {
  const value = cardFixture();
  value.cards.push({ id: 2, name: 'Itaú Click', limit: 3000, closeDay: 2, dueDay: 10, payAccountId: 1, history: [] });
  value.purchases = [
    { id: 11, cardId: 2, desc: 'AMAZON BR', total: 54.90, installments: 1, firstMonth: '2026-08', purchaseDate: '2026-07-06', category: 'Assinaturas', status: 'active', refunds: [] },
    { id: 12, cardId: 2, desc: 'MERCADO LIVRE', total: 19.35, installments: 1, firstMonth: '2026-08', purchaseDate: '2026-07-28', category: 'Outros', status: 'active', refunds: [] }
  ];
  value.invoices = [{ id: 22, cardId: 2, month: '2026-08', officialTotal: 74.25, paidAmount: 0, accountId: 1, payments: [], status: 'closed', closedAt: '2026-08-02T12:00:00Z' }];
  value.ui.invoiceMonthByCard = { 2: '2026-08' };
  const errors = await boot(page, value);

  const payPromise = page.evaluate(async () => {
    document.querySelector('#invoiceCard').value = '2';
    document.querySelector('#invoiceMonth').value = '2026-08';
    await document.querySelector('#payInvoice').onclick();
  });
  await page.locator('#dialogPromptInput').fill('74,25');
  await page.locator('#dialogConfirmBtn').click();
  await payPromise;

  expect(await page.evaluate(() => ({
    selectedCard: document.querySelector('#invoiceCard').value,
    selectedMonth: document.querySelector('#invoiceMonth').value,
    shownPaid: parseMoney(document.querySelector('#invoicePaidView').textContent),
    paid: invoiceStatus(2, '2026-08').paidAmount,
    remaining: invoiceRemaining(2, '2026-08')
  }))).toEqual({ selectedCard: '2', selectedMonth: '2026-08', shownPaid: 74.25, paid: 74.25, remaining: 0 });
  expect(errors).toEqual([]);
});

test('CARD-05C upgrade RC13 reconcilia Pago pelo ledger sem duplicar saída de caixa', async ({ page }) => {
  const value = fixture('Migração RC13 para RC14');
  value.schemaVersion = 15;
  value.cards.push({ id: 2, name: 'Itaú Click', limit: 3000, closeDay: 2, dueDay: 10, payAccountId: 1, history: [] });
  value.invoices = [{
    id: 22,
    cardId: 2,
    month: '2026-08',
    officialTotal: 74.25,
    paidAmount: 0,
    accountId: 1,
    payments: [
      { date: '2026-08-10', amount: 74.25, balanceImpact: true, targetMonth: '2026-08' },
      { date: '2026-08-10', amount: 74.25, balanceImpact: true, targetMonth: '2026-08' },
      { date: '2026-08-10', amount: 74.25, balanceImpact: true, targetMonth: '2026-08' }
    ],
    status: 'closed',
    closedAt: '2026-08-02T12:00:00Z'
  }];

  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expectBootComplete(page, expect, 'Migração RC13 para RC14');

  expect(await page.evaluate(() => ({
    schemaVersion: state.schemaVersion,
    paid: invoiceStatus(2, '2026-08').paidAmount,
    status: invoiceDisplayStatus(2, '2026-08'),
    remaining: invoiceRemaining(2, '2026-08'),
    payments: invoiceStatus(2, '2026-08').payments.length,
    activePayments: invoiceStatus(2, '2026-08').payments.filter(p => p.countsTowardInvoice !== false && p.balanceImpact === true).length,
    neutralized: invoiceStatus(2, '2026-08').payments.filter(p => p.duplicatePaymentNeutralizedAt === 'schema-16').length,
    balance: accountBalance(1),
    migration: invoiceStatus(2, '2026-08').paymentLedgerReconciledAt
  }))).toEqual({ schemaVersion: 16, paid: 74.25, status: 'paid', remaining: 0, payments: 3, activePayments: 1, neutralized: 2, balance: 925.75, migration: 'schema-16' });

  await page.reload();
  await expectBootComplete(page, expect, 'Migração RC13 para RC14');
  expect(await page.evaluate(() => ({ paid: invoiceStatus(2, '2026-08').paidAmount, payments: invoiceStatus(2, '2026-08').payments.length, activePayments: invoiceStatus(2, '2026-08').payments.filter(p => p.countsTowardInvoice !== false && p.balanceImpact === true).length, balance: accountBalance(1) }))).toEqual({ paid: 74.25, payments: 3, activePayments: 1, balance: 925.75 });
});

test('CARD-06 cancelamento preserva parcelas históricas e metadados e elimina somente futuras', async ({ page }) => {
  const value = cardFixture();
  value.invoices = [
    { id: 20, cardId: 1, month: '2026-01', officialTotal: 100, paidAmount: 100, payments: [{ date: '2026-01-17', amount: 100, balanceImpact: true }], status: 'paid', closedAt: '2026-01-10' },
    { id: 21, cardId: 1, month: '2026-02', officialTotal: 100, paidAmount: 0, payments: [], status: 'closed', closedAt: '2026-02-10' }
  ];
  value.mesAtual = '2026-03';
  const errors = await boot(page, value);
  const cancelPromise = page.evaluate(() => cancelPurchase(10));
  await page.locator('#dialogConfirmBtn').click();
  await cancelPromise;
  await persisted(page, s => s.purchases[0].status === 'cancelled' && s.purchases[0].cancelledFromMonth === '2026-03');
  const result = await page.evaluate(() => ({ jan: invoiceTotal(1, '2026-01'), feb: invoiceTotal(1, '2026-02'), mar: invoiceTotal(1, '2026-03'), metadata: state.purchases[0].metadata }));
  expect(result).toEqual({ jan: 100, feb: 100, mar: 0, metadata: { future: true } });
  expect(errors).toEqual([]);
});

test('CARD-07/08 sequência completa mantém limite, registros e histórico após reload', async ({ page }) => {
  const value = cardFixture();
  value.invoices = [{ id: 20, cardId: 1, month: '2026-01', officialTotal: 100, paidAmount: 40, accountId: 1, payments: [{ date: '2026-01-17', amount: 40, balanceImpact: true }], status: 'partial', closedAt: '2026-01-10' }];
  value.mesAtual = '2026-02';
  const errors = await boot(page, value);
  await refundPurchaseThroughDialog(page, 10, '50');
  await page.evaluate(async () => { const i = state.invoices[0]; i.paidAmount = 100; i.status = 'paid'; i.payments.push({ date: '2026-02-01', amount: 60, balanceImpact: true }); addCardHistory(1, 'payment', 'Pagamento restante', 60); await save('Pagamento restante'); });
  await persisted(page, s => s.purchases[0].refunds.length === 1 && s.invoices[0].payments.length === 2 && s.cards[0].history.length === 2);
  const inspect = () => page.evaluate(() => ({ outstanding: cardOutstanding(1, new Date(2026, 0, 15)), available: card(1).limit - cardOutstanding(1, new Date(2026, 0, 15)), purchase: state.purchases.length, invoices: state.invoices.length, refunds: state.purchases[0].refunds.length, payments: state.invoices[0].payments.length, history: state.cards[0].history.length }));
  const before = await inspect();
  expect(before).toEqual({ outstanding: 150, available: 1850, purchase: 1, invoices: 1, refunds: 1, payments: 2, history: 2 });
  await page.reload(); await expectBootComplete(page, expect, 'Fixture QA');
  expect(await inspect()).toEqual(before);
  expect(errors).toEqual([]);
});

test('CARD-09/10 pagamento conciliado permanece caixa, não competência nem segunda despesa', async ({ page }) => {
  const value = cardFixture();
  value.invoices = [{ id: 20, cardId: 1, month: '2026-01', officialTotal: 100, paidAmount: 100, accountId: 1, payments: [{ date: '2026-02-10', amount: 100, balanceImpact: true }], status: 'paid', closedAt: '2026-01-10' }];
  value.mesAtual = '2026-02';
  const errors = await boot(page, value);
  const result = await page.evaluate(async () => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement([{ date: '2026-02-10', desc: 'PAGAMENTO FATURA CARTAO', amount: -100, fitid: 'card-10' }], 'fatura.csv');
    await importStatement();
    return { transactions: state.transactions.length, statementKey: state.invoices[0].payments[0].statementKey, cash: cashView('2026-02').expense, accrual: accrualView('2026-02').expense, commitments: commitmentView('2026-02').total };
  });
  expect(result).toEqual({ transactions: 0, statementKey: '1|fit:card-10', cash: 100, accrual: 100, commitments: 100 });
  expect(errors).toEqual([]);
});
