const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}

function addAccount(value, id, name, initial, balanceDate) {
  value.accounts.push({
    id,
    name,
    type: 'Conta corrente',
    initial,
    reconciled: null,
    balanceMode: 'snapshot',
    balanceDate
  });
}

async function importRows(page, accountId, rows, file) {
  return page.evaluate(async ({ accountId, rows, file }) => {
    document.querySelector('#stmtAccount').value = String(accountId);
    prepareStatement(rows, file);
    const preview = statementDraft.map(r => ({ action: r.action }));
    await importStatement();
    return preview;
  }, { accountId, rows, file });
}

function scenarioFixture(name) {
  const value = fixture(name);
  value.accounts[0].name = 'Conta A';
  value.accounts[0].initial = 1000;
  value.accounts[0].balanceMode = 'snapshot';
  value.accounts[0].balanceDate = '2026-02-05';
  addAccount(value, 2, 'Conta B', 500, '2026-01-01');
  return value;
}

async function inspect(page) {
  return page.evaluate(() => ({
    a: accountBalance(1),
    b: accountBalance(2),
    total: allAccountBalance(),
    evidence: state.transferEvidence.length,
    transfers: state.transfers.length,
    impact: state.transfers[0]?.balanceImpact,
    impactByAccount: state.transfers[0]?.balanceImpactByAccount || null,
    matchedBy: state.transfers[0]?.matchedBy
  }));
}

test.describe('Impacto por conta em transferências conciliadas', () => {
  test('ponta histórica primeiro não reaplica movimento já absorvido pelo snapshot', async ({ page }) => {
    await boot(page, scenarioFixture('Snapshot assimétrico A→B'));

    const first = await importRows(page, 1, [
      { date: '2026-02-02', desc: 'PIX ENVIADO ENTRE CONTAS', amount: -100, fitid: 'A-100' }
    ], 'conta-a.ofx');
    expect(first).toEqual([{ action: 'pending_transfer' }]);

    const second = await importRows(page, 2, [
      { date: '2026-02-02', desc: 'PIX RECEBIDO ENTRE CONTAS', amount: 100, fitid: 'B-100' }
    ], 'conta-b.ofx');
    expect(second).toEqual([{ action: 'transfer_match' }]);

    expect(await inspect(page)).toEqual({
      a: 1000,
      b: 600,
      total: 1600,
      evidence: 0,
      transfers: 1,
      impact: true,
      impactByAccount: { 1: false, 2: true },
      matchedBy: 'statement-cross-account'
    });

    await page.reload();
    await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe('Snapshot assimétrico A→B');
    expect(await inspect(page)).toEqual({
      a: 1000,
      b: 600,
      total: 1600,
      evidence: 0,
      transfers: 1,
      impact: true,
      impactByAccount: { 1: false, 2: true },
      matchedBy: 'statement-cross-account'
    });
  });

  test('ordem inversa produz exatamente os mesmos saldos', async ({ page }) => {
    await boot(page, scenarioFixture('Snapshot assimétrico B→A'));

    const first = await importRows(page, 2, [
      { date: '2026-02-02', desc: 'PIX RECEBIDO ENTRE CONTAS', amount: 100, fitid: 'B-100' }
    ], 'conta-b.ofx');
    expect(first).toEqual([{ action: 'pending_transfer' }]);

    const second = await importRows(page, 1, [
      { date: '2026-02-02', desc: 'PIX ENVIADO ENTRE CONTAS', amount: -100, fitid: 'A-100' }
    ], 'conta-a.ofx');
    expect(second).toEqual([{ action: 'transfer_match' }]);

    expect(await inspect(page)).toEqual({
      a: 1000,
      b: 600,
      total: 1600,
      evidence: 0,
      transfers: 1,
      impact: true,
      impactByAccount: { 1: false, 2: true },
      matchedBy: 'statement-cross-account'
    });
  });
});