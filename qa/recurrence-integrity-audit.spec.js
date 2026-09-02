const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value){
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && lastSavedState);
}

test('REC-AUD-01 materializar salário do mês usa dia útil canônico e identidade lógica', async ({ page }) => {
  const value=fixture('Recurrence month identity');
  value.baseDate='2026-01-01';
  value.mesAtual='2026-09';
  value.recurring=[{id:501,desc:'Salário',type:'income',amount:2500,day:1,category:'Trabalho',accountId:1,start:'2026-01',end:'',active:true,skips:[],dateRule:'business-day-before-anchor',payrollAnchor:1}];
  value.transactions=[];
  await boot(page,value);
  await page.evaluate(() => postRec(501));
  const tx=await page.evaluate(() => state.transactions.find(t=>t.recurringId===501));
  expect(tx.date).toBe('2026-08-31');
  expect(tx.recurrenceMonth).toBe('2026-09');
  expect(tx.occurrenceKey).toBe('501:2026-09');
  const virtuals=await page.evaluate(() => recurringOccurrences('2026-09'));
  expect(virtuals).toEqual([]);
});

test('REC-AUD-02 migra recorrência legada que cruza o mês sem recriar ocorrência virtual', async ({ page }) => {
  const value=fixture('Legacy recurring migration');
  value.mesAtual='2026-09';
  value.recurring=[{id:502,desc:'Salário',type:'income',amount:2000,day:1,category:'Trabalho',accountId:1,start:'2026-01',end:'',active:true,skips:[],dateRule:'business-day-before-anchor',payrollAnchor:1}];
  value.transactions=[{id:900,recurringId:502,kind:'income',desc:'Salário',amount:2000,date:'2026-08-31',category:'Trabalho',accountId:1,status:'paid',balanceImpact:true}];
  await boot(page,value);
  const result=await page.evaluate(() => ({tx:state.transactions[0],virtuals:recurringOccurrences('2026-09')}));
  expect(result.tx.recurrenceMonth).toBe('2026-09');
  expect(result.tx.occurrenceKey).toBe('502:2026-09');
  expect(result.virtuals).toEqual([]);
});

test('REC-AUD-03 resumo mensal respeita start end skips e pause', async ({ page }) => {
  const value=fixture('Recurring month projection');
  value.mesAtual='2026-09';
  value.recurring=[
    {id:1,desc:'Ativa',type:'expense',amount:100,day:10,category:'Casa',accountId:1,start:'2026-01',end:'',active:true,skips:[]},
    {id:2,desc:'Futura',type:'expense',amount:200,day:10,category:'Casa',accountId:1,start:'2026-10',end:'',active:true,skips:[]},
    {id:3,desc:'Encerrada',type:'expense',amount:300,day:10,category:'Casa',accountId:1,start:'2026-01',end:'2026-08',active:true,skips:[]},
    {id:4,desc:'Pulada',type:'expense',amount:400,day:10,category:'Casa',accountId:1,start:'2026-01',end:'',active:true,skips:['2026-09']},
    {id:5,desc:'Pausada',type:'expense',amount:500,day:10,category:'Casa',accountId:1,start:'2026-01',end:'',active:false,skips:[]},
    {id:6,desc:'Receita',type:'income',amount:50,day:10,category:'Trabalho',accountId:1,start:'2026-01',end:'',active:true,skips:[]}
  ];
  await boot(page,value);
  await page.evaluate(() => { setPage('recorrencias'); renderRecurring(); });
  await expect(page.locator('#recMonthlyTotal')).toContainText('50,00');
  const rules=await page.evaluate(() => recurringRulesForMonth('2026-09').map(r=>r.id));
  expect(rules).toEqual([1,6]);
});

test('REC-AUD-04 editar salário para despesa normal limpa regra payroll', async ({ page }) => {
  const value=fixture('Payroll edit reset');
  value.recurring=[{id:700,desc:'Salário',type:'income',amount:2000,day:1,category:'Trabalho',accountId:1,start:'2026-01',end:'',active:true,skips:[],dateRule:'business-day-before-anchor',payrollAnchor:1}];
  await boot(page,value);
  await page.evaluate(() => editRec(700));
  await page.locator('#recDesc').fill('Aluguel');
  await page.locator('#recType').selectOption('expense');
  await page.locator('#recDay').fill('10');
  await page.locator('#recAmount').fill('1000');
  await page.locator('#recForm').evaluate(form => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => state.recurring.find(r=>r.id===700)?.desc)).toBe('Aluguel');
  const rec=await page.evaluate(() => state.recurring.find(r=>r.id===700));
  expect(rec.type).toBe('expense');
  expect(rec.dateRule).toBeUndefined();
  expect(rec.payrollAnchor).toBeUndefined();
  const date=await page.evaluate(() => recurringDateForMonth(state.recurring.find(r=>r.id===700),'2026-09'));
  expect(date).toBe('2026-09-10');
});

test('REC-AUD-05 Sophy não zera despesas fixas e não duplica materialização no variável', async ({ page }) => {
  const value=fixture('Sophy recurring totals');
  value.mesAtual='2026-09';
  value.recurring=[
    {id:801,desc:'Aluguel',type:'expense',amount:1200,day:5,category:'Casa',accountId:1,start:'2026-01',end:'',active:true,skips:[]},
    {id:802,desc:'Netflix',type:'expense',amount:50,day:8,category:'Assinaturas',accountId:1,start:'2026-01',end:'',active:true,skips:[]},
    {id:803,desc:'Salário',type:'income',amount:3000,day:1,category:'Trabalho',accountId:1,start:'2026-01',end:'',active:true,skips:[]}
  ];
  value.transactions=[
    {id:901,recurringId:801,recurrenceMonth:'2026-09',occurrenceKey:'801:2026-09',kind:'expense',desc:'Aluguel',amount:1200,date:'2026-09-05',category:'Casa',accountId:1,status:'paid',balanceImpact:true},
    {id:902,kind:'expense',desc:'Compra avulsa',amount:300,date:'2026-09-10',category:'Casa',accountId:1,status:'paid',balanceImpact:true}
  ];
  await boot(page,value);
  const response=await page.evaluate(() => {
    const fn=typeof sophyDeterministicAnswer==='function'?sophyDeterministicAnswer:(typeof localSophyAnswer==='function'?localSophyAnswer:null);
    return fn?fn('despesas fixas e variáveis'):null;
  });
  expect(response).toBeTruthy();
  const text=typeof response==='string'?response:response.text;
  expect(text).toContain('R$ 1.250,00');
  expect(text).toContain('R$ 300,00');
});
