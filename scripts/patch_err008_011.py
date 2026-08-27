from pathlib import Path

p = Path('app/src/main/assets/www/index.html')
s = p.read_text(encoding='utf-8')


def once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    s = s.replace(old, new, 1)


once(
    '<label class="money-field">Saldo inicial<input id="accountInitial" type="number" inputmode="decimal" step="0.01" value="0"/></label>',
    '<label class="money-field">Saldo inicial<input id="accountInitial" type="text" inputmode="decimal" data-money-locale="pt-BR" value="0,00"/></label>',
    'account initial localized input',
)

once(
    '<div class="field-group field-group--two"><label>Parcela<input id="debtPayment" type="number" inputmode="decimal" step="0.01" required/></label><label>Juros a.m. %<input id="debtRate" type="number" inputmode="decimal" step="0.01" value="0"/></label><label>Número de parcelas<input id="debtInstallments" type="number" inputmode="numeric" min="1" step="1" required/></label><label>Primeiro vencimento<input id="debtFirstDue" type="date" required/></label></div>',
    '<div class="field-group field-group--two"><label>Parcela<input id="debtPayment" type="number" inputmode="decimal" step="0.01" required/></label><label>Juros %<input id="debtRate" type="number" inputmode="decimal" step="0.01" value="0"/></label><label>Periodicidade da taxa<select id="debtRatePeriod"><option value="daily">a.d. — ao dia</option><option value="monthly" selected>a.m. — ao mês</option><option value="annual">a.a. — ao ano</option></select></label><label>Método de cálculo<select id="debtAmortization"><option value="price" selected>Price — estimativa automática</option><option value="manual">Manual — valor do contrato</option></select></label><label>Número de parcelas<input id="debtInstallments" type="number" inputmode="numeric" min="1" step="1" required/></label><label>Primeiro vencimento<input id="debtFirstDue" type="date" required/></label></div><div id="debtPaymentHint" class="note" aria-live="polite">Informe saldo, taxa e número de parcelas para estimar a prestação pelo sistema Price.</div>',
    'debt contract fields',
)

once(
    "function handleMoneyBlurEvent(e){\n const el=e.target;if(!isMonetaryInput(el))return;\n let val=el.value;if(!val)return;\n let num=parseMoney(val);\n if(Number.isFinite(num))el.value=(Math.round(num*100)/100).toFixed(2);\n}",
    "function moneyInputDisplayValue(el,num){\n const fixed=(Math.round(Number(num||0)*100)/100).toFixed(2);\n return el?.dataset?.moneyLocale==='pt-BR'?fixed.replace('.',','):fixed\n}\nfunction handleMoneyFocusEvent(e){\n const el=e.target;if(!isMonetaryInput(el))return;\n const num=parseMoney(el.value);\n if(Number.isFinite(num)&&Math.abs(num)<.005&&typeof el.select==='function')el.select()\n}\nfunction handleMoneyBlurEvent(e){\n const el=e.target;if(!isMonetaryInput(el))return;\n let val=el.value;if(!val){if(el.dataset.moneyLocale==='pt-BR')el.value='0,00';return}\n let num=parseMoney(val);\n if(Number.isFinite(num))el.value=moneyInputDisplayValue(el,num);\n}",
    'money focus and localized blur',
)

once(
    "document.addEventListener('input',handleMoneyInputEvent,true);\ndocument.addEventListener('blur',handleMoneyBlurEvent,true);",
    "document.addEventListener('input',handleMoneyInputEvent,true);\ndocument.addEventListener('focusin',handleMoneyFocusEvent,true);\ndocument.addEventListener('blur',handleMoneyBlurEvent,true);",
    'money focus listener',
)

once(
    "function debtMonths(d){let b=d.balance,r=d.rate/100,p=d.payment,m=0;if(p<=b*r)return 999;while(b>0&&m<999){b=b*(1+r)-p;m++}return m}",
    "function debtMonthlyRate(rate,period='monthly'){let r=Number(rate||0)/100;if(!(r>0))return 0;if(period==='daily')return Math.pow(1+r,30)-1;if(period==='annual')return Math.pow(1+r,1/12)-1;return r}\nfunction calculateDebtInstallment({principal,rate=0,ratePeriod='monthly',installments,method='price'}={}){let p=Number(principal),n=Number(installments);if(method!=='price'||!(p>0)||!Number.isInteger(n)||n<1)return null;let i=debtMonthlyRate(rate,ratePeriod),payment=i>0?p*(i/(1-Math.pow(1+i,-n))):p/n;return Number.isFinite(payment)?Math.round(payment*100)/100:null}\nfunction debtRateLabel(d){let suffix={daily:'a.d.',monthly:'a.m.',annual:'a.a.'}[d?.ratePeriod||'monthly']||'a.m.';return `${d?.rate||0}% ${suffix}`}\nfunction updateDebtPaymentEstimate(){let payment=$('debtPayment'),hint=$('debtPaymentHint');if(!payment)return null;let method=$('debtAmortization')?.value||'price';if(method==='manual'){if(hint)hint.textContent='Modo manual: informe a parcela exatamente como consta no contrato real.';return null}let estimate=calculateDebtInstallment({principal:parseMoney($('debtBalance')?.value),rate:parseMoney($('debtRate')?.value),ratePeriod:$('debtRatePeriod')?.value||'monthly',installments:Number($('debtInstallments')?.value),method});if(estimate==null){if(hint)hint.textContent='Informe saldo, taxa e número de parcelas para estimar a prestação pelo sistema Price.';return null}if(payment.dataset.userEdited!=='1')payment.value=estimate.toFixed(2);if(hint)hint.textContent=`Estimativa Price: ${brl(estimate)}. Taxas diária/anual são convertidas para equivalente mensal; não inclui IOF, tarifas ou seguros. Ajuste ao contrato real se necessário.`;return estimate}\nwindow.calculateDebtInstallment=calculateDebtInstallment;\nfunction debtMonths(d){let b=d.balance,r=debtMonthlyRate(d.rate,d.ratePeriod),p=d.payment,m=0;if(p<=b*r)return 999;while(b>0&&m<999){b=b*(1+r)-p;m++}return m}",
    'debt installment engine',
)

if s.count('${d.rate}% a.m.') != 2:
    raise SystemExit(f'debt rate labels: expected 2 matches, found {s.count("${d.rate}% a.m.")}')
s = s.replace('${d.rate}% a.m.', '${debtRateLabel(d)}')

once(
    "window.editAccount=(id,fromDetail=false)=>{let a=account(id);$('accountId').value=a.id;$('accountName').value=a.name;$('accountType').value=a.type;$('accountInitial').value=a.initial;",
    "window.editAccount=(id,fromDetail=false)=>{let a=account(id);$('accountId').value=a.id;$('accountName').value=a.name;$('accountType').value=a.type;$('accountInitial').value=moneyInputDisplayValue($('accountInitial'),a.initial);",
    'account edit localized value',
)

once(
    "window.editDebt=(id,fromDetail=false)=>{let d=state.debts.find(x=>x.id===id);if(!d)return;$('debtId').value=d.id;$('debtName').value=d.name;$('debtBalance').value=d.balance;$('debtRate').value=d.rate;$('debtPayment').value=d.payment;$('debtFirstDue').value=d.firstDue||'';",
    "window.editDebt=(id,fromDetail=false)=>{let d=state.debts.find(x=>x.id===id);if(!d)return;$('debtId').value=d.id;$('debtName').value=d.name;$('debtBalance').value=d.balance;$('debtRate').value=d.rate;$('debtRatePeriod').value=d.ratePeriod||'monthly';$('debtAmortization').value=d.amortizationMethod||'manual';$('debtPayment').value=d.payment;$('debtPayment').dataset.userEdited='1';$('debtFirstDue').value=d.firstDue||'';",
    'debt edit preserves contract',
)

once(
    "function initForms(){\n $('debtInstallments').oninvalid=()=>toast('O número de parcelas da dívida precisa ser um inteiro maior ou igual a 1.','warning');",
    "function initForms(){\n $('debtInstallments').oninvalid=()=>toast('O número de parcelas da dívida precisa ser um inteiro maior ou igual a 1.','warning');\n ['debtBalance','debtRate','debtInstallments'].forEach(id=>{$(id).oninput=updateDebtPaymentEstimate});\n $('debtRatePeriod').onchange=updateDebtPaymentEstimate;\n $('debtPayment').oninput=()=>{$('debtPayment').dataset.userEdited='1'};\n $('debtAmortization').onchange=()=>{if($('debtAmortization').value==='price')$('debtPayment').dataset.userEdited='';updateDebtPaymentEstimate()};",
    'debt auto calculation listeners',
)

once(
    "$('accountForm').onsubmit=async e=>{e.preventDefault();let panel=e.currentTarget.closest('.management-form-panel'),id=+$('accountId').value,old=id?account(id):null,patch={id:id||uid(),name:$('accountName').value.trim(),type:$('accountType').value,initial:+$('accountInitial').value};",
    "$('accountForm').onsubmit=async e=>{e.preventDefault();let panel=e.currentTarget.closest('.management-form-panel'),id=+$('accountId').value,old=id?account(id):null,patch={id:id||uid(),name:$('accountName').value.trim(),type:$('accountType').value,initial:parseMoney($('accountInitial').value)};",
    'account submit parse localized money',
)

once(
    "let patch={id:id||uid(),name:$('debtName').value.trim(),balance:+$('debtBalance').value,rate:+$('debtRate').value,payment:+$('debtPayment').value,firstDue,installments};",
    "let patch={id:id||uid(),name:$('debtName').value.trim(),balance:parseMoney($('debtBalance').value),rate:parseMoney($('debtRate').value),ratePeriod:$('debtRatePeriod').value||'monthly',amortizationMethod:$('debtAmortization').value||'manual',payment:parseMoney($('debtPayment').value),firstDue,installments};",
    'debt submit new contract fields',
)

once(
    "const form=$(def[0]);form.reset();const hidden=form.querySelector('input[type=\"hidden\"]');if(hidden)hidden.value='';showProgressivePanel(form.closest('.management-form-panel'),def[1])",
    "const form=$(def[0]);form.reset();const hidden=form.querySelector('input[type=\"hidden\"]');if(hidden)hidden.value='';if(page==='dividas'){$('debtPayment').dataset.userEdited='';$('debtRatePeriod').value='monthly';$('debtAmortization').value='price';updateDebtPaymentEstimate()}showProgressivePanel(form.closest('.management-form-panel'),def[1])",
    'new debt resets estimate mode',
)

p.write_text(s, encoding='utf-8')
