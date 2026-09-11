(function installOpenFinanceBills(global){
'use strict';
const VERSION=3,FLAG='__SFP_OF_BILLS_V3',$=id=>document.getElementById(id),clean=v=>v==null?'':String(v).trim(),same=(a,b)=>String(a)===String(b),round=v=>Math.round((Number(v)||0)*100)/100,date=v=>clean(v).slice(0,10),ym=v=>date(v).slice(0,7);
let lastPreview=null,coreSave=null,syncIntent=false,persisting=false;
function norm(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function itemName(item){const a=Array.isArray(item?.accounts)?item.accounts:[],n=a.map(x=>clean(x?.marketingName)||clean(x?.name)).find(Boolean),i=clean(item?.institution);return n||(i&&norm(i)!=='meupluggy'?i:'')||a.map(x=>clean(x?.presentationName)).find(Boolean)||clean(item?.connectorName)||'Instituição'}
function cardFor(account,item){try{return global.SFPOpenFinancePersonal?.suggestSfpEntity?.(account,itemName(item))?.entity||null}catch(_){return null}}
function usage(account){const c=account?.creditData||{},hasL=c.creditLimit!==null&&c.creditLimit!==undefined&&clean(c.creditLimit)!=='',hasA=c.availableCreditLimit!==null&&c.availableCreditLimit!==undefined&&clean(c.availableCreditLimit)!=='',hasB=account?.balance!==null&&account?.balance!==undefined&&clean(account?.balance)!=='',l=hasL?Number(c.creditLimit):NaN,a=hasA?Number(c.availableCreditLimit):NaN,b=hasB?Number(account?.balance):NaN;if(Number.isFinite(l)&&Number.isFinite(a)&&l>=a&&a>=0)return{amount:round(l-a),limit:round(l),available:round(a),source:'creditLimit-availableCreditLimit',safe:true};if(Number.isFinite(b)&&b>=0)return{amount:round(b),limit:Number.isFinite(l)?round(l):null,available:Number.isFinite(a)?round(a):null,source:'account.balance',safe:false};return null}
function curMonth(card){try{return global.currentInvoiceMonth(card)}catch(_){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}}
function monthShift(month,delta){const m=clean(month).match(/^(\d{4})-(\d{2})$/);if(!m)return month;const d=new Date(Date.UTC(+m[1],+m[2]-1+Number(delta||0),1));return`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`}
function invoiceMonthForCard(card,value){const d=date(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return ym(value);let m=d.slice(0,7);const day=Number(d.slice(8,10)),closeDay=Number(card?.closeDay);if(Number.isFinite(closeDay)&&closeDay>0&&day>closeDay)m=monthShift(m,1);return m}
function ensure(cardId,m){try{return global.ensureInvoice(cardId,m)}catch(_){}let x=(global.state.invoices||[]).find(i=>same(i.cardId,cardId)&&i.month===m);if(!x){x={id:global.uid?.()||Date.now(),cardId,month:m,status:'open',paidAmount:0,payments:[]};global.state.invoices.push(x)}return x}
function findInvoice(cardId,m){return(global.state.invoices||[]).find(i=>same(i.cardId,cardId)&&i.month===m)||null}
function remaining(id,m){try{return round(global.invoiceRemaining(id,m))}catch(_){return 0}}
function outstanding(id){try{return round(global.cardOutstanding(id))}catch(_){return 0}}
function billMonth(b){return ym(b?.dueDate)||ym(b?.billClosingDate)}
function recalculable(inv){const status=clean(inv?.status).toLowerCase();return Boolean(inv)&&!inv.closedAt&&status!=='closed'&&status!=='paid'}
function clearNonAuthoritativeOfficial(inv,cardId,m){
  if(!recalculable(inv)||inv.officialTotalSource==='open-finance-bill'||inv.officialTotalSource==='document')return false;
  const source=clean(inv.officialTotalSource);
  let removable=source==='open-finance-used-minus-future'||source==='calculated-import';
  if(!removable&&!source&&!clean(inv.openFinanceBillId)&&Number.isFinite(Number(inv.officialTotal))){
    const calculated=round(global.invoiceCalculated?.(cardId,m)||0);
    removable=Math.abs(Number(inv.officialTotal)-calculated)<=.011;
  }
  if(!removable)return false;
  delete inv.officialTotal;delete inv.officialTotalSource;delete inv.openFinanceInferred;delete inv.openFinanceOutstandingDifference;delete inv.openFinanceOtherOutstanding;delete inv.openFinanceInferenceCheckedAt;
  return true;
}
function estimateCurrent(card,account,u,cm){if(!u?.safe||account?.transactionsError||account?.transactionPreviewHasMore)return null;const local=round(global.invoiceCalculated?.(card.id,cm)||0);const pending=(account.transactions||[]).filter(x=>clean(x.status).toUpperCase().includes('PENDING')&&clean(x.type).toUpperCase()==='DEBIT'&&invoiceMonthForCard(card,x.date)===cm).reduce((s,x)=>s+Math.max(0,Number(x.amount)||0),0);return{amount:local,pending:round(pending),basis:'local-confirmed',bankUsed:u.amount,official:false}}
function sameEstimate(a,b){return Boolean(a&&b)&&Number(a.amount)===Number(b.amount)&&Number(a.pending)===Number(b.pending)&&clean(a.basis)===clean(b.basis)&&Number(a.bankUsed)===Number(b.bankUsed)&&a.official===false&&b.official===false}
function apply(result){
  if(!result?.ok||!global.state)return{changed:false,bills:0,estimated:0,clearedInferred:0};
  let changed=0,bills=0,estimated=0,clearedInferred=0;
  for(const item of result.items||[])for(const account of item.accounts||[]){
    if(account?.type!=='CREDIT')continue;
    const card=cardFor(account,item);if(!card)continue;
    const u=usage(account);
    if(u){
      const usageChanged=card.openFinanceUsedAmount!==u.amount||card.openFinanceUsageSource!==u.source||card.openFinanceCreditLimit!==u.limit||card.openFinanceAvailableCreditLimit!==u.available;
      card.openFinanceUsedAmount=u.amount;card.openFinanceUsageSource=u.source;
      if(usageChanged)card.openFinanceUsageSyncedAt=new Date().toISOString();
      if(u.limit!=null)card.openFinanceCreditLimit=u.limit;if(u.available!=null)card.openFinanceAvailableCreditLimit=u.available;
      if(usageChanged)changed++;
    }
    const cm=curMonth(card);let officialCurrent=false;
    for(const bill of account.bills||[]){
      const m=billMonth(bill),total=Math.abs(Number(bill.totalAmount));if(!m||!Number.isFinite(total))continue;
      const inv=ensure(card.id,m),v=round(total),nextPayments=(bill.payments||[]).map(p=>({id:p.id,date:date(p.paymentDate),amount:round(p.amount),paymentMode:p.paymentMode||null,valueType:p.valueType||null}));
      const billChanged=inv.officialTotal!==v||inv.officialTotalSource!=='open-finance-bill'||inv.openFinanceBillId!==clean(bill.id)||inv.documentDueDate!==date(bill.dueDate)||inv.documentCloseDate!==date(bill.billClosingDate)||JSON.stringify(inv.openFinanceBillPayments||[])!==JSON.stringify(nextPayments)||Boolean(inv.openFinanceEstimate);
      inv.officialTotal=v;inv.officialTotalSource='open-finance-bill';inv.openFinanceBillId=clean(bill.id);inv.documentDueDate=date(bill.dueDate);inv.documentCloseDate=date(bill.billClosingDate);inv.openFinanceBillPayments=nextPayments;delete inv.openFinanceEstimate;
      if(billChanged){inv.openFinanceBillSyncedAt=new Date().toISOString();changed++;bills++}
      if(m===cm)officialCurrent=true;
    }
    for(const inv of global.state.invoices||[]){
      if(!same(inv.cardId,card.id))continue;
      if(clearNonAuthoritativeOfficial(inv,card.id,inv.month)){changed++;clearedInferred++}
    }
    if(!officialCurrent){
      let current=findInvoice(card.id,cm);
      const est=estimateCurrent(card,account,u,cm);
      if(est){
        current=current||ensure(card.id,cm);
        if(!sameEstimate(current.openFinanceEstimate,est)){
          current.openFinanceEstimate={...est,calculatedAt:new Date().toISOString()};
          changed++;estimated++;
        }
      }
    }
  }
  return{changed:changed>0,bills,estimated,clearedInferred};
}
function capture(r){if(r&&typeof r.then==='function')return r.then(v=>{if(v?.ok)lastPreview=v;return v});if(r?.ok)lastPreview=r;return r}
function wrapApi(){const api=global.SFPOpenFinancePersonal;if(!api?.preview)return false;if(api.__sfpBillsCapture)return true;const wrapped={...api,preview:(...args)=>capture(api.preview(...args))};Object.defineProperty(wrapped,'__sfpBillsCapture',{value:true});global.SFPOpenFinancePersonal=Object.freeze(wrapped);return true}
function toastReport(report){if(!report?.changed)return;const bits=[];if(report.bills)bits.push(`${report.bills} fatura(s) oficial(is)`);if(report.estimated)bits.push(`${report.estimated} fatura(s) estimada(s)`);if(report.clearedInferred)bits.push(`${report.clearedInferred} total(is) não oficial(is) normalizado(s)`);global.toast?.(`${bits.join(' • ')||'Dados de cartão atualizados'} pelo Open Finance.`,'success')}
function wrapSave(){if(typeof global.save!=='function')return false;if(global.save.__sfpBills)return true;coreSave=global.save;const fn=async function(reason,...args){const report=reason==='Sincronizar Open Finance'&&lastPreview?.ok?apply(lastPreview):null;const out=await coreSave.call(this,reason,...args);syncIntent=false;toastReport(report);return out};Object.defineProperty(fn,'__sfpBills',{value:true});global.save=fn;return true}
function wrapNoTransactionSync(){if(global.__sfpBillsNoTxSync)return true;if(typeof global.renderAll!=='function'||!coreSave)return false;const original=global.renderAll;global.renderAll=function(...args){if(syncIntent&&lastPreview?.ok&&!persisting){const report=apply(lastPreview);syncIntent=false;if(report.changed){persisting=true;Promise.resolve(coreSave.call(global,'Sincronizar Open Finance')).then(()=>toastReport(report)).catch(error=>{console.error('SFP Open Finance bill persistence:',error);global.toast?.('A conciliação da fatura não pôde ser persistida.','error')}).finally(()=>{persisting=false});}}return original.apply(this,args)};global.__sfpBillsNoTxSync=true;document.addEventListener('click',event=>{if(event.target?.closest?.('#openFinanceSyncBtn'))syncIntent=true;else if(event.target?.closest?.('#openFinancePreviewBtn'))syncIntent=false},true);return true}
function previewAccount(cardId){if(!lastPreview?.ok)return null;for(const item of lastPreview.items||[])for(const account of item.accounts||[]){if(account.type!=='CREDIT')continue;const card=cardFor(account,item);if(card&&same(card.id,cardId))return{item,account}}return null}
function diag(cardId,m){const card=(global.state.cards||[]).find(c=>same(c.id,cardId));if(!card)throw Error('Cartão não encontrado');const inv=findInvoice(cardId,m),rows=global.installments?.(m)?.filter(x=>same(x.card?.id,cardId))||[],adj=global.invoiceAdjustments?.(cardId,m)||[],p=previewAccount(cardId),u=p?usage(p.account):null,calc=round(global.invoiceCalculated?.(cardId,m)||0),total=round(global.invoiceTotal?.(cardId,m)||calc),rem=remaining(cardId,m),out=outstanding(cardId),future=round(Math.max(0,out-rem));return{schema:'sfp-invoice-diagnostic-v2',generatedAt:new Date().toISOString(),card:{id:card.id,name:card.name,limit:round(card.limit),closeDay:card.closeDay,dueDay:card.dueDay},invoice:{month:m,status:inv?.status||'open',calculatedTotal:calc,officialTotal:inv?.officialTotal??null,officialTotalSource:inv?.officialTotalSource||null,estimatedTotal:inv?.openFinanceEstimate?.amount??null,estimatedBasis:inv?.openFinanceEstimate?.basis||null,pendingAmount:inv?.openFinanceEstimate?.pending??null,totalShown:total,paidAmount:round(inv?.paidAmount||0),remaining:rem,dueDate:inv?.documentDueDate||null,closeDate:inv?.documentCloseDate||null,openFinanceBillId:inv?.openFinanceBillId||null},equation:{installments:round(rows.reduce((s,x)=>s+Number(x.amount||0),0)),adjustments:round(adj.reduce((s,x)=>s+Number(x.amount||0),0)),displayedTotal:total,paid:round(inv?.paidAmount||0),remaining:rem},purchases:rows.map(x=>({id:x.purchase?.id,description:x.purchase?.desc,purchaseDate:x.purchase?.purchaseDate,firstMonth:x.purchase?.firstMonth,installmentNumber:x.n,totalInstallments:x.total,installmentAmount:round(x.amount),purchaseTotal:round(x.purchase?.total),status:x.purchase?.status,externalId:x.purchase?.externalId||null,openFinanceStatus:x.purchase?.openFinanceStatus||null})),adjustments:adj.map(x=>({id:x.id,description:x.desc||x.description||'',amount:round(x.amount),type:x.type||null})),payments:(inv?.payments||[]).map(x=>({date:x.date,amount:round(x.amount),source:x.source||null,externalId:x.externalId||null})),openFinance:{available:Boolean(p),usage:u,bills:(p?.account?.bills||[]),pendingTransactions:(p?.account?.transactions||[]).filter(x=>clean(x.status).toUpperCase().includes('PENDING')),transactionsError:Boolean(p?.account?.transactionsError),partial:Boolean(p?.account?.transactionPreviewHasMore)},commitment:{bankCurrentUsage:u?.amount??null,bankAvailableLimit:u?.available??null,sfpProjectedOutstanding:out,sfpFuturePlanned:future,legacyDifference:u?round(u.amount-out):null},privacy:{credentials:false,identity:false,fullCardNumber:false}}}
function exportDiag(cardId,m){const d=diag(cardId,m),card=(global.state.cards||[]).find(c=>same(c.id,cardId)),name=norm(card?.name).replace(/\s+/g,'-').slice(0,36)||'cartao';global.download(JSON.stringify(d,null,2),`sfp-fatura-${name}-${m}-diagnostico.json`,'application/json');global.toast?.('Diagnóstico da fatura exportado.','success');return d}
function money(v){try{return global.brl(v)}catch(_){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0)}}
function renderTruth(){const id=$('invoiceCard')?.value||global.state?.ui?.invoiceCardId,m=$('invoiceMonth')?.value||global.state?.mesAtual,card=(global.state.cards||[]).find(c=>same(c.id,id)),note=$('openFinanceInvoiceTruth');if(!card||!note)return;const used=Number(card.openFinanceUsedAmount),available=Number(card.openFinanceAvailableCreditLimit);if(!Number.isFinite(used)){note.classList.add('hidden');return}const inv=findInvoice(id,m),rem=remaining(id,m),out=outstanding(id),future=round(Math.max(0,out-rem)),bits=[`Uso atual informado pelo banco: ${money(used)}`];if(Number.isFinite(available))bits.push(`limite disponível: ${money(available)}`);if(inv?.officialTotalSource==='open-finance-bill'||inv?.officialTotalSource==='document')bits.push(`fatura oficial: ${money(inv.officialTotal)}`);else{bits.push(`fatura estimada no SFP: ${money(global.invoiceCalculated?.(id,m)||0)}`);const pending=Number(inv?.openFinanceEstimate?.pending);if(Number.isFinite(pending)&&pending>.009)bits.push(`compras pendentes no banco: ${money(pending)}`)}if(future>.009)bits.push(`compromissos futuros projetados: ${money(future)}`);note.textContent=bits.join(' • ');note.classList.remove('hidden')}
function ui(){const actions=document.querySelector('#cartoes .invoice-focus .head .actions'),summary=document.querySelector('#cartoes .invoice-focus .invoice-summary');if(!actions||!summary)return false;if(!$('exportInvoiceDiagnostic')){const b=document.createElement('button');b.id='exportInvoiceDiagnostic';b.type='button';b.className='btn2 tiny';b.textContent='Exportar fatura';b.onclick=()=>exportDiag($('invoiceCard')?.value||global.state.ui.invoiceCardId,$('invoiceMonth')?.value||global.state.mesAtual);actions.prepend(b)}if(!$('openFinanceInvoiceTruth')){const n=document.createElement('div');n.id='openFinanceInvoiceTruth';n.className='note hidden';n.style.marginTop='10px';summary.after(n)}$('invoiceCard')?.addEventListener('change',renderTruth);$('invoiceMonth')?.addEventListener('change',renderTruth);const total=$('invoiceTotalView');if(total&&!total.__sfpTruth){const o=new MutationObserver(renderTruth);o.observe(total,{childList:true,subtree:true,characterData:true});Object.defineProperty(total,'__sfpTruth',{value:o})}renderTruth();return true}
function install(){if(global[FLAG])return;if(!global.state||!wrapApi()||!wrapSave()||!wrapNoTransactionSync()||!ui()){setTimeout(install,50);return}global[FLAG]=true;global.SFPOpenFinanceBills=Object.freeze({version:VERSION,apply,diag,exportDiag,getLastPreview:()=>lastPreview})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(typeof window!=='undefined'?window:globalThis);
