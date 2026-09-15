const { test, expect } = require('@playwright/test');
const fs = require('fs');
const vm = require('vm');

// Run the production resolver with bank payloads, without UI or a network connection.
function resolver({ transactions = [], bills = [], partial = false, stored = {}, realMapping = false } = {}) {
  const card = { id: 1, name: 'Nubank', closeDay: 9, dueDay: 16, openFinanceBankBills: stored };
  const account = { type: 'CREDIT', transactions, bills, transactionPreviewHasMore: partial,
    creditData: { balanceDueDate: '2026-09-16', balanceCloseDate: '2026-09-09' } };
  const item={connectorName:'MeuPluggy',accounts:realMapping?[{type:'BANK',name:'Nubank'},account]:[account]};
  const context = {
    state: { cards: [card], invoices: [], baseDate: '2026-09-14', mesAtual: '2026-09' },
    document: { querySelectorAll: () => [], getElementById: () => null },
    SFPOpenFinanceBills: { getLastPreview: () => ({ ok: true, items: [item] }) },
    SFPOpenFinancePersonal: { suggestSfpEntity: () => ({ entity: card }) },
    invoiceCalculated: () => 241.49, invoiceStatus: () => ({}),
    renderCards() {}, openCardDetail() {}, setInterval() {}, clearInterval() {}
  };
  vm.createContext(context);
  if(realMapping)vm.runInContext(fs.readFileSync('app/src/main/assets/www/open-finance-personal.js','utf8'),context);
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

test('mês previsto pelo banco inclui compra fora do corte local e exclui a próxima fatura', () => {
  const { api, card } = resolver({ transactions: [
    { date: '2026-09-11', amount: 100, status: 'PENDING', billForecastDate: '2026-09' },
    { date: '2026-09-09', amount: 43.48, status: 'PENDING', billForecastDate: '2026-10' }
  ] });
  expect(api.displayTotal(card, '2026-09')).toBe(100);
  expect(api.displayTotal(card, '2026-10')).toBe(43.48);
});

test('crédito de compra é diferente de pagamento: R$ 252,48 menos R$ 81,64 resulta em estimativa de R$ 170,84', () => {
  // Aggregate amounts from the September diagnostic; forecast months are an explicit fixture,
  // not a claim that the older Android export retained the provider metadata.
  const { api, card } = resolver({ transactions: [
    { date: '2026-08-11', amount: 252.48, status: 'PENDING', billForecastDate: '2026-09' },
    { date: '2026-09-02', amount: -81.64, description: 'Crédito de Google One', status: 'PENDING', billForecastDate: '2026-09' },
    { date: '2026-08-10', amount: -59.99, description: 'Pagamento recebido', status: 'PENDING', billForecastDate: '2026-09' },
    { date: '2026-09-09', amount: 43.48, status: 'PENDING', billForecastDate: '2026-10' }
  ] });
  expect(api.bankTruth(card, '2026-09')).toMatchObject({ amount: 170.84, official: false, paymentsExcluded: 59.99 });
  expect(api.displayTotal(card, '2026-10')).toBe(43.48);
});

test('mês previsto também governa grupos com billId, mantendo pagamento pendente excluído', () => {
  const { api, card } = resolver({ transactions: [
    { date: '2026-09-11', amount: 327.59, status: 'PENDING', billForecastDate: '2026-09', billId: 'itau-sep' },
    { ...payment, date: '2026-09-11', billForecastDate: '2026-09', billId: 'itau-sep' }
  ] });
  expect(api.bankTruth(card, '2026-09')).toMatchObject({ amount: 327.59, official: false, paymentsExcluded: 70.65 });
});

test('cartão sem nome usa o banco da mesma conexão para resolver a fatura', () => {
  const { api, card } = resolver({ realMapping: true, transactions: [
    { date: '2026-09-02', amount: 170.84, status: 'PENDING' }
  ] });
  expect(api.bankTruth(card, '2026-09')).toMatchObject({ amount: 170.84, official: false });
  expect(api.displayTotal(card, '2026-09')).toBe(170.84);
});

test('parcelas com compra original em julho e previsão de setembro completam R$ 327,59 sem reduzir pelo pagamento', () => {
  const { api, card, account } = resolver({ transactions: [
    { date:'2026-09-11', amount:253.40, status:'PENDING', billForecastDate:'2026-09' },
    { date:'2026-07-06', amount:54.90, status:'PENDING', billForecastDate:'2026-09' },
    { date:'2026-07-28', amount:19.29, status:'PENDING', billForecastDate:'2026-09' },
    { date:'2026-08-10', amount:-74.25, description:'Pagamento PIX', status:'PENDING', billForecastDate:'2026-09' },
    { date:'2026-07-06', amount:54.90, status:'POSTED', billForecastDate:'2026-08' }
  ] });
  expect(api.bankTruth(card,'2026-09')).toMatchObject({amount:327.59,official:false,paymentsExcluded:74.25});
  account.transactionPreviewHasMore=true;
  expect(api.cycleTransactions(card,'2026-09')).toBeNull();
});

test('Nubank sem compras locais projeta as duas parcelas restantes de 1/3 sem alterar a fatura', () => {
  const {api,card}=resolver({transactions:[{id:'purchase',description:'Compra parcelada',date:'2026-08-11',billForecastDate:'2026-09',amount:94.36,status:'PENDING',installment:{installmentNumber:1,totalInstallments:3}},payment]});
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:2,amount:188.72,nextAmount:94.36,complete:false});
  expect(api.displayTotal(card,'2026-09')).toBe(94.36);
});

test('parcela futura explícita substitui a projeção da mesma parcela sem duplicar', () => {
  const tx={description:'Compra parcelada',amount:94.36,status:'PENDING',installment:{installmentNumber:1,totalInstallments:3}};
  const {api,card}=resolver({transactions:[{...tx,id:'one',date:'2026-08-11',billForecastDate:'2026-09'}, {...tx,id:'two',date:'2026-10-11',billForecastDate:'2026-10',installment:{installmentNumber:2,totalInstallments:3}}]});
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:2,amount:188.72,nextAmount:94.36});
});

test('falha de transações preserva última projeção e ausência de metadados não confirma zero parcelas', () => {
  const {api,card,account}=resolver({transactions:[{id:'one',description:'Compra',date:'2026-08-11',billForecastDate:'2026-09',amount:94.36,installment:{installmentNumber:1,totalInstallments:3}}]});
  api.rememberBankTruth();
  account.transactions=[];account.transactionsError=true;
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:2,amount:188.72,stale:true});
  delete card.openFinanceFutureCommitments;
  expect(api.futureCommitments(card,'2026-09')).toBeNull();
  account.transactionsError=false;
  expect(api.futureCommitments(card,'2026-09').count).toBeNull();
});


test('crédito futuro reduz o valor identificado sem apagar parcelas ou contar pagamento pendente', () => {
  const {api,card}=resolver({transactions:[
    {id:'one',description:'Compra',date:'2026-08-11',billForecastDate:'2026-09',amount:94.36,installment:{installmentNumber:1,totalInstallments:3}},
    {id:'refund',description:'Estorno loja',date:'2026-10-01',billForecastDate:'2026-10',amount:-10},
    {...payment,billForecastDate:'2026-10'}
  ]});
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:2,amount:178.72,nextAmount:84.36});
});


test('última parcela explícita com arredondamento substitui a projeção correspondente', () => {
  const {api,card}=resolver({transactions:[
    {id:'one',description:'Compra',billForecastDate:'2026-09',amount:94.36,installment:{installmentNumber:1,totalInstallments:3}},
    {id:'three',description:'Compra',billForecastDate:'2026-11',amount:94.35,installment:{installmentNumber:3,totalInstallments:3}}
  ]});
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:2,amount:188.71,nextAmount:94.36});
});

test('retorno completo Itaú: 29 parcelas explícitas não viram 170 projeções', () => {
  const {api,card}=resolver({transactions:require('./fixtures/open-finance-itau-installment-schedule.json')});
  expect(api.displayTotal(card,'2026-09')).toBe(327.59);
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:29,monthsRemaining:11,lastMonth:'2027-08',amount:1166.78,nextAmount:180.82});
});

test('retorno Nubank com sufixos 1/3 e 3/3 projeta somente a parcela ausente', () => {
  const {api,card}=resolver({transactions:require('./fixtures/open-finance-nubank-installment-schedule.json')});
  expect(api.displayTotal(card,'2026-09')).toBe(170.84);
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:2,monthsRemaining:2,lastMonth:'2026-11',amount:357.08,nextAmount:262.73});
});


test('falha de consulta não reutiliza a projeção inflada da .18', () => {
  const {api,card,account}=resolver();
  account.transactionsError=true;
  card.openFinanceFutureCommitments={month:'2026-09',count:170,amount:6677.53,nextAmount:361.65};
  expect(api.futureCommitments(card,'2026-09')).toBeNull();
});

test('número no nome da loja só é removido quando coincide com a parcela informada', () => {
  const {api,card}=resolver({transactions:[
    {id:'a',description:'Loja 24/7',billForecastDate:'2026-09',amount:10,installment:{installmentNumber:1,totalInstallments:2}},
    {id:'b',description:'Loja 12/7',billForecastDate:'2026-10',amount:20,installment:{installmentNumber:2,totalInstallments:2}}
  ]});
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:2,amount:30,nextAmount:30});
});


test('nove parcelas distribuídas em três meses representam três meses restantes', () => {
  const {api,card}=resolver({transactions:['Loja A','Loja B','Loja C'].map((description,i)=>({
    id:'purchase-'+i,description,billForecastDate:'2026-09',amount:10,installment:{installmentNumber:1,totalInstallments:4}
  }))});
  expect(api.futureCommitments(card,'2026-09')).toMatchObject({count:9,monthsRemaining:3,lastMonth:'2026-12',amount:90});
});

test('cartão com compras locais conta meses até a última parcela, ignorando cancelamentos e estornos', () => {
  const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
  const source=html.match(/function sfpCardRemainingMonths\(c\)\{[\s\S]*?\n\}/)[0];
  const purchases=[1,2,3].map(id=>({id,cardId:1,status:'active',firstMonth:'2026-09',installments:4}));
  const context={state:{purchases:[...purchases,{cardId:1,status:'cancelled',firstMonth:'2026-09',installments:36}]},
    currentInvoiceMonth:()=> '2026-09',
    monthAdd:(month,n)=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);},
    purchaseInstallment:()=>({amount:10})};
  vm.createContext(context);vm.runInContext(source,context);
  expect(context.sfpCardRemainingMonths({id:1})).toBe(3);
  context.purchaseInstallment=(_,month)=>({amount:month==='2026-12'?0:10});
  expect(context.sfpCardRemainingMonths({id:1})).toBe(2);
});
