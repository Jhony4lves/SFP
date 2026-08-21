const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && lastSavedState);
}

function calendarFixture() {
  const v = fixture('CALENDAR_UX');
  v.mesAtual = '2026-08';
  v.accounts = [
    { id: 1, name: 'Conta Principal', type: 'Conta corrente', initial: 2500, balanceMode: 'ledger' }
  ];
  v.cards = [
    { id: 10, name: 'Nubank', limit: 3000, closeDay: 10, dueDay: 20, payAccountId: 1, history: [] }
  ];
  v.transactions = [
    { id: 101, kind: 'income', desc: 'Salário Mensal', amount: 5000, date: '2026-08-05', category: 'Trabalho', accountId: 1, status: 'paid', balanceImpact: true },
    { id: 102, kind: 'expense', desc: 'Supermercado Real', amount: 350, date: '2026-08-12', category: 'Alimentação', accountId: 1, status: 'paid', balanceImpact: true },
    { id: 103, kind: 'expense', desc: 'Aluguel Futuro', amount: 1500, date: '2026-08-25', category: 'Casa', accountId: 1, status: 'pending', balanceImpact: false },
    { id: 104, kind: 'expense', desc: 'Internet Futura', amount: 120, date: '2026-08-25', category: 'Casa', accountId: 1, status: 'pending', balanceImpact: false },
    { id: 105, kind: 'expense', desc: 'Energia Futura', amount: 180, date: '2026-08-25', category: 'Casa', accountId: 1, status: 'pending', balanceImpact: false }
  ];
  v.recurring = [
    { id: 201, desc: 'Netflix', type: 'expense', amount: 55.9, day: 15, category: 'Assinaturas', accountId: 1, start: '2026-01', end: '', active: true, skips: [] }
  ];
  v.purchases = [
    { id: 301, cardId: 10, desc: 'Notebook', total: 600, installments: 3, firstMonth: '2026-08', category: 'Outros', status: 'active', refunds: [] }
  ];
  v.invoices = [
    {
      cardId: 10,
      month: '2026-08',
      status: 'open',
      paidAmount: 50,
      payments: [{ date: '2026-08-18', amount: 50 }]
    }
  ];
  v.debts = [
    { id: 401, name: 'Empréstimo Auto', balance: 1200, payment: 200, rate: 0, installments: 6, paidInstallments: 0, firstDue: '2026-08-28', paymentMethod: 'bank', history: [] }
  ];
  return v;
}

// Helper determinístico para localizar botão do dia pelo número exato
function dayButton(page, dayNum) {
  return page.locator('button.day').filter({
    has: page.locator('.daynum', { hasText: new RegExp(`^${dayNum}$`) })
  });
}

const VIEWPORTS = [
  { name: 'Mobile Portrait 360x780', width: 360, height: 780 },
  { name: 'Mobile Portrait 384x854', width: 384, height: 854 },
  { name: 'Mobile Portrait 412x915', width: 412, height: 915 },
  { name: 'Mobile Landscape 780x360', width: 780, height: 360 },
  { name: 'Mobile Landscape 854x384', width: 854, height: 384 },
  { name: 'Mobile Landscape 915x412', width: 915, height: 412 },
  { name: 'Desktop 1280x800', width: 1280, height: 800 }
];

for (const vp of VIEWPORTS) {
  test(`calendário se adapta perfeitamente ao viewport ${vp.name} sem overflow horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await boot(page, calendarFixture());
    await page.evaluate(() => setPage('calendario'));

    const calendar = page.locator('#calendar');
    await expect(calendar).toBeVisible();

    const calHeads = page.locator('.calhead');
    await expect(calHeads).toHaveCount(7);

    // Validação geométrica rigorosa de TODAS as células do grid (inclusive .day.off)
    const geometry = await page.evaluate(() => {
      const cal = document.getElementById('calendar');
      const rect = cal.getBoundingClientRect();
      const clientW = window.innerWidth;
      const allCells = Array.from(cal.querySelectorAll('.day, .day.off'));

      const boundsViolations = allCells.filter(d => {
        const r = d.getBoundingClientRect();
        return r.right > clientW + 1 || r.left < -1;
      });

      const cellWidths = allCells.slice(0, 7).map(d => d.getBoundingClientRect().width);
      const minW = Math.min(...cellWidths);
      const maxW = Math.max(...cellWidths);

      return {
        calRight: rect.right,
        clientW,
        calScrollWidth: cal.scrollWidth,
        calClientWidth: cal.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
        boundsViolationsCount: boundsViolations.length,
        columnWidthDelta: maxW - minW
      };
    });

    expect(geometry.boundsViolationsCount).toBe(0);
    expect(geometry.calRight).toBeLessThanOrEqual(geometry.clientW + 1);
    expect(geometry.calScrollWidth).toBeLessThanOrEqual(geometry.calClientWidth + 1);
    expect(geometry.docScrollWidth).toBeLessThanOrEqual(geometry.docClientWidth + 1);
    expect(geometry.columnWidthDelta).toBeLessThanOrEqual(3);
  });
}

test('células vazias não exibem "Sem eventos" e dias com eventos mostram contagem real e semântica', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, calendarFixture());
  await page.evaluate(() => setPage('calendario'));

  // Dia 1: sem eventos (deve exibir apenas o número do dia, sem a string "Sem eventos" poluindo a célula)
  const day1 = dayButton(page, 1);
  await expect(day1).toBeVisible();
  const day1Text = await day1.innerText();
  expect(day1Text).not.toContain('Sem eventos');
  expect(day1Text.trim()).toBe('1');
  await expect(day1.locator('.cal-count')).toHaveCount(0);

  // Dia 5: 1 receita realizada
  const day5 = dayButton(page, 5);
  await expect(day5).toBeVisible();
  await expect(day5.locator('.cal-dot.realized')).toBeVisible();
  await expect(day5.locator('.cal-flow.inc')).toBeVisible();
  await expect(day5.locator('.cal-count')).toHaveText('1 evento');

  // Dia 15: 1 despesa/recorrência prevista
  const day15 = dayButton(page, 15);
  await expect(day15).toBeVisible();
  await expect(day15.locator('.cal-dot.projected')).toBeVisible();
  await expect(day15.locator('.cal-flow.exp')).toBeVisible();
  await expect(day15.locator('.cal-count')).toHaveText('1 evento');

  // Dia 25: 3 despesas previstas (mostra "3 eventos", sem inventar "+1" residual)
  const day25 = dayButton(page, 25);
  await expect(day25).toBeVisible();
  await expect(day25.locator('.cal-dot.projected')).toBeVisible();
  await expect(day25.locator('.cal-flow.exp')).toBeVisible();
  await expect(day25.locator('.cal-count')).toHaveText('3 eventos');
});

test('interação com dia abre detalhe diário e exibe todos os eventos sem truncamento', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, calendarFixture());
  await page.evaluate(() => setPage('calendario'));

  // Clica no dia 25
  await dayButton(page, 25).click();
  const modal = page.locator('#modalRoot');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Aluguel Futuro')).toBeVisible();
  await expect(modal.getByText('Internet Futura')).toBeVisible();
  await expect(modal.getByText('Energia Futura')).toBeVisible();
});

test('navegação no detalhe diário abre a entidade correspondente e novo lançamento preserva data', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, calendarFixture());
  await page.evaluate(() => setPage('calendario'));

  // 1. Abre dia 12 (Supermercado Real) e clica no item
  await dayButton(page, 12).click();
  await page.locator('#modalRoot .item', { hasText: 'Supermercado Real' }).click();

  // Confirma que abriu o form de edição do lançamento com ID 102
  await expect(page.locator('#lancamentos')).toHaveClass(/active/);
  await expect(page.locator('#txEditId')).toHaveValue('102');
  await expect(page.locator('#txDesc')).toHaveValue('Supermercado Real');

  // 2. Volta ao calendário, abre dia 18 (Pagamento de fatura) e clica no item
  await page.evaluate(() => setPage('calendario'));
  await dayButton(page, 18).click();
  await page.locator('#modalRoot .item', { hasText: 'Pagamento fatura Nubank' }).click();

  // Confirma que navegou para cartões E abriu o detalhe do cartão Nubank correto
  await expect(page.locator('#cartoes')).toHaveClass(/active/);
  await expect(page.locator('#modalRoot h2', { hasText: 'Nubank' })).toBeVisible();
  await expect(page.locator('#modalRoot').getByText('Fecha dia 10 · vence dia 20')).toBeVisible();

  // 3. Volta ao calendário, abre dia 28 e clica em "+ Novo lançamento nesta data"
  await page.evaluate(() => setPage('calendario'));
  await dayButton(page, 28).click();
  await page.locator('#modalRoot button', { hasText: '+ Novo lançamento nesta data' }).click();

  // Confirma que navegou para lançamentos com a data 2026-08-28 preenchida
  await expect(page.locator('#lancamentos')).toHaveClass(/active/);
  await expect(page.locator('#txDate')).toHaveValue('2026-08-28');
});

test('acessibilidade de teclado: ativação de item na modal via tecla Enter', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, calendarFixture());
  await page.evaluate(() => setPage('calendario'));

  await dayButton(page, 5).click();
  const item = page.locator('#modalRoot .item').first();
  await item.focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('#lancamentos')).toHaveClass(/active/);
  await expect(page.locator('#txEditId')).toHaveValue('101');
});

test('acessibilidade de teclado: ativação de item na modal via tecla Space', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, calendarFixture());
  await page.evaluate(() => setPage('calendario'));

  await dayButton(page, 5).click();
  const item = page.locator('#modalRoot .item').first();
  await item.focus();
  await page.keyboard.press('Space');

  await expect(page.locator('#lancamentos')).toHaveClass(/active/);
  await expect(page.locator('#txEditId')).toHaveValue('101');
});

test('integridade financeira: renderizar calendário, abrir detalhe e navegar meses não altera o estado financeiro', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, calendarFixture());

  // Captura snapshot do estado financeiro real antes das interações
  const beforeFinance = await page.evaluate(() => ({
    transactions: clone(state.transactions),
    purchases: clone(state.purchases),
    cards: clone(state.cards),
    invoices: clone(state.invoices),
    debts: clone(state.debts),
    recurring: clone(state.recurring),
    accounts: clone(state.accounts),
    balances: state.accounts.map(a => accountBalance(a.id)),
    totalBalance: allAccountBalance(),
    netWorth: netWorth()
  }));

  // Interage: abre calendário, renderiza, abre modal do dia 25, fecha modal
  await page.evaluate(() => {
    setPage('calendario');
    renderCalendar();
    openCalendarDay('2026-08-25');
    closeProgressive();
  });

  // Navega para o mês anterior e depois para o próximo mês de visualização
  await page.evaluate(() => {
    state.mesAtual = monthAdd(state.mesAtual, -1);
    renderAll();
    state.mesAtual = monthAdd(state.mesAtual, 2);
    renderAll();
    state.mesAtual = '2026-08';
    renderAll();
  });

  // Captura snapshot do estado financeiro real após as interações
  const afterFinance = await page.evaluate(() => ({
    transactions: clone(state.transactions),
    purchases: clone(state.purchases),
    cards: clone(state.cards),
    invoices: clone(state.invoices),
    debts: clone(state.debts),
    recurring: clone(state.recurring),
    accounts: clone(state.accounts),
    balances: state.accounts.map(a => accountBalance(a.id)),
    totalBalance: allAccountBalance(),
    netWorth: netWorth()
  }));

  // Compara igualdade profunda do estado financeiro persistido
  expect(afterFinance).toEqual(beforeFinance);
});
