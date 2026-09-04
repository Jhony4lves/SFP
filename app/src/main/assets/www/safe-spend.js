(function(global){
  'use strict';

  const VERSION=1;
  const cents=value=>Number.isFinite(Number(value))?Math.round(Number(value)):0;
  const clamp0=value=>Math.max(0,cents(value));
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  function chooseProjection(snapshot,days=30){
    const items=Array.isArray(snapshot?.projections)?snapshot.projections:[];
    return items.find(p=>Number(p.days)===Number(days))||items.find(p=>Number(p.days)>=Number(days))||items.at(-1)||null;
  }

  function normalizeTimeline(projection,availableCents){
    const events=Array.isArray(projection?.events)?projection.events:[];
    const startDate=projection?.referenceDate||null;
    return [
      {id:'opening',date:startDate,type:'opening',amountCents:0,balanceCents:cents(availableCents),origin:'accounts'},
      ...events.map((event,index)=>({
        id:String(event.id||`event-${index}`),
        date:event.date||null,
        type:event.type==='income'?'income':'expense',
        amountCents:clamp0(event.amountCents),
        balanceCents:cents(event.balanceCents),
        origin:event.origin||null
      }))
    ];
  }

  function analyze({snapshot,projectionDays=30}={}){
    const input=clone(snapshot)||{};
    const availableCents=cents(input.availableCents ?? input.accounts?.totalCents);
    const reservedCents=clamp0(input.reserved?.amountCents);
    const reportedFree=cents(input.free?.amountCents ?? (availableCents-reservedCents));
    const safeToSpendCents=clamp0(reportedFree);
    const shortfallCents=clamp0(-reportedFree);
    const projection=chooseProjection(input,projectionDays);
    const minBalanceCents=cents(projection?.minBalanceCents ?? availableCents);
    const negativeRisk=Boolean(projection?.negativeRisk)||minBalanceCents<0;
    const nextIncome=input.nextIncome?clone(input.nextIncome):null;
    const timeline=normalizeTimeline(projection,availableCents);
    const coverageRatio=reservedCents>0?Math.max(0,Math.min(1,availableCents/reservedCents)):1;

    let status='healthy';
    if(shortfallCents>0||negativeRisk)status='critical';
    else if(reservedCents>0&&safeToSpendCents<=Math.round(availableCents*.1))status='tight';

    const basis=nextIncome
      ? `Obrigações conhecidas até a próxima entrada prevista em ${nextIncome.date}.`
      : 'Sem próxima entrada conhecida; o SFP usa a janela conservadora já definida pelo Local Financial Core.';

    return {
      version:VERSION,
      generatedFor:input.referenceDate||null,
      status,
      availableCents,
      reservedCents,
      freeCents:reportedFree,
      safeToSpendCents,
      shortfallCents,
      coverageRatio,
      nextIncome,
      projection:{
        days:Number(projection?.days)||Number(projectionDays)||30,
        projectedCents:cents(projection?.projectedCents ?? availableCents),
        minBalanceCents,
        minDate:projection?.minDate||input.referenceDate||null,
        negativeRisk,
        timeline
      },
      formula:'SAFE_TO_SPEND = MAX(0, AVAILABLE - RESERVED)',
      basis,
      limitations:[
        'Considera apenas saldos, entradas e obrigações conhecidas pelo SFP.',
        'Não prevê compras futuras ainda não registradas nem eventos externos.',
        'Não inclui margem pessoal de segurança oculta; qualquer buffer futuro deve ser explícito e configurável.'
      ]
    };
  }

  global.SFPSafeSpend=Object.freeze({version:VERSION,analyze});
})(typeof window!=='undefined'?window:globalThis);

(function loadWhatIfSuite(){
  if(typeof document==='undefined')return;
  const loadUI=()=>{
    if(document.querySelector('script[data-sfp-what-if-ui="1"]'))return;
    const ui=document.createElement('script');
    ui.src='what-if-ui.js';
    ui.async=false;
    ui.dataset.sfpWhatIfUi='1';
    document.head.appendChild(ui);
  };
  if(globalThis.SFPWhatIf){loadUI();return;}
  let script=document.querySelector('script[data-sfp-what-if="1"]');
  if(!script){
    script=document.createElement('script');
    script.src='what-if-engine.js';
    script.async=false;
    script.dataset.sfpWhatIf='1';
    document.head.appendChild(script);
  }
  script.addEventListener('load',loadUI,{once:true});
})();

(function loadSophyA3(){
  if(typeof document==='undefined'||document.querySelector('script[data-sfp-sophy-a3="1"]'))return;
  const script=document.createElement('script');
  script.src='sophy-proactive-brief.js';
  script.async=false;
  script.dataset.sfpSophyA3='1';
  document.head.appendChild(script);
})();

/*
 * SFP_BALANCE_EVIDENCE_GUARD_V1
 *
 * transferEvidence é somente evidência de uma possível transferência.
 * Enquanto não houver pareamento/confirmação, ela não representa dinheiro
 * efetivamente debitado ou creditado no saldo oficial da conta.
 *
 * O core legado ainda soma evidências pendentes em accountBalance(). Este
 * guard neutraliza apenas essa parcela e se auto-desativa quando o core for
 * refatorado para remover transferEvidence da função nativa.
 */
(function installTransferEvidenceBalanceGuard(){
  if(typeof document==='undefined')return;

  const install=()=>{
    try{
      if(typeof accountBalance!=='function'||typeof state==='undefined'){
        setTimeout(install,0);
        return;
      }
      if(accountBalance.__sfpTransferEvidenceNeutral===true)return;

      const source=Function.prototype.toString.call(accountBalance);
      if(!source.includes('transferEvidence'))return;

      const original=accountBalance;
      const guarded=function(id){
        let value=Number(original(id)||0);
        (state.transferEvidence||[])
          .filter(e=>e.accountId==id&&e.status!=='matched'&&e.balanceImpact===true)
          .forEach(e=>value-=Number(e.amount)||0);
        return Math.round(value*100)/100;
      };

      Object.defineProperty(guarded,'__sfpTransferEvidenceNeutral',{value:true});
      Object.defineProperty(guarded,'__sfpOriginalAccountBalance',{value:original});
      accountBalance=guarded;
      if(typeof window!=='undefined')window.accountBalance=guarded;
    }catch(error){
      console.error('SFP balance evidence guard:',error);
    }
  };

  setTimeout(install,0);
})();

(function loadFinancialIntegrityV2(){
  if(typeof document==='undefined'||document.querySelector('script[data-sfp-financial-integrity-v2="1"]'))return;
  const script=document.createElement('script');
  script.src='financial-integrity-v2.js';
  script.async=false;
  script.dataset.sfpFinancialIntegrityV2='1';
  document.head.appendChild(script);
})();

(function loadManualInvoiceReconciliation(){
  if(typeof document==='undefined'||document.querySelector('script[data-sfp-manual-invoice-reconciliation="1"]'))return;
  const script=document.createElement('script');
  script.src='invoice-manual-reconciliation.js';
  script.async=false;
  script.dataset.sfpManualInvoiceReconciliation='1';
  document.head.appendChild(script);
})();

(function loadOpenFinancePersonal(){
  if(typeof document==='undefined'||document.querySelector('script[data-sfp-open-finance-personal="1"]'))return;
  const script=document.createElement('script');
  script.src='open-finance-personal.js';
  script.async=false;
  script.dataset.sfpOpenFinancePersonal='1';
  document.head.appendChild(script);
})();
