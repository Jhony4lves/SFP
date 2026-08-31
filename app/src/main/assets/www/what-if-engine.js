(function(global){
  'use strict';

  const VERSION=1;
  const DAY_MS=86400000;
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const cents=value=>Number.isFinite(Number(value))?Math.round(Number(value)):0;
  const clamp0=value=>Math.max(0,cents(value));
  const safeArray=value=>Array.isArray(value)?value:[];

  function assertPositiveCents(value,label='amountCents'){
    const amount=cents(value);
    if(amount<=0)throw new Error(`${label} must be greater than zero`);
    return amount;
  }

  function validatedDebtAmortization(scenario){
    const amount=assertPositiveCents(scenario?.amountCents);
    const debt=clone(scenario?.debt)||{};
    const balance=cents(debt.balanceCents);
    if(balance<=0)throw new Error('debt.balanceCents is required for debt_amortization');
    if(amount>balance)throw new Error('amountCents cannot exceed debt.balanceCents');
    return {amount,debt,balance};
  }

  function civilMs(value){
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match)return NaN;
    return Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),12,0,0,0);
  }

  function civilDate(ms){
    const d=new Date(ms);if(Number.isNaN(d.getTime()))return null;
    const y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,'0'),day=String(d.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function addDays(date,days){const ms=civilMs(date);return Number.isFinite(ms)?civilDate(ms+Number(days||0)*DAY_MS):null;}
  function daysBetween(from,to){const a=civilMs(from),b=civilMs(to);return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/DAY_MS):null;}

  function addMonths(date,months){
    const match=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return null;
    const y=Number(match[1]),m=Number(match[2])-1,day=Number(match[3]);
    const anchor=new Date(Date.UTC(y,m+Number(months||0),1,12));
    const last=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+1,0,12)).getUTCDate();
    anchor.setUTCDate(Math.min(day,last));return civilDate(anchor.getTime());
  }

  function distributeCents(total,count){
    const amount=assertPositiveCents(total,'totalCents'),n=Math.max(1,Math.trunc(Number(count)||0));
    const base=Math.floor(amount/n),remainder=amount-base*n;
    return Array.from({length:n},(_,index)=>base+(index<remainder?1:0));
  }

  function normalizeCoreSnapshot(snapshot){
    const input=clone(snapshot)||{};
    const availableCents=cents(input.availableCents??input.accounts?.totalCents);
    const reservedCents=clamp0(input.reserved?.amountCents);
    const freeCents=cents(input.free?.amountCents??(availableCents-reservedCents));
    return {...input,availableCents,reservedCents,freeCents,referenceDate:input.referenceDate||null,projections:safeArray(input.projections)};
  }

  function baselineEvent(event,index){
    const type=event?.type==='income'?'income':'expense';
    return {
      id:String(event?.id||`core-${index}`),date:event?.date||null,type,
      amountCents:clamp0(event?.amountCents),origin:event?.origin||event?.source||'core',scenario:false
    };
  }

  function scenarioEvent({id,date,type='expense',amountCents,origin='what_if',economicImpact='cash'}){
    return {id:String(id),date,type:type==='income'?'income':'expense',amountCents:assertPositiveCents(amountCents),origin,scenario:true,economicImpact};
  }

  function scenarioEvents(scenario,referenceDate){
    const type=scenario?.type;
    if(type==='spend_now'){
      return [scenarioEvent({id:'scenario:spend-now',date:scenario.date||referenceDate,type:'expense',amountCents:scenario.amountCents,origin:'what_if_spend'})];
    }
    if(type==='monthly_saving'){
      const amount=assertPositiveCents(scenario.amountCents),months=Math.max(1,Math.min(600,Math.trunc(Number(scenario.months)||12))),start=scenario.startDate||referenceDate;
      return Array.from({length:months},(_,index)=>scenarioEvent({id:`scenario:saving:${index+1}`,date:addMonths(start,index),type:'expense',amountCents:amount,origin:'what_if_goal_allocation',economicImpact:'allocation'}));
    }
    if(type==='installment_purchase'){
      const installments=Math.max(1,Math.min(120,Math.trunc(Number(scenario.installments)||1))),firstDueDate=scenario.firstDueDate;
      if(!firstDueDate||!Number.isFinite(civilMs(firstDueDate)))throw new Error('firstDueDate is required for installment_purchase');
      const parts=distributeCents(scenario.totalCents,installments);
      return parts.map((amount,index)=>scenarioEvent({id:`scenario:installment:${index+1}`,date:addMonths(firstDueDate,index),type:'expense',amountCents:amount,origin:'what_if_installment'}));
    }
    if(type==='debt_amortization'){
      const {amount}=validatedDebtAmortization(scenario);
      return [scenarioEvent({id:'scenario:debt-amortization',date:scenario.date||referenceDate,type:'expense',amountCents:amount,origin:'what_if_debt_amortization',economicImpact:'debt_transfer'})];
    }
    throw new Error(`Unsupported what-if scenario: ${String(type||'')}`);
  }

  function projectionFor(core,projection,extraEvents){
    const referenceDate=core.referenceDate||projection?.referenceDate;
    const days=Math.max(0,Number(projection?.days)||0),endDate=referenceDate?addDays(referenceDate,days):null;
    const coreEvents=safeArray(projection?.events).map(baselineEvent);
    const scenarioWithin=extraEvents.filter(event=>{
      if(!event.date||!referenceDate)return true;
      const diff=daysBetween(referenceDate,event.date);
      return diff!=null&&diff>=0&&(!endDate||event.date<=endDate);
    });
    const events=[...coreEvents,...scenarioWithin].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||(a.scenario===b.scenario?0:a.scenario?1:-1)||a.id.localeCompare(b.id));
    let balance=core.availableCents,minBalance=balance,minDate=referenceDate;
    const timeline=[{id:'opening',date:referenceDate,type:'opening',amountCents:0,balanceCents:balance,origin:'accounts',scenario:false}];
    for(const event of events){
      balance+=event.type==='income'?event.amountCents:-event.amountCents;
      if(balance<minBalance){minBalance=balance;minDate=event.date||minDate;}
      timeline.push({...event,balanceCents:balance});
    }
    return {days,availableCents:core.availableCents,projectedCents:balance,minBalanceCents:minBalance,minDate,negativeRisk:minBalance<0,events:timeline.slice(1),timeline};
  }

  function baselineProjectionSummary(core,projection){
    const normalized=projectionFor(core,projection,[]);
    return {
      days:normalized.days,
      projectedCents:cents(projection?.projectedCents??normalized.projectedCents),
      minBalanceCents:cents(projection?.minBalanceCents??normalized.minBalanceCents),
      minDate:projection?.minDate||normalized.minDate,
      negativeRisk:Boolean(projection?.negativeRisk)||cents(projection?.minBalanceCents??normalized.minBalanceCents)<0
    };
  }

  function reservedScenarioAmount(core,events){
    const nextDate=core.nextIncome?.date||null;
    if(!nextDate)return 0;
    return events.filter(event=>event.type==='expense'&&event.date&&event.date>core.referenceDate&&event.date<nextDate).reduce((sum,event)=>sum+event.amountCents,0);
  }

  function immediateCashAmount(core,events){
    return events.filter(event=>event.type==='expense'&&(!event.date||event.date<=core.referenceDate)).reduce((sum,event)=>sum+event.amountCents,0)
      -events.filter(event=>event.type==='income'&&(!event.date||event.date<=core.referenceDate)).reduce((sum,event)=>sum+event.amountCents,0);
  }

  function debtSchedule({balanceCents,monthlyRate,paymentCents,maxMonths=1200}={}){
    let balance=clamp0(balanceCents),rate=Math.max(0,Number(monthlyRate)||0),payment=clamp0(paymentCents),months=0,totalInterest=0,totalPaid=0;
    if(balance<=0)return {months:0,totalInterestCents:0,totalPaidCents:0,remainingCents:0,amortizes:true};
    if(payment<=0)return {months:null,totalInterestCents:null,totalPaidCents:null,remainingCents:balance,amortizes:false};
    while(balance>0&&months<maxMonths){
      const interest=Math.round(balance*rate);
      const due=balance+interest;
      const paid=Math.min(payment,due);
      if(paid<=interest&&rate>0)return {months:null,totalInterestCents:null,totalPaidCents:null,remainingCents:balance,amortizes:false};
      totalInterest+=interest;totalPaid+=paid;balance=due-paid;months++;
    }
    return {months:balance<=0?months:null,totalInterestCents:balance<=0?totalInterest:null,totalPaidCents:balance<=0?totalPaid:null,remainingCents:balance,amortizes:balance<=0};
  }

  function debtImpact(scenario){
    if(scenario?.type!=='debt_amortization')return null;
    const {amount,debt,balance}=validatedDebtAmortization(scenario),newBalance=balance-amount;
    const monthlyRate=Math.max(0,Number(debt.monthlyRate)||0),payment=clamp0(debt.paymentCents);
    const before=debtSchedule({balanceCents:balance,monthlyRate,paymentCents:payment});
    const after=debtSchedule({balanceCents:newBalance,monthlyRate,paymentCents:payment});
    const interestSaved=before.totalInterestCents!=null&&after.totalInterestCents!=null?Math.max(0,before.totalInterestCents-after.totalInterestCents):null;
    const monthsSaved=before.months!=null&&after.months!=null?Math.max(0,before.months-after.months):null;
    return {debtId:debt.id??null,balanceBeforeCents:balance,amortizationCents:amount,balanceAfterCents:newBalance,monthlyRate,paymentCents:payment,interestSavedCents:interestSaved,monthsSaved,beforeSchedule:before,afterSchedule:after};
  }

  function goalImpact(scenario){
    if(scenario?.type!=='monthly_saving')return null;
    const monthly=assertPositiveCents(scenario.amountCents),months=Math.max(1,Math.min(600,Math.trunc(Number(scenario.months)||12))),current=clamp0(scenario.currentGoalCents),target=scenario.targetGoalCents==null?null:clamp0(scenario.targetGoalCents),contribution=monthly*months,projected=current+contribution;
    return {goalId:scenario.goalId??null,currentCents:current,monthlyContributionCents:monthly,months,totalContributionCents:contribution,projectedCents:projected,targetCents:target,remainingAfterCents:target==null?null:Math.max(0,target-projected),reachesTarget:target==null?null:projected>=target};
  }

  function installmentImpact(scenario,events){
    if(scenario?.type!=='installment_purchase')return null;
    const total=assertPositiveCents(scenario.totalCents),installments=events.length;
    return {totalCents:total,installments,firstDueDate:events[0]?.date||null,lastDueDate:events.at(-1)?.date||null,installmentCents:events.map(e=>e.amountCents),sumCents:events.reduce((sum,e)=>sum+e.amountCents,0)};
  }

  function simulate({snapshot,scenario}={}){
    const rawSnapshot=clone(snapshot),rawScenario=clone(scenario);
    const core=normalizeCoreSnapshot(rawSnapshot),referenceDate=core.referenceDate;
    if(!referenceDate||!Number.isFinite(civilMs(referenceDate)))throw new Error('snapshot.referenceDate is required');
    const events=scenarioEvents(rawScenario,referenceDate);
    const immediate=immediateCashAmount(core,events),addedReserved=reservedScenarioAmount(core,events);
    const simulatedAvailable=core.availableCents-immediate;
    const simulatedReserved=core.reservedCents+addedReserved;
    const simulatedFree=simulatedAvailable-simulatedReserved;
    const projections=core.projections.map(projection=>projectionFor(core,projection,events));
    const baselineProjections=core.projections.map(projection=>baselineProjectionSummary(core,projection));
    const currentWorst=baselineProjections.reduce((worst,p)=>worst==null||p.minBalanceCents<worst.minBalanceCents?p:worst,null);
    const simulatedWorst=projections.reduce((worst,p)=>worst==null||p.minBalanceCents<worst.minBalanceCents?p:worst,null);
    const debt=debtImpact(rawScenario),goal=goalImpact(rawScenario),installment=installmentImpact(rawScenario,events);
    const commitmentDeltaCents=rawScenario?.type==='installment_purchase'?installment.totalCents:rawScenario?.type==='monthly_saving'?goal.totalContributionCents:0;
    const netWorthDeltaCents=rawScenario?.type==='spend_now'?-assertPositiveCents(rawScenario.amountCents):0;

    return {
      version:VERSION,
      referenceDate,
      scenario:rawScenario,
      events:clone(events),
      baseline:{availableCents:core.availableCents,reservedCents:core.reservedCents,freeCents:core.freeCents,safeToSpendCents:Math.max(0,core.freeCents),worstProjection:currentWorst,projections:baselineProjections},
      simulated:{availableCents:simulatedAvailable,reservedCents:simulatedReserved,freeCents:simulatedFree,safeToSpendCents:Math.max(0,simulatedFree),worstProjection:simulatedWorst,projections},
      delta:{availableCents:simulatedAvailable-core.availableCents,reservedCents:simulatedReserved-core.reservedCents,freeCents:simulatedFree-core.freeCents,safeToSpendCents:Math.max(0,simulatedFree)-Math.max(0,core.freeCents),commitmentCents:commitmentDeltaCents,netWorthCents:netWorthDeltaCents},
      debtImpact:debt,
      goalImpact:goal,
      installmentImpact:installment,
      assumptions:[
        'O cenário começa no snapshot autoritativo do Local Financial Core.',
        'Eventos hipotéticos só existem dentro deste relatório e não são persistidos.',
        rawScenario?.type==='monthly_saving'?'Guardar por mês é tratado como compromisso de reserva: reduz caixa livre projetado, mas não reduz patrimônio líquido por si só.':null,
        rawScenario?.type==='debt_amortization'?'Amortização reduz caixa e saldo devedor pelo mesmo principal validado; estimativa de juros/prazo só existe quando taxa mensal e parcela foram fornecidas.':null,
        rawScenario?.type==='installment_purchase'?'Compra parcelada entra no caixa nas datas de vencimento fornecidas; limite de cartão e ciclo de fatura serão tratados pelo adaptador de produto, não inventados pelo engine.':null
      ].filter(Boolean),
      limitations:[
        'O motor não prevê renda, inflação, rentabilidade, multas ou compras que ainda não estejam no snapshot ou no cenário.',
        'Resultados são projeções condicionais, não promessa de saldo futuro.'
      ],
      contracts:{readOnly:true,persisted:false,moneyUnit:'cents',hiddenBuffer:false,sourceOfTruth:'Local Financial Core'}
    };
  }

  global.SFPWhatIf=Object.freeze({VERSION,version:VERSION,simulate,distributeCents,debtSchedule,addMonths,addDays});
})(typeof window!=='undefined'?window:globalThis);
