const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

function snapshot(overrides={}){
  return {
    referenceDate:'2026-08-28',
    availableCents:100000,
    accounts:{totalCents:100000},
    reserved:{status:'known',amountCents:40000,reasons:[]},
    free:{status:'known',amountCents:60000,formula:'AVAILABLE - RESERVED'},
    nextIncome:{date:'2026-09-01',amountCents:150000,type:'income'},
    projections:[
      {days:7,availableCents:100000,projectedCents:90000,minBalanceCents:80000,minDate:'2026-08-31',negativeRisk:false,events:[]},
      {days:30,availableCents:100000,projectedCents:120000,minBalanceCents:55000,minDate:'2026-08-30',negativeRisk:false,events:[
        {id:'rec:1',date:'2026-08-30',type:'expense',amountCents:45000,balanceCents:55000,origin:'recurring'},
        {id:'rec:2',date:'2026-09-01',type:'income',amountCents:150000,balanceCents:205000,origin:'recurring'},
        {id:'invoice:1',date:'2026-09-05',type:'expense',amountCents:85000,balanceCents:120000,origin:'invoice'}
      ]}
    ],
    ...overrides
  };
}

test.describe('Safe-to-spend + Cashflow Projection',()=>{
  test('motor carrega com contrato versionado',async({page})=>{
    await boot(page);
    expect(await page.evaluate(()=>({version:window.SFPSafeSpend?.version,analyze:typeof window.SFPSafeSpend?.analyze}))).toEqual({version:1,analyze:'function'});
  });

  test('gasto seguro usa somente disponível menos reservado conhecido',async({page})=>{
    await boot(page);
    const report=await page.evaluate(s=>window.SFPSafeSpend.analyze({snapshot:s}),snapshot());
    expect(report.availableCents).toBe(100000);
    expect(report.reservedCents).toBe(40000);
    expect(report.freeCents).toBe(60000);
    expect(report.safeToSpendCents).toBe(60000);
    expect(report.shortfallCents).toBe(0);
    expect(report.formula).toBe('SAFE_TO_SPEND = MAX(0, AVAILABLE - RESERVED)');
  });

  test('déficit conhecido nunca vira permissão de gasto negativa ou falsa',async({page})=>{
    await boot(page);
    const base=snapshot({availableCents:30000,accounts:{totalCents:30000},reserved:{status:'known',amountCents:50000,reasons:[]},free:{status:'known',amountCents:-20000}});
    const report=await page.evaluate(s=>window.SFPSafeSpend.analyze({snapshot:s}),base);
    expect(report.safeToSpendCents).toBe(0);
    expect(report.shortfallCents).toBe(20000);
    expect(report.status).toBe('critical');
  });

  test('risco negativo da projeção torna o estado crítico mesmo com livre atual positivo',async({page})=>{
    await boot(page);
    const base=snapshot();
    base.projections[1].negativeRisk=true;
    base.projections[1].minBalanceCents=-1000;
    const report=await page.evaluate(s=>window.SFPSafeSpend.analyze({snapshot:s}),base);
    expect(report.safeToSpendCents).toBe(60000);
    expect(report.projection.negativeRisk).toBe(true);
    expect(report.status).toBe('critical');
  });

  test('análise é read-only e mantém timeline dos eventos do Local Financial Core',async({page})=>{
    await boot(page);
    const base=snapshot(),before=JSON.stringify(base);
    const result=await page.evaluate(s=>({report:window.SFPSafeSpend.analyze({snapshot:s}),after:JSON.stringify(s)}),base);
    expect(result.after).toBe(before);
    expect(result.report.projection.timeline.filter(e=>e.type!=='opening')).toHaveLength(3);
    expect(result.report.projection.timeline.at(-1)).toMatchObject({type:'expense',balanceCents:120000,origin:'invoice'});
  });

  test('painel exibe disponível, reservado, livre, menor saldo e eventos conhecidos',async({page})=>{
    await boot(page);
    await page.evaluate(s=>{
      window.__qaSafeSnapshot=s;
      window.financialContextSnapshot=()=>window.__qaSafeSnapshot;
      window.renderSafeSpendProjection();
      window.applyPrivacy();
    },snapshot());
    const panel=page.locator('#safeSpendPanel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Quanto posso gastar?');
    await expect(panel.locator('.safe-spend-value')).toContainText('600');
    await expect(panel).toContainText('Disponível');
    await expect(panel).toContainText('Reservado');
    await expect(panel).toContainText('Livre');
    await expect(panel.locator('.safe-spend-min')).toContainText('550');
    await expect(panel.locator('.safe-spend-event')).toHaveCount(3);
  });

  test('painel deixa explícita a limitação e não usa buffer oculto',async({page})=>{
    await boot(page);
    await page.evaluate(s=>{window.financialContextSnapshot=()=>s;window.renderSafeSpendProjection();},snapshot());
    const panel=page.locator('#safeSpendPanel');
    await expect(panel).toContainText('não esconde margem arbitrária');
  });

  test('Perguntar à Sophy exige o mesmo core e proíbe invenção de buffer',async({page})=>{
    await boot(page);
    await page.evaluate(s=>{
      window.financialContextSnapshot=()=>s;
      window.__qaSafePrompt=null;
      window.sophySendMessage=async p=>{window.__qaSafePrompt=p};
      window.renderSafeSpendProjection();
    },snapshot());
    await page.getByRole('button',{name:'Perguntar à Sophy'}).last().click();
    await expect(page.locator('#pageTitle')).toHaveText('Sophy');
    const prompt=await page.evaluate(()=>window.__qaSafePrompt);
    expect(prompt).toContain('Local Financial Core');
    expect(prompt).toContain('Não invente buffer');
    expect(prompt).toContain('saldo disponível, reservado e livre');
  });

  test('modo de privacidade cobre valores do painel',async({page})=>{
    await boot(page);
    await page.evaluate(s=>{
      window.financialContextSnapshot=()=>s;
      state.settings.privacy=true;
      window.renderSafeSpendProjection();
      window.applyPrivacy();
    },snapshot());
    await expect(page.locator('#safeSpendPanel .safe-spend-value')).toHaveClass(/private-value/);
    await expect(page.locator('#safeSpendPanel .safe-spend-event-balance').first()).toHaveClass(/private-value/);
  });
});
