const { test, expect } = require('@playwright/test');
const { fixture, monitor, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}

function addAccount(value, id, name, initial = 0) {
  value.accounts.push({
    id,
    name,
    type: 'Conta corrente',
    initial,
    reconciled: null,
    balanceMode: 'snapshot',
    balanceDate: '2026-01-01'
  });
}

async function importRows(page, accountId, rows, file) {
  return page.evaluate(async ({ accountId, rows, file }) => {
    document.querySelector('#stmtAccount').value = String(accountId);
    prepareStatement(rows, file);
    const preview = statementDraft.map(r => ({
      action: r.action,
      key: r.key,
      duplicate: r.duplicate,
      transferAccountId: r.transferAccountId,
      transferMatchSource: r.transferMatchSource,
      transferMatchId: r.transferMatchId,
      transferMatchConfidence: r.transferMatchConfidence,
      transferMatchReason: r.transferMatchReason,
      semanticClass: r.semanticClass,
      economicImpact: r.economicImpact
    }));
    await importStatement();
    return preview;
  }, { accountId, rows, file });
}

test.describe('Conciliação de transferências entre extratos', () => {
  test('upgrade RC5 repara automaticamente o saldo espelhado persistido sem apagar a transferência', async ({ page }) => {
    const value = fixture('Migração RC5 para RC6');
    value.schemaVersion = 12;
    value.baseDate = '2026-08-18';
    value.accounts[0].name = 'Nubank';
    value.accounts[0].initial = 0;
    value.accounts[0].balanceDate = '2026-08-18';
    addAccount(value, 2, 'Mercado Pago', 0);
    value.accounts[1].balanceDate = '2026-08-18';
    value.transfers = [{
      id: 74639,
      desc: 'PIX ENTRE CONTAS PRÓPRIAS',
      amount: 746.39,
      date: '2026-08-17',
      fromId: 1,
      toId: 2,
      tags: ['extrato', 'transferência'],
      statementKey: '2|fit:MP-74639',
      balanceImpact: true
    }];

    await boot(page, value);

    expect(await page.evaluate(() => ({
      schemaVersion: state.schemaVersion,
      nubank: accountBalance(1),
      mercadoPago: accountBalance(2),
      transferCount: state.transfers.length,
      impact: state.transfers[0]?.balanceImpact,
      migration: state.transfers[0]?.balanceImpactMigratedAt
    }))).toEqual({
      schemaVersion: 14,
      nubank: 0,
      mercadoPago: 0,
      transferCount: 1,
      impact: false,
      migration: 'schema-13'
    });

    await page.reload();
    await expect.poll(() => page.evaluate(() => state?.schemaVersion)).toBe(14);
    expect(await page.evaluate(() => ({
      nubank: accountBalance(1),
      mercadoPago: accountBalance(2),
      transferCount: state.transfers.length,
      impact: state.transfers[0]?.balanceImpact
    }))).toEqual({nubank: 0, mercadoPago: 0, transferCount: 1, impact: false});
  });

  test('migração não neutraliza transferência manual nem extrato posterior à data-base', async ({ page }) => {
    const value = fixture('Guardrails da migração');
    value.schemaVersion = 12;
    value.baseDate = '2026-08-18';
    addAccount(value, 2, 'Conta B', 0);
    value.transfers = [
      {id: 1, desc: 'Manual antiga', amount: 100, date: '2026-08-17', fromId: 1, toId: 2, balanceImpact: true},
      {id: 2, desc: 'Extrato novo', amount: 50, date: '2026-08-19', fromId: 1, toId: 2, tags: ['extrato'], statementKey: '1|fit:new', balanceImpact: true}
    ];

    await boot(page, value);

    expect(await page.evaluate(() => state.transfers.map(t => ({id: t.id, impact: t.balanceImpact})))).toEqual([
      {id: 1, impact: true},
      {id: 2, impact: true}
    ]);
    expect(await page.evaluate(() => [accountBalance(1), accountBalance(2)])).toEqual([850, 150]);
  });

  test('primeira ponta fica pendente e neutra até chegar o extrato da outra conta', async ({ page }) => {
    const errors = monitor(page);
    const value = fixture('Transferência pendente');
    addAccount(value, 2, 'Conta B', 0);
    await boot(page, value);

    const preview = await importRows(page, 1, [
      { date: '2026-02-02', desc: 'PIX ENVIADO PARA MINHA CONTA', amount: -18.98, fitid: 'A-1898' }
    ], 'conta-a.ofx');

    expect(preview[0]).toMatchObject({
      action: 'pending_transfer',
      duplicate: false,
      semanticClass: 'possible_transfer',
      economicImpact: 'neutral'
    });

    expect(await page.evaluate(() => ({
      evidence: state.transferEvidence.length,
      evidenceAmount: state.transferEvidence[0]?.amount,
      transactions: state.transactions.length,
      transfers: state.transfers.length,
      balanceA: accountBalance(1),
      total: allAccountBalance(),
      cash: cashView('2026-02')
    }))).toMatchObject({
      evidence: 1,
      evidenceAmount: -18.98,
      transactions: 0,
      transfers: 0,
      balanceA: 1000,
      total: 1000,
      cash: { income: 0, expense: 0, net: 0 }
    });

    const again = await page.evaluate(() => {
      document.querySelector('#stmtAccount').value = '1';
      prepareStatement([{ date: '2026-02-02', desc: 'PIX ENVIADO PARA MINHA CONTA', amount: -18.98, fitid: 'A-1898' }], 'conta-a.ofx');
      return statementDraft.map(r => ({ duplicate: r.duplicate, action: r.action }));
    });
    expect(again).toEqual([{ duplicate: true, action: 'ignore' }]);
    expect(errors).toEqual([]);
  });

  test('evidências pendentes espelhadas não alteram saldos reais antes da confirmação', async ({ page }) => {
    const value = fixture('Evidência espelhada P0');
    addAccount(value, 2, 'Mercado Pago', 0);
    await boot(page, value);

    const result = await page.evaluate(() => {
      state.transferEvidence.push(
        { id: 9001, accountId: 1, amount: -746.39, status: 'pending', balanceImpact: true },
        { id: 9002, accountId: 2, amount: 746.39, status: 'pending', balanceImpact: true }
      );
      return {
        nubank: accountBalance(1),
        mercadoPago: accountBalance(2),
        total: allAccountBalance()
      };
    });

    expect(result.nubank).toBe(1000);
    expect(result.mercadoPago).toBe(0);
    expect(result.total).toBe(1000);
  });

  test('segunda ponta liga as duas contas e vira uma única transferência, sem receita ou despesa', async ({ page }) => {
    const errors = monitor(page);
    const value = fixture('Transferência casada');
    addAccount(value, 2, 'Conta B', 0);
    await boot(page, value);

    await importRows(page, 1, [
      { date: '2026-02-02', desc: 'PIX ENVIADO PARA CONTA PROPRIA', amount: -18.98, fitid: 'A-1898' }
    ], 'conta-a.ofx');

    const second = await importRows(page, 2, [
      { date: '2026-02-02', desc: 'PIX RECEBIDO CONTA PROPRIA', amount: 18.98, fitid: 'B-1898' }
    ], 'conta-b.ofx');

    expect(second[0].action).toBe('transfer_match');
    expect(second[0].transferAccountId).toBe(1);
    expect(second[0].transferMatchSource).toBe('evidence');
    expect(second[0].transferMatchConfidence).toBeGreaterThanOrEqual(0.9);

    const result = await page.evaluate(() => {
      const t = state.transfers[0];
      const cash = cashView('2026-02');
      return {
        evidence: state.transferEvidence.length,
        transactions: state.transactions.length,
        transfers: state.transfers.length,
        transfer: t && {
          fromId: t.fromId,
          toId: t.toId,
          amount: t.amount,
          statementKeys: t.statementKeys,
          matchedBy: t.matchedBy,
          confidence: t.matchConfidence
        },
        balanceA: accountBalance(1),
        balanceB: accountBalance(2),
        total: allAccountBalance(),
        cash: { income: cash.income, expense: cash.expense, net: cash.net }
      };
    });

    expect(result.evidence).toBe(0);
    expect(result.transactions).toBe(0);
    expect(result.transfers).toBe(1);
    expect(result.transfer).toMatchObject({
      fromId: 1,
      toId: 2,
      amount: 18.98,
      matchedBy: 'statement-cross-account'
    });
    expect(result.transfer.statementKeys.sort()).toEqual(['1|fit:A-1898', '2|fit:B-1898'].sort());
    expect(result.balanceA).toBe(981.02);
    expect(result.balanceB).toBe(18.98);
    expect(result.total).toBe(1000);
    expect(result.cash).toEqual({ income: 0, expense: 0, net: 0 });

    const duplicates = await page.evaluate(() => {
      const out = [];
      document.querySelector('#stmtAccount').value = '1';
      prepareStatement([{ date: '2026-02-02', desc: 'PIX ENVIADO PARA CONTA PROPRIA', amount: -18.98, fitid: 'A-1898' }], 'conta-a.ofx');
      out.push(statementDraft[0].duplicate);
      document.querySelector('#stmtAccount').value = '2';
      prepareStatement([{ date: '2026-02-02', desc: 'PIX RECEBIDO CONTA PROPRIA', amount: 18.98, fitid: 'B-1898' }], 'conta-b.ofx');
      out.push(statementDraft[0].duplicate);
      return out;
    });
    expect(duplicates).toEqual([true, true]);
    expect(errors).toEqual([]);
  });

  test('funciona independentemente da ordem dos extratos', async ({ page }) => {
    const value = fixture('Ordem reversa');
    addAccount(value, 2, 'Conta B', 0);
    await boot(page, value);

    const first = await importRows(page, 2, [
      { date: '2026-02-03', desc: 'TED RECEBIDA ENTRE CONTAS', amount: 75, fitid: 'B-75' }
    ], 'b.ofx');
    expect(first[0].action).toBe('pending_transfer');

    const second = await importRows(page, 1, [
      { date: '2026-02-03', desc: 'TED ENVIADA ENTRE CONTAS', amount: -75, fitid: 'A-75' }
    ], 'a.ofx');
    expect(second[0].action).toBe('transfer_match');

    expect(await page.evaluate(() => ({
      evidence: state.transferEvidence.length,
      transfer: state.transfers.map(t => ({ fromId: t.fromId, toId: t.toId, amount: t.amount }))
    }))).toEqual({ evidence: 0, transfer: [{ fromId: 1, toId: 2, amount: 75 }] });
  });

  test('candidato ambíguo não é ligado automaticamente', async ({ page }) => {
    const value = fixture('Ambiguidade segura');
    addAccount(value, 2, 'Conta B', 0);
    addAccount(value, 3, 'Conta C', 0);
    await boot(page, value);

    await importRows(page, 1, [
      { date: '2026-02-05', desc: 'PIX ENVIADO ENTRE CONTAS', amount: -100, fitid: 'A-100' }
    ], 'a.ofx');
    await importRows(page, 2, [
      { date: '2026-02-05', desc: 'PIX ENVIADO ENTRE CONTAS', amount: -100, fitid: 'B-100' }
    ], 'b.ofx');

    const preview = await page.evaluate(() => {
      document.querySelector('#stmtAccount').value = '3';
      prepareStatement([{ date: '2026-02-05', desc: 'PIX RECEBIDO ENTRE CONTAS', amount: 100, fitid: 'C-100' }], 'c.ofx');
      return statementDraft.map(r => ({ action: r.action, match: r.transferMatchId, target: r.transferAccountId }));
    });

    expect(preview).toEqual([{ action: 'pending_transfer', match: null, target: null }]);
    expect(await page.evaluate(() => state.transfers.length)).toBe(0);
  });

  test('pode corrigir uma ponta genérica já importada como lançamento quando a contraparte aparece', async ({ page }) => {
    const value = fixture('Reclassificação posterior');
    addAccount(value, 2, 'Conta B', 0);
    await boot(page, value);

    const first = await importRows(page, 1, [
      { date: '2026-02-07', desc: 'MOVIMENTO 12345', amount: -50, fitid: 'GEN-50-A' }
    ], 'a.csv');
    expect(first[0].action).toBe('expense');
    expect(await page.evaluate(() => ({ tx: state.transactions.length, exp: monthCalc('2026-02').exp }))).toEqual({ tx: 1, exp: 50 });

    const second = await importRows(page, 2, [
      { date: '2026-02-07', desc: 'PIX RECEBIDO CONTA PROPRIA', amount: 50, fitid: 'GEN-50-B' }
    ], 'b.csv');
    expect(second[0].action).toBe('transfer_match');
    expect(second[0].transferMatchSource).toBe('transaction');

    expect(await page.evaluate(() => ({
      tx: state.transactions.length,
      transfers: state.transfers.length,
      exp: monthCalc('2026-02').exp,
      fromId: state.transfers[0]?.fromId,
      toId: state.transfers[0]?.toId,
      amount: state.transfers[0]?.amount
    }))).toEqual({ tx: 0, transfers: 1, exp: 0, fromId: 1, toId: 2, amount: 50 });
  });

  test('movimentos econômicos conhecidos de mesmo valor não viram transferência sem indício bancário', async ({ page }) => {
    const value = fixture('Falso positivo protegido');
    addAccount(value, 2, 'Conta B', 0);
    await boot(page, value);

    const first = await importRows(page, 1, [
      { date: '2026-02-09', desc: 'MERCADO', amount: -100, fitid: 'MKT-100' }
    ], 'a.csv');
    expect(first[0].action).toBe('expense');

    const preview = await page.evaluate(() => {
      document.querySelector('#stmtAccount').value = '2';
      prepareStatement([{ date: '2026-02-09', desc: 'SALARIO', amount: 100, fitid: 'SAL-100' }], 'b.csv');
      return statementDraft.map(r => ({ action: r.action, match: r.transferMatchId, semanticClass: r.semanticClass }));
    });

    expect(preview[0].action).toBe('income');
    expect(preview[0].match).toBeNull();
    expect(await page.evaluate(() => state.transfers.length)).toBe(0);
  });

  test('tolerância de um dia funciona, mas continua sendo apresentada para revisão', async ({ page }) => {
    const value = fixture('Liquidação D+1');
    addAccount(value, 2, 'Conta B', 0);
    await boot(page, value);

    await importRows(page, 1, [
      { date: '2026-02-10', desc: 'TRANSFERENCIA ENVIADA CONTA PROPRIA', amount: -220, fitid: 'D1-A' }
    ], 'a.ofx');

    const preview = await page.evaluate(() => {
      document.querySelector('#stmtAccount').value = '2';
      prepareStatement([{ date: '2026-02-11', desc: 'TRANSFERENCIA RECEBIDA CONTA PROPRIA', amount: 220, fitid: 'D1-B' }], 'b.ofx');
      return statementDraft.map(r => ({ action: r.action, confidence: r.transferMatchConfidence, review: statementNeedsReview(r) }));
    });

    expect(preview[0].action).toBe('transfer_match');
    expect(preview[0].confidence).toBeGreaterThanOrEqual(0.8);
    expect(preview[0].review).toBe(true);
  });
});
