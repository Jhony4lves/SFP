import test from 'node:test';
import assert from 'node:assert/strict';

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

function createSeed() {
  return {
    accounts: [{ id: 1, name: 'Conta Corrente', type: 'Corrente', initial: 1000, reconciled: null }],
    cards: [{ id: 1, name: 'Cartão', limit: 5000, closeDay: 1, dueDay: 10, payAccountId: 1, history: [] }],
    transactions: Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      kind: 'expense',
      desc: `Transação ${i}`,
      amount: 10 + i,
      date: '2026-08-18',
      category: 'Outros',
      accountId: 1,
      status: 'paid'
    })),
    transfers: [],
    purchases: [],
    invoiceAdjustments: [],
    invoices: [],
    recurring: [],
    debts: [],
    goals: [],
    assets: [],
    statements: [],
    classificationRules: [],
    snapshots: [],
    trash: [],
    undo: [],
    closedMonths: [],
    csvTemplates: [],
    favorites: [],
    creditFacilities: [],
    settings: { name: 'Jhony', day1: 5, day2: 20 },
    sophy: { messages: [], memories: [], introDone: true },
    schemaVersion: 11
  };
}

test('1. Baseline snapshotUndo vs Fixed snapshotUndo (RED/GREEN proof)', () => {
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

  // Run 10 iterations on old logic
  let oldState = createSeed();
  let oldLastSaved = JSON.parse(JSON.stringify(oldState));
  for (let i = 1; i <= 10; i++) {
    oldState.transactions.push({ id: 100 + i, desc: `Ação ${i}`, amount: 10 });
    oldSnapshotUndo(oldState, `Ação ${i}`, oldLastSaved);
    oldLastSaved = JSON.parse(JSON.stringify(oldState));
  }
  const oldDepth = getUndoDepth(oldState);
  const oldSize = JSON.stringify(oldState).length;
  assert.ok(oldDepth > 1, `Old logic must have fractal depth > 1 (was ${oldDepth})`);
  assert.ok(oldSize > 1_000_000, `Old logic must explode beyond 1MB after 10 saves (was ${oldSize} bytes)`);

  // Run 10 iterations on fixed logic
  let fixedState = createSeed();
  let fixedLastSaved = JSON.parse(JSON.stringify(fixedState));
  for (let i = 1; i <= 10; i++) {
    fixedState.transactions.push({ id: 100 + i, desc: `Ação ${i}`, amount: 10 });
    fixedSnapshotUndo(fixedState, `Ação ${i}`, fixedLastSaved);
    fixedLastSaved = JSON.parse(JSON.stringify(fixedState));
  }
  const fixedDepth = getUndoDepth(fixedState);
  const fixedSize = JSON.stringify(fixedState).length;
  assert.equal(fixedDepth, 1, `Fixed logic must have depth exactly 1 (was ${fixedDepth})`);
  for (const entry of fixedState.undo) {
    assert.equal(entry.state.undo.length, 0, 'Every snapshot entry state must have undo.length === 0');
  }
  assert.ok(fixedSize < 150_000, `Fixed logic must stay strictly bounded under 150KB (was ${fixedSize} bytes)`);
});

test('2. In-place compaction of bloated legacy fixture (30MB+ nested tree)', () => {
  function compactUndoHistoryInPlace(target) {
    if (!target || typeof target !== 'object') return;
    if (!Array.isArray(target.undo)) {
      target.undo = [];
      return;
    }
    target.undo = target.undo.slice(-10);
    for (let i = 0; i < target.undo.length; i++) {
      const entry = target.undo[i];
      if (entry && typeof entry === 'object' && entry.state && typeof entry.state === 'object') {
        entry.state.undo = [];
      }
    }
  }

  // Generate a bloated legacy fixture
  function oldSnapshotUndo(state, label, source = null) {
    const clone = o => JSON.parse(JSON.stringify(o));
    const base = clone(source || state);
    base.undo = (base.undo || []).slice(-8);
    state.undo = state.undo || [];
    state.undo.push({ id: Math.floor(Math.random() * 1e9), label, at: new Date().toISOString(), state: base });
    state.undo = state.undo.slice(-10);
  }

  let bloated = createSeed();
  let lastSaved = JSON.parse(JSON.stringify(bloated));
  for (let i = 1; i <= 12; i++) {
    bloated.transactions.push({ id: 200 + i, desc: `Legacy Action ${i}`, amount: 5 });
    oldSnapshotUndo(bloated, `Legacy Action ${i}`, lastSaved);
    lastSaved = JSON.parse(JSON.stringify(bloated));
  }

  const beforeSize = JSON.stringify(bloated).length;
  const beforeDepth = getUndoDepth(bloated);
  assert.ok(beforeSize > 10_000_000, `Fixture must be bloated > 10MB (was ${beforeSize})`);
  assert.ok(beforeDepth >= 10, `Fixture depth must be >= 10 (was ${beforeDepth})`);

  const t0 = performance.now();
  compactUndoHistoryInPlace(bloated);
  const compactionTime = performance.now() - t0;

  const afterSize = JSON.stringify(bloated).length;
  const afterDepth = getUndoDepth(bloated);

  assert.equal(afterDepth, 1, `Compacted depth must be 1 (was ${afterDepth})`);
  assert.ok(afterSize < 120_000, `Compacted size must be under 120KB (was ${afterSize})`);
  assert.ok(compactionTime < 10, `In-place compaction must take < 10ms without deep clone (was ${compactionTime.toFixed(2)}ms)`);
  assert.equal(bloated.undo.length, 10, 'Must preserve 10 top-level undo snapshots');
  assert.equal(bloated.accounts.length, 1, 'Must preserve all financial accounts');
  assert.equal(bloated.transactions.length, 42, 'Must preserve all financial transactions');
});

test('3. undoLast() semantic correctness after compaction and fixed snapshots', () => {
  let state = createSeed();
  let lastSavedState = JSON.parse(JSON.stringify(state));

  function compactUndoHistoryInPlace(target) {
    if (!target || typeof target !== 'object') return;
    if (!Array.isArray(target.undo)) {
      target.undo = [];
      return;
    }
    target.undo = target.undo.slice(-10);
    for (let i = 0; i < target.undo.length; i++) {
      const entry = target.undo[i];
      if (entry && typeof entry === 'object' && entry.state && typeof entry.state === 'object') {
        entry.state.undo = [];
      }
    }
  }

  function snapshotUndo(label, source = null) {
    const clone = o => JSON.parse(JSON.stringify(o));
    const src = source || state;
    const sanitizedSource = { ...src, undo: [] };
    const base = clone(sanitizedSource);
    state.undo = state.undo || [];
    state.undo.push({ id: Math.floor(Math.random() * 1e9), label, at: new Date().toISOString(), state: base });
    state.undo = state.undo.slice(-10);
  }

  function restoreState(candidate) {
    compactUndoHistoryInPlace(candidate);
    state = JSON.parse(JSON.stringify(candidate));
    lastSavedState = JSON.parse(JSON.stringify(state));
  }

  function undoLast() {
    const u = state.undo?.[state.undo.length - 1];
    if (!u) return null;
    const restored = JSON.parse(JSON.stringify(u.state));
    const remaining = JSON.parse(JSON.stringify(state.undo.slice(0, -1)));
    restored.undo = remaining;
    restoreState(restored);
    return u;
  }

  // Initial: State A (name: "State A")
  state.settings.name = 'State A';
  lastSavedState = JSON.parse(JSON.stringify(state));

  // Change to State B (name: "State B")
  snapshotUndo('Action 1', lastSavedState);
  state.settings.name = 'State B';
  lastSavedState = JSON.parse(JSON.stringify(state));

  // Change to State C (name: "State C")
  snapshotUndo('Action 2', lastSavedState);
  state.settings.name = 'State C';
  lastSavedState = JSON.parse(JSON.stringify(state));

  assert.equal(state.settings.name, 'State C');
  assert.equal(state.undo.length, 2);

  // Undo 1: should return to State B
  const u1 = undoLast();
  assert.equal(u1.label, 'Action 2');
  assert.equal(state.settings.name, 'State B');
  assert.equal(state.undo.length, 1);

  // Undo 2: should return to State A
  const u2 = undoLast();
  assert.equal(u2.label, 'Action 1');
  assert.equal(state.settings.name, 'State A');
  assert.equal(state.undo.length, 0);

  // Undo 3: nothing to undo
  const u3 = undoLast();
  assert.equal(u3, null);
  assert.equal(state.settings.name, 'State A');
});
