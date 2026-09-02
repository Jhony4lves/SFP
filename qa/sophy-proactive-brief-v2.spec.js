const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  await page.waitForFunction(()=>window.__SFP_SOPHY_A3_INSTALLED===true&&window.SFPProactiveBrief?.version===2);
}

const healthyInsights={version:1,generatedFor:'2026-08-31',summary:{total:1,critical:0,warning:0,info:1},insights:[{
  id:'upcoming-obligations-2026-08-31',type:'upcoming_obligations',severity:'info',confidence:1,
  title:'2 compromissos próximos',message:'Compromissos conhecidos.',explanation:'Somente obrigações conhecidas.',
  evidence:{totalCents:25000,events:[{date:'2026-09-01'},{date:'2026-09-02'}]}
}]};

const duplicateInsights={version:1,generatedFor:'2026-08-31',summary:{total:1,critical:0,warning:1,info:0},insights:[{
  id:'duplicate-candidate-a-b',type:'duplicate_candidate',severity:'warning',confidence:1,
  title:'Possível lançamento duplicado',message:'Duas movimentações idênticas foram encontradas.',
  explanation:'Mesma conta, data, natureza, valor e descrição normalizada.',
  evidence:{firstId:'a',secondId:'b',date:'2026-08-20',amountCents:1898}
}]};

const healthySafe={version:1,generatedFor:'2026-08-31',status:'healthy',availableCents:180000,reservedCents:50000,freeCents:130000,safeToSpendCents:130000,shortfallCents:0,nextIncome:{date:'2026-09-01',amountCents:68000},projection:{days:30,minBalanceCents:90000,minDate:'2026-08-31',negativeRisk:false}};
const criticalSafe={...healthySafe,status:'critical',availableCents:10000,reservedCents:28000,freeCents:-18000,safeToSpendCents:0,shortfallCents:18000,projection:{days:30,minBalanceCents:-18000,minDate:'2026-08-31',negativeRisk:true}};

async function stubReports(page,insights,safe){
  await page.evaluate(({insights,safe})=>{
    window.__qaA3Insights=insights;
    window.__qaA3Safe=safe;
    window.financialIntelligenceSnapshot=()=>window.__qaA3Insights;
    window.safeSpendingSnapshot=()=>window.__qaA3Safe;
  },{insights,safe});
}

test.describe('Sophy A3 proactive brief v2',()=>{
  test('engine é versionado, read-only e não muta relatórios',async({page})=>{
    await boot(page);
    const result=await page.evaluate(({insights,safe})=>{
      const before=JSON.stringify({insights,safe});
      const brief=window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe});
      return {before,after:JSON.stringify({insights,safe}),version:window.SFPProactiveBrief.version,brief};
    },{insights:healthyInsights,safe:healthySafe});
    expect(result.version).toBe(2);
    expect(result.after).toBe(result.before);
    expect(result.brief.contracts).toMatchObject({recalculate:false,hiddenBuffer:false,readOnly:true});
  });

  test('pressão de caixa domina o brief e usa o mesmo core',async({page})=>{
    await boot(page);
    const brief=await page.evaluate(({insights,safe})=>window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe}),{insights:healthyInsights,safe:criticalSafe});
    expect(brief.priority).toBe('critical');
    expect(brief.source).toBe('cashflow_pressure');
    expect(brief.shouldNotify).toBe(true);
    expect(brief.reason).toContain('Local Financial Core');
    expect(brief.reason).toContain('não adiciona margem oculta');
    expect(brief.evidence.some(item=>item.label==='Menor saldo')).toBe(true);
  });

  test('warning determinístico ganha ação contextual e fingerprint estável',async({page})=>{
    await boot(page);
    const pair=await page.evaluate(({insights,safe})=>{
      const a=window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe});
      const b=window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe});
      return {a,b};
    },{insights:duplicateInsights,safe:healthySafe});
    expect(pair.a.priority).toBe('warning');
    expect(pair.a.actionPage).toBe('lancamentos');
    expect(pair.a.fingerprint).toBe(pair.b.fingerprint);
  });

  test('cenário saudável fica silencioso sem force',async({page})=>{
    await boot(page);
    const brief=await page.evaluate(({insights,safe})=>window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe}),{insights:healthyInsights,safe:healthySafe});
    expect(brief.priority).toBe('healthy');
    expect(brief.shouldNotify).toBe(false);
    expect(brief.summary).toContain('Sem alerta material');
  });

  test('painel mostra evidências e Detalhar é local/determinístico',async({page})=>{
    await boot(page);
    await stubReports(page,duplicateInsights,healthySafe);
    await page.evaluate(()=>window.renderSophyProactiveBrief());
    await page.evaluate(()=>window.setPage('sophy'));
    const panel=page.locator('#sophyProactiveBrief');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-priority','warning');
    await expect(panel).toContainText('Possível lançamento duplicado');
    await expect(panel).toContainText('R$ 18,98');
    await panel.getByRole('button',{name:'Detalhar'}).click();
    const detail=panel.locator('#sophyBriefDetail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Evidências usadas:');
    await expect(detail).toContainText('Valor: R$ 18,98');
    await expect(detail).toContainText('não altera nenhum dado');
  });

  test('proatividade elimina fallback aleatório e force mantém compatibilidade',async({page})=>{
    await boot(page);
    await stubReports(page,healthyInsights,healthySafe);
    const result=await page.evaluate(()=>{
      state.sophy.messages=[];
      state.sophy.introDone=true;
      state.sophy.lastProactiveAt=null;
      const source=window.sophyCheckProactivity.toString();
      const text=window.sophyCheckProactivity({force:true});
      return {source,text,msg:state.sophy.messages.at(-1)};
    });
    expect(result.source).not.toContain('Math.random');
    expect(result.text).toContain('Brief financeiro');
    expect(result.msg.proactive).toBe(true);
    expect(result.msg.proactiveFinancial).toBe(true);
    expect(result.msg.proactiveBriefVersion).toBe(2);
  });

  test('fingerprint repetido não notifica em 24h, mudança material notifica após cooldown',async({page})=>{
    await boot(page);
    await stubReports(page,duplicateInsights,healthySafe);
    const result=await page.evaluate(()=>{
      state.sophy.introDone=true;
      state.sophy.settings.proactivityEnabled=true;
      state.sophy.messages=[];
      state.sophy.lastProactiveAt=new Date(Date.now()-5*60*60*1000).toISOString();
      const first=window.sophyCheckProactivity();
      const firstMsg=state.sophy.messages.at(-1);
      state.sophy.lastProactiveAt=new Date(Date.now()-5*60*60*1000).toISOString();
      const repeated=window.sophyCheckProactivity();
      window.__qaA3Safe={...window.__qaA3Safe,safeToSpendCents:90000,freeCents:90000,projection:{...window.__qaA3Safe.projection,minBalanceCents:70000}};
      state.sophy.lastProactiveAt=new Date(Date.now()-5*60*60*1000).toISOString();
      const changed=window.sophyCheckProactivity();
      return {first,repeated,changed,count:state.sophy.messages.length,firstFingerprint:firstMsg?.proactiveFingerprint,lastFingerprint:state.sophy.messages.at(-1)?.proactiveFingerprint};
    });
    expect(result.first).toContain('Possível lançamento duplicado');
    expect(result.repeated).toBeNull();
    expect(result.changed).not.toBeNull();
    expect(result.count).toBe(2);
    expect(result.lastFingerprint).not.toBe(result.firstFingerprint);
  });

  test('bolha financeira proativa respeita modo privacidade',async({page})=>{
    await boot(page);
    await stubReports(page,duplicateInsights,healthySafe);
    await page.evaluate(()=>{
      state.settings.privacy=true;
      state.sophy.messages=[];
      state.sophy.introDone=true;
      state.sophy.lastProactiveAt=null;
      window.sophyCheckProactivity({force:true});
      window.renderSophy();
    });
    const bubble=page.locator('#sophyChatList .sophy-msg-row.sophy .sophy-bubble').last();
    await expect(bubble).toHaveAttribute('data-money','');
    await expect(bubble).toHaveClass(/private-value/);
  });

  test('brief não ocupa o composer em landscape baixo',async({page})=>{
    await page.setViewportSize({width:844,height:390});
    await boot(page);
    await page.evaluate(()=>window.setPage('sophy'));
    await expect(page.locator('#sophyProactiveBrief')).toBeHidden();
    await expect(page.locator('#sophyInput')).toBeVisible();
  });
});
