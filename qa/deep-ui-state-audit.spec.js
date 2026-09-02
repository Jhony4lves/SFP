const { test } = require('@playwright/test');
const fs = require('node:fs');
const { fixture } = require('./helpers');

function auditState(){
  const s=fixture('Auditoria profunda de estados interativos');
  s.mesAtual='2026-09';
  s.baseDate='2026-09-02';
  s.settings={...(s.settings||{}),onboardingDone:true};
  s.accounts=[
    {id:101,name:'Conta Corrente Principal com Nome Extremamente Comprido',type:'Conta corrente',initial:198765.43,balanceMode:'snapshot',balanceDate:'2026-09-02'},
    {id:102,name:'Reserva de Emergência Longuíssima para Teste',type:'Poupança',initial:54321.98,balanceMode:'snapshot',balanceDate:'2026-09-02'}
  ];
  s.cards=[{id:201,name:'Itaú Click Mastercard Internacional Final 1234 com Nome Muito Comprido',limit:99999.99,closeDay:10,dueDay:17,payAccountId:101,history:[]}];
  s.purchases=[{id:501,cardId:201,desc:'Compra parcelada com descrição extremamente longa para testar todos os cortes de texto do aplicativo',total:98765.43,installments:12,purchaseDate:'2026-08-29',firstMonth:'2026-09',category:'Eletrônicos e tecnologia com categoria longa',status:'active',note:'',tags:[],refunds:[]}];
  s.invoices=[{id:701,cardId:201,month:'2026-09',status:'partial',officialTotal:98765.43,paidAmount:12345.67,accountId:101,payments:[{date:'2026-09-01',amount:12345.67,balanceImpact:true,targetMonth:'2026-09'}]}];
  s.debts=[{id:301,name:'Empréstimo consignado de prazo muito comprido',balance:87654.32,rate:1.99,ratePeriod:'monthly',payment:1499.90,installments:72,paidInstallments:8,firstDue:'2026-09-10',dueDay:10,accountId:101,history:[]}];
  s.goals=[{id:401,name:'Entrada do imóvel próprio com nome propositalmente enorme',target:250000,accountId:102,plan:1500,targetDate:'2030-12-31',history:[]}];
  s.recurring=[{id:601,desc:'Mensalidade recorrente com descrição extremamente comprida',type:'expense',amount:1234.56,day:10,category:'Assinaturas',accountId:101,start:'2026-01',end:'',active:true,skips:[]}];
  s.ui={...(s.ui||{}),invoiceCardId:201,invoiceMonthByCard:{201:'2026-09'}};
  return s;
}

async function boot(page,theme,vp){
  await page.setViewportSize(vp);
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderAll==='function'&&typeof setPage==='function');
  await page.evaluate(({s,theme})=>{
    state=s;
    state.settings={...(state.settings||{}),theme,onboardingDone:true};
    if(typeof normalize==='function')normalize();
    if(typeof applyTheme==='function')applyTheme(theme);
    renderAll();
    setPage('hoje',{mode:'replace'});
  },{s:auditState(),theme});
}

async function scan(page,label){
  return page.evaluate(label=>{
    const findings=[];
    const visible=el=>{if(!(el instanceof HTMLElement))return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>.5&&r.height>.5&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'};
    const selector=el=>el.id?`#${el.id}`:`${el.tagName.toLowerCase()}${[...el.classList].slice(0,4).map(c=>'.'+c).join('')}`;
    const root=document.querySelector('#modalRoot:not(.hidden)')||document.querySelector('.tab.active')||document.body;
    const vw=innerWidth;
    for(const el of [root,...root.querySelectorAll('*')]){
      if(!(el instanceof HTMLElement)||!visible(el))continue;
      const r=el.getBoundingClientRect(),s=getComputedStyle(el),text=String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
      const interactive=el.matches('button,input,select,textarea,a,[role="button"],[tabindex="0"]');
      if(r.left<-1||r.right>vw+1) findings.push({label,type:'offscreen',selector:selector(el),text:text.slice(0,140),left:+r.left.toFixed(1),right:+r.right.toFixed(1),vw});
      if(text&&el.scrollWidth>el.clientWidth+2&&['hidden','clip'].includes(s.overflowX)) findings.push({label,type:/R\$|\d[.,]\d/.test(text)?'clipped-financial-text':'clipped-text',selector:selector(el),text:text.slice(0,140),client:el.clientWidth,scroll:el.scrollWidth,whiteSpace:s.whiteSpace});
      if(interactive&&vw<=412&&(r.width<44||r.height<44)) findings.push({label,type:'small-target',selector:selector(el),text:text.slice(0,100),w:+r.width.toFixed(1),h:+r.height.toFixed(1)});
      if(el.matches('input,select,textarea')){
        const id=el.id,associated=id?document.querySelector(`label[for="${CSS.escape(id)}"]`):null,wrap=el.closest('label');
        const name=el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||associated?.innerText||wrap?.innerText||'';
        if(!String(name).trim()) findings.push({label,type:'unlabelled-control',selector:selector(el),placeholder:el.getAttribute('placeholder')||''});
      }
    }
    const modal=document.querySelector('#modalRoot:not(.hidden) [role="dialog"][aria-modal="true"]');
    if(modal&&document.activeElement&&!modal.contains(document.activeElement)) findings.push({label,type:'modal-focus-outside',active:selector(document.activeElement)});
    document.querySelectorAll('select.sfp-review-native-select').forEach(sel=>{
      if(sel.tabIndex>=0) findings.push({label,type:'hidden-native-select-focusable',selector:selector(sel),tabIndex:sel.tabIndex});
      const host=sel._sfpReviewHost||sel.nextElementSibling,button=host?.querySelector?.('.sfp-select-button');
      if(button){const aria=button.getAttribute('aria-label')||button.getAttribute('aria-labelledby')||'';if(!aria)findings.push({label,type:'custom-select-no-field-name',selector:selector(button),value:String(button.innerText||'').trim().slice(0,100)});}
    });
    return findings;
  },label);
}

async function closeModal(page){await page.evaluate(()=>{try{if(typeof closeProgressive==='function')closeProgressive(false)}catch{}const r=document.getElementById('modalRoot');if(r){r.className='hidden';r.replaceChildren();}});}

const viewports=[
  {name:'tiny',width:320,height:568},
  {name:'mobile',width:360,height:800},
  {name:'phone',width:412,height:915},
  {name:'landscape',width:854,height:384}
];

for(const vp of viewports){
  test(`DEEP-UI-STATES ${vp.name}`,async({page},testInfo)=>{
    test.setTimeout(150000);
    const findings=[];
    for(const theme of ['dark','light']){
      await boot(page,theme,vp);

      for(const kind of ['expense','bill','card','income','transfer']){
        await page.evaluate(kind=>{setPage('lancamentos',{mode:'replace'});if(typeof setKind==='function')setKind(kind);},kind);
        await page.waitForTimeout(20);
        findings.push(...await scan(page,`${theme}:transaction:${kind}`));
      }

      for(const section of ['contas','cartoes','dividas','metas']){
        await page.evaluate(section=>{if(typeof openManagementAction==='function')openManagementAction(section);},section);
        await page.waitForTimeout(25);
        findings.push(...await scan(page,`${theme}:management-form:${section}`));
        await closeModal(page);
      }

      await page.evaluate(()=>setPage('sophy',{mode:'replace'}));
      await page.waitForTimeout(30);
      findings.push(...await scan(page,`${theme}:sophy`));
      const settings=page.locator('#sophySettingsBtn');
      if(await settings.count()&&await settings.isVisible()){
        await settings.click();await page.waitForTimeout(25);findings.push(...await scan(page,`${theme}:sophy-settings`));await closeModal(page);
      }
      await page.evaluate(()=>setPage('sophy',{mode:'replace'}));
      const memories=page.locator('#sophyOpenMemoriesBtn');
      if(await memories.count()&&await memories.isVisible()){
        await memories.click();await page.waitForTimeout(25);findings.push(...await scan(page,`${theme}:sophy-memories`));await closeModal(page);
      }

      for(const section of ['simuladores','extratos','dados','config','auditoria','relatorios']){
        await page.evaluate(section=>setPage(section,{mode:'replace'}),section);
        await page.waitForTimeout(35);
        findings.push(...await scan(page,`${theme}:page:${section}`));
      }

      await page.evaluate(()=>{setPage('simuladores',{mode:'replace'});});
      const whatIf=page.locator('#whatIfType');
      if(await whatIf.count()){
        for(const type of ['spend_now','installment_purchase','monthly_saving','debt_amortization']){
          await page.evaluate(type=>{const el=document.getElementById('whatIfType');if(el){el.value=type;el.dispatchEvent(new Event('change',{bubbles:true}));}},type);
          await page.waitForTimeout(25);
          findings.push(...await scan(page,`${theme}:what-if:${type}`));
        }
      }
    }
    const out=testInfo.outputPath(`deep-ui-states-${vp.name}.json`);
    fs.writeFileSync(out,JSON.stringify({viewport:vp,findings},null,2));
    await testInfo.attach(`deep-ui-states-${vp.name}.json`,{path:out,contentType:'application/json'});
  });
}
