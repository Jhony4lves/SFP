const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await expect.poll(() => page.evaluate(() => state.settings.name)).toBe(value.settings.name);
}

test('ERR-001/002 fatura aceita OFX e mantém prévia antes de persistir', async ({ page }) => {
  await boot(page, fixture('Fatura OFX'));
  await page.evaluate(() => {
    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-03';
  });

  const accept = await page.locator('#cardImportFile').getAttribute('accept');
  expect(accept).toContain('.csv');
  expect(accept).toContain('.ofx');
  expect(accept).toContain('application/csv');

  const ofx = '<OFX><STMTTRN><DTPOSTED>20260305<TRNAMT>123.45<FITID>NUB-1<MEMO>Compra Nubank</STMTTRN></OFX>';
  await page.locator('#cardImportFile').setInputFiles({
    name: 'Nubank_2026-03.ofx',
    mimeType: 'application/x-ofx',
    buffer: Buffer.from(ofx, 'utf8')
  });

  await expect(page.locator('#cardImportReview')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => state.purchases.length)).toBe(0);
  await page.locator('#cardImportConfirm').click();
  await expect.poll(() => page.evaluate(() => state.purchases.length)).toBe(1);
  expect(await page.evaluate(() => ({ desc: state.purchases[0].desc, total: state.purchases[0].total })))
    .toEqual({ desc: 'Compra Nubank', total: 123.45 });
});

test('ERR-010 conciliação exibe um único feedback de sucesso', async ({ page }) => {
  await boot(page, fixture('Conciliação única'));
  await page.evaluate(async () => {
    window.sfpPrompt = async () => '1000';
    await reconcileAccount(1);
  });
  await expect(page.locator('#feedbackCard')).toHaveClass(/show/);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
});

test('ERR-015 feedback de transferência não expõe marcação HTML', async ({ page }) => {
  const value = fixture('Feedback transferência');
  value.accounts.push({ id: 2, name: 'Destino', type: 'Conta corrente', initial: 0, balanceMode: 'snapshot', balanceDate: '2026-01-01' });
  await boot(page, value);
  await page.evaluate(() => {
    setPage('lancamentos');
    setKind('transfer');
    document.querySelector('#txFrom').value = '1';
    document.querySelector('#txTo').value = '2';
    document.querySelector('#txDesc').value = 'Transferência teste';
    document.querySelector('#txAmount').value = '10';
    document.querySelector('#txDate').value = '2026-01-10';
    document.querySelector('#txForm').requestSubmit();
  });
  await expect.poll(() => page.evaluate(() => state.transfers.length)).toBe(1);
  const text = await page.locator('#feedbackCard').textContent();
  expect(text).not.toContain('<br>');
  expect(text).not.toContain('<b>');
  expect(text).toContain('Livre projetado agora');
});

test('ERR-016 botão vazio Adicionar lançamento continua funcional após render dinâmico', async ({ page }) => {
  await boot(page, fixture('CTA vazio'));
  await page.evaluate(() => {
    setPage('lancamentos');
    setKind('income');
    renderTx();
  });
  const button = page.locator('#txTable [data-go="lancamentos"]');
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => page.evaluate(() => currentKind)).toBe('expense');
});

test('ERR-007 conta fecha fluxo de criação somente depois de salvar', async ({ page }) => {
  await boot(page, fixture('Fechar conta'));
  await page.evaluate(() => openManagementAction('contas'));
  await expect(page.locator('#modalRoot')).toHaveClass(/modalback/);
  await page.locator('#accountName').fill('Conta nova');
  await page.locator('#accountInitial').fill('250');
  await page.locator('#accountForm button[type="submit"], #accountSubmit').first().click();
  await expect.poll(() => page.evaluate(() => state.accounts.some(a => a.name === 'Conta nova'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
});

test('ERR-012 dívida fecha fluxo de criação somente depois de salvar', async ({ page }) => {
  await boot(page, fixture('Fechar dívida'));
  await page.evaluate(() => {
    openManagementAction('dividas');
    document.querySelector('#debtName').value = 'Empréstimo QA';
    document.querySelector('#debtBalance').value = '1000';
    document.querySelector('#debtRate').value = '1';
    document.querySelector('#debtPayment').value = '100';
    document.querySelector('#debtFirstDue').value = '2026-02-10';
    document.querySelector('#debtInstallments').value = '10';
    document.querySelector('#debtDay').value = '10';
    document.querySelector('#debtAccount').value = '1';
    document.querySelector('#debtForm').requestSubmit();
  });
  await expect.poll(() => page.evaluate(() => state.debts.some(d => d.name === 'Empréstimo QA'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
});

test('ERR-019 recorrência fecha o fluxo após salvar e aparece na lista', async ({ page }) => {
  await boot(page, fixture('Fechar recorrência'));
  await page.evaluate(() => openRecurringForm());
  await expect(page.locator('#modalRoot')).toHaveClass(/modalback/);
  await page.locator('#recDesc').fill('Academia QA');
  await page.locator('#recAmount').fill('80');
  await page.locator('#recDay').fill('5');
  await page.locator('#recStart').fill('2026-01');
  await page.locator('#recForm button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => state.recurring.some(r => r.desc === 'Academia QA'))).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect(page.locator('#recList')).toContainText('Academia QA');
});
