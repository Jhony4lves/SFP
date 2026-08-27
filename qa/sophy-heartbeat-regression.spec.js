const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(expectedName => typeof state !== 'undefined' && state?.settings?.name === expectedName, value.settings.name);
}

test('ERR-005 heartbeat inicializa e persiste o relógio entre reinícios do app', async ({ page }) => {
  const value = fixture('Heartbeat persistente');
  value.sophy.introDone = true;
  value.sophy.lastProactiveAt = null;
  await boot(page, value);

  const first = await page.evaluate(() => state.sophy.lastProactiveAt);
  expect(first).toBeTruthy();

  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state?.settings?.name === 'Heartbeat persistente');
  const second = await page.evaluate(() => state.sophy.lastProactiveAt);
  expect(second).toBe(first);
});

test('ERR-005 heartbeat periódico gera mensagem relevante sem force e persiste após reload', async ({ page }) => {
  const value = fixture('Heartbeat real');
  value.sophy.introDone = true;
  value.sophy.lastProactiveAt = '2026-01-01T00:00:00.000Z';
  await boot(page, value);

  const result = await page.evaluate(async () => {
    state.accounts[0].initial = 0;
    state.sophy.introDone = true;
    state.sophy.lastProactiveAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    state.transactions.push({
      id: 9901,
      kind: 'expense',
      desc: 'Conta urgente heartbeat',
      amount: 125,
      date: localCivilDate(),
      category: 'Casa',
      accountId: 1,
      status: 'pending',
      dueDay: new Date().getDate(),
      balanceImpact: false,
      createdAt: Date.now()
    });
    await dbSet(state);
    lastSavedState = clone(state);
    const beforeCount = state.sophy.messages.length;
    const text = await sophyHeartbeatTick({ notify: false });
    return {
      text,
      beforeCount,
      afterCount: state.sophy.messages.length,
      lastAt: state.sophy.lastProactiveAt,
      latest: state.sophy.messages.at(-1)?.text || ''
    };
  });

  expect(result.text).toContain('livre projetado');
  expect(result.afterCount).toBe(result.beforeCount + 1);
  expect(result.latest).toContain('livre projetado');
  expect(result.lastAt).toBeTruthy();

  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state?.settings?.name === 'Heartbeat real');
  await expect.poll(() => page.evaluate(() => state.sophy.messages.some(m => m.text?.includes('livre projetado')))).toBe(true);
});

test('ERR-005 startSophyHeartbeat é idempotente e não cria vários timers', async ({ page }) => {
  const value = fixture('Heartbeat único');
  value.sophy.introDone = true;
  await boot(page, value);

  const timers = await page.evaluate(() => {
    const first = startSophyHeartbeat();
    const second = startSophyHeartbeat();
    return { same: first === second, interval: SOPHY_HEARTBEAT_INTERVAL_MS };
  });
  expect(timers.same).toBe(true);
  expect(timers.interval).toBe(15 * 60 * 1000);
});

test('ERR-005 proatividade desligada impede heartbeat de criar conversa', async ({ page }) => {
  const value = fixture('Heartbeat desligado');
  value.sophy.introDone = true;
  value.sophy.settings.proactivityEnabled = false;
  value.sophy.lastProactiveAt = '2026-01-01T00:00:00.000Z';
  await boot(page, value);

  const result = await page.evaluate(async () => {
    const before = {
      count: state.sophy.messages.length,
      last: state.sophy.lastProactiveAt
    };
    const text = await sophyHeartbeatTick({ notify: false });
    return {
      text,
      before,
      afterCount: state.sophy.messages.length,
      afterLast: state.sophy.lastProactiveAt
    };
  });
  expect(result.text).toBeNull();
  expect(result.afterCount).toBe(result.before.count);
  expect(result.afterLast).toBe(result.before.last);
});

test('ERR-005 recebimento de amanhã é reconhecido como amanhã, não como mês atual', async ({ page }) => {
  const value = fixture('Heartbeat amanhã');
  value.sophy.introDone = true;
  await boot(page, value);

  const result = await page.evaluate(async () => {
    const tomorrowRef = new Date();
    tomorrowRef.setDate(tomorrowRef.getDate() + 1);
    state.sophy.introDone = true;
    state.sophy.lastProactiveAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    state.transactions.push({
      id: 9902,
      kind: 'income',
      desc: 'Recebimento heartbeat',
      amount: 300,
      date: localCivilDate(tomorrowRef),
      category: 'Trabalho',
      accountId: 1,
      status: 'pending',
      dueDay: tomorrowRef.getDate(),
      balanceImpact: false,
      createdAt: Date.now()
    });
    await dbSet(state);
    lastSavedState = clone(state);
    const text = await sophyHeartbeatTick({ notify: false });
    return { text, tomorrow: localCivilDate(tomorrowRef) };
  });

  expect(result.text).toContain('Amanhã');
  expect(result.text).toContain('Recebimento heartbeat');
});
