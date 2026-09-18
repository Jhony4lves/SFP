const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateFor(name) {
  const value = fixture(name);
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-01';
  value.accounts = [{ id:1, name:'Nubank', type:'Conta corrente', initial:1000, balanceMode:'snapshot', balanceDate:'2026-09-01' }];
  value.cards = [];
  value.purchases = [];
  value.transfers = [];
  value.transactions = [];
  value.recurring = [];
  value.recurringGroups = [];
  return value;
}

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.waitForFunction(() => Number(window.SFPRecurringIncomePlan?.version) >= 2);
}

async function createSalaryPlan(page, overrides = {}) {
  return page.evaluate(input => SFPRecurringIncomePlan.upsert({
    desc:'Salário Águas de Niterói',
    targetAmount:2273,
    accountId:1,
    start:'2026-09',
    end:'',
    firstAmount:1591.10,
    secondAmount:681.90,
    ...input
  }), overrides);
}

test('#218 plano mensal + duas quinzenas gera somente duas previsões de caixa', async ({ page }) => {
  const errors = monitor(page);
  await boot(page, stateFor('Plano salarial sem terceira receita #218'));

  const created = await createSalaryPlan(page);
  expect(created.ok).toBe(true);

  const result = await page.evaluate(() => {
    const plan = state.recurringGroups[0];
    const occurrences = recurringOccurrences('2026-09').filter(item => item.kind === 'income');
    return {
      groupCount:state.recurringGroups.length,
      recurringCount:state.recurring.length,
      memberCount:plan.memberRecurringIds.length,
      occurrenceCount:occurrences.length,
      occurrenceTotal:occurrences.reduce((sum,item)=>sum+Number(item.amount||0),0),
      transactionCount:state.transactions.length,
      balance:accountBalance(1),
      summary:SFPRecurringIncomePlan.summary(plan,'2026-09')
    };
  });

  expect(result.groupCount).toBe(1);
  expect(result.recurringCount).toBe(2);
  expect(result.memberCount).toBe(2);
  expect(result.occurrenceCount).toBe(2);
  expect(result.occurrenceTotal).toBeCloseTo(2273, 2);
  expect(result.transactionCount).toBe(0);
  expect(result.balance).toBeCloseTo(1000, 2);
  expect(result.summary).toMatchObject({
    targetAmount:2273,
    plannedAmount:2273,
    realizedAmount:0,
    remainingAmount:2273,
    projectedAmount:2273,
    fulfilledParts:0,
    totalParts:2,
    complete:false
  });
  expect(errors).toEqual([]);
});

test('#218 primeira quinzena realizada substitui apenas sua previsão e atualiza projeção mensal', async ({ page }) => {
  await boot(page, stateFor('Plano salarial parcial #218'));
  await createSalaryPlan(page);

  const result = await page.evaluate(() => {
    const plan = state.recurringGroups[0];
    const firstId = plan.memberRecurringIds[0];
    const firstRule = state.recurring.find(item => item.id === firstId);
    state.transactions.push({
      id:9001,
      recurringId:firstRule.id,
      recurrenceMonth:'2026-09',
      occurrenceKey:`${firstRule.id}:2026-09`,
      accountId:1,
      kind:'income',
      desc:firstRule.desc,
      amount:1600,
      plannedAmount:firstRule.amount,
      date:'2026-09-01',
      scheduledDate:recurringDateForMonth(firstRule,'2026-09'),
      category:'Salário',
      status:'paid',
      balanceImpact:true,
      tags:['recorrente','open-finance']
    });
    return {
      summary:SFPRecurringIncomePlan.summary(plan,'2026-09'),
      virtuals:recurringOccurrences('2026-09').filter(item => plan.memberRecurringIds.includes(item.recurringId)),
      balance:accountBalance(1)
    };
  });

  expect(result.summary).toMatchObject({
    targetAmount:2273,
    realizedAmount:1600,
    remainingAmount:681.90,
    projectedAmount:2281.90,
    varianceToTarget:8.90,
    fulfilledParts:1,
    totalParts:2,
    complete:false
  });
  expect(result.virtuals).toHaveLength(1);
  expect(result.virtuals[0].amount).toBeCloseTo(681.90, 2);
  expect(result.balance).toBeCloseTo(2600, 2);
});

test('#218 duas quinzenas realizadas fecham o agregado sem previsão virtual restante', async ({ page }) => {
  await boot(page, stateFor('Plano salarial completo #218'));
  await createSalaryPlan(page);

  const result = await page.evaluate(() => {
    const plan = state.recurringGroups[0];
    const rules = plan.memberRecurringIds.map(id => state.recurring.find(item => item.id === id));
    const actuals = [1598.40, 674.25];
    const dates = ['2026-09-01','2026-09-15'];
    rules.forEach((rule,index)=>state.transactions.push({
      id:9100+index,
      recurringId:rule.id,
      recurrenceMonth:'2026-09',
      occurrenceKey:`${rule.id}:2026-09`,
      accountId:1,
      kind:'income',
      desc:rule.desc,
      amount:actuals[index],
      plannedAmount:rule.amount,
      date:dates[index],
      scheduledDate:recurringDateForMonth(rule,'2026-09'),
      category:'Salário',
      status:'paid',
      balanceImpact:true,
      tags:['recorrente','open-finance']
    }));
    return {
      summary:SFPRecurringIncomePlan.summary(plan,'2026-09'),
      virtuals:recurringOccurrences('2026-09').filter(item => plan.memberRecurringIds.includes(item.recurringId))
    };
  });

  expect(result.summary.realizedAmount).toBeCloseTo(2272.65, 2);
  expect(result.summary.remainingAmount).toBe(0);
  expect(result.summary.projectedAmount).toBeCloseTo(2272.65, 2);
  expect(result.summary.varianceToTarget).toBeCloseTo(-0.35, 2);
  expect(result.summary.fulfilledParts).toBe(2);
  expect(result.summary.complete).toBe(true);
  expect(result.virtuals).toHaveLength(0);
});

test('#218 mês futuro mantém as duas partes planejadas mesmo após setembro ser realizado', async ({ page }) => {
  await boot(page, stateFor('Plano salarial futuro #218'));
  await createSalaryPlan(page);

  const result = await page.evaluate(() => {
    const plan = state.recurringGroups[0];
    const rules = plan.memberRecurringIds.map(id => state.recurring.find(item => item.id === id));
    rules.forEach((rule,index)=>state.transactions.push({
      id:9200+index,
      recurringId:rule.id,
      recurrenceMonth:'2026-09',
      occurrenceKey:`${rule.id}:2026-09`,
      accountId:1,
      kind:'income',
      desc:rule.desc,
      amount:rule.amount,
      plannedAmount:rule.amount,
      date:index===0?'2026-09-01':'2026-09-15',
      category:'Salário',
      status:'paid',
      balanceImpact:true
    }));
    const october = recurringOccurrences('2026-10').filter(item => plan.memberRecurringIds.includes(item.recurringId));
    return {
      count:october.length,
      total:october.reduce((sum,item)=>sum+Number(item.amount||0),0),
      summary:SFPRecurringIncomePlan.summary(plan,'2026-10')
    };
  });

  expect(result.count).toBe(2);
  expect(result.total).toBeCloseTo(2273, 2);
  expect(result.summary).toMatchObject({realizedAmount:0,remainingAmount:2273,projectedAmount:2273,complete:false});
});

test('#218 plano rejeita soma das quinzenas diferente do alvo mensal', async ({ page }) => {
  await boot(page, stateFor('Plano salarial validação #218'));
  const result = await createSalaryPlan(page, { secondAmount:600 });

  expect(result.ok).toBe(false);
  expect(result.errors.join(' ')).toContain('soma das duas entradas');
  expect(await page.evaluate(() => ({groups:state.recurringGroups.length,rules:state.recurring.length}))).toEqual({groups:0,rules:0});
});

test('#218 editar plano preserva ids e aliases Open Finance das recorrências filhas', async ({ page }) => {
  await boot(page, stateFor('Plano salarial edição #218'));
  await createSalaryPlan(page);

  const result = await page.evaluate(() => {
    const plan = state.recurringGroups[0];
    const before = [...plan.memberRecurringIds];
    state.recurring.find(item => item.id === before[0]).openFinanceAliases=['AGUAS DE NITEROI SA'];
    const updated = SFPRecurringIncomePlan.upsert({
      id:plan.id,
      desc:'Salário Águas de Niterói',
      targetAmount:2300,
      accountId:1,
      start:'2026-09',
      end:'',
      firstAmount:1610,
      secondAmount:690,
      secondDay:15
    });
    const first = state.recurring.find(item => item.id === before[0]);
    return {ok:updated.ok,before,after:updated.plan.memberRecurringIds,aliases:first.openFinanceAliases,amount:first.amount};
  });

  expect(result.ok).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.aliases).toContain('AGUAS DE NITEROI SA');
  expect(result.amount).toBe(1610);
});

test('#218 pausar e pular plano opera nas duas recorrências filhas sem criar movimento', async ({ page }) => {
  await boot(page, stateFor('Plano salarial controle #218'));
  await createSalaryPlan(page);

  const result = await page.evaluate(() => {
    const plan = state.recurringGroups[0];
    SFPRecurringIncomePlan.toggle(plan.id);
    const paused = state.recurring.filter(item => item.recurringGroupId === plan.id).every(item => item.active === false);
    SFPRecurringIncomePlan.toggle(plan.id);
    SFPRecurringIncomePlan.skipMonth(plan.id,'2026-09');
    const skipped = state.recurring.filter(item => item.recurringGroupId === plan.id).every(item => item.skips.includes('2026-09'));
    return {paused,skipped,transactions:state.transactions.length,virtuals:recurringOccurrences('2026-09').filter(item => item.recurringGroupId === plan.id).length};
  });

  expect(result.paused).toBe(true);
  expect(result.skipped).toBe(true);
  expect(result.transactions).toBe(0);
  expect(result.virtuals).toBe(0);
});

test('#218 módulo é carregado pelo SFP e o agregado não participa do motor de saldo', async () => {
  const safeSpend = fs.readFileSync('app/src/main/assets/www/safe-spend.js','utf8');
  const moduleSource = fs.readFileSync('app/src/main/assets/www/recurring-income-plan.js','utf8');
  expect(safeSpend).toMatch(/script\.src='recurring-income-plan\.js(?:\?v=\d+)?'/);
  expect(moduleSource).toContain("kind:'income-split'");
  expect(moduleSource).toContain('memberRecurringIds');
  expect(moduleSource).not.toContain('balanceImpact:true');
});