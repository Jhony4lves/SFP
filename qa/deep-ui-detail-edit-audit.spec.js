const { test } = require('@playwright/test');
const fs = require('node:fs');
const { fixture } = require('./helpers');

function stateForAudit(){
  const s=fixture('Auditoria de detalhes e edição');
  s.mesAtual='2026-09';
  s.baseDate='2026-09-02';
  s.settings={...(s.settings||{}),onboardingDone:true,privacy:true};
  s.accounts=[
    {id:101,name:'Conta Principal de Teste com Nome Muito Longo',type:'Conta corrente',initial:123456.78,reconciled:{balance:120000.12,date:'2026-09-01',difference:0},balanceMode:'snapshot',balanceDate:'2026-09-02'},
    {id:102,name:'Reserva de Emergência Teste',type:'Poupança',initial:54321.98,balanceMode:'snapshot',balanceDate:'2026-09-02'}
  ];
  s.cards=[{id:201,name:'Cartão Internacional Teste Final 1234',limit:88888.88,closeDay:10,dueDay:17,payAccountId:101,history:[{date:'2026-08-01',type:'limit',amount:9999.99}]}];
  s.transactions=[
    {id:501,kind:'income',entryType:'income',desc:'Receita de teste',amount:98765.43,date:'2026-09-01',category:'Salário',accountId:101,status:'paid',dueDay:1,balanceImpact:true,createdAt:1},
    {id:502,kind:'expense',entryType:'expense',desc:'Despesa de teste',amount:43210.98,date:'2026-09-02',category:'Outros',accountId:101,status:'paid',dueDay:2,balanceImpact:true,createdAt:2}
  ];
  s.purchases=[{id:601,cardId:201,desc:'Compra parcelada para detalhe da fatura',total:34567.89,installments:3,purchaseDate:'2026-08-20',firstMonth:'2026-09',category:'Outros',status:'active',note:'',tags:[],refunds:[]}];
  s.invoices=[{id:701,cardId:201,month:'2026-09',status:'partial',officialTotal:11522.63,paidAmount:1234.56,accountId:101,payments:[{date:'2026-09-01',amount:1234.56,balanceImpact:true,targetMonth:'2026-09'}]}];
  s.debts=[{id:301,name:'Dívida de Teste com Nome Longo',balance:76543.21,rate:1.99,ratePeriod:'monthly',payment:1499.90,installments:72,paidInstallments:8,firstDue:'2026-09-10',dueDay:10,accountId:101,history:[{date:'2026-08-10',type:'payment',amount:1499.90}]}];
  s.goals=[{id:401,name:'Meta Financeira de Teste com Nome Longo',target:250000,accountId:102,plan:1500,targetDate:'2030-12-31',history:[{date:'2026-08-15',amount:1500}]}];
  s.ui={...(s.ui||{}),invoiceCardId:201,invoiceMonthByCard:{201:'2026-09'}};
  return s;
}

async function boot(page,theme,viewport){
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderAll==='function');
  await page.evaluate(({s,theme})=>{
    state=s;
    state.settings={...(state.settings||{}),theme,privacy:true,onboardingDone:true};
    if(typeof normalize==='function')normalize();
    if(typeof applyTheme==='function')applyTheme(theme);
    renderAll();
    if(typeof applyPrivacy==='function')applyPrivacy();
  },{s:stateForAudit(),theme});
}

async function scan(page,label){
  return page.evaluate(label=>{
    const findings=[];
    const root=document.querySelector('#modalRoot:not(.hidden)')||document.querySelector('.tab.active')||document.body;
    const vw=innerWidth;
    const visible=el=>{if(!(el instanceof HTMLElement))return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>.5&&r.height>.5&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'};
    const selector=el=>el.id?`#${el.id}`:`${el.tagName.toLowerCase()}${[...el.classList].slice(0,4).map(c=>'.'+c).join('')}`;
    const protectedValue=el=>{for(let n=el;n&&n instanceof HTMLElement;n=n.parentElement){if(n.classList.contains('private-value'))return true;const f=getComputedStyle(n).filter||'';if(f!=='none'&&/blur\(/.test(f))return true;}return false;};
    for(const el of [root,...root.querySelectorAll('*')]){
      if(!(el instanceof HTMLElement)||!visible(el))continue;
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      const own=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent||'').join(' ').replace(/\s+/g,' ').trim();
      if(r.left<-1||r.right>vw+1)findings.push({label,type:'offscreen',selector:selector(el),left:+r.left.toFixed(1),right:+r.right.toFixed(1),vw,text:own.slice(0,120)});
      if(/R\$\s*[\d.]+(?:,\d{2})?/.test(own)&&!protectedValue(el))findings.push({label,type:'privacy-currency-leak',selector:selector(el),text:own.slice(0,160)});
      if(/\b\d{4}-\d{2}-\d{2}\b/.test(own))findings.push({label,type:'raw-iso-date',selector:selector(el),text:own.slice(0,160)});
      if(/\b(?:expense|income|open|partial|paid|pending|planned|cancelled)\b/i.test(own))findings.push({label,type:'raw-internal-enum',selector:selector(el),text:own.slice(0,160)});
      if(el.matches('input:not([type="hidden"]),textarea')&&String(el.value||'').trim()){
        const context=String(el.closest('label')?.innerText||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();
        const value=String(el.value||'').trim();
        if(/\d/.test(value)&&/(valor|saldo|limite|parcela|aporte|juros|meta|objetivo|amortiza|inicial)/i.test(context)&&!protectedValue(el))findings.push({label,type:'privacy-financial-input-leak',selector:selector(el),value,context:context.slice(0,100)});
      }
      if(el.matches('button,a,[role="button"],[tabindex="0"]')&&vw<=412&&(r.width<44||r.height<44))findings.push({label,type:'small-target',selector:selector(el),w:+r.width.toFixed(1),h:+r.height.toFixed(1),text:String(el.innerText||'').replace(/\s+/g,' ').trim().slice(0,100)});
      if(own&&el.scrollWidth>el.clientWidth+2&&['hidden','clip'].includes(s.overflowX))findings.push({label,type:'clipped-text',selector:selector(el),client:el.clientWidth,scroll:el.scrollWidth,text:own.slice(0,140)});
    }
    const dialog=root.matches?.('[role="dialog"][aria-modal="true"]')?root:root.querySelector?.('[role="dialog"][aria-modal="true"]');
    if(dialog&&document.activeElement&&!dialog.contains(document.activeElement))findings.push({label,type:'modal-focus-outside',active:selector(document.activeElement)});
    return findings;
  },label);
}

async function cleanup(page){
  await page.evaluate(()=>{try{if(typeof closeProgressive==='function')closeProgressive(false)}catch{}const r=document.getElementById('modalRoot');if(r){r.className='hidden';r.replaceChildren();}if(typeof applyPrivacy==='function')applyPrivacy();});
}

const cases=[
  ['account-detail',()=>openAccountDetail(101)],
  ['account-edit',()=>editAccount(101,true)],
  ['card-detail',()=>openCardDetail(201)],
  ['card-edit',()=>editCard(201,true)],
  ['invoice-detail',()=>openInvoiceDetail(201)],
  ['debt-detail',()=>openDebtDetail(301)],
  ['debt-edit',()=>editDebt(301,true)],
  ['goal-detail',()=>openGoalDetail(401)],
  ['goal-edit',()=>editGoal(401,true)]
];

for(const viewport of [{name:'tiny',width:320,height:568},{name:'mobile',width:360,height:800},{name:'phone',width:412,height:915}]){
  test(`DEEP-DETAIL-EDIT ${viewport.name}`,async({page},testInfo)=>{
    test.setTimeout(120000);
    const findings=[];
    for(const theme of ['dark','light']){
      await boot(page,theme,viewport);
      for(const [name,fn] of cases){
        await page.evaluate(fn);
        await page.waitForTimeout(30);
        if(typeof page.evaluate==='function')await page.evaluate(()=>{if(typeof applyPrivacy==='function')applyPrivacy();});
        findings.push(...await scan(page,`${theme}:${name}`));
        await cleanup(page);
      }
    }
    const out=testInfo.outputPath(`deep-ui-detail-edit-${viewport.name}.json`);
    fs.writeFileSync(out,JSON.stringify({viewport,findings},null,2));
    await testInfo.attach(`deep-ui-detail-edit-${viewport.name}.json`,{path:out,contentType:'application/json'});
  });
}
