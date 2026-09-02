const { test } = require('@playwright/test');
const fs = require('node:fs');
const { fixture } = require('./helpers');

function stateForInteractions(){
  const s=fixture('Auditoria UI interativa');
  s.mesAtual='2026-09';
  s.baseDate='2026-09-02';
  s.settings={...(s.settings||{}),onboardingDone:true};
  s.accounts=[{id:101,name:'Conta Corrente com Nome Muito Comprido para Auditoria',type:'Conta corrente',initial:150000,balanceMode:'snapshot',balanceDate:'2026-09-02'}];
  s.cards=[{id:201,name:'Itaú Click Mastercard Internacional Final 1234 com Nome Muito Comprido',limit:99999.99,closeDay:10,dueDay:17,payAccountId:101,history:[]}];
  s.purchases=[{id:501,cardId:201,desc:'Compra parcelada com descrição extremamente longa que precisa continuar legível na fatura',total:65432.10,installments:12,purchaseDate:'2026-08-29',firstMonth:'2026-09',category:'Eletrônicos e tecnologia com nome longo',status:'active',note:'',tags:[],refunds:[]}];
  s.invoices=[{id:701,cardId:201,month:'2026-09',status:'partial',officialTotal:99999.99,paidAmount:12345.67,accountId:101,payments:[{date:'2026-09-01',amount:12345.67,balanceImpact:true,targetMonth:'2026-09'}]}];
  s.invoiceAdjustments=[];
  s.ui={...(s.ui||{}),invoiceCardId:201,invoiceMonthByCard:{201:'2026-09'}};
  return s;
}

async function boot(page,theme,width,height){
  await page.setViewportSize({width,height});
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderAll==='function'&&typeof setPage==='function');
  await page.evaluate(({s,theme})=>{
    state=s;
    state.settings={...(state.settings||{}),theme,onboardingDone:true};
    if(typeof normalize==='function')normalize();
    if(typeof applyTheme==='function')applyTheme(theme);
    renderAll();
    setPage('hoje',{mode:'replace'});
  },{s:stateForInteractions(),theme});
}

async function inspect(page,label){
  return page.evaluate(label=>{
    const out=[];
    const parse=v=>{const m=String(v).match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:[, /]+(\d*(?:\.\d+)?))?\)/i);return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined||m[4]===''?1:+m[4]}:null};
    const lum=c=>{const f=x=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)};
    const ratio=(a,b)=>{const A=lum(a),B=lum(b);return (Math.max(A,B)+.05)/(Math.min(A,B)+.05)};
    const bgFor=el=>{for(let p=el;p&&p instanceof HTMLElement;p=p.parentElement){const s=getComputedStyle(p);const c=parse(s.backgroundColor);if(c&&c.a>=.98)return c}return null};
    const sel=el=>el.id?`#${el.id}`:`${el.tagName.toLowerCase()}${[...el.classList].slice(0,4).map(x=>'.'+x).join('')}`;
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'};
    const roots=[document.querySelector('.modalback:not(.hidden)'),document.querySelector('.progressive-overlay:not(.hidden)'),document.querySelector('.sfp-more-modal'),document.querySelector('#toast.show'),document.querySelector('.page.active')].filter(Boolean);
    const seen=new Set();
    for(const root of roots){
      for(const el of [root,...root.querySelectorAll('*')]){
        if(seen.has(el)||!visible(el))continue;seen.add(el);
        const r=el.getBoundingClientRect(),s=getComputedStyle(el),text=String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
        if((r.left<-1||r.right>innerWidth+1)&&!['auto','scroll'].includes(s.overflowX))out.push({label,type:'offscreen',selector:sel(el),text:text.slice(0,120),left:Math.round(r.left),right:Math.round(r.right),vw:innerWidth});
        if(text&&/^(SPAN|SMALL|STRONG|B|P|H1|H2|H3|H4|BUTTON|LABEL)$/.test(el.tagName)){
          const fg=parse(s.color),bg=bgFor(el.parentElement||el);if(fg&&bg&&fg.a>=.9){const cr=ratio(fg,bg),fs=parseFloat(s.fontSize||'16'),fw=parseInt(s.fontWeight||'400')||400,large=fs>=24||(fs>=18.66&&fw>=700),threshold=large?3:4.5;if(cr<threshold)out.push({label,type:'contrast',selector:sel(el),text:text.slice(0,120),ratio:+cr.toFixed(2),fontSize:fs,color:s.color,background:`rgb(${bg.r}, ${bg.g}, ${bg.b})`});}
        }
      }
    }
    const toast=document.querySelector('#toast.show'),nav=document.querySelector('.sidebar');
    if(toast&&nav&&visible(toast)&&visible(nav)){const a=toast.getBoundingClientRect(),b=nav.getBoundingClientRect(),overlap=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));out.push({label,type:'toast-nav-geometry',toast:{top:Math.round(a.top),bottom:Math.round(a.bottom)},nav:{top:Math.round(b.top),bottom:Math.round(b.bottom)},overlapPx:Math.round(overlap)});}
    return out;
  },label);
}

for(const vp of [{name:'tiny',width:320,height:568},{name:'mobile',width:360,height:800}]){
  test(`DEEP-UI-INTERACTIONS ${vp.name}`,async({page},testInfo)=>{
    test.setTimeout(90000);
    const all=[];
    for(const theme of ['dark','light']){
      await boot(page,theme,vp.width,vp.height);

      await page.evaluate(()=>{window.sfpAlert({title:'Aviso com título extremamente comprido para testar diálogo',message:'Mensagem longa para validar contraste, quebra de linha e ações do popup.',type:'warning'});});
      await page.waitForSelector('.sfp-dialog');
      all.push(...await inspect(page,`${theme}:alert`));
      const ok=page.locator('#dialogOkBtn');if(await ok.count())await ok.click();

      await page.evaluate(()=>{setPage('cartoes',{mode:'replace'});openCardDetail(201);});
      await page.waitForTimeout(50);
      all.push(...await inspect(page,`${theme}:card-detail`));
      await page.evaluate(()=>{try{closeProgressive()}catch{}});

      await page.evaluate(()=>{setPage('cartoes',{mode:'replace'});openInvoiceDetail(201);});
      await page.waitForTimeout(80);
      all.push(...await inspect(page,`${theme}:invoice`));
      await page.evaluate(()=>{try{closeProgressive()}catch{}});

      await page.evaluate(()=>{setPage('hoje',{mode:'replace'});toast('Mensagem temporária com valor R$ 123.456,78','warning');});
      await page.waitForTimeout(30);
      all.push(...await inspect(page,`${theme}:toast`));

      if(vp.width<=360){
        await page.evaluate(()=>{setPage('hoje',{mode:'replace'});});
        const more=page.locator('#moreNavBtn');if(await more.isVisible())await more.click();
        await page.waitForTimeout(30);
        all.push(...await inspect(page,`${theme}:more-menu`));
        await page.evaluate(()=>{const root=document.getElementById('modalRoot');if(root){root.className='hidden';root.replaceChildren();}});
      }
    }
    const out=testInfo.outputPath(`deep-ui-interactions-${vp.name}.json`);fs.writeFileSync(out,JSON.stringify({viewport:vp,findings:all},null,2));await testInfo.attach(`deep-ui-interactions-${vp.name}.json`,{path:out,contentType:'application/json'});
  });
}
