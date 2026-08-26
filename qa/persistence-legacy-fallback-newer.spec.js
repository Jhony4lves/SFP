const { test, expect } = require('@playwright/test');
const { DB_NAME, STORE, DB_KEY, FALLBACK_KEY, fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

const ORIGIN = 'http://127.0.0.1:4173';
const QUARANTINE_KEY = 'sfp_legacy_quarantine';
const SENTINEL_DESC = 'SENTINELA-QA-B-777';

function legacyStateA() {
  return {
    ...fixture('Legado A'),
    mesAtual: '2026-08', baseDate: '2026-08-01',
    accounts: [{ id: 1, name: 'Conta A', type: 'Conta corrente', initial: 100, balanceMode: 'snapshot', balanceDate: '2026-08-01' }],
    transactions: [{ id: 'a-1', kind: 'expense', desc: 'ESTADO-A', amount: 10, date: '2026-08-02', category: 'Outros', accountId: 1, status: 'paid' }],
    undo: []
  };
}

function legacyStateB() {
  return {
    ...fixture('Legado B'),
    mesAtual: '2026-08', baseDate: '2026-08-15',
    accounts: [{ id: 1, name: 'Conta B', type: 'Conta corrente', initial: 900, balanceMode: 'snapshot', balanceDate: '2026-08-15' }],
    transactions: [{ id: 'sentinel-b', kind: 'expense', desc: SENTINEL_DESC, amount: 777, date: '2026-08-20', category: 'Outros', accountId: 1, status: 'paid' }],
    undo: []
  };
}

test.use({
  storageState: {
    cookies: [],
    origins: [{ origin: ORIGIN, localStorage: [{ name: FALLBACK_KEY, value: JSON.stringify(legacyStateB()) }] }]
  }
});

test('P0 persistência: fallback legado divergente sem revision é preservado em quarentena antes da migração', async ({ page }) => {
  const errors = monitor(page);

  // Boot de preparação: IDB vazio + fallback B -> app promove B ao IDB.
  // Em seguida substituímos o IDB pelo estado legado A (sem revision), recriando
  // a divergência legada A (IndexedDB) x B (fallback) que dispara o caso ambíguo.
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await writeIndexedDB(page, legacyStateA());
  await page.evaluate(keys => { for (const key of keys) localStorage.removeItem(key); }, [QUARANTINE_KEY, 'sfp_last_migration_notice']);

  // Boot 1: IndexedDB legado A sem revision x fallback legado B sem revision, divergentes.
  await page.reload();
  await expectBootComplete(page, expect, 'Legado A');

  const quarantinedRaw = await page.evaluate(key => localStorage.getItem(key), QUARANTINE_KEY);
  expect(quarantinedRaw, 'quarentena deve ser criada no primeiro boot ambíguo').toBeTruthy();
  const quarantined = JSON.parse(quarantinedRaw);
  expect(quarantined.transactions.some(t => t.desc === SENTINEL_DESC), 'sentinela de B preservada na quarentena').toBe(true);
  expect(quarantined.accounts?.[0]?.name).toBe('Conta B');
  expect(quarantined.persistenceMeta?.revision == null, 'quarentena mantém o estado legado original').toBe(true);
  const quarantineSnapshot = quarantinedRaw;

  // Boot 2: app continua funcional e a quarentena permanece intacta.
  await page.reload();
  await expectBootComplete(page, expect, 'Legado A');
  expect(await page.evaluate(key => localStorage.getItem(key), QUARANTINE_KEY)).toBe(quarantineSnapshot);

  // Um save normal após o segundo boot não pode destruir a quarentena silenciosamente.
  await page.evaluate(() => window.save('QA quarentena legada'));
  expect(await page.evaluate(key => localStorage.getItem(key), QUARANTINE_KEY)).toBe(quarantineSnapshot);

  // Nenhum erro não tratado durante toda a sequência.
  expect(errors, 'nenhum erro não tratado no console').toEqual([]);
});
