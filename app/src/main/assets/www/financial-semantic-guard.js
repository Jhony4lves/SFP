(function installFinancialSemanticGuard(global){
  'use strict';

  if(typeof document==='undefined')return;

  const validDate=value=>{
    const d=value instanceof Date?new Date(value.getTime()):new Date(value||Date.now());
    return Number.isNaN(d.getTime())?new Date():d;
  };
  const isoDate=value=>{
    const d=validDate(value);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const isoMonth=value=>String(value||'').slice(0,7);
  const monthAdd=(month,delta)=>{
    const [year,number]=String(month||'').split('-').map(Number);
    const d=new Date(year,(number||1)-1+delta,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const toCents=value=>Math.round((Number(value)||0)*100);

  function protectedAccount(account){
    if(!account)return false;
    if(account.spendable===true)return false;
    if(account.spendable===false)return true;
    return /Reserva|Investimento/i.test(String(account.type||''));
  }

  function installActualSavings(){
    if(typeof global.actualSavings!=='function'||global.actualSavings.__sfpRealizedSavings===true)return false;
    const original=global.actualSavings;
    const guarded=function(month=global.state?.mesAtual){
      const today=isoDate(new Date());
      return (global.state?.transfers||[])
        .filter(transfer=>{
          const realizedDate=String(transfer?.settledDate||transfer?.date||'').slice(0,10);
          if(!realizedDate||realizedDate>today||isoMonth(realizedDate)!==month)return false;
          const from=(global.state?.accounts||[]).find(account=>String(account.id)===String(transfer.fromId));
          const to=(global.state?.accounts||[]).find(account=>String(account.id)===String(transfer.toId));
          return !!from&&!!to&&!protectedAccount(from)&&protectedAccount(to);
        })
        .reduce((sum,transfer)=>sum+(Number(transfer.amount)||0),0);
    };
    Object.defineProperty(guarded,'__sfpRealizedSavings',{value:true});
    Object.defineProperty(guarded,'__sfpOriginalActualSavings',{value:original});
    global.actualSavings=guarded;
    try{actualSavings=guarded}catch{}
    return true;
  }

  function installRealizedContext(){
    if(!global.SFPFinancialIntegrityV2||typeof global.financialContextSnapshot!=='function'||typeof global.cashView!=='function')return false;
    if(global.financialContextSnapshot.__sfpCashRealized===true)return true;

    const original=global.financialContextSnapshot;
    const guarded=function(options={}){
      const base=original(options)||{};
      const reference=validDate(options.reference);
      const months=Math.max(1,Math.trunc(Number(options.months)||3));
      const endMonth=isoMonth(isoDate(reference));
      const monthList=Array.from({length:months},(_,index)=>monthAdd(endMonth,index-months+1));
      const cash=monthList.map(month=>global.cashView(month));
      const incomeCents=toCents(cash.reduce((sum,row)=>sum+(Number(row?.income)||0),0));
      const expenseCents=toCents(cash.reduce((sum,row)=>sum+(Number(row?.expense)||0),0));
      return {...base,realized:{incomeCents,expenseCents,resultCents:incomeCents-expenseCents}};
    };

    Object.defineProperty(guarded,'__sfpCashRealized',{value:true});
    Object.defineProperty(guarded,'__sfpOriginalFinancialContextSnapshot',{value:original});
    global.financialContextSnapshot=guarded;
    global.sfpFinancialContextSnapshot=guarded;
    try{financialContextSnapshot=guarded;sfpFinancialContextSnapshot=guarded}catch{}
    return true;
  }

  const install=()=>{
    const savingsReady=installActualSavings();
    const contextReady=installRealizedContext();
    return savingsReady&&contextReady;
  };

  let attempts=0;
  const timer=setInterval(()=>{
    attempts++;
    if(install()||attempts>=160)clearInterval(timer);
  },25);
  install();
})(typeof window!=='undefined'?window:globalThis);
