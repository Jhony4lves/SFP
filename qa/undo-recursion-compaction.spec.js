const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

function getUndoDepth(obj, currentDepth = 0) {
  if (!obj || typeof obj !== 'object') return currentDepth;
  let maxD = currentDepth;
  if (Array.isArray(obj.undo)) {
    for (const u of obj.undo) {
      if (u && u.state) {
        maxD = Math.max(maxD, getUndoDepth(u.state, currentDepth + 1));
      }
    }
  }
  return maxD;
}

test.describe('Undo Compaction & Anti-Recursion — Prova Isolada e Integração Real', () => {

  test('1. Prova Algorítmica Isolada: snapshotUndo sanitizado previne explosão fractal', () => {
    function oldSnapshotUndo(state, label, source = null) {
      const clone = o => JSON.parse(JSON.stringify(o));
      const base = clone(source || state);
      base.undo = (base.undo || []).slice(-8);
      state.undo = state.undo || [];
      state.undo.push({ id: Math.floor(Math.random() * 1e9), label, at: new Date().toISOString(), state: base });
      state.undo = state.undo.slice(-10);
    }

    function fixedSnapshotUndo(state, label, source = null) {
      const clone = o => JSON.parse(JSON.stringify(o));
      const src = source || state;
      const sanitizedSource = { ...src, undo: [] };
      const base = clone(sanitizedSource);
      state.undo = state.undo || [];
      state.undo.push({ id: Math.floor(Math.random() * 1e9), label, at: new Date().toISOString(), state: base });
      state.undo = state.undo.slice(-10);
    }

    // 10 iterações com lógica antiga
    let oldState = fixture('Seed Old');
    let oldLastSaved = JSON.parse(JSON.stringify(oldState));
    for (let i = 1; i <= 10; i++) {
      oldState.transactions.push({ id: 100 + i, desc: `Ação ${i}`, amount: 10 });
      oldSnapshotUndo(oldState, `Ação ${i}`, oldLastSaved);
      oldLastSaved = JSON.parse(JSON.stringify(oldState));
    }
    const oldDepth = getUndoDepth(oldState);
    const oldSize = JSON.stringify(oldState).length;
    expect(oldDepth).toBeGreaterThan(1);
    expect(oldSize).toBeGreaterThan(500_000);

    // 10 iterações com lógica corrigida
    let fixedState = fixture('Seed Fixed');
    let fixedLastSaved = JSON.parse(JSON.stringify(fixedState));
    for (let i = 1; i <= 10; i++) {
      fixedState.transactions.push({ id: 100 + i, desc: `Ação ${i}`, amount: 10 });
      fixedSnapshotUndo(fixedState, `Ação ${i}`, fixedLastSaved);
      fixedLastSaved = JSON.parse(JSON.stringify(fixedState));
    }
    const fixedDepth = getUndoDepth(fixedState);
    const fixedSize = JSON.stringify(fixedState).length;
    expect(fixedDepth).toBe(1);
    for (const entry of fixedState.undo) {
      expect(entry.state.undo.length).toBe(0);
    }
    expect(fixedSize).toBeLessThan(100_000);
  });

  test('2. SFP REAL Integração: múltiplas operações reais mantêm profundidade 1 e undo funcional após reload', async ({ page }) => {
    const errors = monitor(page);
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');

    // Executa 15 operações consecutivas com save() real do SFP
    await page.evaluate(async () => {
      for (let i = 1; i <= 15; i++) {
        state.transactions.push({
          id: 7000 + i,
          kind: 'expense',
          desc: `Transação de Teste ${i}`,
          amount: 50.0 + i,
          date: '2026-08-20',
          category: 'Alimentação',
          accountId: 1,
          status: 'paid'
        });
        await save(`Transação ${i}`);
      }
    });

    // Lê o estado real do SFP
    const undoReport = await page.evaluate(() => {
      function calcDepth(obj, currentDepth = 0) {
        if (!obj || typeof obj !== 'object') return currentDepth;
        let maxD = currentDepth;
        if (Array.isArray(obj.undo)) {
          for (const u of obj.undo) {
            if (u && u.state) {
              maxD = Math.max(maxD, calcDepth(u.state, currentDepth + 1));
            }
          }
        }
        return maxD;
      }
      return {
        undoCount: state.undo.length,
        maxDepth: calcDepth(state),
        nestedUndoLengths: state.undo.map(u => u.state?.undo?.length),
        totalTransactions: state.transactions.length
      };
    });

    expect(undoReport.undoCount).toBe(10); // limitado a no máximo 10 snapshots
    expect(undoReport.maxDepth).toBe(1);   // profundidade máxima estritamente 1
    for (const len of undoReport.nestedUndoLengths) {
      expect(len).toBe(0);                // cada snapshot aninhado tem undo.length === 0
    }
    expect(undoReport.totalTransactions).toBe(15);

    // Executa undoLast() no SFP real
    const undoResult = await page.evaluate(async () => {
      const u = await undoLast();
      return {
        label: u?.label,
        remainingUndo: state.undo.length,
        totalTransactions: state.transactions.length,
        lastTxDesc: state.transactions[state.transactions.length - 1]?.desc
      };
    });

    expect(undoResult.label).toBe('Transação 15');
    expect(undoResult.remainingUndo).toBe(9);
    expect(undoResult.totalTransactions).toBe(14);
    expect(undoResult.lastTxDesc).toBe('Transação de Teste 14');

    // Executa reload e repete a verificação de persistência e restauração
    await page.reload();
    await expectBootComplete(page, expect, 'Fixture QA');

    const afterReloadReport = await page.evaluate(() => {
      function calcDepth(obj, currentDepth = 0) {
        if (!obj || typeof obj !== 'object') return currentDepth;
        let maxD = currentDepth;
        if (Array.isArray(obj.undo)) {
          for (const u of obj.undo) {
            if (u && u.state) {
              maxD = Math.max(maxD, calcDepth(u.state, currentDepth + 1));
            }
          }
        }
        return maxD;
      }
      return {
        undoCount: state.undo.length,
        maxDepth: calcDepth(state),
        nestedUndoLengths: state.undo.map(u => u.state?.undo?.length),
        totalTransactions: state.transactions.length
      };
    });

    expect(afterReloadReport.undoCount).toBe(9);
    expect(afterReloadReport.maxDepth).toBe(1);
    for (const len of afterReloadReport.nestedUndoLengths) {
      expect(len).toBe(0);
    }
    expect(afterReloadReport.totalTransactions).toBe(14);

    // Desfaz mais uma ação após o reload
    const undoAfterReload = await page.evaluate(async () => {
      const u = await undoLast();
      return {
        label: u?.label,
        remainingUndo: state.undo.length,
        totalTransactions: state.transactions.length,
        lastTxDesc: state.transactions[state.transactions.length - 1]?.desc
      };
    });

    expect(undoAfterReload.label).toBe('Transação 14');
    expect(undoAfterReload.remainingUndo).toBe(8);
    expect(undoAfterReload.totalTransactions).toBe(13);
    expect(undoAfterReload.lastTxDesc).toBe('Transação de Teste 13');

    expect(errors).toEqual([]);
  });

  test('3. SFP REAL Integração: load() e restoreState() sagram estado legado inflado na inicialização', async ({ page }) => {
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');

    // Gera fixture inflada simulando formato legado anterior com aninhamento recursivo
    const bloatedFixture = fixture('Bloated Legacy QA');
    let current = JSON.parse(JSON.stringify(bloatedFixture));
    for (let i = 1; i <= 8; i++) {
      current.transactions.push({ id: 900 + i, desc: `Legacy ${i}`, amount: 10 });
      const copy = JSON.parse(JSON.stringify(current));
      bloatedFixture.undo.push({
        id: 8000 + i,
        label: `Legacy ${i}`,
        at: new Date().toISOString(),
        state: copy // aninhamento recursivo legado com cópias completas
      });
    }

    const legacyDepth = getUndoDepth(bloatedFixture);
    expect(legacyDepth).toBeGreaterThan(1);

    // Grava no IndexedDB
    await writeIndexedDB(page, bloatedFixture);
    await page.evaluate(() => localStorage.clear());

    const errors = monitor(page);
    await page.reload();
    await expectBootComplete(page, expect, 'Bloated Legacy QA');

    // Verifica se a inicialização real compactou o histórico in-place sem erros
    const compactedReport = await page.evaluate(() => {
      function calcDepth(obj, currentDepth = 0) {
        if (!obj || typeof obj !== 'object') return currentDepth;
        let maxD = currentDepth;
        if (Array.isArray(obj.undo)) {
          for (const u of obj.undo) {
            if (u && u.state) {
              maxD = Math.max(maxD, calcDepth(u.state, currentDepth + 1));
            }
          }
        }
        return maxD;
      }
      return {
        undoCount: state.undo.length,
        maxDepth: calcDepth(state),
        nestedUndoLengths: state.undo.map(u => u.state?.undo?.length)
      };
    });

    expect(compactedReport.undoCount).toBeLessThanOrEqual(10);
    expect(compactedReport.maxDepth).toBe(1);
    for (const len of compactedReport.nestedUndoLengths) {
      expect(len).toBe(0);
    }

    expect(errors).toEqual([]);
  });

});
