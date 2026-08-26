const { test, expect } = require('@playwright/test');
const { fixture, monitor, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  await expect.poll(() => page.evaluate(() => state?.settings?.name)).toBe(value.settings.name);
}
async function importRows(page, rows, file = 'extrato.csv', configure = null) {
  return page.evaluate(async ({ rows, file, configure }) => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement(rows, file);
    if (configure) Function(configure)();
    const draft = statementDraft.map(({ key, duplicate, candidateId, action }) => ({ key, duplicate, candidateId, action }));
    await importStatement();
    return draft;
  }, { rows, file, configure });
}

test('mesmo CSV sem FITID é idempotente e linhas idênticas legítimas mantêm ocorrências', async ({ page }) => {
  const errors = monitor(page); await boot(page, fixture('CSV íntegro'));
  const rows = [
    { date: '2026-02-05', desc: 'Tarifa repetida', amount: -10, fitid: null },
    { date: '2026-02-05', desc: 'Tarifa repetida', amount: -10, fitid: null }
  ];
  const first = await importRows(page, rows);
  expect(first.map(x => x.duplicate)).toEqual([false, false]);
  expect(first[0].key).not.toBe(first[1].key);
  expect(await page.evaluate(() => state.transactions.length)).toBe(2);
  const second = await importRows(page, rows);
  expect(second.map(x => x.duplicate)).toEqual([true, true]);
  expect(await page.evaluate(() => ({ count: state.transactions.length, balance: accountBalance(1), statements: state.statements.length }))).toEqual({ count: 2, balance: 980, statements: 1 });
  expect(errors).toEqual([]);
});

test('OFX preserva FITID, impede reimportação e aceita movimentos sem FITID por chave determinística', async ({ page }) => {
  await boot(page, fixture('OFX íntegro'));
  const parsed = await page.evaluate(() => parseOFX('<OFX><STMTTRN><DTPOSTED>20260205<TRNAMT>-25.00<FITID>BANK-77<MEMO>Compra</STMTTRN><STMTTRN><DTPOSTED>20260206<TRNAMT>-12.00<MEMO>Sem id</STMTTRN></OFX>'));
  expect(parsed.map(x => x.fitid)).toEqual(['BANK-77', '']);
  await importRows(page, parsed, 'conta.ofx');
  await importRows(page, parsed, 'conta.ofx');
  expect(await page.evaluate(() => state.transactions.map(t => t.statementKey))).toEqual(expect.arrayContaining(['1|fit:BANK-77']));
  expect(await page.evaluate(() => state.transactions.length)).toBe(2);
});

test('reserva cada candidato uma vez e não reutiliza lançamento já conciliado', async ({ page }) => {
  const value = fixture('Candidatos únicos');
  value.transactions = [{ id: 10, kind: 'expense', desc: 'Condomínio', amount: 100, date: '2026-02-05', accountId: 1, status: 'pending', balanceImpact: false }];
  await boot(page, value);
  const draft = await importRows(page, [
    { date: '2026-02-05', desc: 'Condomínio', amount: -100, fitid: 'A' },
    { date: '2026-02-05', desc: 'Condomínio', amount: -100, fitid: 'B' }
  ]);
  expect(draft.filter(x => x.candidateId === 10)).toHaveLength(1);
  expect(await page.evaluate(() => ({ count: state.transactions.length, linked: state.transactions.filter(t => t.statementKey).length, balance: accountBalance(1) }))).toEqual({ count: 2, linked: 2, balance: 800 });
  await importRows(page, [{ date: '2026-02-05', desc: 'Condomínio', amount: -100, fitid: 'C' }]);
  expect(await page.evaluate(() => state.transactions.length)).toBe(3);
});

test('pagamento de fatura é consumido uma vez e não vira despesa comum após reload', async ({ page }) => {
  const value = fixture('Fatura única'); value.mesAtual = '2026-02';
  value.invoices = [{ id: 20, cardId: 1, month: '2026-01', paidAmount: 100, accountId: 1, payments: [{ date: '2026-02-10', amount: 100, balanceImpact: true }] }];
  await boot(page, value);
  await importRows(page, [{ date: '2026-02-10', desc: 'PAGAMENTO FATURA CARTAO', amount: -100, fitid: 'PAY-1' }], 'bank.ofx');
  await page.reload();
  await page.waitForFunction(() =>
    typeof state !== 'undefined' &&
    state &&
    typeof lastSavedState !== 'undefined' &&
    lastSavedState
  );
  expect(await page.evaluate(() => ({ tx: state.transactions.length, key: state.invoices[0].payments[0].statementKey, expense: cashView('2026-02').expense }))).toEqual({ tx: 0, key: '1|fit:PAY-1', expense: 100 });
  await importRows(page, [{ date: '2026-02-10', desc: 'PAGAMENTO FATURA CARTAO', amount: -100, fitid: 'PAY-1' }], 'bank.ofx');
  expect(await page.evaluate(() => state.transactions.length)).toBe(0);
});

test('transferência usa a linha uma vez sem criar receita ou despesa', async ({ page }) => {
  const value = fixture('Transferência única'); value.accounts.push({ id: 2, name: 'Reserva', type: 'Reserva', initial: 0, balanceMode: 'snapshot', balanceDate: '2026-01-01' });
  await boot(page, value);
  const configure = `statementDraft[0].action='transfer';statementDraft[0].transferAccountId=2`;
  await importRows(page, [{ date: '2026-02-08', desc: 'TED ENTRE CONTAS', amount: -200, fitid: 'TED-1' }], 'ted.ofx', configure);
  await importRows(page, [{ date: '2026-02-08', desc: 'TED ENTRE CONTAS', amount: -200, fitid: 'TED-1' }], 'ted.ofx', configure);
  expect(await page.evaluate(() => ({ transfers: state.transfers.length, tx: state.transactions.length, a: accountBalance(1), b: accountBalance(2), income: cashView('2026-02').income, expense: cashView('2026-02').expense }))).toEqual({ transfers: 1, tx: 0, a: 800, b: 200, income: 0, expense: 0 });
});

test('recorrência materializada é conciliada sem segunda ocorrência', async ({ page }) => {
  const value = fixture('Recorrência única'); value.mesAtual = '2026-02';
  value.recurring = [{ id: 30, desc: 'Academia mensal', type: 'expense', amount: 80, day: 5, category: 'Saúde', accountId: 1, start: '2026-01', end: '', active: true, skips: [] }];
  value.transactions = [{ id: 31, recurringId: 30, kind: 'expense', desc: 'Academia mensal', amount: 80, date: '2026-02-05', category: 'Saúde', accountId: 1, status: 'pending', balanceImpact: false }];
  await boot(page, value);
  await importRows(page, [{ date: '2026-02-05', desc: 'Academia mensal', amount: -80, fitid: 'REC-1' }], 'rec.ofx');
  expect(await page.evaluate(() => ({ count: state.transactions.filter(t => t.recurringId === 30).length, virtual: recurringOccurrences('2026-02').length, balance: accountBalance(1) }))).toEqual({ count: 1, virtual: 0, balance: 920 });
});

test('falha de persistência restaura todo o estado sem mutação parcial', async ({ page }) => {
  await boot(page, fixture('Importação atômica'));
  const result = await page.evaluate(async () => {
    document.querySelector('#stmtAccount').value = '1';
    prepareStatement([{ date: '2026-02-05', desc: 'Primeira', amount: -10, fitid: 'FAIL-1' }, { date: '2026-02-06', desc: 'Segunda', amount: -20, fitid: 'FAIL-2' }], 'falha.ofx');
    const original = dbSet; dbSet = async () => { throw Error('falha simulada'); };
    await importStatement(); dbSet = original;
    return { transactions: state.transactions.length, statements: state.statements.length, draft: statementDraft.length };
  });
  expect(result).toEqual({ transactions: 0, statements: 0, draft: 2 });
});

test('prévia de fatura não persiste e confirma compras parceladas distintas com mesma descrição e total', async ({ page }) => {
  await boot(page, fixture('Prévia de fatura'));
  const preview = await page.evaluate(() => {
    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-03';
    prepareCardImport(parseCardCsv('Data;Descrição;Valor\n05/03/2026;Curso - Parcela 1/2;50,00\n06/03/2026;Curso - Parcela 2/2;50,00'), 'fatura.csv');
    return { purchasesBefore: state.purchases.length, visible: !document.querySelector('#cardImportReview').classList.contains('hidden'), ready: cardImportDraft.rows.filter(r => !r.duplicate).length };
  });
  expect(preview).toEqual({ purchasesBefore: 0, visible: true, ready: 2 });
  await page.evaluate(() => confirmCardImport());
  expect(await page.evaluate(() => state.purchases.map(p => ({ desc: p.desc, firstMonth: p.firstMonth, purchaseDate: p.purchaseDate, total: p.total })))).toEqual([
    { desc: 'Curso', firstMonth: '2026-03', purchaseDate: '2026-03-05', total: 100 },
    { desc: 'Curso', firstMonth: '2026-02', purchaseDate: '2026-03-06', total: 100 }
  ]);
});


test('pagamento manual sem descrição é deduplicado por data e valor sem bloquear descrições distintas completas', async ({ page }) => {
  const value = fixture('Pagamento manual legado');
  value.invoices = [{
    id: 20,
    cardId: 1,
    month: '2026-02',
    paidAmount: 100,
    accountId: 1,
    payments: [{ date: '2026-03-06', amount: 100, balanceImpact: true }],
    status: 'partial'
  }];
  await boot(page, value);
  const result = await page.evaluate(async () => {
    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-03';
    prepareCardImport(parseCardCsv('Data;Descrição;Valor\n06/03/2026;Pagamento legado;-100,00'), 'fatura.csv');
    const preview = {
      visible: !document.querySelector('#cardImportReview').classList.contains('hidden'),
      duplicates: cardImportDraft.rows.map(r => r.duplicate),
      paidBefore: state.invoices[0].paidAmount,
      paymentsBefore: state.invoices[0].payments.length
    };
    await confirmCardImport();
    const afterLegacy = { paid: state.invoices[0].paidAmount, payments: state.invoices[0].payments.length };
    state.invoices[0].payments.push({ date: '2026-03-07', amount: 50, balanceImpact: true, targetMonth: '2026-02', sourceDesc: 'Pagamento A' });
    state.invoices[0].paidAmount += 50;
    prepareCardImport(parseCardCsv('Data;Descrição;Valor\n07/03/2026;Pagamento B;-50,00'), 'fatura.csv');
    const distinctPreview = cardImportDraft.rows.map(r => r.duplicate);
    await confirmCardImport();
    return {
      preview,
      afterLegacy,
      distinctPreview,
      final: { paid: state.invoices[0].paidAmount, payments: state.invoices[0].payments.map(p => p.sourceDesc || '') }
    };
  });
  expect(result).toEqual({
    preview: { visible: true, duplicates: [true], paidBefore: 100, paymentsBefore: 1 },
    afterLegacy: { paid: 100, payments: 1 },
    distinctPreview: [false],
    final: { paid: 200, payments: ['', 'Pagamento A', 'Pagamento B'] }
  });
});

test('reimportação da fatura detecta compra e pagamento pelo detalhe completo sem descartar pagamentos distintos', async ({ page }) => {
  await boot(page, fixture('Deduplicação de fatura'));
  const result = await page.evaluate(async () => {
    document.querySelector('#cardImportCard').value = '1';
    document.querySelector('#cardImportMonth').value = '2026-03';
    const csv = 'Data;Descrição;Valor\n05/03/2026;Loja - Parcela 1/2;50,00\n06/03/2026;Pagamento A;-50,00\n06/03/2026;Pagamento B;-50,00';
    prepareCardImport(parseCardCsv(csv), 'fatura.csv'); await confirmCardImport();
    prepareCardImport(parseCardCsv(csv), 'fatura.csv');
    return { duplicates: cardImportDraft.rows.map(r => r.duplicate), purchases: state.purchases.length, payments: state.invoices.find(i => i.month === '2026-02').payments.length };
  });
  expect(result).toEqual({ duplicates: [true, true, true], purchases: 1, payments: 2 });
});
