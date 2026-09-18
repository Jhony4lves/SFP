(function loadRecurringIncomePlanCore(global){
  'use strict';

  /* Core contract: aggregate kind:'income-split' owns memberRecurringIds; only child recurrences enter cash flow. */
  const CORE_SRC='recurring-income-plan-core.js';
  const GUARD_FLAG='__SFP_RECURRING_INCOME_PLAN_CHILD_GUARDS_V1';
  const TRASH_GUARD_FLAG='__SFP_RECURRING_INCOME_PLAN_TRASH_GUARD_V1';
  const COPY_GUARD_FLAG='__SFP_RECURRING_INCOME_PLAN_COPY_GUARD_V1';

  const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
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
    if(!global.SFPRecurringIncomePlan){setTimeout(installChildGuards,50);return;}
    const required=['toggleRec','skipRec','removeRec','editRec'];
    if(required.some(name=>typeof global[name]!=='function')){setTimeout(installChildGuards,50);return;}
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

  function groupIdForTrashEntry(entry){
    if(entry?.type==='recurringGroup')return entry.item?.id??null;
    if(entry?.type==='recurring'&&entry.item?.recurringGroupId!=null)return entry.item.recurringGroupId;
    return null;
  }

  function reconstructGroup(groupId,children){
    const first=children.find(item=>item?.recurringPartKey==='first')||children[0];
    if(!first)return null;
    const memberRecurringIds=children.map(item=>item.id);
    const desc=String(first.desc||'Salário').replace(/\s+—\s+(?:1ª|2ª)\s+quinzena\s*$/i,'').trim()||'Salário';
    return{
      id:groupId,
      kind:'income-split',
      type:'income',
      desc,
      category:'Salário',
      targetAmount:Number(first.recurringGroupTarget)||children.reduce((sum,item)=>sum+(Number(item.amount)||0),0),
      accountId:first.accountId,
      start:first.start,
      end:first.end||'',
      active:children.some(item=>item.active!==false),
      memberRecurringIds,
      reconstructedFromTrash:true,
      updatedAt:new Date().toISOString(),
      createdAt:new Date().toISOString()
    };
  }

  async function restorePlanBundle(groupId){
    const state=global.state;
    if(!state||!Array.isArray(state.trash))return false;
    if(!Array.isArray(state.recurring))state.recurring=[];
    if(!Array.isArray(state.recurringGroups))state.recurringGroups=[];

    const bundled=state.trash.filter(entry=>sameId(groupIdForTrashEntry(entry),groupId));
    const groupEntry=bundled.find(entry=>entry.type==='recurringGroup');
    const childEntries=bundled.filter(entry=>entry.type==='recurring');
    const children=childEntries.map(entry=>copy(entry.item)).filter(Boolean);
    let group=groupEntry?.item?copy(groupEntry.item):state.recurringGroups.find(item=>sameId(item?.id,groupId));
    if(!group)group=reconstructGroup(groupId,children);
    if(!group)return false;

    if(!state.recurringGroups.some(item=>sameId(item?.id,group.id)))state.recurringGroups.push(group);
    for(const child of children){
      if(!state.recurring.some(item=>sameId(item?.id,child.id)))state.recurring.push(child);
    }
    const bundleSet=new Set(bundled);
    state.trash=state.trash.filter(entry=>!bundleSet.has(entry));

    if(typeof global.save==='function')await global.save('Restaurar plano salarial da lixeira');
    else if(typeof global.renderAll==='function')global.renderAll();
    if(typeof global.toast==='function')global.toast('Plano salarial e suas quinzenas foram restaurados juntos.','success');
    return true;
  }

  function installTrashRestoreGuard(){
    if(global[TRASH_GUARD_FLAG]||typeof document==='undefined')return;
    global[TRASH_GUARD_FLAG]=true;
    document.addEventListener('click',async event=>{
      const target=event.target instanceof Element?event.target.closest('[data-restore]'):null;
      if(!target)return;
      const index=Number(target.dataset.restore);
      const entry=global.state?.trash?.[index];
      const groupId=groupIdForTrashEntry(entry);
      if(groupId==null)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const restored=await restorePlanBundle(groupId);
      if(restored&&typeof global.showTrash==='function')global.showTrash();
    },true);
  }

  function clarifyNetIncomeCopy(){
    const input=document.getElementById('salaryPlanTarget');
    const form=document.getElementById('salaryIncomePlanForm');
    if(!input||!form)return;
    const targetLabel='Total líquido planejado no mês';
    const targetNote='O total líquido mensal é uma referência de caixa. Somente as duas entradas abaixo movimentam o saldo e podem ser realizadas pelo Open Finance. Regra da folha: 1ª quinzena no fim do mês anterior e 2ª quinzena no dia 15; sábado, domingo, segunda ou feriado antecipam o pagamento.';
    const label=input.closest('label');
    if(label){
      const textNode=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
      if(textNode&&textNode.nodeValue!==targetLabel)textNode.nodeValue=targetLabel;
    }
    const note=form.querySelector('.note');
    if(note&&note.textContent!==targetNote)note.textContent=targetNote;
  }

  function alignIncomePlanLayout(){
    if(typeof document==='undefined')return;
    const root=document.getElementById('recorrencias');
    const grid=root?.querySelector('.grid2');
    const section=document.getElementById('recIncomePlans');
    if(!root||!grid||!section){setTimeout(alignIncomePlanLayout,50);return;}
    if(section.parentElement!==grid)grid.appendChild(section);
    section.style.gridColumn='1 / -1';
    section.style.order='-1';
  }

  function installCopyGuard(){
    if(global[COPY_GUARD_FLAG]||typeof document==='undefined')return;
    global[COPY_GUARD_FLAG]=true;
    const observer=new MutationObserver(()=>{clarifyNetIncomeCopy();alignIncomePlanLayout();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    clarifyNetIncomeCopy();
    alignIncomePlanLayout();
  }

  function installAll(){
    installChildGuards();
    installTrashRestoreGuard();
    installCopyGuard();
    alignIncomePlanLayout();
  }

  function loadCore(){
    if(global.SFPRecurringIncomePlan){installAll();return;}
    if(typeof document==='undefined')return;
    let script=document.querySelector('script[data-sfp-recurring-income-plan-core="1"]');
    if(!script){
      script=document.createElement('script');
      script.src=CORE_SRC;
      script.async=false;
      script.dataset.sfpRecurringIncomePlanCore='1';
      document.head.appendChild(script);
    }
    script.addEventListener('load',installAll,{once:true});
  }

  loadCore();
})(typeof window!=='undefined'?window:globalThis);
