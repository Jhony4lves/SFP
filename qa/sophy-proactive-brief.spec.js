const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

const healthyInsights={version:1,generatedFor:'2026-08-28',summary:{total:1,critical:0,warning:0,info:1},insights:[{
  id:'upcoming-obligations-2026-08-28',type:'upcoming_obligations',severity:'info',confidence:1,
  title:'2 compromissos nos próximos 14 dias',message:'Total conhecido de 250.00 nessa janela.',
  explanation:'Somente obrigações conhecidas.',evidence:{totalCents:25000,events:[{date:'2026-08-30'},{date:'2026-09-02'}]}
}]};

const healthySafe={version:1,generatedFor:'2026-08-28',status:'healthy',availableCents:180000,reservedCents:50000,freeCents:130000,safeToSpendCents:130000,shortfallCents:0,nextIncome:{date:'2026-09-01',amountCents:68000},projection:{days:30,minBalanceCents:90000,minDate:'2026-08-31',negativeRisk:false}};

const criticalSafe={version:1,generatedFor:'2026-08-28',status:'critical',availableCents:10000,reservedCents:28000,freeCents:-18000,safeToSpendCents:0,shortfallCents:18000,nextIncome:{date:'2026-09-01',amountCents:68000},projection:{days:30,minBalanceCents:-18000,minDate:'2026-08-31',negativeRisk:true}};

const duplicateInsights={version:1,generatedFor:'2026-08-28',summary:{total:1,critical:0,warning:1,info:0},insights:[{
  id:'duplicate-candidate-a-b',type:'duplicate_candidate',severity:'warning',confidence:1,
  title:'Possível lançamento duplicado',message:'Duas movimentações idênticas foram encontradas.',
  explanation:'Mesma conta, data, natureza, valor e descrição normalizada.',
  evidence:{firstId:'a',secondId:'b',date:'2026-08-20',amountCents:1898}
}]};

function briefStub(overrides={}){
  return {
    version:1,generatedFor:'2026-08-28',priority:'warning',source:'duplicate_candidate',title:'Possível lançamento duplicado',
    summary:'Duas movimentações idênticas foram encontradas.',reason:'Mesma conta, data, natureza, valor e descrição normalizada.',confidence:1,
    shouldNotify:true,forced:false,fingerprint:'v1|duplicate_candidate|warning|dup',mood:'focused',actionPage:'lancamentos',
    evidence:[{label:'Valor',value:'R$ 18,98',kind:'money'}],message:'**Possível lançamento duplicado**\n\nDuas movimentações idênticas foram encontradas.',
    contracts:{financialIntelligenceVersion:1,safeSpendVersion:1,recalculate:false,hiddenBuffer:false},...overrides
  };
}

test.describe('Sophy Proactive Brief',()=>{
  test('motor carrega, é versionado e não muta os relatórios de entrada',async({page})=>{
    await boot(page);
    const result=await page.evaluate(({insights,safe})=>{
      const before=JSON.stringify({insights,safe});
      const brief=window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe,referenceDate:'2026-08-28'});
      return {version:window.SFPProactiveBrief.version,brief,before,after:JSON.stringify({insights,safe})};
    },{insights:healthyInsights,safe:healthySafe});
    expect(result.version).toBe(1);
    expect(result.before).toBe(result.after);
    expect(result.brief.contracts.recalculate).toBe(false);
    expect(result.brief.contracts.hiddenBuffer).toBe(false);
  });

  test('pressão de caixa do mesmo core domina o brief e gera alerta crítico explicável',async({page})=>{
    await boot(page);
    const brief=await page.evaluate(({insights,safe})=>window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe}),{insights:healthyInsights,safe:criticalSafe});
    expect(brief.priority).toBe('critical');
    expect(brief.source).toBe('cashflow_pressure');
    expect(brief.shouldNotify).toBe(true);
    expect(brief.summary).toContain('R$');
    expect(brief.reason).toContain('Local Financial Core');
    expect(brief.reason).toContain('buffer oculto');
    expect(brief.evidence.some(e=>e.label==='Menor saldo')).toBe(true);
  });

  test('warning determinístico vira brief de atenção com ação contextual',async({page})=>{
    await boot(page);
    const brief=await page.evaluate(({insights,safe})=>window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe}),{insights:duplicateInsights,safe:healthySafe});
    expect(brief.priority).toBe('warning');
    expect(brief.source).toBe('duplicate_candidate');
    expect(brief.actionPage).toBe('lancamentos');
    expect(brief.confidence).toBe(1);
    expect(brief.fingerprint).toContain('duplicate_candidate');
  });

  test('cenário saudável produz brief determinístico, mas não pede interrupção espontânea',async({page})=>{
    await boot(page);
    const pair=await page.evaluate(({insights,safe})=>{
      const a=window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe,force:false});
      const b=window.SFPProactiveBrief.build({insightsReport:insights,safeSpendReport:safe,force:true});
      return {a,b};
    },{insights:healthyInsights,safe:healthySafe});
    expect(pair.a.priority).toBe('healthy');
    expect(pair.a.shouldNotify).toBe(false);
    expect(pair.a.fingerprint).toBe(pair.b.fingerprint);
    expect(pair.a.message).toBe(pair.b.message);
    expect(pair.a.summary).toContain('Sem alerta material');
  });

  test('brief visual aparece na Sophy e mostra evidências sem duplicar matemática',async({page})=>{
    const errors=monitor(page);
    await boot(page);
    await page.evaluate(({insights,safe})=>{
      window.financialIntelligenceSnapshot=()=>insights;
      window.safeSpendingSnapshot=()=>safe;
      window.renderSophyProactiveBrief();
    },{insights:duplicateInsights,safe:healthySafe});
    await page.locator('.nav button[data-page="sophy"]').click();
    const panel=page.locator('#sophyProactiveBrief');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-priority','warning');
    await expect(panel).toContainText('Possível lançamento duplicado');
    await expect(panel).toContainText('R$ 18,98');
    expect(errors).toEqual([]);
  });

  test('abrir Sophy recalcula somente o brief a partir dos snapshots atuais',async({page})=>{
    await boot(page);
    await page.evaluate(({insights,safe})=>{
      window.__qaBriefSafe=safe;
      window.financialIntelligenceSnapshot=()=>insights;
      window.safeSpendingSnapshot=()=>window.__qaBriefSafe;
    },{insights:healthyInsights,safe:healthySafe});
    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophyProactiveBrief')).toHaveAttribute('data-priority','healthy');
    await page.evaluate(()=>{window.__qaBriefSafe={...window.__qaBriefSafe,status:'critical',shortfallCents:12000,safeToSpendCents:0,freeCents:-12000,projection:{...window.__qaBriefSafe.projection,negativeRisk:true,minBalanceCents:-12000}}});
    await page.locator('.nav button[data-page="hoje"]').click();
    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophyProactiveBrief')).toHaveAttribute('data-priority','critical');
    await expect(page.locator('#sophyProactiveBrief')).toContainText('Pressão de caixa');
  });

  test('proatividade normal fica silenciosa quando o brief não é material',async({page})=>{
    await boot(page);
    const result=await page.evaluate(()=>{
      state.sophy.introDone=true;
      state.sophy.settings.proactivityEnabled=true;
      state.sophy.lastProactiveAt=new Date(Date.now()-48*60*60*1000).toISOString();
      state.sophy.messages=[];
      window.sophyProactiveBriefSnapshot=()=>({
        ...({version:1,priority:'healthy',source:'healthy',title:'Cenário sem alerta material',summary:'Tudo estável.',reason:'Sem sinal material.',confidence:1,shouldNotify:false,fingerprint:'healthy-1',mood:'cheerful',actionPage:'dashboard',evidence:[],message:'Brief saudável.'})
      });
      const text=window.sophyCheckProactivity();
      return {text,count:state.sophy.messages.length,source:window.sophyCheckProactivity.toString()};
    });
    expect(result.text).toBeNull();
    expect(result.count).toBe(0);
    expect(result.source).not.toContain('Math.random');
  });

  test('force:true mantém compatibilidade e registra fingerprint/evidência do brief',async({page})=>{
    await boot(page);
    const result=await page.evaluate(brief=>{
      state.sophy.messages=[];
      state.sophy.lastProactiveAt=null;
      window.sophyProactiveBriefSnapshot=()=>brief;
      const text=window.sophyCheckProactivity({force:true});
      return {text,msg:state.sophy.messages.at(-1)};
    },briefStub({priority:'healthy',shouldNotify:false,fingerprint:'healthy-force',message:'Brief financeiro saudável e determinístico.',mood:'cheerful'}));
    expect(result.text).toBe('Brief financeiro saudável e determinístico.');
    expect(result.msg.sender).toBe('sophy');
    expect(result.msg.proactiveFingerprint).toBe('healthy-force');
    expect(result.msg.proactiveSource).toBe('duplicate_candidate');
  });

  test('mesmo fingerprint não repete em 24h, mas mudança material pode notificar após cooldown',async({page})=>{
    await boot(page);
    const result=await page.evaluate(({first,changed})=>{
      state.sophy.introDone=true;
      state.sophy.settings.proactivityEnabled=true;
      const fiveHoursAgo=new Date(Date.now()-5*60*60*1000).toISOString();
      state.sophy.lastProactiveAt=fiveHoursAgo;
      state.sophy.messages=[{id:'old',sender:'sophy',text:'old',at:fiveHoursAgo,proactiveFingerprint:first.fingerprint}];
      window.sophyProactiveBriefSnapshot=()=>first;
      const repeated=window.sophyCheckProactivity();
      window.sophyProactiveBriefSnapshot=()=>changed;
      const changedText=window.sophyCheckProactivity();
      return {repeated,changedText,last:state.sophy.messages.at(-1),count:state.sophy.messages.length};
    },{first:briefStub({fingerprint:'same-signal',message:'Mesmo sinal'}),changed:briefStub({fingerprint:'changed-signal',message:'Sinal mudou'})});
    expect(result.repeated).toBeNull();
    expect(result.changedText).toBe('Sinal mudou');
    expect(result.last.proactiveFingerprint).toBe('changed-signal');
    expect(result.count).toBe(2);
  });

  test('Detalhar reutiliza o brief e proíbe recálculo inventado; privacidade cobre valores',async({page})=>{
    await boot(page);
    await page.evaluate(({insights,safe})=>{
      window.financialIntelligenceSnapshot=()=>insights;
      window.safeSpendingSnapshot=()=>safe;
      window.__qaSophyPrompt=null;
      window.sophySendMessage=async prompt=>{window.__qaSophyPrompt=prompt;};
      state.settings.privacy=true;
      window.renderSophyProactiveBrief();
      window.applyPrivacy();
    },{insights:duplicateInsights,safe:healthySafe});
    const panel=page.locator('#sophyProactiveBrief');
    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-money]').first()).toHaveClass(/private-value/);
    await panel.getByRole('button',{name:'Detalhar'}).click();
    const prompt=await page.evaluate(()=>window.__qaSophyPrompt);
    expect(prompt).toContain('Local Financial Core');
    expect(prompt).toContain('Não recalcule');
    expect(prompt).toContain('buffer oculto');
  });
});
