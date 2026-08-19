const { test, expect } = require('@playwright/test');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

test('bootstrap renderiza por completo, sem erros, e navega sem duplicar o menu', async ({ page }) => {
  const errors = monitor(page);
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  const navCount = await page.locator('.sidebar .nav').count();
  await page.locator('.nav button[data-page="lancamentos"]').click();
  await expect(page.locator('#txForm')).toBeVisible();
  await page.locator('.nav button[data-page="dashboard"]').click();
  await page.locator('.nav button[data-page="lancamentos"]').click();
  expect(await page.locator('.sidebar .nav').count()).toBe(navCount);
  expect(navCount).toBe(1);
  expect(errors).toEqual([]);
});

test('IndexedDB válida prevalece sem qualquer localStorage e restaura o DOM após reload', async ({ page }) => {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  const saved = fixture('IndexedDB QA');
  await writeIndexedDB(page, saved);
  await page.evaluate(() => localStorage.clear());
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, saved.settings.name);
  expect(errors).toEqual([]);
});

for (const marker of [false, true]) {
  test(`fallback válido com IndexedDB indisponível ${marker ? 'com' : 'sem'} marcador não é substituído`, async ({ page }) => {
    await page.goto('/index.html');
    await expectBootComplete(page, expect, 'Fixture QA');
    const saved = fixture(`Fallback ${marker}`);
    await page.evaluate(({ saved, marker }) => {
      localStorage.clear();
      localStorage.setItem('sfp_final_fallback', JSON.stringify(saved));
      if (marker) localStorage.setItem('sfp_jhony_stable_seed_202', '1');
    }, { saved, marker });
    await page.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true }));
    const errors = monitor(page);
    await page.reload();
    await expectBootComplete(page, expect, saved.settings.name);
    const fallback = await page.evaluate(() => JSON.parse(localStorage.getItem('sfp_final_fallback')));
    expect(fallback).toEqual(saved);
    expect(errors).toEqual([]);
  });
}

test('IndexedDB vazia promove fallback válido sem usar seed', async ({ page }) => {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  const saved = fixture('Fallback promovido');
  await writeIndexedDB(page, undefined);
  await page.evaluate(saved => { localStorage.clear(); localStorage.setItem('sfp_final_fallback', JSON.stringify(saved)); }, saved);
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, saved.settings.name);
  const primary = await page.evaluate(async () => (await dbGet()).value.settings.name);
  expect(primary).toBe(saved.settings.name);
  expect(errors).toEqual([]);
});

test('fontes comprovadamente vazias usam seed', async ({ page }) => {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, undefined);
  await page.evaluate(() => localStorage.clear());
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, 'SFP Jhony');
  expect(errors).toEqual([]);
});

test('fallback corrompido não é sobrescrito por seed', async ({ page }) => {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, undefined);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('sfp_final_fallback', '{corrompido'); });
  const errors = monitor(page);
  await page.reload();
  await expect.poll(() => errors.some(error => error.includes('Persistência indisponível ou corrompida'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('sfp_final_fallback'))).toBe('{corrompido');
  expect(await page.evaluate(() => typeof state === 'object' && state !== null)).toBe(false);
});

test('IndexedDB corrompida usa fallback válido sem alterar nenhuma fonte', async ({ page }) => {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  const saved = fixture('Fallback após corrupção');
  await writeIndexedDB(page, 'não é um estado');
  await page.evaluate(saved => { localStorage.clear(); localStorage.setItem('sfp_final_fallback', JSON.stringify(saved)); }, saved);
  const errors = monitor(page);
  await page.reload();
  await expectBootComplete(page, expect, saved.settings.name);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sfp_final_fallback')))).toEqual(saved);
  expect((await page.evaluate(async () => dbGet())).status).toBe('corrupt');
  expect(errors).toEqual([]);
});

test('IndexedDB indisponível sem fallback interrompe bootstrap sem criar seed', async ({ page }) => {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await page.evaluate(() => localStorage.clear());
  await page.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true }));
  const errors = monitor(page);
  await page.reload();
  await expect.poll(() => errors.some(error => error.includes('Persistência indisponível ou corrompida'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('sfp_final_fallback'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('sfp_jhony_stable_seed_202'))).toBeNull();
});
