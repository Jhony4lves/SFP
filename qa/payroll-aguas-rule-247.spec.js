const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  await page.waitForFunction(() => window.SFPRecurringIncomePlan?.version >= 2);
}

function salaryState(name='Salário Águas #247') {
  const value = fixture(name);
  value.mesAtual = '2026-08';
  value.baseDate = '2026-07-01';
  value.accounts = [{ id:1, name:'Itaú', type:'Conta corrente', initial:0, balanceMode:'snapshot', balanceDate:'2026-07-01' }];
  value.recurring = [];
  value.recurringGroups = [];
  return value;
}

test('#247 regra Águas usa fim do mês anterior e dia 15 com antecipação seletiva', async ({ page }) => {
  await boot(page, salaryState());

  const result = await page.evaluate(() => {
    const created=SFPRecurringIncomePlan.upsert({
      desc:'Salário Águas',
      targetAmount:1884.39,
      accountId:1,
      start:'2026-08',
      end:'',
      firstAmount:1202.49,
      secondAmount:681.90
    });
    const first=created.children.find(row=>row.recurringPartKey==='first');
    const second=created.children.find(row=>row.recurringPartKey==='second');
    return {
      firstRule:{dateRule:first.dateRule,payrollBase:first.payrollBase,payrollAnchor:first.payrollAnchor},
      secondRule:{dateRule:second.dateRule,payrollBase:second.payrollBase,payrollAnchor:second.payrollAnchor},
      augFirst:recurringDateForMonth(first,'2026-08'),
      augSecond:recurringDateForMonth(second,'2026-08'),
      sepSecond:recurringDateForMonth(second,'2026-09'),
      junSecond:recurringDateForMonth(second,'2026-06')
    };
  });

  expect(result.firstRule).toEqual({dateRule:'salary-company-advance',payrollBase:'previous-month-end',payrollAnchor:1});
  expect(result.secondRule).toEqual({dateRule:'salary-company-advance',payrollBase:'day',payrollAnchor:15});
  expect(result.augFirst).toBe('2026-07-31');
  expect(result.augSecond).toBe('2026-08-14');
  expect(result.sepSecond).toBe('2026-09-15');
  expect(result.junSecond).toBe('2026-06-12');
});

test('#247 feriado adicional em dia 15 recua até a data permitida anterior', async ({ page }) => {
  await boot(page, salaryState('Feriado folha #247'));

  const result=await page.evaluate(() => {
    const created=SFPRecurringIncomePlan.upsert({
      desc:'Salário Águas',
      targetAmount:1884.39,
      accountId:1,
      start:'2026-09',
      firstAmount:1202.49,
      secondAmount:681.90,
      payrollBlockedDates:'2026-09-15'
    });
    const second=created.children.find(row=>row.recurringPartKey==='second');
    return {
      date:recurringDateForMonth(second,'2026-09'),
      blocked:second.payrollBlockedDates
    };
  });

  expect(result.date).toBe('2026-09-11');
  expect(result.blocked).toEqual(['2026-09-15']);
});

test('#247 calendário civil mostra a 1ª quinzena da competência seguinte no fim do mês anterior', async ({ page }) => {
  await boot(page, salaryState('Calendário civil salário #247'));

  const result=await page.evaluate(() => {
    const created=SFPRecurringIncomePlan.upsert({
      desc:'Salário Águas',
      targetAmount:1884.39,
      accountId:1,
      start:'2026-08',
      firstAmount:1202.49,
      secondAmount:681.90
    });
    const first=created.children.find(row=>row.recurringPartKey==='first');
    const july=financialCalendarEvents('2026-07').filter(event=>event.source==='recurring'&&event.recurrenceMonth==='2026-08');
    const upcoming=upcomingEvents(5,new Date(2026,6,30,12,0,0)).filter(event=>event.source==='recurring'&&event.sourceId===`rec-${first.id}-2026-08`);
    return { july, upcoming };
  });

  expect(result.july).toHaveLength(1);
  expect(result.july[0]).toMatchObject({date:'2026-07-31',amount:1202.49,type:'income',recurrenceMonth:'2026-08'});
  expect(result.upcoming).toHaveLength(1);
  expect(result.upcoming[0]).toMatchObject({date:'2026-07-31',amount:1202.49,type:'income'});
});

test('#247 formulário não pede mais âncora manual', async ({ page }) => {
  await boot(page, salaryState('UX salário #247'));
  await page.evaluate(() => {
    setPage('recorrencias');
    SFPRecurringIncomePlan.openForm();
  });

  await expect(page.locator('#salaryIncomePlanForm')).toBeVisible();
  await expect(page.locator('#salaryPlanFirstDay')).toHaveCount(0);
  await expect(page.locator('#salaryPlanSecondDay')).toHaveCount(0);
  await expect(page.locator('#salaryIncomePlanForm')).toContainText('Pagamento-base: último dia do mês anterior.');
  await expect(page.locator('#salaryIncomePlanForm')).toContainText('Pagamento-base: dia 15.');
  await expect(page.locator('#salaryPlanBlockedDates')).toBeVisible();
});
