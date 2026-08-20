const { test, expect } = require('@playwright/test');
const { fixture } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(value => { state = value; normalize(); }, fixture('Tempo QA'));
});

test('TIME-01/02/03 datas civis noturnas permanecem no calendário local', async ({ page }) => {
  const dates = await page.evaluate(() => [
    new Date(2026, 7, 20, 20, 59), new Date(2026, 7, 20, 21, 0), new Date(2026, 7, 20, 23, 59)
  ].map(localCivilDate));
  expect(dates).toEqual(['2026-08-20', '2026-08-20', '2026-08-20']);
});

test('TIME-04/05 mês, ano e fevereiro comum/bissexto são civis', async ({ page }) => {
  const result = await page.evaluate(() => ({
    year: monthAdd('2026-12', 1), beforeYear: monthAdd('2027-01', -1),
    common: clampDay(2026, 2, 31), leap: clampDay(2028, 2, 31),
    monthAtNight: localCivilMonth(new Date(2026, 11, 31, 23, 59))
  }));
  expect(result).toEqual({ year: '2027-01', beforeYear: '2026-12', common: 28, leap: 29, monthAtNight: '2026-12' });
});
