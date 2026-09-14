const { test, expect } = require('@playwright/test');
const fs = require('fs');
const vm = require('vm');

// Run the production resolver with bank payloads, without UI or a network connection.
function resolver({ transactions = [], bills = [], partial = false, stored = {} } = {}) {
  const card = { id: 1, name: 'Nubank', closeDay: 9, dueDay: 16, openFinanceBankBills: stored };
  const account = { type: 'CREDIT', transactions, bills, transactionPreviewHasMore: partial,
    creditData: { balanceDueDate: '2026-09-16', balanceCloseDate: '2026-09-09' } };
  const context = {
    state: { cards: [card], invoices: [], baseDate: '2026-09-14', mesAtual: '2026-09' },
    document: { querySelectorAll: () => [], getElementById: () => null },
    SFPOpenFinanceBills: { getLastPreview: () => ({ ok: true, items: [{ accounts: [account] }] }) },
    SFPOpenFinancePersonal: { suggestSfpEntity: () => ({ entity: card }) },
    invoiceCalculated: () => 241.49, invoiceStatus: () => ({}),
    renderCards() {}, openCardDetail() {}, setInterval() {}, clearInterval() {}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('app/src/main/assets/www/open-finance-bank-truth-v2.js', 'utf8'), context);
  return { api: context.SFPOpenFinanceBankTruth, card, account };
}

const payment = { id: 'pending-pay', billId: 'nu-sep', date: '2026-09-09',
  amount: -70.65, description: 'Pagamento antecipado', type: 'CREDIT', status: 'PENDING' };

test('pagamento PENDING com billId sozinho preserva R$ 241,49 e não cria cache zero', () => {
  const { api, card } = resolver({ transactions: [payment] });
  expect(api.linkedBillFromAccount(card, '2026-09')).toBeNull();
  expect(api.bankTruth(card, '2026-09')).toBeNull();
  expect(api.displayTotal(card, '2026-09')).toBe(241.49);
  expect(card.openFinanceBankBills['2026-09']).toBeUndefined();
});

test('pagamento PENDING não reduz compras vinculadas de R$ 241,49 para R$ 170,84', () => {
  const { api, card } = resolver({ transactions: [payment, { ...payment, id: 'purchase',
    description: 'Compra', amount: 241.49, type: 'DEBIT', status: 'POSTED' }] });
  const truth = api.bankTruth(card, '2026-09');
  expect(truth.amount).toBe(241.49);
  expect(truth.paymentsExcluded).toBe(70.65);
  expect(truth.transactionCount).toBe(1);
});

test('Bill oficial confirma R$ 170,84 apesar do pagamento pendente', () => {
  const { api, card } = resolver({ transactions: [payment], bills: [{ id: 'nu-sep',
    dueDate: '2026-09-16', billClosingDate: '2026-09-09', totalAmount: 170.84 }] });
  expect(api.bankTruth(card, '2026-09')).toMatchObject({ amount: 170.84, official: true });
});

test('cache oficial sobrevive sincronização parcial e transações sem Bill', () => {
  const stored = { '2026-09': { schema: 4, amount: 170.84, official: true,
    source: 'open-finance-bill', dueDate: '2026-09-16', closeDate: '2026-09-09' } };
  const { api, card, account } = resolver({ partial: true, stored, transactions: [payment] });
  expect(api.displayTotal(card, '2026-09')).toBe(170.84);
  account.transactionPreviewHasMore = false;
  account.transactions.push({ ...payment, description: 'Compra', amount: 10, status: 'POSTED' });
  api.rememberBankTruth();
  expect(api.displayTotal(card, '2026-09')).toBe(170.84);
  expect(card.openFinanceBankBills['2026-09'].amount).toBe(170.84);
});

test('Bill que fecha em setembro e vence em outubro pertence apenas a outubro', () => {
  const { api, card } = resolver({ bills: [{ id: 'nu-oct', dueDate: '2026-10-02',
    billClosingDate: '2026-09-25', totalAmount: 170.84 }] });
  expect(api.bankTruth(card, '2026-09')).toBeNull();
  expect(api.bankTruth(card, '2026-10')).toMatchObject({ amount: 170.84, official: true });
});

test('Bill sem total não transforma ausência de dados em fatura oficial zero', () => {
  const { api, card } = resolver({ bills: [{ id: 'nu-sep', dueDate: '2026-09-16', totalAmount: null }] });
  expect(api.bankTruth(card, '2026-09')).toBeNull();
  expect(api.displayTotal(card, '2026-09')).toBe(241.49);
});

test('cache legado composto só por pagamento não perpetua fatura zero após atualização', () => {
  const { api, card } = resolver({ transactions: [payment], stored: { '2026-09': {
    schema: 4, source: 'open-finance-linked-transactions', official: false,
    amount: 0, transactionCount: 1, pendingCount: 1,
    debitAmount: 0, creditAmount: 0, paymentsExcluded: 70.65
  } } });
  expect(api.bankTruth(card, '2026-09')).toBeNull();
  expect(api.displayTotal(card, '2026-09')).toBe(241.49);
});
