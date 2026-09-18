(function installFinancialRootIntegrity(global){
  'use strict';
  if(typeof document==='undefined')return;
  const round2=value=>Math.round((Number(value)||0)*100)/100;
  const sameId=(a,b)=>String(a)===String(b);
  const isoDate=value=>String(value||'').slice(0,10);
  const isoMonth=value=>isoDate(value).slice(0,7);
  const nextIsoDay=value=>{const [year,month,day]=isoDate(value).split('-').map(Number);if(!year||!month||!day)return '';const d=new Date(Date.UTC(year,month-1,day+1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;};
  const monthAdd=(month,delta)=>{const [year,number]=String(month||'').split('-').map(Number);const d=new Date(year,(number||1)-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
  const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const protectedAccount=account=>{if(!account)return false;if(account.spendable===true)return false;if(account.spendable===false)return true;return /Reserva|Investimento/i.test(String(account.type||''));};

  function installStatementClosingInvariant(){
    if(typeof importStatement!=='function'||typeof state==='undefined')return false;
    if(importStatement.__sfpStatementClosingInvariant===true)return true;
    const original=importStatement;
    const bankBackedBalanceAtDate=(accountId,closingDate)=>{
      const a=(state.accounts||[]).find(x=>sameId(x.id,accountId));if(!a)return 0;
      const anchor=isoDate(a.balanceDate||state.baseDate||'');let value=Number(a.initial)||0;
      (state.transactions||[]).filter(t=>sameId(t.accountId,accountId)&&t.status==='paid'&&t.balanceImpact===true&&t.statementKey).forEach(t=>{const date=isoDate(t.date);if((anchor&&date<=anchor)||date>closingDate)return;value+=t.kind==='income'?Number(t.amount)||0:-(Number(t.amount)||0);});
      (state.transfers||[]).filter(t=>t.statementKey||(t.statementKeys||[]).length).forEach(t=>{const applies=t.balanceImpactByAccount?.[accountId]??t.balanceImpactByAccount?.[String(accountId)]??(t.balanceImpact!==false);if(!applies)return;if(sameId(t.fromId,accountId)){const date=isoDate(t.date);if((!anchor||date>anchor)&&date<=closingDate)value-=Number(t.amount)||0;}if(sameId(t.toId,accountId)){const date=isoDate(t.settledDate||t.date);if((!anchor||date>anchor)&&date<=closingDate)value+=Number(t.amount)||0;}});
      (state.invoices||[]).filter(i=>sameId(i.accountId,accountId)).forEach(i=>(i.payments||[]).filter(p=>p.balanceImpact===true&&p.statementKey).forEach(p=>{const date=isoDate(p.date);if((!anchor||date>anchor)&&date<=closingDate)value-=Number(p.amount)||0;}));
      (state.transferEvidence||[]).filter(e=>sameId(e.accountId,accountId)&&e.status!=='matched'&&e.balanceImpact===true&&e.statementKey).forEach(e=>{const date=isoDate(e.date);if((!anchor||date>anchor)&&date<=closingDate)value+=Number(e.amount)||0;});
      return round2(value);
    };
    const guarded=async function(){
      try{
        const meta=typeof statementImportMeta!=='undefined'?statementImportMeta:null;
        const draft=typeof statementDraft!=='undefined'?statementDraft:[];
        const accountId=Number(document.getElementById('stmtAccount')?.value||0);
        const a=(state.accounts||[]).find(x=>sameId(x.id,accountId));
        const closingDate=isoDate(meta?.closingDate),closingBalance=Number(meta?.closingBalance);
        if(a&&a.balanceDate&&closingDate&&Number.isFinite(closingBalance)&&closingDate>=isoDate(a.balanceDate)){
          const used=typeof existingStmtKeys==='function'?existingStmtKeys():new Set();const anchorDate=isoDate(a.balanceDate);
          const accepted=(draft||[]).filter(r=>{if(r?.duplicate||r?.action==='ignore'||used.has(r?.key))return false;if(r?.action==='transfer'&&(!r.transferAccountId||sameId(r.transferAccountId,r.accountId)))return false;const date=isoDate(r?.date);return date>anchorDate&&date<=closingDate;});
          const firstAcceptedDate=accepted.map(row=>isoDate(row?.date)).filter(Boolean).sort()[0]||'';
          const continuationDate=nextIsoDay(anchorDate);
          const closesWithoutGap=accepted.length>0?firstAcceptedDate===continuationDate:closingDate===continuationDate;
          if(closesWithoutGap){const expected=round2(bankBackedBalanceAtDate(accountId,closingDate)+accepted.reduce((sum,row)=>sum+(Number(row.amount)||0),0));const difference=round2(closingBalance-expected);if(Math.abs(difference)>.009){if(typeof toast==='function')toast(`Extrato inconsistente: o saldo final informado pelo banco diverge em ${typeof brl==='function'?brl(difference):difference.toFixed(2)} dos movimentos aceitos. Revise o arquivo antes de importar.`,'warning');return false;}}
        }
      }catch(error){console.error('SFP statement closing invariant:',error);return false;}
      return original.apply(this,arguments);
    };
    Object.defineProperty(guarded,'__sfpStatementClosingInvariant',{value:true});Object.defineProperty(guarded,'__sfpOriginalImportStatement',{value:original});importStatement=guarded;global.importStatement=guarded;return true;
  }

  function installTransferSnapshotInvariant(){
    if(typeof transferCandidateAllowed!=='function'||typeof finalizeStatementTransferMatch!=='function'||typeof afterAccountSnapshot!=='function')return false;
    if(transferCandidateAllowed.__sfpPerAccountSnapshotCandidate!==true){const guardedAllowed=function(row,peer,semantic){if(!peer||sameId(peer.accountId,row.accountId))return false;const a=Number(row.amount)||0,b=Number(peer.signedAmount)||0;if(!a||!b||a*b>=0)return false;if(Math.abs(Math.round(Math.abs(a)*100)-Math.round(Math.abs(b)*100))!==0)return false;const days=Math.abs(dateObj(row.date)-dateObj(peer.date))/86400000;if(days>2)return false;if(peer.source==='transaction'){const rowSignal=transferImportSignal(row.desc)||semantic?.semanticClass==='possible_transfer';const peerSignal=transferImportSignal(peer.desc)||peer.semanticClass==='possible_transfer';const rowKnown=semantic?.economicImpact==='economic'&&['income','expense'].includes(semantic?.semanticClass);const peerKnown=peer.economicImpact==='economic'&&['income','expense'].includes(peer.semanticClass);if(!rowSignal&&!peerSignal&&(rowKnown||peerKnown))return false;}return true;};Object.defineProperty(guardedAllowed,'__sfpPerAccountSnapshotCandidate',{value:true});transferCandidateAllowed=guardedAllowed;global.transferCandidateAllowed=guardedAllowed;}
    if(finalizeStatementTransferMatch.__sfpPerAccountSnapshotFinalize!==true){const original=finalizeStatementTransferMatch;const guardedFinalize=function(row){const transfer=original.apply(this,arguments);if(!transfer||transfer.matchedBy!=='statement-cross-account')return transfer;const impact={};(transfer.statementEvidence||[]).forEach(e=>{if(e?.accountId==null||!e?.date)return;impact[e.accountId]=afterAccountSnapshot(e.accountId,e.date)===true;});if(Object.keys(impact).length){transfer.balanceImpactByAccount=impact;transfer.balanceImpact=Object.values(impact).some(Boolean);}return transfer;};Object.defineProperty(guardedFinalize,'__sfpPerAccountSnapshotFinalize',{value:true});finalizeStatementTransferMatch=guardedFinalize;global.finalizeStatementTransferMatch=guardedFinalize;}
    return true;
  }

  function installDebtInstallmentIdentity(){
    if(typeof debtDueForMonth!=='function'||typeof state==='undefined')return false;
    if(debtDueForMonth.__sfpExactInstallmentStatus===true)return true;
    const original=debtDueForMonth;const guarded=function(month){const rows=original(month);for(const row of rows||[]){const debt=row?.debt;if(!debt)continue;const payments=(debt.history||[]).filter(h=>h?.type==='payment');const explicit=new Set(payments.map(h=>Number(h.installment)).filter(n=>Number.isInteger(n)&&n>=1&&n<=Number(debt.installments||0)));let legacy=Math.max(0,Math.trunc(Number(debt.paidInstallments)||0)-explicit.size);const paid=new Set(explicit);for(let n=1;n<=Number(debt.installments||0)&&legacy>0;n++)if(!paid.has(n)){paid.add(n);legacy--}row.status=paid.has(Number(row.n))?'paid':'planned';}return rows;};Object.defineProperty(guarded,'__sfpExactInstallmentStatus',{value:true});debtDueForMonth=guarded;global.debtDueForMonth=guarded;return true;
  }

  function installFinancialSemantics(){
    let savingsReady=false,contextReady=false;
    if(typeof actualSavings==='function'){if(actualSavings.__sfpRealizedSavings===true)savingsReady=true;else{const guarded=function(month=state?.mesAtual){const today=localToday();return (state?.transfers||[]).filter(t=>{const date=isoDate(t?.settledDate||t?.date);if(!date||date>today||isoMonth(date)!==month)return false;const from=(state.accounts||[]).find(a=>sameId(a.id,t.fromId));const to=(state.accounts||[]).find(a=>sameId(a.id,t.toId));return from&&to&&!protectedAccount(from)&&protectedAccount(to);}).reduce((sum,t)=>sum+(Number(t.amount)||0),0);};Object.defineProperty(guarded,'__sfpRealizedSavings',{value:true});actualSavings=guarded;global.actualSavings=guarded;savingsReady=true;}}
    if(typeof financialContextSnapshot==='function'&&typeof cashView==='function'){if(financialContextSnapshot.__sfpCashRealized===true)contextReady=true;else{const original=financialContextSnapshot;const guarded=function(options={}){const base=original(options)||{};const ref=options.reference instanceof Date?options.reference:new Date(options.reference||Date.now());const months=Math.max(1,Math.trunc(Number(options.months)||3));const endMonth=`${ref.getFullYear()}-${String(ref.getMonth()+1).padStart(2,'0')}`;const list=Array.from({length:months},(_,i)=>monthAdd(endMonth,i-months+1));const cash=list.map(month=>cashView(month));const incomeCents=Math.round(cash.reduce((sum,row)=>sum+(Number(row?.income)||0),0)*100);const expenseCents=Math.round(cash.reduce((sum,row)=>sum+(Number(row?.expense)||0),0)*100);return {...base,realized:{incomeCents,expenseCents,resultCents:incomeCents-expenseCents}};};Object.defineProperty(guarded,'__sfpCashRealized',{value:true});financialContextSnapshot=guarded;global.financialContextSnapshot=guarded;global.sfpFinancialContextSnapshot=guarded;try{sfpFinancialContextSnapshot=guarded}catch{}contextReady=true;}}
    return savingsReady&&contextReady;
  }

  const install=()=>{const a=installStatementClosingInvariant();const b=installTransferSnapshotInvariant();const c=installDebtInstallmentIdentity();const d=installFinancialSemantics();return a&&b&&c&&d;};
  let attempts=0;const timer=setInterval(()=>{attempts++;if(install()||attempts>=200)clearInterval(timer)},25);install();
})(typeof window!=='undefined'?window:globalThis);
