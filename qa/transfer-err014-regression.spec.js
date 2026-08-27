const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

// ERR-014 cobre tanto privacidade no boot quanto ativação durante a sessão.
// A máscara precisa mudar na UI antes da persistência assíncrona terminar.
// Rodada final também protege o comentário P1 levantado no review automatizado.
async function boot(page, privacy = false) {
  const value = fixture('ERR-014');
  value.settings.privacy = privacy;
  value.accounts.push({ id: 2, name: 'Reserva QA', type: 'Conta corrente', initial: 250.5, balanceMode: 'snapshot', balanceDate: '2026-01-01' });
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state?.settings?.name === 'ERR-014');
  await page.evaluate(() => setPage('lancamentos'));
  await page.locator('[data-kind="transfer"]').click();
}

test('ERR-014 seletores de transferência exibem saldo atual das contas', async ({ page }) => {
  await boot(page);
  const labels = await page.evaluate(() => ({
    from: [...document.querySelectorAll('#txFrom option')].map(o => o.textContent),
    to: [...document.querySelectorAll('#txTo option')].map(o => o.textContent)
  }));
  for (const list of [labels.from, labels.to]) {
    expect(list.some(x => x.includes('Conta QA') && x.includes('1.000,00'))).toBe(true);
    expect(list.some(x => x.includes('Reserva QA') && x.includes('250,50'))).toBe(true);
  }
});

test('ERR-014 modo privacidade no boot não vaza saldos nos seletores de transferência', async ({ page }) => {
  await boot(page, true);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#txFrom option,#txTo option')].map(o => o.textContent));
  expect(labels.some(x => x.includes('1.000,00') || x.includes('250,50'))).toBe(false);
  expect(labels.every(x => x.includes('••••'))).toBe(true);
});

test('ERR-014 alternar privacidade mascara e restaura opções imediatamente sem perder seleção', async ({ page }) => {
  await boot(page, false);
  await page.locator('#txFrom').selectOption('2');
  await page.locator('#txTo').selectOption('1');
  await page.locator('#privacyToggle').click();

  await expect.poll(() => page.evaluate(() => state.settings.privacy)).toBe(true);
  let result = await page.evaluate(() => ({
    from: document.querySelector('#txFrom').value,
    to: document.querySelector('#txTo').value,
    labels: [...document.querySelectorAll('#txFrom option,#txTo option')].map(o => o.textContent)
  }));
  expect(result.from).toBe('2');
  expect(result.to).toBe('1');
  expect(result.labels.some(x => x.includes('1.000,00') || x.includes('250,50'))).toBe(false);
  expect(result.labels.every(x => x.includes('••••'))).toBe(true);

  await page.locator('#privacyToggle').click();
  await expect.poll(() => page.evaluate(() => state.settings.privacy)).toBe(false);
  result = await page.evaluate(() => ({
    from: document.querySelector('#txFrom').value,
    to: document.querySelector('#txTo').value,
    labels: [...document.querySelectorAll('#txFrom option,#txTo option')].map(o => o.textContent)
  }));
  expect(result.from).toBe('2');
  expect(result.to).toBe('1');
  expect(result.labels.some(x => x.includes('1.000,00'))).toBe(true);
  expect(result.labels.some(x => x.includes('250,50'))).toBe(true);
});

test('ERR-014 origem e destino iguais continuam bloqueados sem criar transferência', async ({ page }) => {
  await boot(page);
  await page.locator('#txDesc').fill('Transferência inválida');
  await page.locator('#txAmount').fill('10.00');
  await page.locator('#txDate').fill('2026-01-20');
  await page.locator('#txFrom').selectOption('1');
  await page.locator('#txTo').selectOption('1');
  const before = await page.evaluate(() => state.transfers.length);
  await page.locator('#txSubmit').click();
  await expect(page.locator('body')).toContainText('Origem e destino precisam ser diferentes.');
  expect(await page.evaluate(() => state.transfers.length)).toBe(before);
});
