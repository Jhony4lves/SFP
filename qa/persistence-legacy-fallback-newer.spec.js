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

test('P1 persistência: falha ao gravar quarentena aborta migração e preserva fallback B intacto', async ({ page }) => {
  const errors = monitor(page);

  // Boot de preparação idêntico ao teste anterior: promove B, depois instala legado A no IDB.
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await writeIndexedDB(page, legacyStateA());
  await page.evaluate(keys => { for (const key of keys) localStorage.removeItem(key); }, [QUARANTINE_KEY, 'sfp_last_migration_notice']);

  // Simula quota/setItem quebrado APENAS para sfp_legacy_quarantine a partir do próximo boot.
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException('QuotaExceededError simulado (QA)', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  }, QUARANTINE_KEY);

  // Boot ambíguo com quarentena indisponível: deve abortar com erro explícito.
  await page.reload();
  await expect.poll(() => errors.join('\n'), { timeout: 20000 }).toMatch(/quarentena/i);
  const bootError = errors.find(e => /pageerror|console\.error/.test(e) && /quarentena/i.test(e));
  expect(bootError, 'erro explícito de quarentena deve ser observável').toBeTruthy();

  // Boot não completou: estado/migração nunca avançaram.
  expect(await page.evaluate(() => typeof state === 'undefined' || state == null), 'estado não pode ter sido carregado').toBe(true);
  expect(await page.evaluate(() => typeof lastSavedState === 'undefined' || lastSavedState == null), 'nenhum save pode ter sido consolidado').toBe(true);

  // sfp_legacy_quarantine não foi criada.
  expect(await page.evaluate(key => localStorage.getItem(key), QUARANTINE_KEY)).toBeNull();

  // IndexedDB A não foi carimbado/migrado: continua sem revision e com o conteúdo original.
  const idbState = await page.evaluate(async ({ DB_NAME, STORE, DB_KEY }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE).objectStore(STORE).get(DB_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return value;
  }, { DB_NAME, STORE, DB_KEY });
  expect(idbState.transactions.some(t => t.desc === 'ESTADO-A'), 'IndexedDB A intacto').toBe(true);
  expect(idbState.persistenceMeta?.revision == null, 'IndexedDB A não foi carimbado').toBe(true);

  // Fallback B permanece intacto e recuperável.
  const fallbackRaw = await page.evaluate(key => localStorage.getItem(key), FALLBACK_KEY);
  expect(fallbackRaw).toBeTruthy();
  const fallbackB = JSON.parse(fallbackRaw);
  expect(fallbackB.transactions.some(t => t.desc === SENTINEL_DESC), 'sentinela de B preservada no fallback').toBe(true);
  expect(fallbackB.persistenceMeta?.revision == null, 'fallback B segue legado original').toBe(true);

  // Dados recuperáveis: sem quarentena criada e sem sobrescrita em nenhuma fonte,
  // um boot futuro sem a falha simulada reproduz o caso ambíguo original.
});
