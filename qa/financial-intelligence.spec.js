const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

function baseSnapshot(){
  return {
    referenceDate:'2026-08-28',
    period:{months:['2026-06','2026-07','2026-08']},
    realized:{incomeCents:300000,expenseCents:270000,resultCents:30000},
    commitments:{events:[]},
    projections:[
      {days:7,availableCents:100000,projectedCents:90000,minBalanceCents:90000,minDate:'2026-09-04',negativeRisk:false,events:[]},
      {days:30,availableCents:100000,projectedCents:70000,minBalanceCents:60000,minDate:'2026-09-15',negativeRisk:false,events:[]}
    ]
  };
}

test.describe('Financial Intelligence Foundation',()=>{
  test('engine externo carrega e expõe contrato versionado',async({page})=>{
    await boot(page);
    const info=await page.evaluate(()=>({version:window.SFPFinancialIntelligence?.version,hasAnalyze:typeof window.SFPFinancialIntelligence?.analyze==='function'}));
    expect(info).toEqual({version:1,hasAnalyze:true});
  });

  test('detecta risco determinístico de saldo negativo pela projeção',async({page})=>{
    await boot(page);
    const report=await page.evaluate((snapshot)=>{
      snapshot.projections[1]={days:30,availableCents:100000,projectedCents:-5000,minBalanceCents:-12000,minDate:'2026-09-12',negativeRisk:true,events:[{date:'2026-09-12',type:'expense',amountCents:25000,balanceCents:-12000}]};
      return window.SFPFinancialIntelligence.analyze({snapshot});
    },baseSnapshot());
    const risk=report.insights.find(i=>i.type==='cashflow_risk');
    expect(risk).toBeTruthy();
    expect(risk.severity).toBe('critical');
    expect(risk.evidence.minBalanceCents).toBe(-12000);
    expect(report.metrics.negativeCashflowRisk).toBe(true);
  });

  test('detecta desvio relevante de categoria contra média recente',async({page})=>{
    await boot(page);
    const report=await page.evaluate((snapshot)=>window.SFPFinancialIntelligence.analyze({
      snapshot,
      currentMonth:'2026-08',
      categoryMonthly:[
        {month:'2026-05',categoriesCents:{Alimentação:10000}},
        {month:'2026-06',categoriesCents:{Alimentação:12000}},
        {month:'2026-07',categoriesCents:{Alimentação:11000}},
        {month:'2026-08',categoriesCents:{Alimentação:22000}}
      ]
    }),baseSnapshot());
    const deviation=report.insights.find(i=>i.type==='category_deviation');
    expect(deviation).toBeTruthy();
    expect(deviation.evidence.category).toBe('Alimentação');
    expect(deviation.evidence.currentCents).toBe(22000);
    expect(deviation.evidence.baselineCents).toBe(11000);
  });

  test('sinaliza duplicata somente quando conta/data/natureza/valor/descrição coincidem',async({page})=>{
    await boot(page);
    const report=await page.evaluate((snapshot)=>window.SFPFinancialIntelligence.analyze({
      snapshot,
      transactions:[
        {id:1,accountId:10,date:'2026-08-20',kind:'expense',amountCents:1898,desc:'Mercado Central'},
        {id:2,accountId:10,date:'2026-08-20',kind:'expense',amountCents:1898,desc:'Mercado Central'},
        {id:3,accountId:11,date:'2026-08-20',kind:'expense',amountCents:1898,desc:'Mercado Central'}
      ]
    }),baseSnapshot());
    expect(report.metrics.duplicateCandidates).toBe(1);
    const dup=report.insights.find(i=>i.type==='duplicate_candidate');
    expect(dup).toBeTruthy();
    expect(dup.evidence.firstId).toBe(1);
    expect(dup.evidence.secondId).toBe(2);
  });

  test('taxa de poupança baixa gera insight explicável',async({page})=>{
    await boot(page);
    const snapshot=baseSnapshot();
    snapshot.realized={incomeCents:200000,expenseCents:190000,resultCents:10000};
    const report=await page.evaluate(s=>window.SFPFinancialIntelligence.analyze({snapshot:s}),snapshot);
    const insight=report.insights.find(i=>i.type==='low_savings');
    expect(insight).toBeTruthy();
    expect(insight.severity).toBe('warning');
    expect(report.metrics.savingsRate).toBeCloseTo(0.05,5);
    expect(insight.explanation).toContain('receitas');
  });

  test('análise é read-only e não muta entradas',async({page})=>{
    await boot(page);
    const result=await page.evaluate((snapshot)=>{
      const input={
        snapshot,
        currentMonth:'2026-08',
        categoryMonthly:[{month:'2026-07',categoriesCents:{Casa:10000}},{month:'2026-08',categoriesCents:{Casa:20000}}],
        transactions:[{id:1,accountId:1,date:'2026-08-10',kind:'expense',amountCents:1000,desc:'Teste'}]
      };
      const before=JSON.stringify(input);
      window.SFPFinancialIntelligence.analyze(input);
      return {before,after:JSON.stringify(input)};
    },baseSnapshot());
    expect(result.after).toBe(result.before);
  });

  test('adapter do SFP expõe relatório e Sophy possui scope insights',async({page})=>{
    await boot(page);
    const data=await page.evaluate(async()=>{
      const report=window.financialIntelligenceSnapshot();
      const tool=window.sophyToolRegistry.getTool('get_financial_context');
      const defs=window.sophyToolRegistry.getGroqToolDefinitions();
      const toolReport=await tool.execute({scope:'insights'});
      return {
        reportVersion:report.version,
        hasSummary:!!report.summary,
        enumHasInsights:defs[0].function.parameters.properties.scope.enum.includes('insights'),
        toolScope:toolReport.scope,
        toolVersion:toolReport.report?.version
      };
    });
    expect(data.reportVersion).toBe(1);
    expect(data.hasSummary).toBe(true);
    expect(data.enumHasInsights).toBe(true);
    expect(data.toolScope).toBe('insights');
    expect(data.toolVersion).toBe(1);
  });

  test('Sophy offline responde consulta de atenção usando o mesmo motor',async({page})=>{
    await boot(page);
    const answer=await page.evaluate(()=>window.sophyOfflineCore.process('O que merece atenção nas minhas finanças agora?'));
    expect(answer.structured?.type).toBe('financial_insights');
    expect(answer.structured?.report?.version).toBe(1);
    expect(typeof answer.text).toBe('string');
    expect(answer.text.length).toBeGreaterThan(10);
  });

  test('Sophy explica alerta concreto sem cair em definição genérica de compromisso',async({page})=>{
    await boot(page);
    const prompt='Sophy, me explica esse alerta de um jeito simples: “1 compromisso nos próximos 14 dias”. O SFP encontrou: 1 obrigação(ões) conhecida(s), total de R$ 400,00. O que isso significa para o meu mês e qual é a ação mais útil agora?';
    const answer=await page.evaluate(p=>window.sophyOfflineCore.process(p),prompt);
    expect(answer.structured?.type).toBe('financial_alert_explanation');
    expect(answer.structured?.days).toBe(14);
    expect(answer.structured?.count).toBe(1);
    expect(answer.structured?.total).toBe(400);
    expect(answer.text).toContain('R$ 400,00');
    expect(answer.text).toContain('14 dias');
    expect(answer.text).not.toContain('1. **Caixa**');
    expect(answer.text).not.toContain('2. **Competência**');
  });

});
