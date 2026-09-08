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

async function reload(page, name) {
  await page.reload();
  await expectBootComplete(page, expect, name);
}

async function importRows(page, accountId, rows, file) {
  return page.evaluate(async ({ accountId, rows, file }) => {
    document.querySelector('#stmtAccount').value = String(accountId);
    prepareStatement(rows, file);
    const preview = statementDraft.map(r => ({ action: r.action }));
    await importStatement();
    return preview;
  }, { accountId, rows, file });
}

async function transferState(page) {
  return page.evaluate(() => ({
    a: accountBalance(1),
    b: accountBalance(2),
    total: allAccountBalance(),
    evidence: state.transferEvidence.length,
    transfers: state.transfers.length,
    impactByAccount: state.transfers[0]?.balanceImpactByAccount || null,
    matchedBy: state.transfers[0]?.matchedBy || null
  }));
}

test('#178 ordem inversa permanece idêntica após reload', async ({ page }) => {
  const value = fixture('Reload #178 B-A');
  value.accounts = [
    { id:1, name:'Conta A', type:'Conta corrente', initial:1000, balanceMode:'snapshot', balanceDate:'2026-02-05' },
    { id:2, name:'Conta B', type:'Conta corrente', initial:500, balanceMode:'snapshot', balanceDate:'2026-01-01' }
  ];
  value.transactions = [];
  value.transfers = [];
  value.transferEvidence = [];
  value.statements = [];
  const errors = await boot(page, value);

  expect(await importRows(page, 2, [{ date:'2026-02-02', desc:'PIX RECEBIDO ENTRE CONTAS', amount:100, fitid:'B-100' }], 'b.ofx'))
    .toEqual([{ action:'pending_transfer' }]);
  expect(await importRows(page, 1, [{ date:'2026-02-02', desc:'PIX ENVIADO ENTRE CONTAS', amount:-100, fitid:'A-100' }], 'a.ofx'))
    .toEqual([{ action:'transfer_match' }]);

  const expected = { a:1000, b:600, total:1600, evidence:0, transfers:1, impactByAccount:{1:false,2:true}, matchedBy:'statement-cross-account' };
  expect(await transferState(page)).toEqual(expected);
  await reload(page, value.settings.name);
  expect(await transferState(page)).toEqual(expected);
  expect(errors).toEqual([]);
});

test('#181 compatibilidade legada permanece correta após reload', async ({ page }) => {
  const value = fixture('Reload #181 legado');
  value.debts = [{
    id:50,
    name:'Empréstimo',
    balance:100,
    rate:0,
    payment:100,
    installments:3,
    paidInstallments:2,
    firstDue:'2026-01-10',
    dueDay:10,
    accountId:1,
    paymentMethod:'bank',
    amortizationMethod:'manual',
    history:[
      { type:'payment', amount:100, date:'2026-01-10' },
      { type:'payment', amount:100, date:'2026-02-10' }
    ]
  }];
  const errors = await boot(page, value);

  const read = () => page.evaluate(() => Object.fromEntries(
    ['2026-01','2026-02','2026-03'].map(m => [m, debtDueForMonth(m).find(x => x.debt.id === 50)?.status])
  ));
  const expected = { '2026-01':'paid', '2026-02':'paid', '2026-03':'planned' };
  expect(await read()).toEqual(expected);
  await reload(page, value.settings.name);
  expect(await read()).toEqual(expected);
  expect(errors).toEqual([]);
});

test('#163 realizado continua caixa após reload do IndexedDB', async ({ page }) => {
  const value = fixture('Reload #163');
  value.mesAtual = '2026-02';
  value.transactions = [
    { id:1, accountId:1, kind:'income', amount:500, date:'2026-02-01', status:'paid', balanceImpact:true, desc:'Receita', category:'Trabalho' },
    { id:2, accountId:1, kind:'expense', amount:70, date:'2026-02-10', status:'pending', balanceImpact:false, desc:'Pendente', category:'Casa' }
  ];
  const errors = await boot(page, value);

  const read = () => page.evaluate(() => ({
    cash: cashView('2026-02'),
    accrual: accrualView('2026-02'),
    realized: financialContextSnapshot({ reference:new Date(2026,1,15,12), months:1 }).realized
  }));
  const assert = result => {
    expect(result.cash).toMatchObject({ income:500, expense:0 });
    expect(result.accrual).toMatchObject({ income:500, expense:70 });
    expect(result.realized).toEqual({ incomeCents:50000, expenseCents:0, resultCents:50000 });
  };

  assert(await read());
  await reload(page, value.settings.name);
  assert(await read());
  expect(errors).toEqual([]);
});

test('#164 poupança realizada não muda após reload', async ({ page }) => {
  const future = fixture('Reload #164 futura');
  future.mesAtual = '2099-01';
  future.accounts = [
    { id:1, name:'Conta', type:'Conta corrente', initial:1000, balanceMode:'snapshot', balanceDate:'2098-12-31' },
    { id:2, name:'Reserva', type:'Reserva', initial:0, balanceMode:'snapshot', balanceDate:'2098-12-31' },
    { id:3, name:'Investimento', type:'Investimento', initial:0, balanceMode:'snapshot', balanceDate:'2098-12-31' }
  ];
  future.transfers = [{ id:1, amount:500, date:'2099-01-20', fromId:1, toId:2, balanceImpact:false }];
  let errors = await boot(page, future);
  expect(await page.evaluate(() => actualSavings('2099-01'))).toBe(0);
  await reload(page, future.settings.name);
  expect(await page.evaluate(() => actualSavings('2099-01'))).toBe(0);
  expect(errors).toEqual([]);

  const realized = fixture('Reload #164 realizada');
  realized.mesAtual = '2000-01';
  realized.accounts = [
    { id:1, name:'Conta', type:'Conta corrente', initial:1000, balanceMode:'snapshot', balanceDate:'1999-12-31' },
    { id:2, name:'Reserva', type:'Reserva', initial:0, balanceMode:'snapshot', balanceDate:'1999-12-31' },
    { id:3, name:'Investimento', type:'Investimento', initial:0, balanceMode:'snapshot', balanceDate:'1999-12-31' }
  ];
  realized.transfers = [
    { id:11, amount:100, date:'2000-01-10', fromId:1, toId:2, balanceImpact:true },
    { id:12, amount:100, date:'2000-01-11', fromId:2, toId:3, balanceImpact:true }
  ];
  errors = await boot(page, realized);
  expect(await page.evaluate(() => actualSavings('2000-01'))).toBe(100);
  await reload(page, realized.settings.name);
  expect(await page.evaluate(() => actualSavings('2000-01'))).toBe(100);
  expect(errors).toEqual([]);
});
