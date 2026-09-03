from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'app/src/main/assets/www/index.html'
TEST = ROOT / 'qa/debt-contract-total.spec.js'
WORKFLOW = ROOT / '.github/workflows/debt-contract-total-patch.yml'
SELF = Path(__file__).resolve()

text = INDEX.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 alvo, encontrado {count}')
    text = text.replace(old, new, 1)


replace_once(
    '<select id="debtAmortization"><option value="price" selected>Price — estimativa automática</option><option value="manual">Manual — valor do contrato</option></select>',
    '<select id="debtAmortization"><option value="price" selected>Price — estimativa automática</option><option value="manual">Manual — valor do contrato</option><option value="contract-total">Total contratado — taxa desconhecida</option></select>',
    'opção total contratado',
)

replace_once(
    '<label>Primeiro vencimento<input id="debtFirstDue" type="date" required/></label></div><div id="debtPaymentHint" class="note" aria-live="polite">Informe saldo, taxa e número de parcelas para estimar a prestação pelo sistema Price.</div>',
    '<label>Primeiro vencimento<input id="debtFirstDue" type="date" required/></label></div><div id="debtContractTotalFields" class="conditional-fields hidden" style="margin-top:12px"><div class="form-section__header"><div><h3 class="form-section__title">Custo fechado</h3><p class="form-section__description">Use quando você sabe quanto recebeu e quanto vai devolver, mas não conhece a taxa.</p></div></div><div class="field-group field-group--two"><label class="money-field">Valor recebido<input id="debtPrincipalReceived" type="number" inputmode="decimal" min="0.01" step="0.01"/><small class="field-help">Quanto efetivamente entrou para você.</small></label><label class="money-field">Total contratado a pagar<input id="debtContractTotal" type="number" inputmode="decimal" min="0.01" step="0.01"/><small class="field-help">Soma final que deverá ser devolvida.</small></label><label>Data do recebimento<input id="debtPrincipalDate" type="date"/><small class="field-help">Opcional; permite mostrar a duração real até o vencimento.</small></label></div></div><div id="debtPaymentHint" class="note" aria-live="polite">Informe saldo, taxa e número de parcelas para estimar a prestação pelo sistema Price.</div>',
    'campos de custo fechado',
)

replace_once(
    "const MONETARY_INPUT_IDS=new Set(['txAmount','accountInitial','cardLimit','recAmount','catBudgetAmount','debtBalance','debtPayment','goalTarget','goalPlan','assetValue','simDebtBalance','simDebtPayment','simDebtExtra','simGoalTarget','simGoalInitial','simGoalMonthly','obBalance']);",
    "const MONETARY_INPUT_IDS=new Set(['txAmount','accountInitial','cardLimit','recAmount','catBudgetAmount','debtBalance','debtPayment','debtPrincipalReceived','debtContractTotal','goalTarget','goalPlan','assetValue','simDebtBalance','simDebtPayment','simDebtExtra','simGoalTarget','simGoalInitial','simGoalMonthly','obBalance']);",
    'inputs monetários',
)

replace_once(
    "function debtRateLabel(d){let suffix={daily:'a.d.',monthly:'a.m.',annual:'a.a.'}[d?.ratePeriod||'monthly']||'a.m.';return `${d?.rate||0}% ${suffix}`}\nfunction updateDebtPaymentEstimate(){let payment=$('debtPayment'),hint=$('debtPaymentHint');if(!payment)return null;let method=$('debtAmortization')?.value||'price';if(method==='manual'){if(hint)hint.textContent='Modo manual: informe a parcela exatamente como consta no contrato real.';return null}let estimate=calculateDebtInstallment({principal:parseMoney($('debtBalance')?.value),rate:parsePercent($('debtRate')?.value),ratePeriod:$('debtRatePeriod')?.value||'monthly',installments:Number($('debtInstallments')?.value),method});if(estimate==null){if(hint)hint.textContent='Informe saldo, taxa e número de parcelas para estimar a prestação pelo sistema Price.';return null}if(payment.dataset.userEdited!=='1')payment.value=estimate.toFixed(2);if(hint)hint.textContent=`Estimativa Price: ${brl(estimate)}. Taxas diária/anual são convertidas para equivalente mensal; não inclui IOF, tarifas ou seguros. Ajuste ao contrato real se necessário.`;return estimate}",
    "function civilDaySpan(start,end){if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(start||'')||!/^\\d{4}-\\d{2}-\\d{2}$/.test(end||''))return null;let [sy,sm,sd]=start.split('-').map(Number),[ey,em,ed]=end.split('-').map(Number),days=Math.round((Date.UTC(ey,em-1,ed)-Date.UTC(sy,sm-1,sd))/86400000);return days>=0?days:null}\nfunction debtContractCostInfo(source={}){let principal=Number(source.principalReceived)||0,total=Number(source.contractTotal)||0;if(!(principal>0)||!(total>=principal))return null;let cost=Math.round((total-principal)*100)/100,pct=principal?cost/principal*100:0,days=civilDaySpan(source.principalDate,source.firstDue);return{principal,total,cost,pct,days}}\nfunction debtRateLabel(d){if(d?.amortizationMethod==='contract-total')return 'Custo fechado · taxa não informada';let suffix={daily:'a.d.',monthly:'a.m.',annual:'a.a.'}[d?.ratePeriod||'monthly']||'a.m.';return `${d?.rate||0}% ${suffix}`}\nfunction updateDebtPaymentEstimate(){let payment=$('debtPayment'),hint=$('debtPaymentHint');if(!payment)return null;let method=$('debtAmortization')?.value||'price',contractMode=method==='contract-total',contractFields=$('debtContractTotalFields'),rate=$('debtRate'),ratePeriod=$('debtRatePeriod');contractFields?.classList.toggle('hidden',!contractMode);if(rate)rate.disabled=contractMode;if(ratePeriod)ratePeriod.disabled=contractMode;if(contractMode){let principal=parseMoney($('debtPrincipalReceived')?.value),total=parseMoney($('debtContractTotal')?.value),installments=Number($('debtInstallments')?.value),principalDate=$('debtPrincipalDate')?.value||'',firstDue=$('debtFirstDue')?.value||'';if($('debtPrincipalDate')&&!$('debtPrincipalDate').value)$('debtPrincipalDate').value=localCivilDate();if(rate)rate.value='0';if(total>0&&(!$('debtId')?.value||$('debtBalance').dataset.userEdited!=='1'))$('debtBalance').value=total.toFixed(2);if(total>0&&Number.isInteger(installments)&&installments>0&&payment.dataset.userEdited!=='1'){let cents=Math.round(total*100);payment.value=(Math.ceil(cents/installments)/100).toFixed(2)}let info=debtContractCostInfo({principalReceived:principal,contractTotal:total,principalDate:$('debtPrincipalDate')?.value||principalDate,firstDue});if(info){let pct=info.pct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),period=info.days==null?'':` em ${info.days} ${info.days===1?'dia':'dias'}`;if(hint)hint.textContent=`Custo do crédito: ${brl(info.cost)} (${pct}% no período${period}). A taxa mensal permanece não informada; o SFP não inventa juros que não constam do contrato.`}else if(hint)hint.textContent='Informe o valor recebido e o total contratado para calcular o custo real do crédito sem inventar uma taxa.';return info}if(method==='manual'){if(hint)hint.textContent='Modo manual: informe a parcela exatamente como consta no contrato real.';return null}let estimate=calculateDebtInstallment({principal:parseMoney($('debtBalance')?.value),rate:parsePercent($('debtRate')?.value),ratePeriod:$('debtRatePeriod')?.value||'monthly',installments:Number($('debtInstallments')?.value),method});if(estimate==null){if(hint)hint.textContent='Informe saldo, taxa e número de parcelas para estimar a prestação pelo sistema Price.';return null}if(payment.dataset.userEdited!=='1')payment.value=estimate.toFixed(2);if(hint)hint.textContent=`Estimativa Price: ${brl(estimate)}. Taxas diária/anual são convertidas para equivalente mensal; não inclui IOF, tarifas ou seguros. Ajuste ao contrato real se necessário.`;return estimate}",
    'motor de custo fechado',
)

replace_once(
    "function debtMonthsLabel(d){let p=debtProjection(d);if(p.status==='ok')return p.months===1?'1 mês estimado':`${p.months} meses estimados`;if(p.status==='not_converged')return 'Parcela não amortiza a dívida';return 'Prazo fora do horizonte calculável'}",
    "function debtMonthsLabel(d){if(d?.amortizationMethod==='contract-total'){let left=Math.max(0,(Number(d.installments)||0)-(Number(d.paidInstallments)||0));return left===1?'1 pagamento restante':`${left} pagamentos restantes`}let p=debtProjection(d);if(p.status==='ok')return p.months===1?'1 mês estimado':`${p.months} meses estimados`;if(p.status==='not_converged')return 'Parcela não amortiza a dívida';return 'Prazo fora do horizonte calculável'}",
    'prazo de custo fechado',
)

replace_once(
    "window.editDebt=(id,fromDetail=false)=>{let d=state.debts.find(x=>x.id===id);if(!d)return;$('debtId').value=d.id;$('debtName').value=d.name;$('debtBalance').value=d.balance;$('debtRate').value=d.rate;$('debtRatePeriod').value=d.ratePeriod||'monthly';$('debtRatePeriod').dataset.userEdited='';$('debtAmortization').value=d.amortizationMethod||'manual';$('debtAmortization').dataset.userEdited='';$('debtPayment').value=d.payment;$('debtPayment').dataset.userEdited='1';$('debtFirstDue').value=d.firstDue||'';$('debtInstallments').value=d.installments||'';$('debtDay').value=d.dueDay||(+d.firstDue?.slice(8,10)||1);$('debtDay').dataset.userEdited='';$('debtAccount').value=d.accountId||state.accounts[0]?.id||'';$('debtAccount').dataset.userEdited='';$('debtMoreDetails').open=!!(d.dueDay||d.accountId||d.paymentMethod);$('debtFormTitle').textContent='Editar dívida';$('debtFormMode').textContent='Edição';$('debtSubmit').textContent='Salvar alterações';setPage('dividas');showProgressivePanel($('debtName').closest('.management-form-panel'),'Editar dívida',fromDetail?()=>openDebtDetail(id):null)}",
    "window.editDebt=(id,fromDetail=false)=>{let d=state.debts.find(x=>x.id===id);if(!d)return;$('debtId').value=d.id;$('debtName').value=d.name;$('debtBalance').value=d.balance;$('debtBalance').dataset.userEdited='1';$('debtRate').value=d.rate||0;$('debtRatePeriod').value=d.ratePeriod||'monthly';$('debtRatePeriod').dataset.userEdited='';$('debtAmortization').value=d.amortizationMethod||'manual';$('debtAmortization').dataset.userEdited='';$('debtPayment').value=d.payment;$('debtPayment').dataset.userEdited='1';$('debtPrincipalReceived').value=d.principalReceived??'';$('debtContractTotal').value=d.contractTotal??'';$('debtPrincipalDate').value=d.principalDate||'';$('debtFirstDue').value=d.firstDue||'';$('debtInstallments').value=d.installments||'';$('debtDay').value=d.dueDay||(+d.firstDue?.slice(8,10)||1);$('debtDay').dataset.userEdited='';$('debtAccount').value=d.accountId||state.accounts[0]?.id||'';$('debtAccount').dataset.userEdited='';$('debtMoreDetails').open=!!(d.dueDay||d.accountId||d.paymentMethod);$('debtFormTitle').textContent='Editar dívida';$('debtFormMode').textContent='Edição';$('debtSubmit').textContent='Salvar alterações';updateDebtPaymentEstimate();setPage('dividas');showProgressivePanel($('debtName').closest('.management-form-panel'),'Editar dívida',fromDetail?()=>openDebtDetail(id):null)}",
    'edição de dívida',
)

replace_once(
    " ['debtBalance','debtRate','debtInstallments'].forEach(id=>{$(id).oninput=updateDebtPaymentEstimate});\n $('debtRatePeriod').onchange=()=>{$('debtRatePeriod').dataset.userEdited='1';updateDebtPaymentEstimate()};\n $('debtPayment').oninput=()=>{$('debtPayment').dataset.userEdited='1'};\n $('debtAmortization').onchange=()=>{$('debtAmortization').dataset.userEdited='1';if($('debtAmortization').value==='price')$('debtPayment').dataset.userEdited='';updateDebtPaymentEstimate()};",
    " $('debtBalance').oninput=()=>{$('debtBalance').dataset.userEdited='1';updateDebtPaymentEstimate()};\n ['debtRate','debtInstallments','debtPrincipalReceived','debtContractTotal','debtPrincipalDate','debtFirstDue'].forEach(id=>{$(id).oninput=updateDebtPaymentEstimate});\n $('debtRatePeriod').onchange=()=>{$('debtRatePeriod').dataset.userEdited='1';updateDebtPaymentEstimate()};\n $('debtPayment').oninput=()=>{$('debtPayment').dataset.userEdited='1'};\n $('debtAmortization').onchange=()=>{$('debtAmortization').dataset.userEdited='1';let method=$('debtAmortization').value;if(method==='price'||method==='contract-total')$('debtPayment').dataset.userEdited='';if(method==='contract-total'&&!$('debtId').value)$('debtBalance').dataset.userEdited='';updateDebtPaymentEstimate()};",
    'eventos do formulário de dívida',
)

old_submit = " $('debtForm').onsubmit=async e=>{e.preventDefault();let panel=e.currentTarget.closest('.management-form-panel'),id=+$('debtId').value,old=id?state.debts.find(d=>d.id===id):null,firstDue=$('debtFirstDue').value,installments=Number($('debtInstallments').value);if(!Number.isInteger(installments)||installments<1)return toast('O número de parcelas da dívida precisa ser um inteiro maior ou igual a 1.','warning');let patch={id:id||uid(),name:$('debtName').value.trim(),balance:parseMoney($('debtBalance').value),rate:parsePercent($('debtRate').value),payment:parseMoney($('debtPayment').value),firstDue,installments};if(!old||Object.hasOwn(old,'ratePeriod')||$('debtRatePeriod').dataset.userEdited==='1')patch.ratePeriod=$('debtRatePeriod').value||'monthly';if(!old||Object.hasOwn(old,'amortizationMethod')||$('debtAmortization').dataset.userEdited==='1')patch.amortizationMethod=$('debtAmortization').value||'manual';if(!old||Object.hasOwn(old,'dueDay')||$('debtDay').dataset.userEdited==='1')patch.dueDay=+$('debtDay').value;if(!old||Object.hasOwn(old,'accountId')||$('debtAccount').dataset.userEdited==='1')patch.accountId=+$('debtAccount').value;if(!patch.name)return toast('Informe o credor da dívida.','warning');if(!requirePositiveAmount(patch.balance,'O saldo da dívida'))return;if(!requirePositiveAmount(patch.payment,'A parcela da dívida'))return;let obj=old?{...old,...patch}:{...patch,paidInstallments:0,paymentMethod:'bank',history:[]};if(id)state.debts=state.debts.map(d=>d.id===id?obj:d);else state.debts.push(obj);await save(id?'Editar dívida':'Nova dívida');resetManagementForm('debtForm',{id:'debtId',titleId:'debtFormTitle',title:'Adicionar dívida',modeId:'debtFormMode',submitId:'debtSubmit',submitText:'Adicionar dívida',detailsId:'debtMoreDetails'});if(progressiveRestore?.node===panel)closeProgressive(false)};"
new_submit = " $('debtForm').onsubmit=async e=>{e.preventDefault();let panel=e.currentTarget.closest('.management-form-panel'),id=+$('debtId').value,old=id?state.debts.find(d=>d.id===id):null,firstDue=$('debtFirstDue').value,installments=Number($('debtInstallments').value),method=$('debtAmortization').value||'manual';if(!Number.isInteger(installments)||installments<1)return toast('O número de parcelas da dívida precisa ser um inteiro maior ou igual a 1.','warning');let patch={id:id||uid(),name:$('debtName').value.trim(),balance:parseMoney($('debtBalance').value),rate:parsePercent($('debtRate').value),payment:parseMoney($('debtPayment').value),firstDue,installments};if(method==='contract-total'){let principalReceived=parseMoney($('debtPrincipalReceived').value),contractTotal=parseMoney($('debtContractTotal').value),principalDate=$('debtPrincipalDate').value||'';if(!requirePositiveAmount(principalReceived,'O valor recebido'))return;if(!requirePositiveAmount(contractTotal,'O total contratado'))return;if(contractTotal+0.009<principalReceived)return toast('O total contratado não pode ser menor que o valor recebido.','warning');patch.principalReceived=Math.round(principalReceived*100)/100;patch.contractTotal=Math.round(contractTotal*100)/100;patch.principalDate=principalDate;patch.rate=0;patch.rateKnown=false;patch.amortizationMethod='contract-total';patch.ratePeriod='monthly';if(!id)patch.balance=patch.contractTotal;if(!id&&patch.payment*installments+0.009<patch.contractTotal)return toast('A soma das parcelas precisa cobrir o total contratado. Ajuste a parcela ou o número de parcelas.','warning')}else patch.rateKnown=true;if(!old||Object.hasOwn(old,'ratePeriod')||$('debtRatePeriod').dataset.userEdited==='1'||method==='contract-total')patch.ratePeriod=method==='contract-total'?'monthly':($('debtRatePeriod').value||'monthly');if(!old||Object.hasOwn(old,'amortizationMethod')||$('debtAmortization').dataset.userEdited==='1'||method==='contract-total')patch.amortizationMethod=method;if(!old||Object.hasOwn(old,'dueDay')||$('debtDay').dataset.userEdited==='1')patch.dueDay=+$('debtDay').value;if(!old||Object.hasOwn(old,'accountId')||$('debtAccount').dataset.userEdited==='1')patch.accountId=+$('debtAccount').value;if(!patch.name)return toast('Informe o credor da dívida.','warning');if(!requirePositiveAmount(patch.balance,'O saldo da dívida'))return;if(!requirePositiveAmount(patch.payment,'A parcela da dívida'))return;let obj=old?{...old,...patch}:{...patch,paidInstallments:0,paymentMethod:'bank',history:[]};if(id)state.debts=state.debts.map(d=>d.id===id?obj:d);else state.debts.push(obj);await save(id?'Editar dívida':'Nova dívida');resetManagementForm('debtForm',{id:'debtId',titleId:'debtFormTitle',title:'Adicionar dívida',modeId:'debtFormMode',submitId:'debtSubmit',submitText:'Adicionar dívida',detailsId:'debtMoreDetails'});$('debtBalance').dataset.userEdited='';$('debtPayment').dataset.userEdited='';updateDebtPaymentEstimate();if(progressiveRestore?.node===panel)closeProgressive(false)};"
replace_once(old_submit, new_submit, 'submit da dívida')

replace_once(
    " await save('Registrar parcela da dívida');toast((d.paymentMethod==='payroll'?`Parcela ${due.n}/${due.total} registrada como descontada em folha.`:`Parcela ${due.n}/${due.total} paga por ${from.name}: ${brl(breakdown.payment)} (principal ${brl(breakdown.principal)} + juros ${brl(breakdown.interest)}).`),'success')",
    " await save('Registrar parcela da dívida');let paymentMessage=d.paymentMethod==='payroll'?`Parcela ${due.n}/${due.total} registrada como descontada em folha.`:(d.amortizationMethod==='contract-total'?`Parcela ${due.n}/${due.total} paga por ${from.name}: ${brl(breakdown.payment)}. O saldo contratual foi reduzido sem inventar uma divisão entre principal e juros.`:`Parcela ${due.n}/${due.total} paga por ${from.name}: ${brl(breakdown.payment)} (principal ${brl(breakdown.principal)} + juros ${brl(breakdown.interest)}).`);toast(paymentMessage,'success')",
    'mensagem de pagamento',
)

old_detail = "window.openDebtDetail=id=>{const d=state.debts.find(x=>x.id===id);if(!d)return;const hist=(d.history||[]).slice().reverse();showDetail(d.name,`${debtRateLabel(d)} · ${d.paidInstallments||0} de ${d.installments} parcelas`, `<div class=\"metric-grid\"><div class=\"metric\"><span>Saldo devedor</span><strong>${brl(d.balance)}</strong><small>Parcela ${brl(d.payment)}</small></div><div class=\"metric\"><span>Próximo vencimento</span><strong>${d.firstDue?sfpDatePt(d.firstDue):'—'}</strong><small>${debtMonthsLabel(d)}</small></div></div><div class=\"section-actions\"><button class=\"btn\" onclick=\"closeProgressive();payDebtInstallment(${id})\">Pagar parcela</button><button class=\"btn2\" onclick=\"closeProgressive();amortize(${id})\">Amortizar</button><button class=\"btn2\" onclick=\"closeProgressive();editDebt(${id},true)\">Editar</button><button class=\"danger\" onclick=\"deleteDebtPrompt(${id})\">Excluir</button></div><div class=\"head\"><div><h3>Histórico</h3><p>Pagamentos e amortizações</p></div></div><div class=\"list\">${hist.length?hist.map(h=>`<div class=\"item\"><span>${h.date?sfpDatePt(h.date):new Date(h.at).toLocaleDateString('pt-BR')} · ${h.type==='extra'?'Amortização':'Pagamento'}</span><strong>${brl(h.amount)}</strong></div>`).join(''):'<div class=\"empty-state\">Nenhum pagamento registrado.</div>'}</div>`)};"
new_detail = "window.openDebtDetail=id=>{const d=state.debts.find(x=>x.id===id);if(!d)return;const hist=(d.history||[]).slice().reverse(),cost=debtContractCostInfo(d),contractBlock=d.amortizationMethod==='contract-total'&&cost?`<div class=\"management-facts\"><div class=\"management-fact\"><small>Valor recebido</small><b>${brl(cost.principal)}</b></div><div class=\"management-fact\"><small>Total contratado</small><b>${brl(cost.total)}</b></div><div class=\"management-fact\"><small>Custo do crédito</small><b>${brl(cost.cost)} · ${cost.pct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%${cost.days==null?'':` em ${cost.days} ${cost.days===1?'dia':'dias'}`}</b></div></div>`:'';showDetail(d.name,`${debtRateLabel(d)} · ${d.paidInstallments||0} de ${d.installments} parcelas`, `<div class=\"metric-grid\"><div class=\"metric\"><span>Saldo devedor</span><strong>${brl(d.balance)}</strong><small>Parcela ${brl(d.payment)}</small></div><div class=\"metric\"><span>Próximo vencimento</span><strong>${d.firstDue?sfpDatePt(d.firstDue):'—'}</strong><small>${debtMonthsLabel(d)}</small></div></div>${contractBlock}<div class=\"section-actions\"><button class=\"btn\" onclick=\"closeProgressive();payDebtInstallment(${id})\">Pagar parcela</button><button class=\"btn2\" onclick=\"closeProgressive();amortize(${id})\">Amortizar</button><button class=\"btn2\" onclick=\"closeProgressive();editDebt(${id},true)\">Editar</button><button class=\"danger\" onclick=\"deleteDebtPrompt(${id})\">Excluir</button></div><div class=\"head\"><div><h3>Histórico</h3><p>Pagamentos e amortizações</p></div></div><div class=\"list\">${hist.length?hist.map(h=>`<div class=\"item\"><span>${h.date?sfpDatePt(h.date):new Date(h.at).toLocaleDateString('pt-BR')} · ${h.type==='extra'?'Amortização':'Pagamento'}</span><strong>${brl(h.amount)}</strong></div>`).join(''):'<div class=\"empty-state\">Nenhum pagamento registrado.</div>'}</div>`)};"
replace_once(old_detail, new_detail, 'detalhe da dívida')

INDEX.write_text(text, encoding='utf-8')

TEST.write_text(r"""const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await writeIndexedDB(page, value);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
}

test('dívida por total contratado registra valor recebido, custo e prazo sem inventar taxa', async ({ page }) => {
  const value = fixture('Crédito por total contratado');
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-03';
  await boot(page, value);
  await page.evaluate(() => openManagementAction('dividas'));

  await page.locator('#debtName').fill('Linha de crédito QA');
  await page.locator('#debtAmortization').selectOption('contract-total');
  await expect(page.locator('#debtContractTotalFields')).toBeVisible();
  await expect(page.locator('#debtRate')).toBeDisabled();

  await page.locator('#debtPrincipalReceived').fill('104.60');
  await page.locator('#debtContractTotal').fill('120.48');
  await page.locator('#debtPrincipalDate').fill('2026-09-03');
  await page.locator('#debtInstallments').fill('1');
  await page.locator('#debtFirstDue').fill('2026-09-24');

  await expect(page.locator('#debtBalance')).toHaveValue('120.48');
  await expect(page.locator('#debtPayment')).toHaveValue('120.48');
  await expect(page.locator('#debtPaymentHint')).toContainText('R$ 15,88');
  await expect(page.locator('#debtPaymentHint')).toContainText('15,18%');
  await expect(page.locator('#debtPaymentHint')).toContainText('21 dias');
  await expect(page.locator('#debtPaymentHint')).toContainText(/não inventa/i);

  await page.locator('#debtForm').evaluate(form => form.requestSubmit());

  const saved = await page.evaluate(() => {
    const d = state.debts.find(x => x.name === 'Linha de crédito QA');
    return d && {
      balance: d.balance,
      payment: d.payment,
      principalReceived: d.principalReceived,
      contractTotal: d.contractTotal,
      principalDate: d.principalDate,
      rate: d.rate,
      rateKnown: d.rateKnown,
      method: d.amortizationMethod,
      installments: d.installments
    };
  });

  expect(saved).toEqual({
    balance: 120.48,
    payment: 120.48,
    principalReceived: 104.6,
    contractTotal: 120.48,
    principalDate: '2026-09-03',
    rate: 0,
    rateKnown: false,
    method: 'contract-total',
    installments: 1
  });

  await page.evaluate(() => renderDebts());
  const card = page.locator('#debtGrid .management-card').filter({ hasText: 'Linha de crédito QA' });
  await expect(card).toContainText('taxa não informada');
  await expect(card).not.toContainText('0% a.m.');

  await page.evaluate(() => openDebtDetail(state.debts.find(d => d.name === 'Linha de crédito QA').id));
  await expect(page.locator('#modalRoot')).toContainText('Valor recebido');
  await expect(page.locator('#modalRoot')).toContainText('R$ 104,60');
  await expect(page.locator('#modalRoot')).toContainText('Total contratado');
  await expect(page.locator('#modalRoot')).toContainText('R$ 120,48');
  await expect(page.locator('#modalRoot')).toContainText('R$ 15,88');
  await expect(page.locator('#modalRoot')).toContainText('15,18%');
});

test('total contratado menor que o recebido é rejeitado', async ({ page }) => {
  await boot(page, fixture('Crédito inválido'));
  await page.evaluate(() => openManagementAction('dividas'));
  await page.locator('#debtName').fill('Contrato inválido');
  await page.locator('#debtAmortization').selectOption('contract-total');
  await page.locator('#debtPrincipalReceived').fill('120.00');
  await page.locator('#debtContractTotal').fill('100.00');
  await page.locator('#debtInstallments').fill('1');
  await page.locator('#debtFirstDue').fill('2026-09-24');
  await page.locator('#debtForm').evaluate(form => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => state.debts.some(d => d.name === 'Contrato inválido'))).toBe(false);
  await expect(page.locator('#toast')).toContainText(/não pode ser menor/i);
});
""", encoding='utf-8')

for path in (WORKFLOW, SELF):
    try:
        path.unlink()
    except FileNotFoundError:
        pass

print('Patch de dívida por total contratado aplicado com sucesso.')
