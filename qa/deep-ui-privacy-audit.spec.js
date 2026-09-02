const { test } = require('@playwright/test');
const fs = require('node:fs');
const { fixture } = require('./helpers');

function privacyState(){
  const s=fixture('Auditoria profunda do modo privacidade');
  s.mesAtual='2026-09';
  s.baseDate='2026-09-02';
  s.settings={...(s.settings||{}),onboardingDone:true,privacy:true};
  s.accounts=[
    {id:101,name:'Conta Principal Privacidade',type:'Conta corrente',initial:123456.78,balanceMode:'snapshot',balanceDate:'2026-09-02'},
    {id:102,name:'Reserva Privacidade',type:'Poupança',initial:54321.98,balanceMode:'snapshot',balanceDate:'2026-09-02'}
  ];
  s.cards=[{id:201,name:'Cartão Privacidade',limit:88888.88,closeDay:10,dueDay:17,payAccountId:101,history:[]}];
  s.transactions=[
    {id:501,kind:'income',entryType:'income',desc:'Receita teste privacidade',amount:98765.43,date:'2026-09-01',category:'Salário',accountId:101,status:'paid',dueDay:1,balanceImpact:true,createdAt:1},
    {id:502,kind:'expense',entryType:'expense',desc:'Despesa teste privacidade',amount:43210.98,date:'2026-09-02',category:'Outros',accountId:101,status:'paid',dueDay:2,balanceImpact:true,createdAt:2}
  ];
  s.purchases=[{id:601,cardId:201,desc:'Compra privacidade',total:34567.89,installments:3,purchaseDate:'2026-08-20',firstMonth:'2026-09',category:'Outros',status:'active',note:'',tags:[],refunds:[]}];
  s.invoices=[{id:701,cardId:201,month:'2026-09',status:'open',officialTotal:11522.63,paidAmount:0,accountId:101,payments:[]}];
  s.debts=[{id:301,name:'Dívida Privacidade',balance:76543.21,rate:1.99,ratePeriod:'monthly',payment:1499.90,installments:72,paidInstallments:8,firstDue:'2026-09-10',dueDay:10,accountId:101,history:[]}];
  s.goals=[{id:401,name:'Meta Privacidade',target:250000,accountId:102,plan:1500,targetDate:'2030-12-31',history:[]}];
  s.recurring=[{id:801,desc:'Recorrência privacidade',type:'expense',amount:1234.56,day:10,category:'Assinaturas',accountId:101,start:'2026-01',end:'',active:true,skips:[]}];
  s.assets=[{id:901,name:'Ativo Privacidade',type:'Outros',value:222222.22,note:''}];
  s.categoryBudgets={Outros:2500};
  s.ui={...(s.ui||{}),invoiceCardId:201,invoiceMonthByCard:{201:'2026-09'}};
  return s;
}

async function boot(page,theme){
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderAll==='function'&&typeof setPage==='function');
  await page.evaluate(({s,theme})=>{
    state=s;
    state.settings={...(state.settings||{}),theme,privacy:true,onboardingDone:true};
    if(typeof normalize==='function')normalize();
    if(typeof applyTheme==='function')applyTheme(theme);
    renderAll();
    if(typeof applyPrivacy==='function')applyPrivacy();
  },{s:privacyState(),theme});
}

async function scanLeaks(page,label){
  return page.evaluate(label=>{
    const findings=[];
    const visible=el=>{
      if(!(el instanceof HTMLElement))return false;
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return r.width>.5&&r.height>.5&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
    };
    const selector=el=>el.id?`#${el.id}`:`${el.tagName.toLowerCase()}${[...el.classList].slice(0,4).map(c=>'.'+c).join('')}`;
    const privateByStyle=el=>{
      for(let n=el;n&&n instanceof HTMLElement;n=n.parentElement){
        if(n.classList.contains('private-value'))return true;
        const filter=getComputedStyle(n).filter||'';
        if(filter&&filter!=='none'&&/blur\(/.test(filter))return true;
      }
      return false;
    };
    const root=document.querySelector('.tab.active')||document.body;
    for(const el of [root,...root.querySelectorAll('*')]){
      if(!(el instanceof HTMLElement)||!visible(el))continue;
      const own=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent||'').join(' ').replace(/\s+/g,' ').trim();
      if(/R\$\s*[\d.]+(?:,\d{2})?/.test(own)&&!privateByStyle(el)){
        findings.push({label,type:'visible-currency-not-private',selector:selector(el),text:own.slice(0,160)});
      }
      if(el.matches('input:not([type="hidden"]),textarea')&&visible(el)){
        const value=String(el.value||'').trim();
        const context=String(el.closest('label')?.innerText||el.getAttribute('aria-label')||'').toLowerCase();
        if(value&&/\d/.test(value)&&/(valor|saldo|limite|parcela|aporte|juros|renda|gasto|meta|objetivo|amortiza)/.test(context)&&!privateByStyle(el)){
          findings.push({label,type:'financial-input-not-private',selector:selector(el),value:value.slice(0,80),context:context.slice(0,100)});
        }
      }
    }
    return findings;
  },label);
}

const pages=['hoje','dashboard','visao','lancamentos','contas','cartoes','recorrencias','orcamento','dividas','metas','patrimonio','calendario','relatorios','simuladores','extratos','dados','auditoria','config','sophy'];

for(const theme of ['dark','light']){
  test(`DEEP-PRIVACY ${theme}`,async({page},testInfo)=>{
    test.setTimeout(90000);
    await boot(page,theme);
    const findings=[];
    for(const pageId of pages){
      await page.evaluate(pageId=>{setPage(pageId,{mode:'replace'});if(typeof applyPrivacy==='function')applyPrivacy();},pageId);
      await page.waitForTimeout(20);
      findings.push(...await scanLeaks(page,`${theme}:${pageId}`));
    }
    // Também abre estados que exibem valores em overlays/forms.
    for(const section of ['contas','cartoes','dividas','metas']){
      await page.evaluate(section=>{if(typeof openManagementAction==='function')openManagementAction(section);if(typeof applyPrivacy==='function')applyPrivacy();},section);
      await page.waitForTimeout(20);
      findings.push(...await scanLeaks(page,`${theme}:management:${section}`));
      await page.evaluate(()=>{try{if(typeof closeProgressive==='function')closeProgressive(false)}catch{}const r=document.getElementById('modalRoot');if(r){r.className='hidden';r.replaceChildren();}});
    }
    const out=testInfo.outputPath(`deep-ui-privacy-${theme}.json`);
    fs.writeFileSync(out,JSON.stringify({theme,count:findings.length,findings},null,2));
    await testInfo.attach(`deep-ui-privacy-${theme}.json`,{path:out,contentType:'application/json'});
  });
}
