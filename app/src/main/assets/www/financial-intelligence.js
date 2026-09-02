(function(global){
  'use strict';

  const ENGINE_VERSION = 1;
  const DEFAULT_THRESHOLDS = Object.freeze({
    categoryDeviationRatio: 1.5,
    categoryDeviationMinDeltaCents: 5000,
    categoryDeviationMinBaselineCents: 5000,
    lowSavingsRate: 0.10,
    maxDuplicateInsights: 3,
    upcomingWindowDays: 14,
    maxUpcomingItems: 5
  });

  const safeArray = value => Array.isArray(value) ? value : [];
  const cents = value => Math.round(Number(value) || 0);
  const moneyCents = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents(value)/100);
  const civilDate = value => { const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3]+'/'+m[2]+'/'+m[1] : String(value||'—'); };
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const normalizeText = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();

  function dateDistanceDays(a,b){
    const da = new Date(String(a) + 'T12:00:00');
    const db = new Date(String(b) + 'T12:00:00');
    if(Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
    return Math.round(Math.abs(da-db)/86400000);
  }

  function sameEconomicMovement(a,b){
    if(!a || !b) return false;
    if(a.id != null && b.id != null && String(a.id) === String(b.id)) return false;
    if(String(a.accountId ?? '') !== String(b.accountId ?? '')) return false;
    if(String(a.kind || '') !== String(b.kind || '')) return false;
    if(cents(a.amountCents) !== cents(b.amountCents)) return false;
    if(String(a.date || '') !== String(b.date || '')) return false;
    const ad = normalizeText(a.desc);
    const bd = normalizeText(b.desc);
    return !!ad && ad === bd;
  }

  function duplicateCandidates(transactions){
    const txs = safeArray(transactions).filter(t => {
      if(!t || !t.date || !t.kind) return false;
      if(t.economicImpact === 'neutral') return false;
      return cents(t.amountCents) > 0;
    });
    const out = [];
    const seenPairs = new Set();
    for(let i=0;i<txs.length;i++){
      for(let j=i+1;j<txs.length;j++){
        const a=txs[i],b=txs[j];
        if(!sameEconomicMovement(a,b)) continue;
        const key=[String(a.id ?? i),String(b.id ?? j)].sort().join(':');
        if(seenPairs.has(key)) continue;
        seenPairs.add(key);
        out.push({
          firstId:a.id ?? null,
          secondId:b.id ?? null,
          accountId:a.accountId ?? null,
          date:a.date,
          kind:a.kind,
          amountCents:cents(a.amountCents),
          desc:a.desc || b.desc || '',
          confidence:1,
          reason:'Mesma conta, data, natureza, valor e descrição normalizada.'
        });
      }
    }
    return out;
  }

  function categoryDeviations(categoryMonthly,currentMonth,thresholds){
    const rows=safeArray(categoryMonthly).filter(r=>r&&r.month&&r.categoriesCents&&typeof r.categoriesCents==='object');
    const current=rows.find(r=>r.month===currentMonth);
    if(!current) return [];
    const previous=rows.filter(r=>r.month<currentMonth).sort((a,b)=>b.month.localeCompare(a.month)).slice(0,3);
    if(!previous.length) return [];
    const categories=new Set(Object.keys(current.categoriesCents||{}));
    previous.forEach(r=>Object.keys(r.categoriesCents||{}).forEach(k=>categories.add(k)));
    const out=[];
    for(const category of categories){
      const currentCents=cents(current.categoriesCents?.[category]);
      const values=previous.map(r=>cents(r.categoriesCents?.[category]));
      const baselineCents=Math.round(values.reduce((s,v)=>s+v,0)/values.length);
      if(baselineCents < thresholds.categoryDeviationMinBaselineCents) continue;
      const deltaCents=currentCents-baselineCents;
      const ratio=baselineCents>0?currentCents/baselineCents:null;
      if(deltaCents < thresholds.categoryDeviationMinDeltaCents) continue;
      if(ratio == null || ratio < thresholds.categoryDeviationRatio) continue;
      out.push({category,currentCents,baselineCents,deltaCents,ratio});
    }
    return out.sort((a,b)=>b.deltaCents-a.deltaCents);
  }

  function insight(base){
    return {
      id:base.id,
      type:base.type,
      severity:base.severity || 'info',
      confidence:clamp(Number(base.confidence ?? 1),0,1),
      title:base.title || '',
      message:base.message || '',
      explanation:base.explanation || '',
      evidence:base.evidence || {},
      actions:safeArray(base.actions)
    };
  }

  function analyze(input={}){
    const snapshot=input.snapshot || {};
    const thresholds={...DEFAULT_THRESHOLDS,...(input.thresholds||{})};
    const currentMonth=input.currentMonth || snapshot?.period?.months?.at?.(-1) || null;
    const insights=[];

    const projections=safeArray(snapshot.projections);
    const risky=projections.filter(p=>p&&p.negativeRisk).sort((a,b)=>(a.days||999)-(b.days||999))[0];
    if(risky){
      insights.push(insight({
        id:`cashflow-risk-${risky.days}`,
        type:'cashflow_risk',
        severity:'critical',
        confidence:1,
        title:`Risco de saldo negativo em até ${risky.days} dias`,
        message:`A projeção determinística encontra saldo mínimo de ${moneyCents(risky.minBalanceCents)} antes do fim da janela.`,
        explanation:'Saldo atual + entradas previstas − saídas previstas; o menor ponto da trajetória ficou abaixo de zero.',
        evidence:{days:risky.days,availableCents:cents(risky.availableCents),projectedCents:cents(risky.projectedCents),minBalanceCents:cents(risky.minBalanceCents),minDate:risky.minDate,events:safeArray(risky.events)}
      }));
    }

    const expenseEvents=safeArray(snapshot?.commitments?.events)
      .filter(e=>e&&e.type==='expense')
      .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    const referenceDate=input.referenceDate || snapshot.referenceDate || null;
    const upcoming=expenseEvents.filter(e=>{
      if(!referenceDate) return true;
      const distance=dateDistanceDays(referenceDate,e.date);
      return distance!=null && distance<=thresholds.upcomingWindowDays;
    }).slice(0,thresholds.maxUpcomingItems);
    if(upcoming.length){
      const totalCents=upcoming.reduce((s,e)=>s+cents(e.amountCents ?? Math.round((Number(e.amount)||0)*100)),0);
      insights.push(insight({
        id:`upcoming-obligations-${referenceDate||'current'}`,
        type:'upcoming_obligations',
        severity:'info',
        confidence:1,
        title:`${upcoming.length} compromisso${upcoming.length===1?'':'s'} nos próximos ${thresholds.upcomingWindowDays} dias`,
        message:`Total conhecido de ${moneyCents(totalCents)} nessa janela.`,
        explanation:'Considera apenas obrigações futuras conhecidas e ainda não realizadas no Local Financial Core.',
        evidence:{windowDays:thresholds.upcomingWindowDays,totalCents,events:upcoming.map(e=>({date:e.date,desc:e.desc||'',origin:e.source||e.origin||'',amountCents:cents(e.amountCents ?? Math.round((Number(e.amount)||0)*100))}))}
      }));
    }

    const deviations=categoryDeviations(input.categoryMonthly,currentMonth,thresholds);
    deviations.slice(0,3).forEach(d=>{
      insights.push(insight({
        id:`category-deviation-${normalizeText(d.category).replace(/\s+/g,'-')||'unknown'}`,
        type:'category_deviation',
        severity:d.ratio>=2?'warning':'info',
        confidence:0.95,
        title:`${d.category}: gasto acima do padrão recente`,
        message:`O mês atual está ${Math.round((d.ratio-1)*100)}% acima da média dos meses anteriores usados como base.`,
        explanation:'Compara o gasto da categoria no mês atual com a média dos até 3 meses anteriores disponíveis; só sinaliza diferenças materiais.',
        evidence:{category:d.category,currentCents:d.currentCents,baselineCents:d.baselineCents,deltaCents:d.deltaCents,ratio:d.ratio,currentMonth}
      }));
    });

    const duplicates=duplicateCandidates(input.transactions);
    duplicates.slice(0,thresholds.maxDuplicateInsights).forEach((d,index)=>{
      insights.push(insight({
        id:`duplicate-candidate-${d.firstId ?? index}-${d.secondId ?? index+1}`,
        type:'duplicate_candidate',
        severity:'warning',
        confidence:d.confidence,
        title:'Possível lançamento duplicado',
        message:`Duas movimentações idênticas de ${moneyCents(d.amountCents)} foram encontradas em ${civilDate(d.date)}.`,
        explanation:d.reason,
        evidence:d,
        actions:['review_transactions']
      }));
    });

    const incomeCents=cents(snapshot?.realized?.incomeCents);
    const resultCents=cents(snapshot?.realized?.resultCents);
    let savingsRate=null;
    if(incomeCents>0){
      savingsRate=resultCents/incomeCents;
      if(savingsRate<thresholds.lowSavingsRate){
        insights.push(insight({
          id:'low-savings-rate',
          type:'low_savings',
          severity:savingsRate<0?'critical':'warning',
          confidence:0.9,
          title:savingsRate<0?'Resultado acumulado negativo':'Poupança abaixo da faixa de atenção',
          message:savingsRate<0
            ?`As despesas superam as receitas no período analisado em ${Math.abs(Math.round(savingsRate*100))}% das receitas.`
            :`A taxa de poupança do período está em ${Math.round(savingsRate*100)}%.`,
          explanation:'Taxa de poupança = (receitas − despesas) ÷ receitas no período do snapshot financeiro.',
          evidence:{incomeCents,resultCents,savingsRate,threshold:savingsRate<0?0:thresholds.lowSavingsRate}
        }));
      }
    }

    const severityRank={critical:0,warning:1,info:2};
    insights.sort((a,b)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9)||b.confidence-a.confidence||a.type.localeCompare(b.type));

    const summary={
      total:insights.length,
      critical:insights.filter(i=>i.severity==='critical').length,
      warning:insights.filter(i=>i.severity==='warning').length,
      info:insights.filter(i=>i.severity==='info').length
    };

    return {
      version:ENGINE_VERSION,
      generatedFor:referenceDate || snapshot.referenceDate || null,
      currentMonth,
      thresholds:{...thresholds},
      metrics:{savingsRate,duplicateCandidates:duplicates.length,categoryDeviations:deviations.length,negativeCashflowRisk:!!risky},
      summary,
      insights
    };
  }

  global.SFPFinancialIntelligence=Object.freeze({
    version:ENGINE_VERSION,
    analyze,
    duplicateCandidates,
    categoryDeviations,
    normalizeText,
    thresholds:DEFAULT_THRESHOLDS
  });
})(typeof window!=='undefined'?window:globalThis);
