(function installOpenFinanceFinancialTruth(global){
  'use strict';

  const VERSION=1;
  const FLAG='__SFP_OPEN_FINANCE_FINANCIAL_TRUTH_V1';
  if(global[FLAG])return;
  global[FLAG]=true;

  const clean=value=>value==null?'':String(value).trim();
  const dateOnly=value=>clean(value).slice(0,10);
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(dateOnly(value));
  const validMonth=value=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(clean(value));
  const sameId=(a,b)=>String(a??'')!==''&&String(a??'')===String(b??'');
  const round2=value=>Math.round((Number(value)||0)*100)/100;
  const toKey=transaction=>clean(transaction?.id)?`pluggy:${clean(transaction.id)}`:'';

  function localCivilDate(ref=new Date()){
    return `${ref.getFullYear()}-${String(ref.getMonth()+1).padStart(2,'0')}-${String(ref.getDate()).padStart(2,'0')}`;
  }

  function monthShift(month,delta){
    if(!validMonth(month))return'';
    const [year,number]=month.split('-').map(Number);
    const cursor=new Date(Date.UTC(year,number-1+Number(delta||0),1));
    return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}`;
  }

  function dayDiff(a,b){
    const aa=dateOnly(a),bb=dateOnly(b);
    if(!validDate(aa)||!validDate(bb))return Infinity;
    return Math.abs(new Date(`${aa}T00:00:00Z`)-new Date(`${bb}T00:00:00Z`))/86400000;
  }

  function normalize(value){
    return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }

  function isCardPaymentDescription(value){
    const text=normalize(value);
    return /(pagamento|pagto|pgto|pagar|pag) (?:de )?fatura/.test(text)
      ||/fatura (?:de )?(?:cartao|credito)/.test(text)
      ||/(pagamento|pagto|pgto) (?:do )?cartao/.test(text);
  }

  function confirmed(transaction){
    const status=clean(transaction?.status).toUpperCase();
    if(!status)return true;
    if(status.includes('PENDING')||status.includes('CANCEL')||status.includes('REVERSED')||status.includes('DECLINED')||status.includes('FAILED'))return false;
    return ['POSTED','COMPLETED','CLEARED','SETTLED','CONFIRMED'].some(token=>status.includes(token));
  }

  function cloneState(value){
    try{return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
    catch(_){return JSON.parse(JSON.stringify(value));}
  }

  function parseBridge(value){
    if(value&&typeof value==='object')return value;
    try{return JSON.parse(String(value||''));}catch(_){return null;}
  }

  function readLatestSnapshot(){
    const bridge=global.PluggyBridge;
    if(!bridge||typeof bridge.previewData!=='function')return null;
    try{
      const result=parseBridge(bridge.previewData());
      return result?.ok===true?result:null;
    }catch(_){return null;}
  }

  function itemName(item){
    const api=global.SFPOpenFinancePersonal;
    try{return api?.itemDisplayName?.(item)||clean(item?.institution)||clean(item?.connectorName);}
    catch(_){return clean(item?.institution)||clean(item?.connectorName);}
  }

  function mappedBankRows(result){
    const api=global.SFPOpenFinancePersonal;
    const rows=[];
    if(!api||!global.state)return rows;
    for(const item of Array.isArray(result?.items)?result.items:[]){
      const name=itemName(item);
      for(const account of Array.isArray(item?.accounts)?item.accounts:[]){
        if(account?.type==='CREDIT')continue;
        let suggestion=null;
        try{suggestion=api.suggestSfpEntity?.(account,name)||null;}catch(_){}
        if(!suggestion?.entity)continue;
        rows.push({item,account,entity:suggestion.entity});
      }
    }
    return rows;
  }

  function snapshotDateFor(item,account){
    const candidates=[
      account?.balanceDate,
      account?.lastUpdatedAt,
      account?.updatedAt,
      item?.lastUpdatedAt,
      item?.updatedAt
    ];
    for(const candidate of candidates){
      const value=dateOnly(candidate);
      if(validDate(value))return value;
    }
    return localCivilDate();
  }

  function reanchorAccountImpact(entity,date){
    const state=global.state;
    if(!state||!entity||!validDate(date))return false;
    let changed=false;

    for(const transaction of Array.isArray(state.transactions)?state.transactions:[]){
      if(!sameId(transaction?.accountId,entity.id)||!validDate(transaction?.date))continue;
      const realized=transaction?.status==='paid'||transaction?.statementKey||transaction?.openFinanceProvider==='pluggy'||clean(transaction?.externalId).startsWith('pluggy:');
      if(!realized)continue;
      const next=dateOnly(transaction.date)>date;
      if(transaction.balanceImpact!==next){transaction.balanceImpact=next;changed=true;}
    }

    for(const transfer of Array.isArray(state.transfers)?state.transfers:[]){
      if(!sameId(transfer?.fromId,entity.id)&&!sameId(transfer?.toId,entity.id))continue;
      const eventDate=sameId(transfer?.fromId,entity.id)?dateOnly(transfer?.date):dateOnly(transfer?.settledDate||transfer?.date);
      if(!validDate(eventDate))continue;
      const fallback=transfer.balanceImpact!==false;
      transfer.balanceImpactByAccount??={};
      if(transfer?.fromId!=null&&transfer.balanceImpactByAccount[transfer.fromId]===undefined)transfer.balanceImpactByAccount[transfer.fromId]=fallback;
      if(transfer?.toId!=null&&transfer.balanceImpactByAccount[transfer.toId]===undefined)transfer.balanceImpactByAccount[transfer.toId]=fallback;
      const next=eventDate>date;
      if(transfer.balanceImpactByAccount[entity.id]!==next){transfer.balanceImpactByAccount[entity.id]=next;changed=true;}
      const any=Object.values(transfer.balanceImpactByAccount).some(Boolean);
      if(transfer.balanceImpact!==any){transfer.balanceImpact=any;changed=true;}
    }

    const cards=Array.isArray(state.cards)?state.cards:[];
    for(const invoice of Array.isArray(state.invoices)?state.invoices:[]){
      const card=cards.find(row=>sameId(row?.id,invoice?.cardId));
      const payAccountId=invoice?.accountId??card?.payAccountId;
      if(!sameId(payAccountId,entity.id))continue;
      for(const payment of Array.isArray(invoice?.payments)?invoice.payments:[]){
        if(!validDate(payment?.date))continue;
        const next=dateOnly(payment.date)>date;
        if(payment.balanceImpact!==next){payment.balanceImpact=next;changed=true;}
      }
    }

    for(const evidence of Array.isArray(state.transferEvidence)?state.transferEvidence:[]){
      if(!sameId(evidence?.accountId,entity.id)||!validDate(evidence?.date))continue;
      const next=dateOnly(evidence.date)>date&&evidence.status!=='matched';
      if(evidence.balanceImpact!==next){evidence.balanceImpact=next;changed=true;}
    }
    return changed;
  }

  function applyBankSnapshot(row){
    const balance=Number(row?.account?.balance);
    if(!Number.isFinite(balance)||!row?.entity)return{changed:false};
    const entity=row.entity;
    const date=snapshotDateFor(row.item,row.account);
    const amount=round2(balance);
    const coreChanged=entity.initial!==amount||entity.balanceDate!==date||entity.balanceMode!=='snapshot'||entity.reconciled?.source!=='open-finance';
    let changed=coreChanged;

    if(coreChanged){
      entity.initial=amount;
      entity.balanceDate=date;
      entity.balanceMode='snapshot';
      entity.reconciled={
        balance:amount,
        date,
        difference:0,
        source:'open-finance',
        provider:'pluggy',
        openFinanceAccountId:clean(row.account?.id)||null,
        openFinanceItemId:clean(row.item?.id)||null,
        at:new Date().toISOString()
      };
    }
    if(reanchorAccountImpact(entity,date))changed=true;
    return{changed,balance:amount,date,accountId:entity.id};
  }

  function invoiceRecord(cardId,month){
    return (global.state?.invoices||[]).find(invoice=>sameId(invoice?.cardId,cardId)&&invoice?.month===month)||null;
  }

  function invoiceTotal(cardId,month){
    try{
      const value=Number(global.invoiceTotal?.(cardId,month));
      return Number.isFinite(value)?round2(value):null;
    }catch(_){return null;}
  }

  function invoiceRemaining(cardId,month){
    try{
      const value=Number(global.invoiceRemaining?.(cardId,month));
      return Number.isFinite(value)?round2(value):null;
    }catch(_){
      const invoice=invoiceRecord(cardId,month),total=invoiceTotal(cardId,month);
      if(total==null)return null;
      return round2(Math.max(0,total-(Number(invoice?.paidAmount)||0)));
    }
  }

  function dueDateFor(card,month,invoice){
    const explicit=[invoice?.documentDueDate,invoice?.bankDueDate,invoice?.dueDate,card?.openFinanceBalanceDueDate]
      .map(dateOnly).find(validDate);
    if(explicit&&explicit.slice(0,7)===month)return explicit;
    const match=String(month||'').match(/^(\d{4})-(\d{2})$/);
    if(!match)return'';
    const year=Number(match[1]),number=Number(match[2]);
    const lastDay=new Date(year,number,0).getDate();
    const day=Math.min(lastDay,Math.max(1,Math.trunc(Number(card?.dueDay)||1)));
    return `${month}-${String(day).padStart(2,'0')}`;
  }

  function paymentHasKey(invoice,key){
    if(!invoice||!key)return false;
    return (invoice.payments||[]).some(payment=>clean(payment?.externalId)===key||(Array.isArray(payment?.openFinanceExternalIds)&&payment.openFinanceExternalIds.includes(key)));
  }

  function findInvoicePaymentMatch(row,transaction){
    if(!global.state||!row?.entity||!confirmed(transaction)||!isCardPaymentDescription(transaction?.description))return null;
    const key=toKey(transaction),type=clean(transaction?.type).toUpperCase();
    const amount=Math.abs(Number(transaction?.amount)),date=dateOnly(transaction?.date),month=date.slice(0,7);
    if(!key||type==='CREDIT'||!Number.isFinite(amount)||amount<=0||!validDate(date)||!validMonth(month))return null;
    const cards=(global.state.cards||[]).filter(card=>sameId(card?.payAccountId,row.entity.id));
    if(!cards.length)return null;

    const candidates=[];
    for(const card of cards){
      for(const candidateMonth of [month,monthShift(month,-1),monthShift(month,1)]){
        if(!validMonth(candidateMonth))continue;
        const remaining=invoiceRemaining(card.id,candidateMonth);
        const total=invoiceTotal(card.id,candidateMonth);
        if(remaining==null||total==null||remaining<=0||total<=0)continue;
        if(Math.abs(remaining-amount)>.02)continue;
        const invoice=invoiceRecord(card.id,candidateMonth);
        const dueDate=dueDateFor(card,candidateMonth,invoice);
        const distance=dayDiff(date,dueDate);
        if(distance>10)continue;
        const score=100-distance+(invoice?.officialTotal!=null?5:0)+(invoice?2:0);
        candidates.push({card,invoice,month:candidateMonth,remaining,total,dueDate,distance,score,amount,date,row,transaction});
      }
    }
    candidates.sort((a,b)=>b.score-a.score||a.distance-b.distance||String(a.card.id).localeCompare(String(b.card.id)));
    if(!candidates.length)return null;
    if(candidates[1]&&candidates[1].score===candidates[0].score)return null;
    return candidates[0];
  }

  function applyInvoicePayment(match){
    if(!match)return{changed:false,review:true};
    const key=toKey(match.transaction);
    let invoice=match.invoice;
    if(!invoice){
      try{invoice=global.ensureInvoice?.(match.card.id,match.month)||null;}catch(_){}
    }
    if(!invoice)return{changed:false,review:true};
    invoice.payments??=[];
    if(key&&paymentHasKey(invoice,key))return{changed:false,already:true};

    const total=invoiceTotal(match.card.id,match.month);
    const currentPaid=round2(Number(invoice.paidAmount)||0);
    if(total==null||total<=0)return{changed:false,review:true};
    const remaining=round2(Math.max(0,total-currentPaid));
    if(remaining<=.009)return{changed:false,already:true};
    if(Math.abs(remaining-match.amount)>.02)return{changed:false,review:true};

    const applied=round2(Math.min(match.amount,remaining));
    const anchor=dateOnly(match.row.entity?.balanceDate);
    const balanceImpact=!validDate(anchor)||match.date>anchor;
    invoice.payments.push({
      date:match.date,
      amount:applied,
      balanceImpact,
      economicImpact:'neutral',
      externalId:key||null,
      openFinanceExternalIds:key?[key]:[],
      openFinanceProvider:'pluggy',
      openFinanceAccountId:clean(match.row.account?.id)||null,
      openFinanceItemId:clean(match.row.item?.id)||null,
      openFinanceStatus:clean(match.transaction?.status),
      note:'Pagamento de fatura conciliado automaticamente pelo Open Finance.',
      createdAt:Date.now()
    });
    invoice.paidAmount=round2(currentPaid+applied);
    invoice.status=invoice.paidAmount>=total-.01?'paid':'partial';
    invoice.accountId??=match.card?.payAccountId??match.row.entity.id;
    invoice.openFinanceLastPaymentAt=new Date().toISOString();
    return{changed:true,amount:applied,invoiceId:invoice.id,cardId:match.card.id,month:match.month,balanceImpact};
  }

  async function reconcileSnapshot(result){
    if(!result?.ok||!global.state)return{ok:false,changed:false,snapshots:0,payments:0,already:0,review:0};
    const before=cloneState(global.state);
    let changed=false,snapshots=0,payments=0,already=0,review=0;
    try{
      const rows=mappedBankRows(result);
      for(const row of rows){
        const applied=applyBankSnapshot(row);
        if(applied.changed){changed=true;snapshots++;}
      }

      for(const row of rows){
        for(const transaction of Array.isArray(row.account?.transactions)?row.account.transactions:[]){
          if(!confirmed(transaction)||!isCardPaymentDescription(transaction?.description))continue;
          const match=findInvoicePaymentMatch(row,transaction);
          const applied=applyInvoicePayment(match);
          if(applied.changed){changed=true;payments++;}
          else if(applied.already)already++;
          else review++;
        }
      }

      if(changed){
        if(typeof global.save!=='function')throw new Error('Persistência do SFP indisponível.');
        await global.save('Conciliar verdade bancária Open Finance');
      }else{
        try{global.renderAll?.();}catch(_){}
      }
      return{ok:true,changed,snapshots,payments,already,review};
    }catch(error){
      try{global.state=before;global.renderAll?.();}catch(_){}
      return{ok:false,changed:false,snapshots:0,payments:0,already:0,review:0,message:error?.message||'Falha ao conciliar verdade bancária.'};
    }
  }

  async function reconcileLatest(){
    const result=readLatestSnapshot();
    if(!result)return{ok:false,changed:false,code:'SNAPSHOT_UNAVAILABLE'};
    return reconcileSnapshot(result);
  }

  function escapeHtml(value){
    return clean(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function money(value){
    try{return typeof global.brl==='function'?global.brl(value):new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);}
    catch(_){return `R$ ${(Number(value)||0).toFixed(2).replace('.',',')}`;}
  }

  function compactAmount(value){
    const n=Math.abs(Number(value)||0);
    if(n>=1000000)return `${(n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})}M`;
    if(n>=1000)return `${(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:n>=100000?0:1})}k`;
    return Math.round(n).toLocaleString('pt-BR');
  }

  function temporalizeEvent(event,today){
    if(!event||event.status==='paid'||event.realization==='realized')return{...event,realization:'realized',temporalStatus:'realized'};
    const date=dateOnly(event?.date);
    if(!validDate(date)||date>=today)return{...event,realization:'projected',temporalStatus:'projected'};
    if(event.virtual===true||event.source==='recurring')return{...event,realization:'unreconciled',temporalStatus:'unreconciled'};
    return{...event,realization:'overdue',temporalStatus:'overdue'};
  }

  function installCalendarStyle(){
    if(typeof document==='undefined'||document.getElementById('sfp-historical-calendar-style'))return;
    const style=document.createElement('style');
    style.id='sfp-historical-calendar-style';
    style.textContent=`
      .cal-dot.overdue{background:var(--color-negative,#f43f5e);box-shadow:0 0 0 2px rgba(244,63,94,.18)}
      .cal-dot.unreconciled{background:var(--color-purple,#a981ff);box-shadow:0 0 0 2px rgba(169,129,255,.18)}
      .event-status.overdue{color:var(--color-negative,#f43f5e);background:rgba(244,63,94,.12)}
      .event-status.unreconciled{color:var(--color-purple,#a981ff);background:rgba(169,129,255,.12)}
    `;
    document.head.appendChild(style);
  }

  function patchLegend(){
    const legend=document.querySelector('#calendario .calendar-legend');
    if(!legend||legend.dataset.sfpTemporalLegend==='1')return;
    legend.dataset.sfpTemporalLegend='1';
    const revenue=legend.querySelector('.cal-symbol.inc')?.parentElement;
    if(revenue){
      const overdue=document.createElement('span');overdue.innerHTML='<i class="cal-dot overdue"></i>Vencido';
      const review=document.createElement('span');review.innerHTML='<i class="cal-dot unreconciled"></i>Revisar';
      legend.insertBefore(overdue,revenue);legend.insertBefore(review,revenue);
    }
  }

  function installHistoricalCalendarSemantics(){
    if(global.__SFP_HISTORICAL_CALENDAR_SEMANTICS_V1)return true;
    if(typeof global.financialCalendarEvents!=='function'||typeof document==='undefined')return false;
    const baseEvents=global.financialCalendarEvents;
    global.__SFP_HISTORICAL_CALENDAR_SEMANTICS_V1=true;

    global.financialCalendarEvents=function(m=global.state?.mesAtual){
      const today=localCivilDate();
      return (baseEvents(m)||[]).map(event=>temporalizeEvent(event,today));
    };

    global.openCalendarDay=function(date){
      const month=String(date||'').slice(0,7);
      const events=global.financialCalendarEvents(month).filter(event=>event.date===date);
      const labels={realized:'Realizado',projected:'Previsto',overdue:'Vencido',unreconciled:'Revisar'};
      const groups=events.map(event=>{
        const origin=escapeHtml(event.origin||'');
        const sourceId=escapeHtml(event.sourceId||'');
        const safeDate=escapeHtml(date);
        const amountClass=event.type==='income'?'positive':'negative';
        const sign=event.type==='income'?'+':'−';
        const realization=event.realization||'projected';
        return `<div class="item" role="button" tabindex="0" onclick="openCalendarEvent('${origin}', '${sourceId}', '${safeDate}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCalendarEvent('${origin}', '${sourceId}', '${safeDate}')}\"><div><b>${escapeHtml(event.desc)}</b><small>${event.type==='income'?'Entrada':'Saída'} · ${origin} · ${safeDate}</small></div><div><strong class="${amountClass}">${sign} ${money(event.amount)}</strong><span class="event-status ${realization}">${labels[realization]||'Revisar'}</span></div></div>`;
      }).join('');
      const monthLabel=typeof global.monthName==='function'?global.monthName(month):month;
      const body=`${groups||'<div class="empty-state">Nenhum evento financeiro neste dia.</div>'}<div class="section-actions"><button class="btn" onclick="newTransactionForDate('${escapeHtml(date)}')">+ Novo lançamento nesta data</button></div>`;
      if(typeof global.showDetail==='function')global.showDetail(`Dia ${String(date||'').slice(8,10)}`,monthLabel,body);
    };

    global.renderCalendar=function(){
      if(!global.state?.mesAtual)return;
      const [year,month]=global.state.mesAtual.split('-').map(Number);
      const first=new Date(year,month-1,1),days=new Date(year,month,0).getDate(),start=first.getDay();
      const events=global.financialCalendarEvents(global.state.mesAtual);
      let html=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(label=>`<div class="calhead">${label}</div>`).join('');
      for(let index=0;index<start;index++)html+='<div class="day off"></div>';
      for(let day=1;day<=days;day++){
        const date=`${global.state.mesAtual}-${String(day).padStart(2,'0')}`;
        const rows=events.filter(event=>event.date===date);
        const income=rows.filter(event=>event.type==='income').reduce((sum,event)=>sum+Number(event.amount||0),0);
        const expense=rows.filter(event=>event.type==='expense').reduce((sum,event)=>sum+Number(event.amount||0),0);
        const states=new Set(rows.map(event=>event.realization));
        const dots=`${states.has('realized')?'<i class="cal-dot realized" title="Realizado"></i>':''}${states.has('projected')?'<i class="cal-dot projected" title="Previsto"></i>':''}${states.has('overdue')?'<i class="cal-dot overdue" title="Vencido"></i>':''}${states.has('unreconciled')?'<i class="cal-dot unreconciled" title="Revisar histórico"></i>':''}`;
        const statusText=states.has('overdue')?', com vencido':states.has('unreconciled')?', com item para revisar':states.has('projected')?', com previsão':'';
        const label=rows.length?`Dia ${day}, ${rows.length} evento${rows.length>1?'s':''}${income?`, receita de ${money(income)}`:''}${expense?`, despesa de ${money(expense)}`:''}${statusText}`:`Dia ${day}, sem eventos`;
        html+=`<button type="button" class="day${rows.length?' has-events':''}" onclick="openCalendarDay('${date}')" aria-label="${escapeHtml(label)}"><div class="daytop"><span class="daynum">${day}</span>${dots?`<div class="cal-indicators">${dots}</div>`:''}</div>${income?`<span class="cal-flow inc" title="${escapeHtml('+ '+money(income))}"><span class="cal-flow-full" aria-hidden="true">+ ${money(income)}</span><span class="cal-flow-compact" aria-hidden="true">+${compactAmount(income)}</span></span>`:''}${expense?`<span class="cal-flow exp" title="${escapeHtml('− '+money(expense))}"><span class="cal-flow-full" aria-hidden="true">− ${money(expense)}</span><span class="cal-flow-compact" aria-hidden="true">−${compactAmount(expense)}</span></span>`:''}${rows.length?`<span class="cal-count">${rows.length} ${rows.length===1?'evento':'eventos'}</span>`:''}</button>`;
      }
      const root=document.getElementById('calendar');
      if(root)root.innerHTML=html;
      patchLegend();
    };

    installCalendarStyle();
    patchLegend();
    try{global.renderCalendar();}catch(_){}
    return true;
  }

  function installCalendarWhenReady(){
    if(installHistoricalCalendarSemantics())return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(installHistoricalCalendarSemantics()||attempts>80)clearInterval(timer);
    },50);
  }

  installCalendarWhenReady();

  global.SFPOpenFinanceFinancialTruth=Object.freeze({
    version:VERSION,
    reconcileLatest,
    reconcileSnapshot,
    temporalizeEvent,
    installHistoricalCalendarSemantics
  });
})(typeof window!=='undefined'?window:globalThis);
