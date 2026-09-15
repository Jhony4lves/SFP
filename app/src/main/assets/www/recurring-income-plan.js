(function loadRecurringIncomePlanCore(global){
  'use strict';

  /* Core contract: aggregate kind:'income-split' owns memberRecurringIds; only child recurrences enter cash flow. */
  const CORE_SRC='recurring-income-plan-core.js';
  const GUARD_FLAG='__SFP_RECURRING_INCOME_PLAN_CHILD_GUARDS_V1';

  function sameId(a,b){return String(a)===String(b)}

  function groupedRule(id){
    const state=global.state;
    if(!state||!Array.isArray(state.recurring))return null;
    const rule=state.recurring.find(item=>sameId(item?.id,id));
    return rule?.recurringGroupId?rule:null;
  }

  function planForRule(rule){
    const groups=Array.isArray(global.state?.recurringGroups)?global.state.recurringGroups:[];
    return groups.find(item=>sameId(item?.id,rule?.recurringGroupId))||null;
  }

  function warn(rule,message){
    const plan=planForRule(rule);
    if(typeof global.toast==='function')global.toast(message||`Essa quinzena pertence ao plano "${plan?.desc||'Salário'}". Altere o plano mensal para manter as duas partes consistentes.`,'warning');
  }

  function installChildGuards(){
    if(global[GUARD_FLAG])return;
    if(!global.SFPRecurringIncomePlan){setTimeout(installChildGuards,0);return;}
    const required=['toggleRec','skipRec','removeRec','editRec'];
    if(required.some(name=>typeof global[name]!=='function')){setTimeout(installChildGuards,0);return;}
    global[GUARD_FLAG]=true;

    const originalEdit=global.editRec;
    const editWrapped=function(id,...args){
      const rule=groupedRule(id);
      if(!rule)return originalEdit.call(this,id,...args);
      const plan=planForRule(rule);
      if(plan&&typeof global.SFPRecurringIncomePlan?.openForm==='function')return global.SFPRecurringIncomePlan.openForm(plan.id);
      warn(rule);
    };
    Object.defineProperty(editWrapped,'__sfpOriginal',{value:originalEdit});
    global.editRec=editWrapped;

    const protect=name=>{
      const original=global[name];
      const wrapped=function(id,...args){
        const rule=groupedRule(id);
        if(!rule)return original.call(this,id,...args);
        warn(rule,name==='removeRec'
          ?'Essa quinzena faz parte de um salário dividido. Exclua ou edite o plano salarial para não deixar o agregado incompleto.'
          :'Essa quinzena faz parte de um salário dividido. Pause ou pule o plano salarial inteiro para manter as duas entradas sincronizadas.');
        return false;
      };
      Object.defineProperty(wrapped,'__sfpOriginal',{value:original});
      global[name]=wrapped;
    };

    protect('toggleRec');
    protect('skipRec');
    protect('removeRec');
  }

  function loadCore(){
    if(global.SFPRecurringIncomePlan){installChildGuards();return;}
    if(typeof document==='undefined')return;
    let script=document.querySelector('script[data-sfp-recurring-income-plan-core="1"]');
    if(!script){
      script=document.createElement('script');
      script.src=CORE_SRC;
      script.async=false;
      script.dataset.sfpRecurringIncomePlanCore='1';
      document.head.appendChild(script);
    }
    script.addEventListener('load',installChildGuards,{once:true});
  }

  loadCore();
})(typeof window!=='undefined'?window:globalThis);
