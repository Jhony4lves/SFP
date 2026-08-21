const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete } = require('./helpers');

async function loadUsageFixture(page, name = 'Uso real QA') {
  const errors = monitor(page);
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await page.evaluate(value => { state = value; normalize(); renderAll(); }, fixture(name));
  return errors;
}

test('múltiplos reenvios rápidos criam um único ajuste e mostram sucesso', async ({ page }) => {
  const errors = await loadUsageFixture(page);
  await page.locator('.nav button[data-page="contas"]').click();
  await page.evaluate(() => openAccountDetail(1));
  page.on('dialog', async dialog => dialog.accept(dialog.type() === 'prompt' ? '1100' : undefined));

  await page.evaluate(async () => {
    const button = document.querySelector('#modalRoot button[onclick*="reconcileAccount"]');
    const original = dbSet;
    window.__releaseReconcile = null;
    dbSet = async value => {
      await new Promise(resolve => { window.__releaseReconcile = resolve; });
      return original(value);
    };
    window.__reconcilePromise = reconcileAccount(1, button);
  });

  await expect(page.locator('#modalRoot button[onclick*="reconcileAccount"]')).toBeDisabled();
  await expect(page.locator('#modalRoot button[onclick*="reconcileAccount"]')).toHaveText('Conciliando…');
  await page.evaluate(() => reconcileAccount(1, document.querySelector('#modalRoot button[onclick*="reconcileAccount"]')));
  await page.evaluate(() => window.__releaseReconcile());
  await page.evaluate(() => window.__reconcilePromise);

  const result = await page.evaluate(() => ({
    adjustments: state.transactions.filter(t => t.desc === 'Ajuste de conciliação').length,
    balance: accountBalance(1),
    feedback: document.querySelector('#feedbackCard').textContent,
    toast: document.querySelector('#toast').textContent
  }));
  expect(result.adjustments).toBe(1);
  expect(result.balance).toBe(1100);
  expect(`${result.feedback} ${result.toast}`).toContain('Conciliação registrada com sucesso.');
  expect(errors).toEqual([]);
});

test('falha de persistência desfaz tentativa, reativa ação e informa erro', async ({ page }) => {
  await loadUsageFixture(page);
  await page.locator('.nav button[data-page="contas"]').click();
  await page.evaluate(() => openAccountDetail(1));
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('dialog', async dialog => dialog.accept(dialog.type() === 'prompt' ? '1100' : undefined));

  await page.evaluate(async () => {
    const original = dbSet;
    dbSet = async () => { throw Error('falha simulada'); };
    await reconcileAccount(1, document.querySelector('#modalRoot button[onclick*="reconcileAccount"]'));
    dbSet = original;
  });

  expect(await page.evaluate(() => state.transactions.filter(t => t.desc === 'Ajuste de conciliação').length)).toBe(0);
  await expect(page.locator('#modalRoot button[onclick*="reconcileAccount"]')).toBeEnabled();
  await expect(page.locator('#toast')).toContainText('Não foi possível salvar a conciliação.');
  expect(consoleErrors.some(message => message.includes('Falha ao conciliar saldo'))).toBe(true);
});

test('Próximos 7 dias mostra somente eventos abertos, inclusive hoje e D+7', async ({ page }) => {
  const errors = await loadUsageFixture(page);
  const result = await page.evaluate(() => {
    const ref = new Date();
    const iso = offset => { const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const month = iso(0).slice(0, 7);
    const todayDay = ref.getDate();
    state.transactions = [
      { id: 1, kind: 'expense', desc: 'Despesa paga hoje', amount: 10, date: iso(0), accountId: 1, status: 'paid', balanceImpact: true },
      { id: 2, kind: 'expense', desc: 'Despesa pendente hoje', amount: 20, date: iso(0), accountId: 1, status: 'pending', balanceImpact: false },
      { id: 3, kind: 'income', desc: 'Receita recebida hoje', amount: 30, date: iso(0), accountId: 1, status: 'paid', balanceImpact: true },
      { id: 4, kind: 'income', desc: 'Receita pendente hoje', amount: 40, date: iso(0), accountId: 1, status: 'pending', balanceImpact: false },
      { id: 5, kind: 'income', desc: 'Ajuste de conciliação', amount: 50, date: iso(0), accountId: 1, status: 'paid', balanceImpact: true, tags: ['conciliação'] },
      { id: 6, kind: 'expense', desc: 'Evento em D+7', amount: 70, date: iso(7), accountId: 1, status: 'pending', balanceImpact: false },
      { id: 7, kind: 'expense', desc: 'Evento em D+8', amount: 80, date: iso(8), accountId: 1, status: 'pending', balanceImpact: false }
    ];
    state.cards = [
      { id: 1, name: 'Cartão parcial', dueDay: todayDay, closeDay: 1, payAccountId: 1, limit: 1000, history: [] },
      { id: 2, name: 'Cartão pago', dueDay: todayDay, closeDay: 1, payAccountId: 1, limit: 1000, history: [] }
    ];
    state.invoices = [
      { id: 11, cardId: 1, month, officialTotal: 100, paidAmount: 40, accountId: 1, payments: [], status: 'partial' },
      { id: 12, cardId: 2, month, officialTotal: 90, paidAmount: 90, accountId: 1, payments: [], status: 'paid' }
    ];
    renderToday();
    return { text: document.querySelector('#todayNext').innerText, events: pendingUpcomingEvents(7, ref) };
  });

  expect(result.text).not.toContain('Despesa paga hoje');
  expect(result.text).toContain('Despesa pendente hoje');
  expect(result.text).not.toContain('Receita recebida hoje');
  expect(result.text).toContain('Receita pendente hoje');
  expect(result.text).not.toContain('Ajuste de conciliação');
  expect(result.text).toContain('Evento em D+7');
  expect(result.text).not.toContain('Evento em D+8');
  expect(result.text).toContain('Fatura Cartão parcial');
  expect(result.text).toContain('60,00');
  expect(result.text).not.toContain('Fatura Cartão pago');
  expect(result.events.filter(event => event.source === 'invoice')).toHaveLength(1);
  expect(errors).toEqual([]);
});
