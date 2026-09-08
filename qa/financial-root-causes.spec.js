const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete, monitor } = require('./helpers');

async function boot(page, value) {
  const errors = monitor(page);
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  return errors;
}

async function importRows(page, accountId, rows, file, meta = null) {
  return page.evaluate(async ({ accountId, rows, file, meta }) => {
    document.querySelector('#stmtAccount').value = String(accountId);
    prepareStatement(rows, file, meta);
    const preview = statementDraft.map(r => ({ action: r.action }));
    await importStatement();
    return preview;
  }, { accountId, rows, file, meta });
}

test('#77 bloqueia extrato cujo saldo final não fecha com movimentos aceitos', async ({ page }) => {
  const value = fixture('Root #77 inconsistente');
  value.accounts[0] = { ...value.accounts[0], id:1, name:'Nubank', initial:1000, balanceMode:'snapshot', balanceDate:'2026-01-30' };
  value.transactions=[]; value.transfers=[]; value.transferEvidence=[]; value.statements=[];
  const errors = await boot(page, value);

  const result = await page.evaluate(async () => {
    const parsed=parseOFX(`<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260131000000<TRNAMT>-25.00<FITID>BUY-31<MEMO>Compra no debito</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>900.00<DTASOF>20260131000000</LEDGERBAL></OFX>`);
    document.querySelector('#stmtAccount').value='1';
    prepareStatement([...parsed],'inconsistente.ofx',parsed.statementMeta);
    const before={balance:accountBalance(1),initial:state.accounts[0].initial,balanceDate:state.accounts[0].balanceDate,transactions:state.transactions.length,statements:state.statements.length};
    await importStatement();
    const after={balance:accountBalance(1),initial:state.accounts[0].initial,balanceDate:state.accounts[0].balanceDate,transactions:state.transactions.length,statements:state.statements.length};
    return {before,after,toast:$('toast').textContent};
  });

  expect(result.after).toEqual(result.before);
  expect(result.toast).toContain('Extrato inconsistente');
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  expect(await page.evaluate(() => ({balance:accountBalance(1),transactions:state.transactions.length,statements:state.statements.length})))
    .toEqual({balance:1000,transactions:0,statements:0});
  expect(errors).toEqual([]);
});

test('#77 aceita e persiste fechamento explicado exatamente pelo extrato', async ({ page }) => {
  const value = fixture('Root #77 consistente');
  value.accounts[0] = { ...value.accounts[0], id:1, name:'Nubank', initial:1000, balanceMode:'snapshot', balanceDate:'2026-01-30' };
  value.transactions=[]; value.transfers=[]; value.transferEvidence=[]; value.statements=[];
  const errors = await boot(page, value);

  await page.evaluate(async () => {
    const parsed=parseOFX(`<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260131000000<TRNAMT>-25.00<FITID>BUY-31<MEMO>Compra no debito</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>975.00<DTASOF>20260131000000</LEDGERBAL></OFX>`);
    document.querySelector('#stmtAccount').value='1';
    prepareStatement([...parsed],'consistente.ofx',parsed.statementMeta);
    await importStatement();
  });
  expect(await page.evaluate(() => ({balance:accountBalance(1),initial:state.accounts[0].initial,balanceDate:state.accounts[0].balanceDate,transactions:state.transactions.length,statements:state.statements.length})))
    .toEqual({balance:975,initial:975,balanceDate:'2026-01-31',transactions:1,statements:1});
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  expect(await page.evaluate(() => accountBalance(1))).toBe(975);
  expect(errors).toEqual([]);
});

function transferFixture(name) {
  const value=fixture(name);
  value.accounts=[
    {id:1,name:'Conta A',type:'Conta corrente',initial:1000,balanceMode:'snapshot',balanceDate:'2026-02-05'},
    {id:2,name:'Conta B',type:'Conta corrente',initial:500,balanceMode:'snapshot',balanceDate:'2026-01-01'}
  ];
  value.transactions=[];value.transfers=[];value.transferEvidence=[];value.statements=[];
  return value;
}

async function transferState(page){
  return page.evaluate(() => ({
    a:accountBalance(1),b:accountBalance(2),total:allAccountBalance(),
    evidence:state.transferEvidence.length,transfers:state.transfers.length,
    impactByAccount:state.transfers[0]?.balanceImpactByAccount||null,
    matchedBy:state.transfers[0]?.matchedBy||null
  }));
}

test('#178 pareia transferência com snapshots assimétricos e preserva impacto por conta', async ({ page }) => {
  const value=transferFixture('Root #178 A-B');
  const errors=await boot(page,value);
  expect(await importRows(page,1,[{date:'2026-02-02',desc:'PIX ENVIADO ENTRE CONTAS',amount:-100,fitid:'A-100'}],'a.ofx')).toEqual([{action:'pending_transfer'}]);
  expect(await importRows(page,2,[{date:'2026-02-02',desc:'PIX RECEBIDO ENTRE CONTAS',amount:100,fitid:'B-100'}],'b.ofx')).toEqual([{action:'transfer_match'}]);
  expect(await transferState(page)).toEqual({a:1000,b:600,total:1600,evidence:0,transfers:1,impactByAccount:{1:false,2:true},matchedBy:'statement-cross-account'});
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  expect(await transferState(page)).toEqual({a:1000,b:600,total:1600,evidence:0,transfers:1,impactByAccount:{1:false,2:true},matchedBy:'statement-cross-account'});
  expect(errors).toEqual([]);
});

test('#178 ordem inversa produz o mesmo saldo final', async ({ page }) => {
  const value=transferFixture('Root #178 B-A');
  const errors=await boot(page,value);
  expect(await importRows(page,2,[{date:'2026-02-02',desc:'PIX RECEBIDO ENTRE CONTAS',amount:100,fitid:'B-100'}],'b.ofx')).toEqual([{action:'pending_transfer'}]);
  expect(await importRows(page,1,[{date:'2026-02-02',desc:'PIX ENVIADO ENTRE CONTAS',amount:-100,fitid:'A-100'}],'a.ofx')).toEqual([{action:'transfer_match'}]);
  expect(await transferState(page)).toEqual({a:1000,b:600,total:1600,evidence:0,transfers:1,impactByAccount:{1:false,2:true},matchedBy:'statement-cross-account'});
  expect(errors).toEqual([]);
});

test('#181 histórico explícito preserva identidade da parcela paga fora de ordem', async ({ page }) => {
  const value=fixture('Root #181 explícito');
  value.debts=[{id:50,name:'Empréstimo',balance:200,rate:0,payment:100,installments:3,paidInstallments:1,firstDue:'2026-01-10',dueDay:10,accountId:1,paymentMethod:'bank',amortizationMethod:'manual',history:[{type:'payment',installment:3,amount:100,date:'2026-03-10'}]}];
  const errors=await boot(page,value);
  const statuses=await page.evaluate(() => Object.fromEntries(['2026-01','2026-02','2026-03'].map(m=>[m,debtDueForMonth(m).find(x=>x.debt.id===50)?.status])));
  expect(statuses).toEqual({'2026-01':'planned','2026-02':'planned','2026-03':'paid'});
  await page.reload();
  await expectBootComplete(page, expect, value.settings.name);
  expect(await page.evaluate(() => debtDueForMonth('2026-03')[0].status)).toBe('paid');
  expect(errors).toEqual([]);
});

test('#181 paidInstallments continua compatível com pagamentos legados sem número', async ({ page }) => {
  const value=fixture('Root #181 legado');
  value.debts=[{id:50,name:'Empréstimo',balance:100,rate:0,payment:100,installments:3,paidInstallments:2,firstDue:'2026-01-10',dueDay:10,accountId:1,paymentMethod:'bank',amortizationMethod:'manual',history:[{type:'payment',amount:100,date:'2026-01-10'},{type:'payment',amount:100,date:'2026-02-10'}]}];
  const errors=await boot(page,value);
  expect(await page.evaluate(() => Object.fromEntries(['2026-01','2026-02','2026-03'].map(m=>[m,debtDueForMonth(m).find(x=>x.debt.id===50)?.status]))))
    .toEqual({'2026-01':'paid','2026-02':'paid','2026-03':'planned'});
  expect(errors).toEqual([]);
});

test('#163 realized usa caixa e não competência', async ({ page }) => {
  const value=fixture('Root #163');
  value.mesAtual='2026-02';
  value.transactions=[
    {id:1,accountId:1,kind:'income',amount:500,date:'2026-02-01',status:'paid',balanceImpact:true,desc:'Receita',category:'Trabalho'},
    {id:2,accountId:1,kind:'expense',amount:70,date:'2026-02-10',status:'pending',balanceImpact:false,desc:'Pendente',category:'Casa'}
  ];
  const errors=await boot(page,value);
  const result=await page.evaluate(() => ({cash:cashView('2026-02'),accrual:accrualView('2026-02'),realized:financialContextSnapshot({reference:new Date(2026,1,15,12),months:1}).realized}));
  expect(result.cash).toMatchObject({income:500,expense:0});
  expect(result.accrual).toMatchObject({income:500,expense:70});
  expect(result.realized).toEqual({incomeCents:50000,expenseCents:0,resultCents:50000});
  expect(errors).toEqual([]);
});

test('#164 só conta poupança efetivamente realizada da conta operacional para protegida', async ({ page }) => {
  const value=fixture('Root #164');
  value.mesAtual='2099-01';
  value.accounts=[
    {id:1,name:'Conta',type:'Conta corrente',initial:1000,balanceMode:'snapshot',balanceDate:'2098-12-31'},
    {id:2,name:'Reserva',type:'Reserva',initial:0,balanceMode:'snapshot',balanceDate:'2098-12-31'},
    {id:3,name:'Investimento',type:'Investimento',initial:0,balanceMode:'snapshot',balanceDate:'2098-12-31'}
  ];
  value.transfers=[{id:1,amount:500,date:'2099-01-20',fromId:1,toId:2,balanceImpact:false}];
  const errors=await boot(page,value);
  expect(await page.evaluate(() => actualSavings('2099-01'))).toBe(0);

  await page.evaluate(() => {
    state.mesAtual='2000-01';
    state.transfers=[
      {id:11,amount:100,date:'2000-01-10',fromId:1,toId:2,balanceImpact:true},
      {id:12,amount:100,date:'2000-01-11',fromId:2,toId:3,balanceImpact:true}
    ];
  });
  expect(await page.evaluate(() => actualSavings('2000-01'))).toBe(100);
  expect(errors).toEqual([]);
});
