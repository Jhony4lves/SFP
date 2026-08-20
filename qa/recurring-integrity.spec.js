const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await writeIndexedDB(page, value); await page.reload(); await page.waitForFunction(()=>typeof state!=='undefined'&&state&&lastSavedState); }

test('REC-01/02 materializa exatamente uma vez e reload não recria projeção', async ({ page }) => {
  const value=fixture('Recorrências'); value.mesAtual='2026-02'; value.recurring=[{id:7,desc:'Aluguel',type:'expense',amount:300,day:5,category:'Casa',accountId:1,start:'2026-01',end:'',active:true,skips:[]}];
  await boot(page,value); await page.evaluate(() => postRec(7)); await page.evaluate(() => postRec(7));
  expect(await page.evaluate(() => ({real:state.transactions.filter(t=>t.recurringId===7).length,virtual:recurringOccurrences().length,balance:accountBalance(1)}))).toEqual({real:1,virtual:0,balance:700});
  await page.reload(); await page.waitForFunction(()=>state&&lastSavedState); expect(await page.evaluate(() => recurringOccurrences().length)).toBe(0);
});

test('REC-03/04 histórico é imutável; skip e limites afetam somente a projeção elegível', async ({ page }) => {
  const value=fixture('Histórico'); value.mesAtual='2026-08'; value.recurring=[{id:8,desc:'Plano',type:'expense',amount:100,day:31,category:'Casa',accountId:1,start:'2026-08',end:'2026-09',active:true,skips:[]}];
  await boot(page,value); await page.evaluate(() => postRec(8)); await page.evaluate(() => { const r=state.recurring[0]; r.amount=250;r.day=1;r.accountId=999;r.category='Outro';state.mesAtual='2026-09'; });
  expect(await page.evaluate(() => state.transactions[0])).toMatchObject({amount:100,date:'2026-08-31',accountId:1,category:'Casa'});
  await page.evaluate(() => skipRec(8)); expect(await page.evaluate(() => recurringOccurrences('2026-09').length)).toBe(0);
  await page.evaluate(() => { state.mesAtual='2026-10'; }); await page.evaluate(() => postRec(8)); expect(await page.evaluate(() => state.transactions.length)).toBe(1);
});

test('REC-PERSIST falha de gravação restaura estado e permite retry seguro', async ({ page }) => {
  const value=fixture('Atomicidade'); value.mesAtual='2026-02'; value.recurring=[{id:9,desc:'Mensal',type:'expense',amount:40,day:2,category:'Casa',accountId:1,start:'2026-02',end:'',active:true,skips:[]}]; await boot(page,value);
  expect(await page.evaluate(async()=>{const original=dbSet;dbSet=async()=>{throw Error('falha QA')};try{await postRec(9)}catch{}const after={count:state.transactions.length,balance:accountBalance(1)};dbSet=original;await postRec(9);return{after,final:state.transactions.length}})).toEqual({after:{count:0,balance:1000},final:1});
});
