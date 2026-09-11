const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, name='Sophy flow context') {
  const value = fixture(name);
  value.sophy.introDone = true;
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(expected => typeof state !== 'undefined' && state?.settings?.name === expected, name);
  await page.waitForFunction(() => window.__SFP_SOPHY_A3_INSTALLED === true && window.SFPProactiveBrief?.version === 2);
}

test('#173 brief da Sophy pode ser ocultado na sessão e só reaparece se o fingerprint mudar', async ({ page }) => {
  await boot(page, 'Sophy dismiss brief');

  await page.evaluate(() => {
    sessionStorage.clear();
    window.financialIntelligenceSnapshot = () => ({ version: 1, generatedFor: '2026-09-08', insights: [], summary: {} });
    window.safeSpendingSnapshot = () => ({
      version: 2, status: 'critical', safeToSpendCents: 0, reservedCents: 50000,
      shortfallCents: 0, nextIncome: null,
      projection: { minBalanceCents: -2100, minDate: '2026-09-10', negativeRisk: true }
    });
    setPage('sophy');
    renderSophyProactiveBrief();
  });

  const panel = page.locator('#sophyProactiveBrief');
  await expect(panel).toBeVisible();
  await expect(page.locator('#sophyBriefDismissBtn')).toHaveAttribute('aria-label', 'Ocultar este aviso');
  await page.locator('#sophyBriefDismissBtn').click();
  await expect(panel).toBeHidden();

  await page.evaluate(() => renderSophyProactiveBrief());
  await expect(panel).toBeHidden();

  await page.evaluate(() => {
    window.safeSpendingSnapshot = () => ({
      version: 2, status: 'critical', safeToSpendCents: 0, reservedCents: 70000,
      shortfallCents: 0, nextIncome: null,
      projection: { minBalanceCents: -8100, minDate: '2026-09-12', negativeRisk: true }
    });
    renderSophyProactiveBrief();
  });
  await expect(panel).toBeVisible();
});

test('#174 contexto mensal separa saldo, entradas restantes, saídas restantes e saldo projetado', async ({ page }) => {
  await boot(page, 'Sophy monthly context');

  const result = await page.evaluate(() => {
    state.mesAtual = '2026-09';
    state.baseDate = '2026-09-01';
    state.accounts = [{ id: 1, name: 'Principal', type: 'Conta corrente', initial: 500, balanceMode: 'snapshot', balanceDate: '2026-09-01' }];
    state.cards = [];
    state.purchases = [];
    state.invoices = [];
    state.recurring = [];
    state.debts = [];
    state.creditFacilities = [];
    state.transfers = [];
    state.transactions = [
      { id: 1, kind: 'income', entryType: 'income', desc: 'Quinzena', amount: 300, date: '2026-09-15', category: 'Trabalho', accountId: 1, status: 'pending', dueDay: 15, balanceImpact: false },
      { id: 2, kind: 'expense', entryType: 'bill', desc: 'Faculdade', amount: 120, date: '2026-09-20', category: 'Educação', accountId: 1, status: 'pending', dueDay: 20, balanceImpact: false }
    ];
    normalize();
    renderAll();
    const ctx = SFPProactiveBrief.monthlyPlanningContext({ month: '2026-09', reference: new Date(2026, 8, 8, 12) });
    const tool = sophyToolRegistry.getTool('get_financial_context');
    return {
      ctx,
      toolDescription: tool.description,
      wrapped: sophyProviderRegistry.groq.generateResponse.__sfpMonthlyContextWrapped === true,
      detectsQuestion: SFPProactiveBrief.promptNeedsMonthlyContext('Quais despesas faltam e quanto vou ter somando o que tenho com o que ainda entra este mês?')
    };
  });

  expect(result.ctx.currentOperationalBalanceBRL).toBe(500);
  expect(result.ctx.remaining.incomeBRL).toBe(300);
  expect(result.ctx.remaining.expenseBRL).toBe(120);
  expect(result.ctx.resourcesThroughMonthEndBRL).toBe(800);
  expect(result.ctx.projectedMonthEndBalanceBRL).toBe(680);
  expect(result.ctx.remaining.events.map(e => e.description)).toEqual(expect.arrayContaining(['Quinzena', 'Faculdade']));
  expect(result.ctx.semantics).toContain('Saldo atual não é receita');
  expect(result.toolDescription).toContain('entradas e obrigações restantes do mês');
  expect(result.wrapped).toBe(true);
  expect(result.detectsQuestion).toBe(true);
});
