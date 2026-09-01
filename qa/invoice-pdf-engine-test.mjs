import assert from 'node:assert/strict';
import engine from '../app/src/main/assets/www/invoice-pdf-engine.js';

const itauText=`Banco Itaú S.A.
Resumo da fatura em R$
Total da fatura anterior 537,16
Pagamento efetuado em 06/07/2026 -537,16
Saldo financiado 0,00
Lançamentos atuais 74,25
= Total desta fatura 74,25
Vencimento: 10/08/2026
O total da sua fatura é: R$ 74,25 Limite total de crédito: R$ 2.040,00
Pagamento mínimo: R$ 7,42
Pagamentos efetuados Encargos cobrados nesta fatura
DATA VALOR EM R$
06/07 PAGAMENTO -537,16
P Total dos pagamentos -537,16
Lançamentos: compras e saques
DATA ESTABELECIMENTO VALOR EM R$
06/07 AMAZON BR 01/10 54,90
28/07 MERCADO*MERCAD 01/10 19,35
outros LIMEIRA Juros e encargos financeiros até o momento 0,00
L Total dos lançamentos atuais 74,25
Compras parceladas - próximas faturas
DATA ESTABELECIMENTO VALOR EM R$
06/07 AMAZON BR 02/10 54,90
28/07 MERCADO*MERCAD 02/10 19,29
Próxima fatura 74,19
Total para próximas faturas 667,71
Limite disponível 1.298,04`;

const parsed=engine.parse(itauText,{month:'2026-08'});
assert.deepEqual(parsed.profile,{id:'itau-card-v1',label:'Fatura Itaú',confidence:.99});
assert.deepEqual(
  {
    officialTotal:parsed.meta.officialTotal,
    previousInvoiceTotal:parsed.meta.previousInvoiceTotal,
    currentChargesTotal:parsed.meta.currentChargesTotal,
    futureInstallmentsTotal:parsed.meta.futureInstallmentsTotal,
    nextInvoiceTotal:parsed.meta.nextInvoiceTotal,
    totalLimit:parsed.meta.totalLimit,
    dueDate:parsed.meta.dueDate
  },
  {officialTotal:74.25,previousInvoiceTotal:537.16,currentChargesTotal:74.25,futureInstallmentsTotal:667.71,nextInvoiceTotal:74.19,totalLimit:2040,dueDate:'2026-08-10'}
);
assert.equal(parsed.integrity.status,'verified');
assert.equal(parsed.integrity.importAllowed,true);
assert.equal(parsed.integrity.currentNet,74.25);
assert.equal(parsed.integrity.futureRowsExcluded,2);
assert.deepEqual(parsed.rows.map(row=>[row.desc,row.invoiceKind,row.amount]),[
  ['PAGAMENTO','payment',-537.16],
  ['AMAZON BR','purchase',54.9],
  ['MERCADO*MERCAD outros LIMEIRA','purchase',19.35]
]);
assert.deepEqual(parsed.rows[2].installmentSchedule,[19.35,19.29,19.29,19.29,19.29,19.29,19.29,19.29,19.29,19.29]);
assert.equal(parsed.rows[2].total,192.96);

const fragmented=engine.parse(`Banco Itaú S.A.
Resumo da fatura em R$
Total da fatura anterior 537,16
Saldo financiado 0,00
Lançamentos atuais 74,25
Total desta fatura 74,25
Vencimento 10/08/2026
Pagamentos efetuados
DATA
06/07
PAGAMENTO
VALOR EM R$
-537,16
Total dos pagamentos -537,16
Lançamentos: compras e saques
DATA ESTABELECIMENTO VALOR EM R$
06/07 AMAZON BR 01/10 54,90
28/07 MERCADO*MERCAD 01/10
outros LIMEIRA
VALOR EM R$
19,35
Total dos lançamentos atuais 74,25
Compras parceladas - próximas faturas
DATA ESTABELECIMENTO VALOR EM R$
06/07 AMAZON BR 02/10 54,90
28/07 MERCADO*MERCAD 02/10 19,29
Próxima fatura 74,19
Total para próximas faturas 667,71`,{month:'2026-08'});
assert.equal(fragmented.integrity.status,'verified');
assert.deepEqual(fragmented.rows.map(row=>[row.desc,row.amount]),[['PAGAMENTO',-537.16],['AMAZON BR',54.9],['MERCADO*MERCAD outros LIMEIRA',19.35]]);

const divergent=engine.parse(`Resumo da fatura
Total da fatura R$ 100,00
Vencimento 16/09/2026
Lançamentos: compras e saques
DATA ESTABELECIMENTO VALOR EM R$
31/08 Compra real 90,00
Total dos lançamentos atuais 90,00`,{month:'2026-09'});
assert.equal(divergent.integrity.status,'blocked');
assert.equal(divergent.integrity.importAllowed,false);
assert.deepEqual(divergent.integrity.checks.find(check=>check.id==='official_total'),{id:'official_total',label:'Total oficial da fatura',status:'fail',actual:90,expected:100});

const genericWithFuture=engine.parse(`Resumo da fatura
Total da fatura R$ 50,00
Vencimento 16/09/2026
31/08/2026 Compra atual R$ 50,00
Compras parceladas - próximas faturas
30/09/2026 Parcela futura R$ 50,00`,{month:'2026-09'});
assert.equal(genericWithFuture.integrity.status,'verified');
assert.deepEqual(genericWithFuture.rows.map(row=>[row.desc,row.amount]),[['Compra atual',50]]);

console.log('Invoice PDF Engine QA: seções, parcelas futuras e validação contábil verificadas.');
