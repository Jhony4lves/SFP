from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = root / 'app/src/main/assets/www/index.html'
workflow = root / '.github/workflows/debt-contract-total-refine.yml'
self_path = Path(__file__).resolve()
text = index.read_text(encoding='utf-8')


def repl(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 alvo, encontrado {count}')
    text = text.replace(old, new, 1)

repl(
    "d.history??=[];d.history.push({id:paymentId,date,type:'payment',installment:due.n,amount:breakdown.payment,principal:breakdown.principal,interest:breakdown.interest,method:d.paymentMethod||'bank',accountId:from?.id||null,cashTxId});",
    "d.history??=[];d.history.push({id:paymentId,date,type:'payment',installment:due.n,amount:breakdown.payment,principal:d.amortizationMethod==='contract-total'?null:breakdown.principal,interest:d.amortizationMethod==='contract-total'?null:breakdown.interest,pricingUnallocated:d.amortizationMethod==='contract-total',method:d.paymentMethod||'bank',accountId:from?.id||null,cashTxId});",
    'histórico de parcela',
)

repl(
    "note:'Saída de caixa vinculada à amortização de principal.',balanceImpact:true,economicImpact:'neutral',debtId:d.id,debtPaymentId:paymentId,createdAt:Date.now()});d.balance=Math.max(0,Math.round((d.balance-v)*100)/100);d.history??=[];d.history.push({id:paymentId,date,type:'extra',amount:v,principal:v,interest:0,accountId:from.id});",
    "note:d.amortizationMethod==='contract-total'?'Saída de caixa vinculada à antecipação do saldo contratual; a divisão entre principal e custo não é inferida.':'Saída de caixa vinculada à amortização de principal.',balanceImpact:true,economicImpact:'neutral',debtId:d.id,debtPaymentId:paymentId,createdAt:Date.now()});d.balance=Math.max(0,Math.round((d.balance-v)*100)/100);d.history??=[];d.history.push({id:paymentId,date,type:'extra',amount:v,principal:d.amortizationMethod==='contract-total'?null:v,interest:d.amortizationMethod==='contract-total'?null:0,pricingUnallocated:d.amortizationMethod==='contract-total',accountId:from.id});",
    'histórico de amortização',
)

repl(
    "patch.principalReceived=Math.round(principalReceived*100)/100;patch.contractTotal=Math.round(contractTotal*100)/100;patch.principalDate=principalDate;patch.rate=0;",
    "if(principalDate&&firstDue&&civilDaySpan(principalDate,firstDue)==null)return toast('A data do recebimento não pode ser posterior ao primeiro vencimento.','warning');patch.principalReceived=Math.round(principalReceived*100)/100;patch.contractTotal=Math.round(contractTotal*100)/100;patch.principalDate=principalDate;patch.rate=0;",
    'validação de datas',
)

index.write_text(text, encoding='utf-8')
for p in (workflow, self_path):
    try:
        p.unlink()
    except FileNotFoundError:
        pass
print('Refinamento contábil aplicado.')
