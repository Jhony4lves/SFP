const DB_NAME = 'SFP_JHONY_STABLE';
const STORE = 'state';
const DB_KEY = 'main';
const FALLBACK_KEY = 'sfp_final_fallback';

function fixture(name = 'Fixture QA') {
  return {
    version: 202, schemaVersion: 11, mesAtual: '2026-01', baseDate: '2026-01-01',
    settings: { name, day1: 1, day2: 15, budgetPreset: '503020', needs: 50, wants: 30, save: 20, privacy: false, onboardingDone: true },
    accounts: [{ id: 1, name: 'Conta QA', type: 'Conta corrente', initial: 1000, balanceMode: 'snapshot', balanceDate: '2026-01-01' }],
    cards: [{ id: 1, name: 'Cartão QA', limit: 2000, closeDay: 10, dueDay: 17, payAccountId: 1, history: [] }],
    transactions: [], transfers: [], purchases: [], invoiceAdjustments: [], invoices: [], recurring: [], debts: [], goals: [], assets: [], statements: [], classificationRules: [], categoryBudgets: {}, snapshots: [], trash: [], undo: [], closedMonths: [], csvTemplates: [], favorites: [], creditFacilities: [], ui: { invoiceMonthByCard: {} },
    sophy: { personaState: 'cheerful', messages: [], memories: [], lastProactiveAt: null, settings: { proactivityEnabled: true } },
    persistenceMeta: { revision: 1, savedAt: new Date().toISOString() }
  };
}

function monitor(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  return errors;
}

async function expectBootComplete(page, expect, name) {
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  const btn = page.locator('.nav button[data-page="config"]');
  if (await btn.isVisible()) {
    await btn.click();
  } else {
    await page.evaluate(() => setPage('config'));
  }
  await expect(page.locator('#config')).toHaveClass(/active/);
  await expect(page.locator('#cfgName')).toHaveValue(name);
}

async function writeIndexedDB(page, value) {
  if (value && typeof value === 'object' && !value.persistenceMeta) {
    value.persistenceMeta = { revision: Date.now(), savedAt: new Date().toISOString() };
  }
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await page.evaluate(async ({ DB_NAME, STORE, DB_KEY, value }) => {
    if (typeof db !== 'undefined' && db) { try { db.close(); } catch {} db = null; }
    if (typeof window !== 'undefined' && window.db) { try { window.db.close(); } catch {} window.db = null; }
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || Error('Falha ao excluir IndexedDB de teste'));
      request.onblocked = () => resolve();
    });
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value !== undefined) await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(value, DB_KEY);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
    database.close();
  }, { DB_NAME, STORE, DB_KEY, value });
}

module.exports = { DB_NAME, STORE, DB_KEY, FALLBACK_KEY, fixture, monitor, expectBootComplete, writeIndexedDB };
