(function installRecurringIncomePlan(global){
  'use strict';

  const VERSION=2;
  const INSTALL_FLAG='__SFP_RECURRING_INCOME_PLAN_V2';
  if(global[INSTALL_FLAG])return;
  global[INSTALL_FLAG]=true;

  const clean=value=>value==null?'':String(value).trim();
  const sameId=(a,b)=>String(a)===String(b);
  const round2=value=>Math.round(Number(value||0)*100)/100;
  const validMonth=value=>/^\d{4}-\d{2}$/.test(clean(value));
  const escapeHtml=value=>{
    if(typeof global.sfpEsc==='function')return global.sfpEsc(value);
    return clean(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  };
  const money=value=>{
    if(typeof global.brl==='function')return global.brl(Number(value)||0);
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
  };

  function uid(){
    if(typeof global.uid==='function')return global.uid();
    return Date.now()+Math.floor(Math.random()*1000000);
  }

  function ensureState(){
    const state=global.state;
    if(!state)return null;
    if(!Array.isArray(state.recurring))state.recurring=[];
    if(!Array.isArray(state.transactions))state.transactions=[];
    if(!Array.isArray(state.recurringGroups))state.recurringGroups=[];
    return state;
  }

  function parseBlockedDates(value){
    const raw=Array.isArray(value)?value:String(value||'').split(/[\s,;]+/);
    return[...new Set(raw.map(clean).filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item)))].sort();
  }

  function normalizeInput(input={}){
    const desc=clean(input.desc)||'Salário';
    const targetAmount=round2(input.targetAmount);
    const accountId=Number(input.accountId)||0;
    const start=clean(input.start);
    const end=clean(input.end);
    const firstAmount=round2(input.firstAmount);
    const secondAmount=round2(input.secondAmount);
    const payrollBlockedDates=parseBlockedDates(input.payrollBlockedDates);
    const errors=[];

    if(!(targetAmount>0))errors.push('Informe um salário mensal maior que zero.');
    if(!(firstAmount>0)||!(secondAmount>0))errors.push('As duas entradas precisam ter valor maior que zero.');
    if(Math.abs(round2(firstAmount+secondAmount)-targetAmount)>.01)errors.push('A soma das duas entradas precisa ser igual ao salário mensal planejado.');
    if(!accountId)errors.push('Escolha a conta que recebe o salário.');
    if(!validMonth(start))errors.push('Informe o mês inicial do plano.');
    if(end&&(!validMonth(end)||end<start))errors.push('O término do plano não pode ser anterior ao início.');

    return{
      ok:errors.length===0,
      errors,
      value:{desc,targetAmount,accountId,start,end,firstAmount,secondAmount,payrollBlockedDates}
    };
  }

  function payrollPatch(partKey,blockedDates=[]){
    return partKey==='first'
      ?{dateRule:'salary-company-advance',payrollBase:'previous-month-end',payrollAnchor:1,payrollBlockedDates:[...blockedDates]}
      :{dateRule:'salary-company-advance',payrollBase:'day',payrollAnchor:15,payrollBlockedDates:[...blockedDates]};
  }

  function childRule(old,plan,partKey,label,amount,active){
    const base=old||{},day=partKey==='first'?1:15;
    return{
      ...base,
      id:base.id||uid(),
      active:active!==false,
      type:'income',
      desc:`${plan.desc} — ${label}`,
      amount:round2(amount),
      day,
      category:'Salário',
      accountId:plan.accountId,
      start:plan.start,
      end:plan.end,
      skips:Array.isArray(base.skips)?base.skips:[],
      ...payrollPatch(partKey,plan.payrollBlockedDates),
      recurringGroupId:plan.id,
      recurringPartKey:partKey,
      recurringGroupTarget:plan.targetAmount
    };
  }

  function upsert(input={}){
    const state=ensureState();
    if(!state)return{ok:false,errors:['O estado do SFP ainda não está disponível.']};
    const normalized=normalizeInput(input);
    if(!normalized.ok)return normalized;
    const data=normalized.value;
    const existing=input.id?state.recurringGroups.find(item=>sameId(item?.id,input.id)):null;
    const groupId=existing?.id||uid();
    const active=input.active==null?(existing?.active!==false):input.active!==false;
    const plan={
      ...(existing||{}),
      id:groupId,
      kind:'income-split',
      type:'income',
      desc:data.desc,
      category:'Salário',
      targetAmount:data.targetAmount,
      accountId:data.accountId,
      start:data.start,
      end:data.end,
      active,
      payrollRule:'advance-blocked-payday',
      payrollBlockedDates:[...data.payrollBlockedDates],
      updatedAt:new Date().toISOString(),
      createdAt:existing?.createdAt||new Date().toISOString()
    };

    const previousIds=Array.isArray(existing?.memberRecurringIds)?existing.memberRecurringIds:[];
    const oldFirst=state.recurring.find(item=>sameId(item?.id,previousIds[0])||sameId(item?.recurringGroupId,groupId)&&item?.recurringPartKey==='first');
    const oldSecond=state.recurring.find(item=>sameId(item?.id,previousIds[1])||sameId(item?.recurringGroupId,groupId)&&item?.recurringPartKey==='second');
    const first=childRule(oldFirst,plan,'first','1ª quinzena',data.firstAmount,active);
    const second=childRule(oldSecond,plan,'second','2ª quinzena',data.secondAmount,active);
    plan.memberRecurringIds=[first.id,second.id];

    const childIds=new Set(plan.memberRecurringIds.map(String));
    state.recurring=state.recurring.filter(item=>!childIds.has(String(item?.id))&&!sameId(item?.recurringGroupId,groupId));
    state.recurring.push(first,second);
    if(existing)state.recurringGroups=state.recurringGroups.map(item=>sameId(item?.id,groupId)?plan:item);
    else state.recurringGroups.push(plan);

    return{ok:true,plan,children:[first,second]};
  }

  function ruleActiveForMonth(rule,month){
    return Boolean(rule?.active&&rule.start<=month&&(!rule.end||rule.end>=month)&&!(rule.skips||[]).includes(month));
  }

  function occurrenceMonth(transaction){
    try{if(typeof global.recurringOccurrenceMonthForTransaction==='function')return global.recurringOccurrenceMonthForTransaction(transaction)}catch(_){}
    return transaction?.recurrenceMonth||clean(transaction?.date).slice(0,7);
  }

  function transactionForRuleMonth(state,rule,month){
    return(state.transactions||[]).find(item=>sameId(item?.recurringId,rule?.id)&&occurrenceMonth(item)===month&&item?.status!=='cancelled')||null;
  }

  function summary(planOrId,month){
    const state=ensureState();
    if(!state)return null;
    const plan=typeof planOrId==='object'?planOrId:state.recurringGroups.find(item=>sameId(item?.id,planOrId));
    if(!plan)return null;
    const target=round2(plan.targetAmount);
    const members=(plan.memberRecurringIds||[]).map(id=>state.recurring.find(item=>sameId(item?.id,id))).filter(Boolean);
    let planned=0,realized=0,remaining=0,fulfilled=0;
    const parts=members.map(rule=>{
      const applicable=ruleActiveForMonth(rule,month);
      const tx=applicable?transactionForRuleMonth(state,rule,month):null;
      const plannedAmount=round2(tx?.plannedAmount??rule.amount);
      const actualAmount=tx?round2(tx.amount):0;
      if(applicable)planned=round2(planned+plannedAmount);
      if(tx){realized=round2(realized+actualAmount);fulfilled++}
      else if(applicable)remaining=round2(remaining+round2(rule.amount));
      return{
        recurringId:rule.id,
        partKey:rule.recurringPartKey||'',
        desc:rule.desc,
        day:rule.day,
        expectedDate:applicable&&typeof global.recurringDateForMonth==='function'?global.recurringDateForMonth(rule,month):null,
        applicable,
        plannedAmount,
        actualAmount,
        realized:Boolean(tx),
        actualDate:tx?.date||null
      };
    });
    return{
      planId:plan.id,
      month,
      targetAmount:target,
      plannedAmount:planned,
      realizedAmount:realized,
      remainingAmount:remaining,
      projectedAmount:round2(realized+remaining),
      varianceToTarget:round2(realized+remaining-target),
      fulfilledParts:fulfilled,
      totalParts:members.filter(rule=>ruleActiveForMonth(rule,month)).length,
      complete:members.length>0&&members.filter(rule=>ruleActiveForMonth(rule,month)).every(rule=>Boolean(transactionForRuleMonth(state,rule,month))),
      parts
    };
  }

  function toggle(id){
    const state=ensureState();if(!state)return false;
    const plan=state.recurringGroups.find(item=>sameId(item?.id,id));if(!plan)return false;
    plan.active=plan.active===false;
    for(const rule of state.recurring)if(sameId(rule?.recurringGroupId,plan.id))rule.active=plan.active;
    plan.updatedAt=new Date().toISOString();
    return true;
  }

  function skipMonth(id,month){
    const state=ensureState();if(!state||!validMonth(month))return false;
    const plan=state.recurringGroups.find(item=>sameId(item?.id,id));if(!plan)return false;
    for(const rule of state.recurring){
      if(!sameId(rule?.recurringGroupId,plan.id))continue;
      rule.skips=Array.isArray(rule.skips)?rule.skips:[];
      if(!rule.skips.includes(month))rule.skips.push(month);
    }
    plan.updatedAt=new Date().toISOString();
    return true;
  }

  function remove(id){
    const state=ensureState();if(!state)return false;
    const plan=state.recurringGroups.find(item=>sameId(item?.id,id));if(!plan)return false;
    const children=state.recurring.filter(item=>sameId(item?.recurringGroupId,plan.id));
    if(typeof global.moveToTrash==='function'){
      try{global.moveToTrash('recurringGroup',plan)}catch(_){}
      for(const child of children){try{global.moveToTrash('recurring',child)}catch(_){}}
    }
    state.recurring=state.recurring.filter(item=>!sameId(item?.recurringGroupId,plan.id));
    state.recurringGroups=state.recurringGroups.filter(item=>!sameId(item?.id,plan.id));
    return true;
  }

  async function persist(reason){
    if(typeof global.save==='function')await global.save(reason);
    else if(typeof global.renderAll==='function')global.renderAll();
    render();
  }

  function accountOptions(selected){
    const state=ensureState();
    return(state?.accounts||[]).map(account=>`<option value="${escapeHtml(account.id)}" ${sameId(account.id,selected)?'selected':''}>${escapeHtml(account.name||'Conta')}</option>`).join('');
  }

  function editData(plan){
    const state=ensureState();
    const children=(plan?.memberRecurringIds||[]).map(id=>state?.recurring?.find(item=>sameId(item?.id,id))).filter(Boolean);
    const first=children.find(item=>item.recurringPartKey==='first')||children[0]||{};
    const second=children.find(item=>item.recurringPartKey==='second')||children[1]||{};
    return{first,second};
  }

  function openForm(id){
    const state=ensureState();if(!state)return;
    const plan=id?state.recurringGroups.find(item=>sameId(item?.id,id)):null;
    const {first,second}=editData(plan||{});
    const currentMonth=clean(state.mesAtual)||new Date().toISOString().slice(0,7);
    const body=`<form id="salaryIncomePlanForm">
      <input id="salaryPlanId" type="hidden" value="${escapeHtml(plan?.id||'')}"/>
      <label>Descrição<input id="salaryPlanDesc" required value="${escapeHtml(plan?.desc||'Salário')}"/></label>
      <div class="two">
        <label>Salário mensal planejado<input id="salaryPlanTarget" type="number" step="0.01" min="0.01" required value="${escapeHtml(plan?.targetAmount||'')}"/></label>
        <label>Conta<select id="salaryPlanAccount" required>${accountOptions(plan?.accountId||'')}</select></label>
      </div>
      <div class="two">
        <label>Começa em<input id="salaryPlanStart" type="month" required value="${escapeHtml(plan?.start||currentMonth)}"/></label>
        <label>Termina em<input id="salaryPlanEnd" type="month" value="${escapeHtml(plan?.end||'')}"/></label>
      </div>
      <div class="note">Regra da folha: 1ª quinzena no fim do mês anterior (referência dia 1) e 2ª quinzena no dia 15. Se a data cair em sábado, domingo, segunda ou feriado, o SFP antecipa até a data permitida anterior.</div>
      <div class="two">
        <div><label>1ª quinzena — valor<input id="salaryPlanFirstAmount" type="number" step="0.01" min="0.01" required value="${escapeHtml(first.amount||'')}"/></label><small class="field-help">Pagamento-base: último dia do mês anterior.</small></div>
        <div><label>2ª quinzena — valor<input id="salaryPlanSecondAmount" type="number" step="0.01" min="0.01" required value="${escapeHtml(second.amount||'')}"/></label><small class="field-help">Pagamento-base: dia 15.</small></div>
      </div>
      <label>Feriados / dias sem pagamento adicionais<input id="salaryPlanBlockedDates" placeholder="2026-11-23, 2026-12-24" value="${escapeHtml((plan?.payrollBlockedDates||[]).join(', '))}"/><small class="field-help">Opcional. Feriados nacionais fixos já são considerados; adicione aqui datas estaduais, municipais ou internas da empresa.</small></label>
      <button class="btn wide" type="submit">${plan?'Salvar plano':'Criar plano'}</button>
    </form>`;

    if(typeof global.showDetail!=='function')return;
    global.showDetail(plan?'Editar salário dividido':'Planejar salário dividido','Total mensal sem dupla contagem; cada quinzena continua sendo uma entrada real.',body);
    const form=document.getElementById('salaryIncomePlanForm');
    if(!form)return;
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const result=upsert({
        id:document.getElementById('salaryPlanId')?.value||null,
        desc:document.getElementById('salaryPlanDesc')?.value,
        targetAmount:document.getElementById('salaryPlanTarget')?.value,
        accountId:document.getElementById('salaryPlanAccount')?.value,
        start:document.getElementById('salaryPlanStart')?.value,
        end:document.getElementById('salaryPlanEnd')?.value,
        firstAmount:document.getElementById('salaryPlanFirstAmount')?.value,
        secondAmount:document.getElementById('salaryPlanSecondAmount')?.value,
        payrollBlockedDates:document.getElementById('salaryPlanBlockedDates')?.value
      });
      if(!result.ok){
        if(typeof global.toast==='function')global.toast(result.errors[0]||'Revise o plano salarial.','warning');
        return;
      }
      if(typeof global.closeProgressive==='function')global.closeProgressive(false);
      await persist(plan?'Editar plano salarial':'Novo plano salarial');
      if(typeof global.toast==='function')global.toast(plan?'Plano salarial atualizado.':'Plano salarial criado sem duplicar a receita mensal.','success');
    });
  }

  function render(){
    const state=ensureState();
    const section=document.getElementById('recIncomePlans');
    if(!state||!section)return;
    const list=section.querySelector('[data-income-plan-list]');if(!list)return;
    const plans=state.recurringGroups.filter(item=>item?.kind==='income-split');
    if(!plans.length){list.innerHTML='<div class="item"><span>Nenhum salário dividido cadastrado.</span></div>';return;}
    const month=clean(state.mesAtual)||new Date().toISOString().slice(0,7);
    list.innerHTML=plans.map(plan=>{
      const info=summary(plan,month)||{};
      const parts=(info.parts||[]).map(part=>`<span>${escapeHtml(part.partKey==='second'?'2ª':'1ª')} • ${money(part.realized?part.actualAmount:part.plannedAmount)} • ${part.realized?`recebido ${escapeHtml(part.actualDate||'')}`:`previsto ${escapeHtml(part.expectedDate||'')}`}</span>`).join(' · ');
      const status=plan.active===false?'pausado':info.complete?'realizado':'em andamento';
      return`<div class="item" data-income-plan-id="${escapeHtml(plan.id)}"><div style="flex:1"><b>${escapeHtml(plan.desc)}</b><small>Alvo ${money(info.targetAmount)} • realizado ${money(info.realizedAmount)} • a receber ${money(info.remainingAmount)} • projeção ${money(info.projectedAmount)} • ${escapeHtml(status)}</small><small>${parts}</small></div><div class="actions"><button class="btn2 tiny" data-plan-action="edit">Editar</button><button class="btn2 tiny" data-plan-action="toggle">${plan.active===false?'Ativar':'Pausar'}</button><button class="btn2 tiny" data-plan-action="skip">Pular ${escapeHtml(month)}</button><button class="danger tiny" data-plan-action="remove">Excluir</button></div></div>`;
    }).join('');
  }

  function installUi(){
    if(typeof document==='undefined')return;
    const state=ensureState();
    const root=document.getElementById('recorrencias');
    if(!state||!root||typeof global.showDetail!=='function'){setTimeout(installUi,50);return;}
    if(!document.getElementById('recIncomePlans')){
      const grid=root.querySelector('.grid2');
      const section=document.createElement('article');
      section.id='recIncomePlans';
      section.className='panel';
      section.innerHTML='<div class="head"><div><h2>Salário dividido</h2><p>O total mensal é referência; as quinzenas são as entradas que realmente movimentam o caixa.</p></div><button class="btn compact" type="button" data-income-plan-new>+ Planejar salário</button></div><div class="list" data-income-plan-list></div>';
      if(grid)root.insertBefore(section,grid);else root.appendChild(section);
      section.querySelector('[data-income-plan-new]')?.addEventListener('click',()=>openForm());
      section.addEventListener('click',async event=>{
        const button=event.target.closest('[data-plan-action]');if(!button)return;
        const row=button.closest('[data-income-plan-id]');const id=row?.dataset.incomePlanId;if(!id)return;
        const action=button.dataset.planAction;
        if(action==='edit'){openForm(id);return}
        if(action==='toggle'){if(toggle(id))await persist('Alterar plano salarial');return}
        if(action==='skip'){if(skipMonth(id,clean(global.state?.mesAtual)))await persist('Pular plano salarial');return}
        if(action==='remove'){
          let confirmed=true;
          if(typeof global.sfpConfirm==='function')confirmed=await global.sfpConfirm({title:'Excluir plano salarial',message:'Excluir o plano e as duas previsões quinzenais futuras? Os recebimentos já realizados permanecem no histórico.',confirmText:'Excluir',cancelText:'Cancelar',danger:true});
          if(confirmed&&remove(id))await persist('Excluir plano salarial');
        }
      });
    }
    render();

    if(typeof global.renderAll==='function'&&!global.renderAll.__sfpIncomePlanWrapped){
      const original=global.renderAll;
      const wrapped=function(...args){const result=original.apply(this,args);try{render()}catch(error){console.error('SFP income plan render:',error)}return result};
      Object.defineProperty(wrapped,'__sfpIncomePlanWrapped',{value:true});
      Object.defineProperty(wrapped,'__sfpOriginalRenderAll',{value:original});
      global.renderAll=wrapped;
    }
  }

  global.SFPRecurringIncomePlan=Object.freeze({
    version:VERSION,
    ensureState,
    normalizeInput,
    upsert,
    summary,
    toggle,
    skipMonth,
    remove,
    openForm,
    render
  });

  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUi,{once:true});
    else installUi();
  }
})(typeof window!=='undefined'?window:globalThis);
