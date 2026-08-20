const { test, expect } = require('@playwright/test');
const { fixture } = require('./helpers');

test('UP-01..08 janelas materializam todos os meses, inclusive quinto mês e viradas', async ({ page }) => {
  await page.goto('/index.html');
  const result = await page.evaluate(value => {
    state = value;
    state.recurring = [
      { id: 1, active: true, start: '2026-01', end: null, day: 8, type: 'expense', desc: 'Conta Luz', amount: 40, accountId: 1, category: 'Casa' },
      { id: 2, active: true, start: '2026-05', end: null, day: 1, type: 'income', desc: 'Receita Projeto', amount: 500, accountId: 1, category: 'Trabalho' }
    ];
    normalize(); const ref = new Date(2026, 0, 1, 23, 59);
    return {
      d7: upcomingEvents(7, ref).map(e => e.date), d30: upcomingEvents(30, ref).map(e => e.date),
      d75: upcomingEvents(75, ref).map(e => e.date), d120: upcomingEvents(120, ref).map(e => e.date),
      pending120: pendingUpcomingEvents(120, ref).map(e => e.date),
      next: nextIncomeEvent(ref, 120)?.date, commitment: commitmentUntilNextIncome(ref, 120),
      year: upcomingEvents(30, new Date(2026, 11, 20)).every(e => e.date >= '2026-12-20' && e.date <= '2027-01-19'),
      feb: upcomingEvents(60, new Date(2028, 0, 31)).some(e => e.date === '2028-02-08')
    };
  }, fixture('Upcoming QA'));
  expect(result.d7).toContain('2026-01-08');
  expect(result.d30).toContain('2026-01-08'); expect(result.d75).toContain('2026-03-08');
  expect(result.d120).toContain('2026-05-01'); expect(result.pending120).toContain('2026-05-01');
  expect(result.next).toBe('2026-05-01'); expect(result.commitment).toBe(160);
  expect(result.year).toBe(true); expect(result.feb).toBe(true);
});
