const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

function reportWith(insights){
  return {
    version:1,
    generatedFor:'2026-08-28',
    currentMonth:'2026-08',
    summary:{
      total:insights.length,
      critical:insights.filter(i=>i.severity==='critical').length,
      warning:insights.filter(i=>i.severity==='warning').length,
      info:insights.filter(i=>i.severity==='info').length
    },
    metrics:{},
    insights
  };
}

const cashflowRisk={
  id:'cashflow-risk-30',type:'cashflow_risk',severity:'critical',confidence:1,
  title:'Risco de saldo negativo em até 30 dias',
  message:'A projeção determinística encontra saldo mínimo de -120.00 antes do fim da janela.',
  explanation:'Saldo atual + entradas previstas − saídas previstas; o menor ponto ficou abaixo de zero.',
  evidence:{days:30,minBalanceCents:-12000,minDate:'2026-09-12',events:[]},actions:[]
};

const duplicate={
  id:'duplicate-candidate-1-2',type:'duplicate_candidate',severity:'warning',confidence:1,
  title:'Possível lançamento duplicado',message:'Duas movimentações idênticas de 18.98 foram encontradas em 2026-08-20.',
  explanation:'Mesma conta, data, natureza, valor e descrição normalizada.',
  evidence:{firstId:1,secondId:2,accountId:10,date:'2026-08-20',kind:'expense',amountCents:1898,desc:'Mercado Central'},actions:['review_transactions']
};

test.describe('Financial Insights UI',()=>{
  test('carrega módulo e monta painel na tela Hoje',async({page})=>{
    await boot(page);
    const info=await page.evaluate(()=>({hasRenderer:typeof window.renderFinancialInsights==='function',panel:!!document.querySelector('#financialInsightsPanel'),heading:document.querySelector('#financialInsightsTitle')?.textContent||''}));
    expect(info.hasRenderer).toBe(true);expect(info.panel).toBe(true);expect(info.heading).toBe('O que merece atenção');
  });

  test('renderiza severidade, evidência e explicação sem mutar o relatório',async({page})=>{
    await boot(page);const input=reportWith([cashflowRisk,duplicate]);const before=JSON.stringify(input);
    await page.evaluate(report=>{window.__qaInsightReport=report;window.financialIntelligenceSnapshot=()=>window.__qaInsightReport;window.renderFinancialInsights();window.applyPrivacy();},input);
    const cards=page.locator('#financialInsightsPanel .financial-insight');await expect(cards).toHaveCount(2);await expect(cards.first()).toHaveAttribute('data-severity','critical');await expect(cards.first()).toContainText('Risco de saldo negativo');await expect(cards.first().locator('.financial-insight-evidence')).toContainText('R$');await cards.first().locator('summary').click();await expect(cards.first().locator('.financial-insight-details p')).toContainText('Saldo atual');
    expect(await page.evaluate(()=>JSON.stringify(window.__qaInsightReport))).toBe(before);
  });

  test('ação contextual de duplicata leva para Lançamentos',async({page})=>{
    await boot(page);await page.evaluate(report=>{window.financialIntelligenceSnapshot=()=>report;window.renderFinancialInsights();},reportWith([duplicate]));await page.getByRole('button',{name:'Revisar lançamentos'}).click();await expect(page.locator('#pageTitle')).toHaveText('Lançamentos');
  });

  test('Perguntar à Sophy envia pergunta natural e específica daquele insight',async({page})=>{
    await boot(page);await page.evaluate(report=>{window.financialIntelligenceSnapshot=()=>report;window.__qaSophyPrompt=null;window.sophySendMessage=async prompt=>{window.__qaSophyPrompt=prompt;};window.renderFinancialInsights();},reportWith([cashflowRisk]));await page.locator('#financialInsightsPanel').getByRole('button',{name:'Perguntar à Sophy'}).click();await expect(page.locator('#pageTitle')).toHaveText('Sophy');
    const prompt=await page.evaluate(()=>window.__qaSophyPrompt);expect(prompt).toContain('me explica esse alerta de um jeito simples');expect(prompt).toContain('Risco de saldo negativo em até 30 dias');expect(prompt).toContain('Menor saldo projetado');expect(prompt).toContain('R$');expect(prompt).not.toContain('Local Financial Core');
  });

  test('todos os selects simples recebem o componente visual do SFP',async({page})=>{
    await boot(page);await page.waitForFunction(()=>Array.from(document.querySelectorAll('select:not([multiple])')).every(select=>select.dataset.sfpReviewEnhanced==='1'));
    const audit=await page.evaluate(()=>{const selects=Array.from(document.querySelectorAll('select:not([multiple])'));return {total:selects.length,enhanced:selects.filter(s=>s.dataset.sfpReviewEnhanced==='1').length,hosts:selects.filter(s=>!!s._sfpReviewHost).length,visibleNative:selects.filter(s=>!s.classList.contains('sfp-review-native-select')).length};});
    expect(audit.total).toBeGreaterThan(20);expect(audit.enhanced).toBe(audit.total);expect(audit.hosts).toBe(audit.total);expect(audit.visibleNative).toBe(0);
  });

  test('selects criados dinamicamente também são convertidos',async({page})=>{
    await boot(page);await page.evaluate(()=>{const select=document.createElement('select');select.id='qaDynamicSelect';select.innerHTML='<option value="a">Opção A</option><option value="b">Opção B</option>';document.body.appendChild(select);});await page.waitForFunction(()=>document.querySelector('#qaDynamicSelect')?.dataset.sfpReviewEnhanced==='1');await expect(page.locator('.sfp-select[data-for-select="qaDynamicSelect"]')).toHaveCount(1);
  });

  test('recorrência de receita usa categorias de receita e não de despesa',async({page})=>{
    await boot(page);await page.evaluate(()=>{const type=document.querySelector('#recType');type.value='income';type.dispatchEvent(new Event('change',{bubbles:true}));});const categories=await page.evaluate(()=>Array.from(document.querySelector('#recCategory').options).map(o=>o.value));expect(categories).toContain('Salário');expect(categories).toContain('Hora extra');expect(categories).not.toContain('Lazer');expect(categories).not.toContain('Dívida');
  });

  test('privacidade cobre mensagens e evidências monetárias do painel',async({page})=>{
    await boot(page);await page.evaluate(report=>{window.financialIntelligenceSnapshot=()=>report;state.settings.privacy=true;window.renderFinancialInsights();window.applyPrivacy();},reportWith([cashflowRisk]));await expect(page.locator('#financialInsightsPanel .financial-insight-copy p[data-money]')).toHaveClass(/private-value/);await expect(page.locator('#financialInsightsPanel .financial-insight-evidence[data-money]')).toHaveClass(/private-value/);
  });

  test('estado sem alertas comunica cenário saudável sem inventar sinal',async({page})=>{
    await boot(page);await page.evaluate(report=>{window.financialIntelligenceSnapshot=()=>report;window.renderFinancialInsights();},reportWith([]));const panel=page.locator('#financialInsightsPanel');await expect(panel).toContainText('Nenhum sinal relevante agora');await expect(panel.locator('.financial-insight')).toHaveCount(0);
  });
});
