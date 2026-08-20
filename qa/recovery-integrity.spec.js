const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}

test('REC-01/02 backup JSON preserva finanças e campos desconhecidos após reload', async ({ page }) => {
  const value = fixture('Round-trip');
  value.futureRoot = { opaque: ['preservar'] };
  value.accounts[0].futureAccountField = { cents: 12345 };
  value.transactions.push({ id: 7, kind: 'income', desc: 'Receita', amount: 123.45, date: '2026-01-02', accountId: 1, status: 'paid', futureTxField: 'ok' });
  await boot(page, value);
  const backup = await page.evaluate(() => JSON.stringify(state));
  await page.evaluate(async raw => { state = clone(seed); await restoreState(JSON.parse(raw)); }, backup);
  await page.reload();
  expect(await page.evaluate(() => ({ amount: state.transactions[0].amount, txExtra: state.transactions[0].futureTxField, accountExtra: state.accounts[0].futureAccountField, rootExtra: state.futureRoot }))).toEqual({ amount: 123.45, txExtra: 'ok', accountExtra: { cents: 12345 }, rootExtra: { opaque: ['preservar'] } });
});

test('REC-03/04/05 criptografia faz round-trip e falhas não alteram state', async ({ page }) => {
  await boot(page, fixture('Criptografia'));
  const result = await page.evaluate(async () => {
    state.unknown = { safe: true };
    const before = JSON.stringify(state), encrypted = await encryptBackup('senha-segura');
    const roundTrip = await decryptBackup(encrypted, 'senha-segura');
    let wrong = false, corrupt = false;
    try { await decryptBackup(encrypted, 'senha-errada'); } catch { wrong = true; }
    try { await decryptBackup(encrypted.slice(0, -8), 'senha-segura'); } catch { corrupt = true; }
    return { equal: JSON.stringify(roundTrip) === before, unchanged: JSON.stringify(state) === before, wrong, corrupt };
  });
  expect(result).toEqual({ equal: true, unchanged: true, wrong: true, corrupt: true });
});

test('REC-06, UNDO-01/02/03 e TRASH-01/02 preservam snapshots independentes', async ({ page }) => {
  await boot(page, fixture('Recuperação'));
  await page.evaluate(async () => {
    state.transactions.push({ id: 10, kind: 'expense', desc: 'Primeiro', amount: 10, date: '2026-01-02', accountId: 1, status: 'paid', unknown: { a: 1 } }); await save('primeiro');
    state.transactions.push({ id: 11, kind: 'expense', desc: 'Segundo', amount: 20, date: '2026-01-03', accountId: 1, status: 'paid' }); await save('segundo');
    moveToTrash('transaction', state.transactions[0]); state.transactions.splice(0, 1); await save('lixeira');
  });
  const auto = await page.evaluate(() => JSON.parse(localStorage.getItem('sfp_auto_backups')).map(x => x.state.transactions.map(t => t.id)));
  expect(auto.slice(-3)).toEqual([[], [10], [10, 11]]);
  expect(await page.evaluate(() => state.trash[0].item.unknown)).toEqual({ a: 1 });
  await page.evaluate(() => undoLast());
  expect(await page.evaluate(() => state.transactions.map(t => t.id))).toEqual([10, 11]);
  await page.evaluate(() => undoLast());
  expect(await page.evaluate(() => state.transactions.map(t => t.id))).toEqual([10]);
  await page.reload();
  expect(await page.evaluate(() => ({ ids: state.transactions.map(t => t.id), trash: state.trash.length }))).toEqual({ ids: [10], trash: 0 });
});

test('UNDO-04/FAIL-01/02 falha de persistência reverte mutação e não consome undo', async ({ page }) => {
  await boot(page, fixture('Atomicidade'));
  const result = await page.evaluate(async () => {
    state.transactions.push({ id: 1, kind: 'expense', desc: 'A', amount: 10, date: '2026-01-01', accountId: 1, status: 'paid' }); await save('A');
    const original = dbSet, before = JSON.stringify(state), undoCount = state.undo.length;
    dbSet = async () => { throw Error('falha'); };
    state.transactions.push({ id: 2, kind: 'expense', desc: 'B', amount: 20, date: '2026-01-02', accountId: 1, status: 'paid' });
    try { await save('B'); } catch {}
    const saveRolledBack = JSON.stringify(state) === before;
    try { await undoLast(); } catch {}
    const undoPreserved = state.undo.length === undoCount && JSON.stringify(state) === before;
    try { await restoreState(clone(seed)); } catch {}
    const restoreRolledBack = JSON.stringify(state) === before;
    dbSet = original;
    return { saveRolledBack, undoPreserved, restoreRolledBack };
  });
  expect(result).toEqual({ saveRolledBack: true, undoPreserved: true, restoreRolledBack: true });
});
