(function installOpenFinanceRecurringReconcile(global){
  'use strict';

  const VERSION=2;
  const INSTALL_FLAG='__SFP_OPEN_FINANCE_RECURRING_RECONCILE_V2';
  const SAFE_WINDOW_DAYS=3;
  const SYNC_WINDOW_MS=180000;
  let syncWindowUntil=0;
  let lastPreviewResult=null;
  let originalSave=null;
  let originalRenderAll=null;

  const clean=value=>value==null?'':String(value).trim();
  const sameId=(a,b)=>String(a)===String(b);
  const dateOnly=value=>clean(value).slice(0,10);
  const ym=value=>dateOnly(value).slice(0,7);
  const normalize=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function monthAdd(month,delta){
    const match=String(month||'').match(/^(\d{4})-(\d{2})$/);if(!match)return month;
    const date=new Date(Date.UTC(+match[1],+match[2]-1+Number(delta||0),1));
    return`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
  }

  function dayDiff(a,b){
    const aa=new Date(`${dateOnly(a)}T00:00:00Z`),bb=new Date(`${dateOnly(b)}T00:00:00Z`);
    if(Number.isNaN(aa.getTime())||Number.isNaN(bb.getTime()))return Infinity;
    return Math.abs(aa-bb)/86400000;
  }

  function tokens(value){return new Set(normalize(value).split(' ').filter(token=>token.length>2))}

  function descriptionAffinity(a,b){
    const aa=normalize(a),bb=normalize(b);if(!aa||!bb)return 0;
    if(aa===bb)return 3;
    if(aa.includes(bb)||bb.includes(aa))return 2;
    const at=tokens(aa),bt=tokens(bb);let common=0;for(const token of at)if(bt.has(token))common++;
    return common>=2?2:common===1?1:0;
  }

  function activeRulesForMonth(month){
    try{if(typeof global.recurringRulesForMonth==='function')return global.recurringRulesForMonth(month)||[]}catch(_){}
    return (global.state?.recurring||[]).filter(rule=>rule?.active&&rule.start<=month&&(!rule.end||rule.end>=month)&&!(rule.skips||[]).includes(month));
  }

  function recurringDate(rule,month){
    try{if(typeof global.recurringDateForMonth==='function')return global.recurringDateForMonth(rule,month)}catch(_){}
    const day=Math.max(1,Math.min(31,Number(rule?.day)||1));
    const [year,mon]=String(month).split('-').map(Number);
    const last=new Date(Date.UTC(year,mon,0)).getUTCDate();
    return`${month}-${String(Math.min(day,last)).padStart(2,'0')}`;
  }

  function occurrenceMonth(transaction){
    try{if(typeof global.recurringOccurrenceMonthForTransaction==='function')return global.recurringOccurrenceMonthForTransaction(transaction)}catch(_){}
    return transaction?.recurrenceMonth||ym(transaction?.date);
  }

  function isOpenFinanceBankTransaction(transaction){
    if(!transaction||transaction.kind==='transfer'||transaction.recurringId)return false;
    const external=clean(transaction.externalId);
    const tags=Array.isArray(transaction.tags)?transaction.tags:[];
    return transaction.openFinanceProvider==='pluggy'||external.startsWith('pluggy:')||tags.includes('open-finance')||tags.includes('pluggy');
  }

  function semanticMatch(rule,transaction){
    if(descriptionAffinity(rule?.desc,transaction?.desc)>0)return true;
    const ruleCategory=clean(rule?.category),txCategory=clean(transaction?.category);
    return Boolean(ruleCategory&&txCategory&&ruleCategory!=='Outros'&&ruleCategory===txCategory);
  }

  function candidateOccurrences(transaction){
    const state=global.state;if(!state)return[];
    const date=dateOnly(transaction?.date),civilMonth=ym(date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{4}-\d{2}$/.test(civilMonth))return[];
    const months=[civilMonth,monthAdd(civilMonth,-1),monthAdd(civilMonth,1)];
    const out=[];
    for(const month of months){
      for(const rule of activeRulesForMonth(month)){
        if(!sameId(rule?.accountId,transaction?.accountId))continue;
        if(rule?.type!==transaction?.kind)continue;
        if(Math.abs(Math.abs(Number(rule?.amount))-Math.abs(Number(transaction?.amount)))>.011)continue;
        const dueDate=recurringDate(rule,month);
        if(dayDiff(dueDate,date)>SAFE_WINDOW_DAYS)continue;
        if(!semanticMatch(rule,transaction))continue;
        out.push({rule,month,dueDate});
      }
    }
    const unique=[];const seen=new Set();
    for(const row of out){const key=`${row.rule.id}:${row.month}`;if(seen.has(key))continue;seen.add(key);unique.push(row)}
    return unique;
  }

  function externalKeyFromSource(transaction){
    const id=clean(transaction?.id);return id?`pluggy:${id}`:'';
  }

  function externalKeys(transaction){
    const keys=[];
    if(clean(transaction?.externalId))keys.push(clean(transaction.externalId));
    for(const key of Array.isArray(transaction?.openFinanceExternalIds)?transaction.openFinanceExternalIds:[])if(clean(key))keys.push(clean(key));
    return[...new Set(keys)];
  }

  function previewBankRows(){
    const rows=[];
    for(const item of Array.isArray(lastPreviewResult?.items)?lastPreviewResult.items:[]){
      for(const account of Array.isArray(item?.accounts)?item.accounts:[]){
        if(account?.type==='CREDIT')continue;
        for(const transaction of Array.isArray(account?.transactions)?account.transactions:[]){
          const key=externalKeyFromSource(transaction);if(!key)continue;
          rows.push({key,item,account,transaction});
        }
      }
    }
    return rows;
  }

  function mergeTags(a,b){return[...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[]),'recorrente','open-finance','pluggy'])]}

  function copyOpenFinanceMetadata(target,source){
    const keys=['openFinanceProvider','openFinanceAccountId','openFinanceItemId','openFinanceStatus','openFinanceSyncedAt','openFinanceLastLinkedAt'];
    for(const key of keys)if(source?.[key]!=null&&source[key]!=='')target[key]=source[key];
    const ids=[...new Set([...externalKeys(target),...externalKeys(source)])];
    if(ids.length){target.openFinanceExternalIds=ids;if(!clean(target.externalId))target.externalId=ids[0]}
  }

  function recalcBalanceImpact(transaction,date){
    try{if(typeof global.afterAccountSnapshot==='function')return global.afterAccountSnapshot(transaction?.accountId,date)===true}catch(_){}
    return transaction?.balanceImpact;
  }

  function convertToRecurring(transaction,match){
    const {rule,month,dueDate}=match;
    transaction.openFinanceDescription=transaction.openFinanceDescription||transaction.desc;
    transaction.recurringId=rule.id;
    transaction.recurrenceMonth=month;
    transaction.occurrenceKey=`${rule.id}:${month}`;
    transaction.scheduledDate=transaction.scheduledDate||dueDate;
    transaction.dueDay=Number(dueDate.slice(8,10))||transaction.dueDay||null;
    transaction.desc=clean(rule.desc)||transaction.desc;
    transaction.category=clean(rule.category)||transaction.category;
    transaction.status='paid';
    transaction.tags=mergeTags(transaction.tags,[]);
    transaction.openFinanceRecurringReconciledAt=new Date().toISOString();
  }

  function mergeIntoMaterialized(existing,bankTransaction,match){
    const {rule,month,dueDate}=match;
    existing.openFinanceDescription=existing.openFinanceDescription||bankTransaction.openFinanceDescription||bankTransaction.desc;
    existing.scheduledDate=existing.scheduledDate||dueDate;
    existing.date=dateOnly(bankTransaction.date)||existing.date;
    existing.recurringId=rule.id;
    existing.recurrenceMonth=month;
    existing.occurrenceKey=`${rule.id}:${month}`;
    existing.dueDay=Number(dueDate.slice(8,10))||existing.dueDay||null;
    existing.status='paid';
    existing.category=clean(rule.category)||existing.category||bankTransaction.category;
    existing.tags=mergeTags(existing.tags,bankTransaction.tags);
    existing.balanceImpact=bankTransaction.balanceImpact;
    copyOpenFinanceMetadata(existing,bankTransaction);
    existing.openFinanceRecurringReconciledAt=new Date().toISOString();
  }

  function alignAlreadyLinkedRecurring(){
    const state=global.state;if(!state||!lastPreviewResult?.ok)return 0;
    const sourceRows=previewBankRows();if(!sourceRows.length)return 0;
    const byKey=new Map();for(const row of sourceRows)if(!byKey.has(row.key))byKey.set(row.key,row);
    let changed=0;
    for(const record of state.transactions||[]){
      if(!record?.recurringId)continue;
      const source=externalKeys(record).map(key=>byKey.get(key)).find(Boolean);if(!source)continue;
      if(record.openFinanceAccountId&&!sameId(record.openFinanceAccountId,source.account?.id))continue;
      const rule=(state.recurring||[]).find(item=>sameId(item?.id,record.recurringId));if(!rule)continue;
      const month=occurrenceMonth(record);if(!month)continue;
      const dueDate=recurringDate(rule,month),actualDate=dateOnly(source.transaction?.date);
      if(!actualDate||dayDiff(dueDate,actualDate)>SAFE_WINDOW_DAYS)continue;
      if(Math.abs(Math.abs(Number(rule?.amount))-Math.abs(Number(source.transaction?.amount)))>.011)continue;
      const synthetic={desc:source.transaction?.description,category:record.category};
      if(!semanticMatch(rule,synthetic))continue;
      if(record.date===actualDate&&record.scheduledDate===dueDate)continue;
      record.openFinanceDescription=record.openFinanceDescription||source.transaction?.description||record.desc;
      record.scheduledDate=record.scheduledDate||dueDate;
      record.date=actualDate;
      record.dueDay=Number(dueDate.slice(8,10))||record.dueDay||null;
      record.status='paid';
      record.balanceImpact=recalcBalanceImpact(record,actualDate);
      record.tags=mergeTags(record.tags,[]);
      record.openFinanceRecurringReconciledAt=new Date().toISOString();
      changed++;
    }
    return changed;
  }

  function reconcile(){
    const state=global.state;if(!state||!Array.isArray(state.transactions))return{changed:false,converted:0,merged:0,realigned:0,ambiguous:0};
    let converted=0,merged=0,ambiguous=0;
    const realigned=alignAlreadyLinkedRecurring();
    const reserved=new Set();
    const bankTransactions=state.transactions.filter(isOpenFinanceBankTransaction);

    for(const bankTransaction of bankTransactions){
      const matches=candidateOccurrences(bankTransaction).filter(row=>!reserved.has(`${row.rule.id}:${row.month}`));
      if(matches.length!==1){if(matches.length>1)ambiguous++;continue;}
      const match=matches[0],key=`${match.rule.id}:${match.month}`;
      const materialized=state.transactions.filter(entry=>entry!==bankTransaction&&sameId(entry?.recurringId,match.rule.id)&&occurrenceMonth(entry)===match.month);
      if(materialized.length>1){ambiguous++;continue;}
      reserved.add(key);
      if(materialized.length===1){
        mergeIntoMaterialized(materialized[0],bankTransaction,match);
        state.transactions=state.transactions.filter(entry=>entry!==bankTransaction);
        merged++;
      }else{
        convertToRecurring(bankTransaction,match);
        converted++;
      }
    }

    return{changed:Boolean(converted||merged||realigned),converted,merged,realigned,ambiguous};
  }

  function syncActive(){return Date.now()<=syncWindowUntil}

  function notifyReport(report){
    if(!report?.changed)return;
    const total=report.converted+report.merged+report.realigned;
    try{if(typeof global.toast==='function')global.toast(`${total} recorrência(s) conciliada(s) pela data real do banco.`,'success')}catch(_){}
  }

  function capturePreview(result){
    if(result&&typeof result.then==='function')return result.then(value=>{if(value?.ok)lastPreviewResult=value;return value});
    if(result?.ok)lastPreviewResult=result;
    return result;
  }

  function wrapPersonalApi(){
    const api=global.SFPOpenFinancePersonal;
    if(!api||api.__sfpRecurringPreviewCapture)return Boolean(api);
    if(typeof api.preview!=='function')return false;
    try{
      const wrapped={...api,preview:(...args)=>capturePreview(api.preview(...args))};
      Object.defineProperty(wrapped,'__sfpRecurringPreviewCapture',{value:true});
      global.SFPOpenFinancePersonal=Object.freeze(wrapped);
      return true;
    }catch(error){
      console.error('Open Finance recurring preview capture:',error);return false;
    }
  }

  function wrapSave(){
    if(typeof global.save!=='function'||global.save.__sfpOpenFinanceRecurringReconcile)return false;
    originalSave=global.save;
    const wrapped=async function(reason,...args){
      const shouldReconcile=reason==='Sincronizar Open Finance';
      const report=shouldReconcile?reconcile():null;
      const result=await originalSave.call(this,reason,...args);
      if(shouldReconcile){syncWindowUntil=0;notifyReport(report)}
      return result;
    };
    Object.defineProperty(wrapped,'__sfpOpenFinanceRecurringReconcile',{value:true});
    global.save=wrapped;
    return true;
  }

  function wrapRenderAll(){
    if(typeof global.renderAll!=='function'||global.renderAll.__sfpOpenFinanceRecurringReconcile)return false;
    originalRenderAll=global.renderAll;
    const wrapped=function(...args){
      if(!syncActive()||!lastPreviewResult?.ok)return originalRenderAll.apply(this,args);
      const report=reconcile();
      const result=originalRenderAll.apply(this,args);
      if(report.changed&&typeof originalSave==='function'){
        Promise.resolve(originalSave.call(global,'Conciliar recorrência Open Finance'))
          .then(()=>notifyReport(report))
          .catch(error=>console.error('Open Finance recurring reconcile save:',error))
          .finally(()=>{syncWindowUntil=0});
      }else syncWindowUntil=0;
      return result;
    };
    Object.defineProperty(wrapped,'__sfpOpenFinanceRecurringReconcile',{value:true});
    global.renderAll=wrapped;
    return true;
  }

  function observeFinalStatus(){
    const status=document.getElementById('openFinanceStatus');if(!status)return;
    const observer=new MutationObserver(()=>{
      if(!syncActive())return;
      const text=clean(status.textContent);
      if(/Open Finance não foi alterado|Sincronização não concluída|Nenhum dado foi alterado/i.test(text))syncWindowUntil=0;
    });
    observer.observe(status,{subtree:true,childList:true,characterData:true});
  }

  function install(){
    if(global[INSTALL_FLAG])return;
    if(typeof document==='undefined'||typeof global.state==='undefined'){setTimeout(install,50);return;}
    const apiReady=wrapPersonalApi();
    const saveReady=wrapSave();
    const renderReady=wrapRenderAll();
    if(!apiReady||!saveReady||!renderReady){setTimeout(install,50);return;}
    document.addEventListener('click',event=>{
      const target=event.target?.closest?.('#openFinanceSyncBtn');
      if(target){syncWindowUntil=Date.now()+SYNC_WINDOW_MS;lastPreviewResult=null}
    },true);
    observeFinalStatus();
    global[INSTALL_FLAG]=true;
    global.SFPOpenFinanceRecurringReconcile=Object.freeze({version:VERSION,reconcile});
  }

  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
    else install();
  }
})(typeof window!=='undefined'?window:globalThis);
