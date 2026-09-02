const { test, expect } = require('@playwright/test');
const { fixture, FALLBACK_KEY, expectBootComplete } = require('./helpers');

function stressFixture(){
  const state=fixture('Fixture QA Longa');
  state.accounts[0].name='Conta Corrente Principal com Nome Extremamente Longo para Testar Layout do Aplicativo';
  state.cards[0].name='Cartão Internacional Platinum com um Nome Muito Maior do que o Normal';
  state.transactions=[
    {id:101,date:'2026-01-03',kind:'expense',desc:'Compra de supermercado com descrição deliberadamente enorme para verificar quebra e contenção de texto em telas muito estreitas',amount:173.48,category:'Alimentação',accountId:1},
    {id:102,date:'2026-01-05',kind:'income',desc:'Receita extraordinária com nomenclatura longa para estressar os componentes de histórico financeiro',amount:325.19,category:'Renda extra',accountId:1}
  ];
  state.recurring=[{id:201,desc:'Assinatura recorrente com descrição extremamente longa para teste responsivo',amount:39.9,kind:'expense',category:'Assinaturas',day:8,accountId:1,active:true}];
  state.debts=[{id:301,name:'Dívida renegociada com instituição de nome propositalmente muito comprido',balance:980,total:1200,installment:120,dueDay:18,accountId:1,active:true}];
  state.goals=[{id:401,name:'Reserva para objetivo financeiro com nome gigantesco que precisa continuar utilizável',target:5000,current:850,dueDate:'2026-12-20'}];
  state.assets=[{id:501,name:'Investimento de renda fixa com identificação comercial muito extensa',value:1400,category:'Investimento'}];
  return state;
}

async function bootStress(page,width,height){
  const value=stressFixture();
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:FALLBACK_KEY,value});
  await page.setViewportSize({width,height});
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA Longa');
}

const PAGES=['hoje','dashboard','visao','lancamentos','contas','cartoes','recorrencias','dividas','metas','patrimonio','calendario','relatorios','sophy'];

for(const vp of [
  {name:'stress-320',width:320,height:700},
  {name:'stress-s24',width:390,height:844},
  {name:'stress-landscape',width:740,height:360}
]){
  test(`${vp.name}: conteúdo longo não cria overflow global`,async({page})=>{
    await bootStress(page,vp.width,vp.height);
    const problems=[];
    for(const pageId of PAGES){
      await page.evaluate(id=>window.setPage(id,{mode:'replace'}),pageId);
      await page.waitForTimeout(45);
      const result=await page.evaluate(({pageId,vw})=>{
        const docOverflow=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-vw;
        const active=document.querySelector(`#${CSS.escape(pageId)}.tab.active`);
        const r=active?.getBoundingClientRect();
        return {pageId,docOverflow:Math.round(docOverflow),activeWidth:Math.round(r?.width||0)};
      },{pageId,vw:vp.width});
      if(result.docOverflow>2||result.activeWidth>vp.width+2)problems.push(result);
    }
    expect(problems).toEqual([]);
  });
}

test('stress 320: seletor de conta longa mantém opção completa acessível',async({page})=>{
  await bootStress(page,320,700);
  await page.evaluate(()=>{window.setPage('lancamentos',{mode:'replace'});window.contextualNew?.('lancamentos');});
  const host=page.locator('.sfp-select[data-for-select="txAccount"]');
  if(await host.count()){
    await host.locator('.sfp-select-button').click();
    const option=host.locator('.sfp-select-option').filter({hasText:'Conta Corrente Principal'}).first();
    await expect(option).toBeVisible();
    const state=await option.evaluate(el=>({title:el.title,whiteSpace:getComputedStyle(el).whiteSpace,width:el.getBoundingClientRect().width,viewport:innerWidth}));
    expect(state.title).toContain('Conta Corrente Principal');
    expect(state.whiteSpace).not.toBe('nowrap');
    expect(state.width).toBeLessThanOrEqual(state.viewport);
  }
});
