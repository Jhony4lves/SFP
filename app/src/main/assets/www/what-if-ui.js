(function(global){
  'use strict';

  const VERSION=1;
  const PANEL_ID='whatIfPlanner';
  const STYLE_ID='whatIfPlannerStyles';
  let lastReport=null;

  const q=(selector,root=document)=>root.querySelector(selector);
  const safeArray=value=>Array.isArray(value)?value:[];
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const datePt=value=>{const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:(value||'—')};

  function parseBRLCents(value){
    let raw=String(value??'').trim().replace(/\s/g,'').replace(/R\$/gi,'');
    if(!raw)return 0;
    if(/^[-+]?\d+(?:\.\d+)?$/.test(raw))return Math.round(Number(raw)*100);
    const lastComma=raw.lastIndexOf(','),lastDot=raw.lastIndexOf('.');
    if(lastComma>=0&&lastDot>=0){
      raw=lastComma>lastDot?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
    }else if(lastComma>=0){raw=raw.replace(/\./g,'').replace(',','.');}
    const amount=Number(raw);
    return Number.isFinite(amount)?Math.round(amount*100):0;
  }

  function referenceDate(){
    try{return global.financialContextSnapshot?.({months:3})?.referenceDate||new Date().toISOString().slice(0,10)}catch(error){return new Date().toISOString().slice(0,10)}
  }

  function addDays(date,days){
    const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return date;
    const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+Number(days||0),12));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }

  function debts(){try{return safeArray(typeof state!=='undefined'?state.debts:null)}catch(error){return []}}
  function goals(){try{return safeArray(typeof state!=='undefined'?state.goals:null)}catch(error){return []}}
  function goalCurrent(goal){try{return typeof global.goalBalance==='function'?Math.round(global.goalBalance(goal)*100):0}catch(error){return 0}}
  function debtMonthlyRateValue(debt){
    try{if(typeof global.debtMonthlyRate==='function')return Number(global.debtMonthlyRate(debt?.rate,debt?.ratePeriod))||0}catch(error){}
    const rate=Math.max(0,Number(debt?.rate)||0)/100,period=debt?.ratePeriod||'monthly';
    if(period==='annual')return Math.pow(1+rate,1/12)-1;
    if(period==='daily')return Math.pow(1+rate,30)-1;
    return rate;
  }

  function ensureStyles(){
    if(typeof document==='undefined'||document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      .what-if-panel{margin-bottom:12px;overflow:hidden}.what-if-panel .what-if-head{align-items:flex-start}.what-if-panel .what-if-badge{white-space:nowrap}
      .what-if-layout{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:12px}.what-if-form,.what-if-result{min-width:0}
      .what-if-form{display:grid;gap:10px}.what-if-form .two{margin:0}.what-if-help{font-size:11px;color:var(--color-text-secondary);line-height:1.45;margin:0}
      .what-if-result{border:1px solid var(--color-border);border-radius:14px;padding:12px;background:rgba(4,13,23,.32);display:grid;gap:10px}
      .what-if-result[hidden]{display:none}.what-if-compare{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:stretch}.what-if-arrow{align-self:center;color:var(--color-text-secondary);font-weight:800}
      .what-if-side{border:1px solid var(--color-border);border-radius:12px;padding:10px;display:grid;gap:3px}.what-if-side small{color:var(--color-text-secondary)}.what-if-side strong{font-size:18px}.what-if-side em{font-size:10px;font-style:normal;color:var(--color-text-secondary)}
      .what-if-delta{display:flex;gap:6px;flex-wrap:wrap}.what-if-delta span{border:1px solid var(--color-border);border-radius:999px;padding:5px 8px;font-size:10px;background:var(--color-surface-subtle)}
      .what-if-detail{font-size:11px;line-height:1.55;color:var(--color-text-secondary)}.what-if-detail b{color:var(--color-text)}.what-if-error{border-color:var(--color-negative-border);color:var(--color-negative)}
      @media(max-width:760px){.what-if-layout{grid-template-columns:1fr}.what-if-compare{grid-template-columns:1fr}.what-if-arrow{text-align:center;transform:rotate(90deg)}.what-if-result{padding:10px}}
    `;document.head.appendChild(style);
  }

  function panelMarkup(){
    return `<article class="panel what-if-panel" id="${PANEL_ID}"><div class="head what-if-head"><div><h2>E se?</h2><p>Teste uma decisão antes de mexer no seu dinheiro real</p></div><span class="badge what-if-badge">simulação · não salva</span></div><div class="what-if-layout"><div class="what-if-form"><label>Cenário<select id="whatIfType"><option value="spend_now">Gastar agora</option><option value="installment_purchase">Comprar parcelado</option><option value="monthly_saving">Guardar todo mês</option><option value="debt_amortization">Amortizar uma dívida</option></select></label><div id="whatIfFields"></div><p class="what-if-help">A simulação parte do Local Financial Core e não cria lançamento, parcela, meta, dívida ou alteração de saldo.</p><button type="button" class="btn wide" id="whatIfRun">Simular cenário</button></div><div class="what-if-result" id="whatIfResult" hidden aria-live="polite"></div></div></article>`;
  }

  function debtOptions(){
    const items=debts();return `<option value="">Cenário manual</option>${items.map(d=>`<option value="${esc(d.id)}">${esc(d.name||'Dívida')} · ${esc(money(Math.round((Number(d.balance)||0)*100)))}</option>`).join('')}`;
  }
  function goalOptions(){
    const items=goals();return `<option value="">Sem meta específica</option>${items.map(g=>`<option value="${esc(g.id)}">${esc(g.name||'Meta')}</option>`).join('')}`;
  }

  function renderFields(){
    const host=q('#whatIfFields'),type=q('#whatIfType')?.value;if(!host)return;
    const ref=referenceDate();
    if(type==='spend_now'){
      host.innerHTML=`<div class="two"><label>Valor<input id="whatIfAmount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0,00"></label><label>Data<input id="whatIfDate" type="date" value="${esc(ref)}"></label></div>`;
    }else if(type==='installment_purchase'){
      host.innerHTML=`<label>Valor total<input id="whatIfTotal" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0,00"></label><div class="two"><label>Parcelas<input id="whatIfInstallments" type="number" min="1" max="120" step="1" value="3"></label><label>1º vencimento<input id="whatIfFirstDue" type="date" value="${esc(addDays(ref,10))}"></label></div>`;
    }else if(type==='monthly_saving'){
      host.innerHTML=`<label>Meta opcional<select id="whatIfGoal">${goalOptions()}</select></label><div class="two"><label>Guardar por mês<input id="whatIfMonthly" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0,00"></label><label>Por quantos meses<input id="whatIfMonths" type="number" min="1" max="600" step="1" value="12"></label></div><label>Início<input id="whatIfStart" type="date" value="${esc(ref)}"></label>`;
    }else{
      host.innerHTML=`<label>Dívida<select id="whatIfDebt">${debtOptions()}</select></label><label>Amortização extra<input id="whatIfDebtAmount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0,00"></label><div class="two"><label>Saldo devedor<input id="whatIfDebtBalance" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0,00"></label><label>Parcela atual<input id="whatIfDebtPayment" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0,00"></label></div><label>Juros equivalentes a.m. % <input id="whatIfDebtRate" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0,00"></label>`;
      q('#whatIfDebt')?.addEventListener('change',syncDebtFields);
    }
    if(typeof global.enhanceAll==='function'){try{global.enhanceAll()}catch(error){}}
  }

  function syncDebtFields(){
    const id=q('#whatIfDebt')?.value;if(!id)return;
    const debt=debts().find(d=>String(d.id)===String(id));if(!debt)return;
    const balance=q('#whatIfDebtBalance'),payment=q('#whatIfDebtPayment'),rate=q('#whatIfDebtRate');
    if(balance)balance.value=Number(debt.balance||0).toFixed(2);
    if(payment)payment.value=Number(debt.payment||0).toFixed(2);
    if(rate)rate.value=(debtMonthlyRateValue(debt)*100).toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
  }

  function positiveCents(selector,label){const amount=parseBRLCents(q(selector)?.value);if(amount<=0)throw new Error(`Informe ${label}.`);return amount;}
  function integerValue(selector,label,min=1,max=9999){const value=Math.trunc(Number(q(selector)?.value));if(!Number.isFinite(value)||value<min||value>max)throw new Error(`Informe ${label}.`);return value;}

  function buildScenario(){
    const type=q('#whatIfType')?.value,ref=referenceDate();
    if(type==='spend_now')return {type,amountCents:positiveCents('#whatIfAmount','um valor maior que zero'),date:q('#whatIfDate')?.value||ref};
    if(type==='installment_purchase')return {type,totalCents:positiveCents('#whatIfTotal','o valor total'),installments:integerValue('#whatIfInstallments','a quantidade de parcelas',1,120),firstDueDate:q('#whatIfFirstDue')?.value||null};
    if(type==='monthly_saving'){
      const id=q('#whatIfGoal')?.value,goal=goals().find(g=>String(g.id)===String(id));
      return {type,amountCents:positiveCents('#whatIfMonthly','o valor mensal'),months:integerValue('#whatIfMonths','a quantidade de meses',1,600),startDate:q('#whatIfStart')?.value||ref,goalId:goal?.id??null,currentGoalCents:goal?goalCurrent(goal):0,targetGoalCents:goal?.target!=null?Math.round(Number(goal.target)*100):null};
    }
    const selected=q('#whatIfDebt')?.value,debtItem=debts().find(d=>String(d.id)===String(selected));
    const balance=positiveCents('#whatIfDebtBalance','o saldo devedor'),payment=parseBRLCents(q('#whatIfDebtPayment')?.value),ratePct=Math.max(0,Number(String(q('#whatIfDebtRate')?.value||'0').replace(',','.'))||0);
    return {type:'debt_amortization',amountCents:positiveCents('#whatIfDebtAmount','a amortização extra'),date:ref,debt:{id:debtItem?.id??null,balanceCents:balance,paymentCents:Math.max(0,payment),monthlyRate:ratePct/100}};
  }

  function scenarioDetail(report){
    if(report.installmentImpact){const i=report.installmentImpact;return `<b>Parcelamento:</b> ${i.installments}x, de ${datePt(i.firstDueDate)} até ${datePt(i.lastDueDate)}. A soma das parcelas permanece exatamente ${money(i.sumCents)}.`;}
    if(report.goalImpact){const g=report.goalImpact;return `<b>Meta:</b> aportes somam ${money(g.totalContributionCents)} e levam o acumulado simulado a ${money(g.projectedCents)}.${g.targetCents!=null?` Faltariam ${money(g.remainingAfterCents)} para o objetivo.`:''}`;}
    if(report.debtImpact){const d=report.debtImpact;const estimate=d.interestSavedCents!=null?` Economia estimada de juros: ${money(d.interestSavedCents)}${d.monthsSaved!=null?` e ${d.monthsSaved} mês(es)`:''}.`:' Juros/prazo não foram estimados porque o contrato informado não é suficiente.';return `<b>Dívida:</b> saldo cairia de ${money(d.balanceBeforeCents)} para ${money(d.balanceAfterCents)}.${estimate}`;}
    return '<b>Gasto imediato:</b> o valor é retirado do caixa no cenário e propagado por toda a trajetória projetada.';
  }

  function renderReport(report){
    const root=q('#whatIfResult');if(!root)return;
    const base=report.baseline,sim=report.simulated,worst=sim.worstProjection;
    const freeDelta=report.delta.freeCents,availableDelta=report.delta.availableCents;
    const risk=Boolean(worst?.negativeRisk),riskText=risk?`Risco: saldo pode chegar a ${money(worst?.minBalanceCents)}${worst?.minDate?` em ${datePt(worst.minDate)}`:''}.`:`Sem saldo negativo nos horizontes conhecidos deste snapshot.`;
    root.classList.remove('what-if-error');root.hidden=false;root.setAttribute('data-money','');
    root.innerHTML=`<div class="what-if-compare"><div class="what-if-side"><small>Antes</small><strong>${money(base.freeCents)}</strong><em>livre conhecido</em></div><div class="what-if-arrow">→</div><div class="what-if-side"><small>Depois</small><strong>${money(sim.freeCents)}</strong><em>livre no cenário</em></div></div><div class="what-if-delta"><span>Caixa ${availableDelta>=0?'+':''}${money(availableDelta)}</span><span>Livre ${freeDelta>=0?'+':''}${money(freeDelta)}</span><span>${risk?'⚠️ risco de caixa':'✓ trajetória sem negativo conhecido'}</span></div><div class="what-if-detail">${scenarioDetail(report)}<br><br><b>Leitura:</b> ${riskText}<br><br><small>Projeção condicional. Nada foi salvo e o SFP não inventou renda, margem de segurança ou eventos futuros.</small></div>`;
    if(typeof global.applyPrivacy==='function')global.applyPrivacy();
  }

  function renderError(error){const root=q('#whatIfResult');if(!root)return;root.hidden=false;root.removeAttribute('data-money');root.classList.add('what-if-error');root.innerHTML=`<b>Não consegui simular esse cenário.</b><div class="what-if-detail">${esc(error?.message||'Revise os dados informados.')}</div>`;}

  function run(){
    try{
      if(typeof global.financialContextSnapshot!=='function'||!global.SFPWhatIf?.simulate)throw new Error('Motor de planejamento ainda não está disponível.');
      const snapshot=global.financialContextSnapshot({months:3}),scenario=buildScenario();
      lastReport=global.SFPWhatIf.simulate({snapshot,scenario});renderReport(lastReport);return lastReport;
    }catch(error){lastReport=null;renderError(error);return null;}
  }

  function install(){
    if(typeof document==='undefined')return null;ensureStyles();const section=document.getElementById('simuladores');if(!section)return null;
    let panel=document.getElementById(PANEL_ID);if(!panel){section.insertAdjacentHTML('afterbegin',panelMarkup());panel=document.getElementById(PANEL_ID);}
    q('#whatIfType')?.addEventListener('change',()=>{lastReport=null;const result=q('#whatIfResult');if(result)result.hidden=true;renderFields();});
    q('#whatIfRun')?.addEventListener('click',run);renderFields();return panel;
  }

  global.SFPWhatIfUI=Object.freeze({version:VERSION,install,run,getLastReport:()=>lastReport,parseBRLCents});
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else queueMicrotask(install);
  }
})(typeof window!=='undefined'?window:globalThis);
