const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB, FALLBACK_KEY } = require('./helpers');

function revisioned(name, revision) {
  const value = fixture(name);
  value.persistenceMeta = { revision, savedAt: new Date(revision).toISOString() };
  return value;
}

async function prepareSources(page, indexedDBValue, fallbackValue) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, indexedDBValue);
  await page.evaluate(({ key, value }) => {
    localStorage.clear();
    if (value !== undefined) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }, { key: FALLBACK_KEY, value: fallbackValue });
}

async function expectStateLoaded(page, name) {
  await expect.poll(() => page.evaluate(() => typeof state === 'object' ? state?.settings?.name || null : null)).toBe(name);
}

test('persistência escolhe fallback revisionado mais novo e o promove após reload', async ({ page }) => {
  const oldPrimary = revisioned('IDB antiga', 1000);
  const newFallback = revisioned('Fallback novo', 2000);
  await prepareSources(page, oldPrimary, newFallback);
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'Fallback novo');
  expect(await page.evaluate(async () => (await dbGet()).value.settings.name)).toBe('Fallback novo');
  await page.reload();
  await expectBootComplete(page, expect, 'Fallback novo');
  expect(errors).toEqual([]);
});

test('persistência mantém IndexedDB revisionada mais nova que fallback antigo', async ({ page }) => {
  await prepareSources(page, revisioned('IDB nova', 3000), revisioned('Fallback antigo', 2000));
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'IDB nova');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(FALLBACK_KEY)).settings.name)).toBe('Fallback antigo');
  expect(errors).toEqual([]);
});

test('fontes revisionadas iguais preferem IndexedDB sem descartar fallback', async ({ page }) => {
  const equal = revisioned('Fontes iguais', 4000);
  await prepareSources(page, equal, equal);
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'Fontes iguais');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(FALLBACK_KEY)))).toEqual(equal);
  expect(errors).toEqual([]);
});

test('estados legados iguais sem revisão continuam legíveis', async ({ page }) => {
  const legacy = fixture('Legado igual');
  await prepareSources(page, legacy, legacy);
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'Legado igual');
  expect(errors).toEqual([]);
});

test('estados legados divergentes são preservados e interrompem escolha ambígua', async ({ page }) => {
  await prepareSources(page, fixture('Legado IDB'), fixture('Legado fallback'));
  const fallbackBefore = await page.evaluate(() => localStorage.getItem(FALLBACK_KEY));
  const errors = monitor(page);
  await page.reload();
  await expect.poll(() => errors.some(error => error.includes('estados diferentes sem revisão'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem(FALLBACK_KEY))).toBe(fallbackBefore);
  expect((await page.evaluate(async () => dbGet())).value.settings.name).toBe('Legado IDB');
});

test('falha temporária de escrita usa fallback e recuperação promove estado novo', async ({ page }) => {
  await prepareSources(page, revisioned('Antes da falha', 5000), undefined);
  await page.reload();
  await expectBootComplete(page, expect, 'Antes da falha');
  const write = await page.evaluate(async () => {
    state.settings.name = 'Salvo no fallback';
    if (db) { db.close(); db = null; }
    const original = openDB;
    openDB = async () => ({ transaction() { throw Error('falha temporária'); } });
    const result = await dbSet(state);
    openDB = original;
    return { status: result.status, fallbackRevision: JSON.parse(localStorage.getItem(FALLBACK_KEY)).persistenceMeta.revision };
  });
  expect(write.status).toBe('fallback');
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'Salvo no fallback');
  expect(await page.evaluate(async () => (await dbGet()).value.settings.name)).toBe('Salvo no fallback');
  expect(errors).toEqual([]);
});

test('falha de leitura usa fallback válido sem tratar IndexedDB como vazia', async ({ page }) => {
  await prepareSources(page, revisioned('IDB inacessível', 6000), revisioned('Fallback legível', 7000));
  await page.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: { open() { const request = { error: Error('falha de leitura') }; setTimeout(() => request.onerror?.(), 0); return request; } }
  }));
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'Fallback legível');
  expect(errors).toEqual([]);
});

test('corrupção com fallback válido preserva fallback e não promove sobre fonte corrompida', async ({ page }) => {
  const fallback = revisioned('Fallback após corrupção', 8000);
  await prepareSources(page, 'corrompido', fallback);
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'Fallback após corrupção');
  expect((await page.evaluate(async () => dbGet())).status).toBe('corrupt');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(FALLBACK_KEY)))).toEqual(fallback);
  expect(errors).toEqual([]);
});

test('fallback válido sem IndexedDB inicia sem seed', async ({ page }) => {
  const fallback = revisioned('Somente fallback', 9000);
  await prepareSources(page, undefined, fallback);
  await page.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true }));
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'Somente fallback');
  expect(errors).toEqual([]);
});

test('nenhuma fonte válida interrompe bootstrap sem criar seed', async ({ page }) => {
  await prepareSources(page, 'corrompido', '{fallback-corrompido');
  const errors = monitor(page);
  await page.reload();
  await expect.poll(() => errors.some(error => error.includes('Nenhum dado foi substituído'))).toBe(true);
  expect((await page.evaluate(async () => dbGet())).status).toBe('corrupt');
  expect(await page.evaluate(() => localStorage.getItem(FALLBACK_KEY))).toBe('{fallback-corrompido');
});

test('toggle pending e paid sincroniza saldo, caixa e compromisso após reloads reais', async ({ page }) => {
  const value = fixture('Toggle QA');
  value.mesAtual = '2026-02';
  value.transactions = [{ id: 1, kind: 'expense', desc: 'Conta pendente', amount: 100, date: '2026-02-05', category: 'Casa', accountId: 1, status: 'pending', balanceImpact: false }];
  await prepareSources(page, value, undefined);
  const errors = monitor(page);
  await page.reload();
  await expectStateLoaded(page, 'Toggle QA');
  await page.locator('.nav button[data-page="lancamentos"]').click();
  await page.locator('#txTable button.status').click();
  await expect.poll(() => page.evaluate(async () => (await dbGet()).value.transactions[0].status)).toBe('paid');
  await page.reload();
  await expectStateLoaded(page, 'Toggle QA');
  let result = await page.evaluate(() => ({ balance: accountBalance(1), cash: cashView('2026-02').expense, commitment: commitmentView('2026-02').total, status: state.transactions[0].status }));
  expect(result).toEqual({ balance: 900, cash: 100, commitment: 0, status: 'paid' });
  await page.locator('.nav button[data-page="lancamentos"]').click();
  await page.locator('#txTable button.status').click();
  await expect.poll(() => page.evaluate(async () => (await dbGet()).value.transactions[0].status)).toBe('pending');
  await page.reload();
  await expectStateLoaded(page, 'Toggle QA');
  result = await page.evaluate(() => ({ balance: accountBalance(1), cash: cashView('2026-02').expense, commitment: commitmentView('2026-02').total, status: state.transactions[0].status }));
  expect(result).toEqual({ balance: 1000, cash: 0, commitment: 100, status: 'pending' });
  expect(errors).toEqual([]);
});

test('conciliação comum impacta uma vez, persiste e reimportação é idempotente', async ({ page }) => {
  const value = fixture('Conciliação comum QA');
  value.mesAtual = '2026-02';
  value.transactions = [{ id: 1, kind: 'expense', desc: 'Conta pendente', amount: 100, date: '2026-02-05', category: 'Casa', accountId: 1, status: 'pending', balanceImpact: false }];
  await prepareSources(page, value, undefined);
  const errors = monitor(page);
  await page.reload();
  await expectStateLoaded(page, 'Conciliação comum QA');
  await page.evaluate(async () => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement([{ date: '2026-02-05', desc: 'Conta pendente', amount: -100, fitid: 'common-1' }], 'extrato.ofx');
    await importStatement();
  });
  await page.reload();
  await expectStateLoaded(page, 'Conciliação comum QA');
  let result = await page.evaluate(() => ({ count: state.transactions.length, key: state.transactions[0].statementKey, balance: accountBalance(1), cash: cashView('2026-02').expense, commitment: commitmentView('2026-02').total }));
  expect(result).toEqual({ count: 1, key: '1|fit:common-1', balance: 900, cash: 100, commitment: 0 });
  await page.evaluate(async () => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement([{ date: '2026-02-05', desc: 'Conta pendente', amount: -100, fitid: 'common-1' }], 'extrato.ofx');
    await importStatement();
  });
  await page.reload();
  await expectStateLoaded(page, 'Conciliação comum QA');
  result = await page.evaluate(() => ({ count: state.transactions.length, balance: accountBalance(1), cash: cashView('2026-02').expense }));
  expect(result).toEqual({ count: 1, balance: 900, cash: 100 });
  expect(errors).toEqual([]);
});

test('deduplica FITID e chave CSV dentro do lote sem colapsar descrições diferentes', async ({ page }) => {
  await prepareSources(page, fixture('Duplicatas QA'), undefined);
  const errors = monitor(page);
  await page.reload();
  await expectStateLoaded(page, 'Duplicatas QA');
  const first = await page.evaluate(async () => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement([
      { date: '2026-02-05', desc: 'A', amount: -10, fitid: 'same' },
      { date: '2026-02-05', desc: 'A repetida', amount: -10, fitid: 'same' },
      { date: '2026-02-06', desc: 'CSV igual', amount: -20, fitid: null },
      { date: '2026-02-06', desc: 'CSV igual', amount: -20, fitid: null },
      { date: '2026-02-06', desc: 'CSV diferente', amount: -20, fitid: null }
    ], 'lote.csv');
    const duplicateFlags = statementDraft.map(row => row.duplicate);
    await importStatement();
    return { duplicateFlags, count: state.transactions.length };
  });
  expect(first).toEqual({ duplicateFlags: [false, true, false, false, false], count: 4 });
  await page.reload();
  await expectStateLoaded(page, 'Duplicatas QA');
  const later = await page.evaluate(() => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement([{ date: '2026-02-05', desc: 'A', amount: -10, fitid: 'same' }], 'depois.csv');
    return { duplicate: statementDraft[0].duplicate, action: statementDraft[0].action };
  });
  expect(later).toEqual({ duplicate: true, action: 'ignore' });
  expect(errors).toEqual([]);
});
