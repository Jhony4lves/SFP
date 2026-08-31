(function(global){
  'use strict';

  const PANEL_ID='safeSpendPanel';
  const STYLE_ID='safeSpendStyles';
  const escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const datePt=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return value||'—';const [y,m,d]=String(value).split('-');return `${d}/${m}/${y}`};

  function ensureStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .safe-spend-panel{position:relative;overflow:hidden}
      .safe-spend-grid{display:grid;grid-template-columns:1.05fr 1.35fr;gap:12px}
      .safe-spend-hero,.safe-spend-projection{border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface-1);padding:14px}
      .safe-spend-eyebrow{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.055em;color:var(--color-text-muted)}
      .safe-spend-value{display:block;font-size:29px;line-height:1.05;font-weight:850;margin:7px 0 5px;color:var(--color-positive);font-variant-numeric:tabular-nums}
      .safe-spend-panel[data-status="tight"] .safe-spend-value{color:var(--color-warning)}
      .safe-spend-panel[data-status="critical"] .safe-spend-value{color:var(--color-negative)}
      .safe-spend-caption{font-size:10.5px;line-height:1.45;color:var(--color-text-secondary);margin:0}
      .safe-spend-equation{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}
      .safe-spend-equation>div{padding:9px;border-radius:10px;background:var(--color-surface-elevated);border:1px solid var(--color-border)}
      .safe-spend-equation small{display:block;color:var(--color-text-muted);font-size:8.5px;text-transform:uppercase;font-weight:750}
      .safe-spend-equation strong{display:block;margin-top:3px;font-size:12px;color:var(--color-text);font-variant-numeric:tabular-nums}
      .safe-spend-projection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .safe-spend-projection-head b{display:block;font-size:12.5px;color:var(--color-text)}
      .safe-spend-projection-head small{display:block;font-size:9.5px;color:var(--color-text-secondary);margin-top:2px}
      .safe-spend-min{font-size:10px;text-align:right;color:var(--color-text-secondary)}
      .safe-spend-min strong{display:block;font-size:13px;color:var(--color-text);font-variant-numeric:tabular-nums}
      .safe-spend-panel[data-status="critical"] .safe-spend-min strong{color:var(--color-negative)}
      .safe-spend-chart{height:92px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface-elevated);padding:7px;margin-bottom:10px;color:var(--color-brand)}
      .safe-spend-chart svg{width:100%;height:100%;display:block;overflow:visible}
      .safe-spend-chart .baseline{stroke:var(--color-border);stroke-width:1;stroke-dasharray:3 3}
      .safe-spend-chart .line{fill:none;stroke:currentColor;stroke-width:2;vector-effect:non-scaling-stroke}
      .safe-spend-chart .point{fill:currentColor}
      .safe-spend-timeline{display:grid;gap:5px;max-height:172px;overflow:auto;padding-right:2px}
      .safe-spend-event{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 8px;border-radius:9px;background:var(--color-surface-elevated);border:1px solid var(--color-border);font-size:9.5px}
      .safe-spend-event-date{color:var(--color-text-muted);font-variant-numeric:tabular-nums}
      .safe-spend-event-desc{min-width:0;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .safe-spend-event-balance{font-weight:750;color:var(--color-text);font-variant-numeric:tabular-nums}
      .safe-spend-event[data-type="income"] .safe-spend-event-desc{color:var(--color-positive)}
      .safe-spend-event[data-type="expense"] .safe-spend-event-desc{color:var(--color-warning)}
      .safe-spend-foot{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;margin-top:11px;padding-top:10px;border-top:1px solid var(--color-border)}
      .safe-spend-foot p{margin:0;color:var(--color-text-secondary);font-size:9.5px;line-height:1.45;max-width:720px}
      .safe-spend-foot button{min-height:34px;padding:6px 10px;font-size:10px;flex:0 0 auto}
      @media(max-width:820px){.safe-spend-grid{grid-template-columns:1fr}.safe-spend-equation{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:480px){.safe-spend-equation{grid-template-columns:1fr}.safe-spend-event{grid-template-columns:64px minmax(0,1fr);}.safe-spend-event-balance{grid-column:2}.safe-spend-foot{display:grid}.safe-spend-foot button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    let panel=document.getElementById(PANEL_ID);
    if(panel)return panel;
    const insights=document.getElementById('financialInsightsPanel');
    const anchor=insights||document.querySelector('.today-secondary-grid');
    if(!anchor)return null;
    panel=document.createElement('section');panel.id=PANEL_ID;panel.className='panel safe-spend-panel';panel.setAttribute('aria-labelledby','safeSpendTitle');anchor.insertAdjacentElement('afterend',panel);return panel;
  }

  function buildChart(points){
    const values=points.map(p=>Number(p.balanceCents)||0);if(!values.length)return '<div class="safe-spend-chart"></div>';
    let min=Math.min(...values,0),max=Math.max(...values,0);if(min===max){min-=1;max+=1}
    const width=100,height=48,pad=3,range=max-min;
    const coord=(value,index)=>{const x=values.length===1?50:pad+(index/(values.length-1))*(width-pad*2);const y=pad+((max-value)/range)*(height-pad*2);return [x,y];};
    const coords=values.map(coord),baselineY=coord(0,0)[1],poly=coords.map(([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`).join(' '),circles=coords.map(([x,y])=>`<circle class="point" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6"/>`).join('');
    return `<div class="safe-spend-chart" aria-label="Trajetória projetada de saldo"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"><line class="baseline" x1="${pad}" y1="${baselineY.toFixed(2)}" x2="${width-pad}" y2="${baselineY.toFixed(2)}"/><polyline class="line" points="${poly}"/>${circles}</svg></div>`;
  }

  function renderEvents(report){
    const events=(report?.projection?.timeline||[]).filter(e=>e.type!=='opening');if(!events.length)return '<div class="safe-spend-event"><span class="safe-spend-event-date">—</span><span class="safe-spend-event-desc">Nenhum evento conhecido na janela</span></div>';
    return events.slice(0,10).map(event=>{const sign=event.type==='income'?'+':'−';return `<div class="safe-spend-event" data-type="${escapeHtml(event.type)}"><span class="safe-spend-event-date">${escapeHtml(datePt(event.date))}</span><span class="safe-spend-event-desc" data-money>${sign} ${money(event.amountCents)} · ${escapeHtml(event.origin||'evento')}</span><span class="safe-spend-event-balance" data-money>${money(event.balanceCents)}</span></div>`;}).join('')+(events.length>10?`<small class="muted">+ ${events.length-10} evento(s) na projeção.</small>`:'');
  }

  function snapshot(){if(typeof global.financialContextSnapshot!=='function'||!global.SFPSafeSpend?.analyze)return null;const core=global.financialContextSnapshot({months:3});return global.SFPSafeSpend.analyze({snapshot:core,projectionDays:30});}

  function renderSafeSpendProjection(){
    ensureStyles();const panel=ensurePanel();if(!panel)return null;let report;try{report=snapshot()}catch(error){report=null}
    if(!report){panel.dataset.status='critical';panel.innerHTML='<div class="head"><div><h2 id="safeSpendTitle">Quanto posso gastar?</h2><p>Projeção local baseada nas obrigações conhecidas.</p></div></div><p class="muted">Projeção temporariamente indisponível. Seus dados não foram alterados.</p>';return null;}
    panel.dataset.status=report.status;
    const safeText=report.shortfallCents>0?'R$ 0,00':money(report.safeToSpendCents);
    const caption=report.shortfallCents>0?`As obrigações conhecidas excedem o saldo disponível em ${money(report.shortfallCents)}. O SFP não considera nenhum gasto adicional seguro neste momento.`:`Valor livre conhecido sem consumir as obrigações já provisionadas. ${report.basis}`;
    const nextIncome=report.nextIncome?`${datePt(report.nextIncome.date)} · ${money(report.nextIncome.amountCents)}`:'Nenhuma entrada conhecida';
    panel.innerHTML=`<div class="head"><div><h2 id="safeSpendTitle">Quanto posso gastar?</h2><p>Limite seguro conhecido + trajetória dos próximos ${report.projection.days} dias.</p></div><span class="badge ${report.status==='critical'?'negative':report.status==='tight'?'warning':'positive'}">${report.status==='critical'?'Pressão de caixa':report.status==='tight'?'Margem curta':'Cobertura saudável'}</span></div><div class="safe-spend-grid"><article class="safe-spend-hero"><span class="safe-spend-eyebrow">Seguro conhecido agora</span><strong class="safe-spend-value" data-money>${safeText}</strong><p class="safe-spend-caption" data-money>${escapeHtml(caption)}</p><div class="safe-spend-equation"><div><small>Disponível</small><strong data-money>${money(report.availableCents)}</strong></div><div><small>Reservado</small><strong data-money>${money(report.reservedCents)}</strong></div><div><small>Livre</small><strong data-money>${money(report.freeCents)}</strong></div></div><div class="safe-spend-equation"><div style="grid-column:1/-1"><small>Próxima entrada conhecida</small><strong data-money>${escapeHtml(nextIncome)}</strong></div></div></article><article class="safe-spend-projection"><div class="safe-spend-projection-head"><div><b>Trajetória de saldo</b><small>Após cada entrada/saída conhecida da janela.</small></div><div class="safe-spend-min"><span>Menor saldo</span><strong data-money>${money(report.projection.minBalanceCents)}</strong><span>${escapeHtml(datePt(report.projection.minDate))}</span></div></div>${buildChart(report.projection.timeline)}<div class="safe-spend-timeline">${renderEvents(report)}</div></article></div><div class="safe-spend-foot"><p><b>Fórmula:</b> saldo disponível − obrigações conhecidas até a próxima entrada (ou janela conservadora do core quando não há entrada prevista). Não inclui compras futuras ainda não registradas e não esconde margem arbitrária.</p><button type="button" class="ghost" id="safeSpendAskSophy">Perguntar à Sophy</button></div>`;
    const ask=panel.querySelector('#safeSpendAskSophy');if(ask)ask.onclick=async()=>{if(typeof global.setPage==='function')global.setPage('sophy');if(typeof global.sophySendMessage==='function')await global.sophySendMessage('Explique meu limite de gasto seguro conhecido e a projeção de caixa atual usando o Local Financial Core. Diferencie saldo disponível, reservado e livre; cite o menor saldo projetado e a próxima entrada conhecida. Não invente buffer, não recalcule por conta própria e deixe claras as limitações da projeção.');};
    return report;
  }

  global.safeSpendingSnapshot=snapshot;global.renderSafeSpendProjection=renderSafeSpendProjection;
})(typeof window!=='undefined'?window:globalThis);

document.addEventListener('click',event=>{
  if(event.target.closest?.('.sfp-select-button,.sfp-select-option')) event.preventDefault();
},true);

(function(global){
  'use strict';

  const STYLE_ID='sfpMobilePriorityNavV1';
  const PRIMARY_PAGES=['hoje','contas','cartoes','calendario'];
  const MORE_GROUPS=[
    {title:'Planejar',items:[
      ['recorrencias','Recorrências','Assinaturas e gastos fixos'],
      ['orcamento','Orçamento','Tetos e regras'],
      ['dividas','Dívidas','Quitação e acordos'],
      ['metas','Metas','Objetivos de poupança']
    ]},
    {title:'Analisar',items:[
      ['visao','Visão Geral','Análise e fluxo'],
      ['dashboard','Dashboard','Resumo e indicadores'],
      ['patrimonio','Patrimônio','Ativos e evolução'],
      ['relatorios','Relatórios','Leituras e comparativos'],
      ['simuladores','Simuladores','Cenários e projeções']
    ]},
    {title:'Dados',items:[
      ['lancamentos','Lançamentos','Histórico e edição'],
      ['extratos','Extratos','Importação OFX e CSV'],
      ['dados','Central de Dados','Backup, importação e exportação']
    ]},
    {title:'Assistência e sistema',items:[
      ['sophy','Sophy','Assistente contextual'],
      ['auditoria','Auditoria','Integridade dos dados'],
      ['config','Configurações','Preferências do aplicativo']
    ]}
  ];

  function ensureStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .sfp-more-modal{width:min(720px,94vw);max-height:min(88dvh,780px);overflow:auto;padding:16px;border:1px solid var(--color-border);border-radius:20px;background:var(--color-surface-1);box-shadow:var(--shadow-lg);color:var(--color-text)}
      .sfp-more-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;position:sticky;top:-16px;z-index:2;margin:-16px -16px 10px;padding:18px 16px 12px;background:var(--color-surface-1);border-bottom:1px solid var(--color-border)}
      .sfp-more-header h2{margin:0;font-size:20px}.sfp-more-header p{margin:2px 0 0;color:var(--color-text-secondary);font-size:11px}
      .sfp-more-groups{display:grid;gap:18px}.sfp-more-group{display:grid;gap:8px}.sfp-more-group-title{margin:0;padding:0 4px;color:var(--color-text-muted);font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
      .sfp-more-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .sfp-more-item{width:100%;min-width:0;display:grid;grid-template-columns:42px minmax(0,1fr) 18px;align-items:center;gap:12px;min-height:76px;padding:12px 13px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface-elevated);color:var(--color-text);text-align:left}
      .sfp-more-item:hover,.sfp-more-item:focus-visible{border-color:var(--color-brand);background:var(--color-brand-muted);outline:none}
      .sfp-more-icon{width:42px;height:42px;display:grid;place-items:center;color:var(--color-brand)}
      .sfp-more-icon svg{width:26px;height:26px;display:block;stroke:currentColor}
      .sfp-more-copy{min-width:0}.sfp-more-copy strong,.sfp-more-copy small{display:block;text-align:left}.sfp-more-copy strong{font-size:14px;line-height:1.2}.sfp-more-copy small{margin-top:3px;color:var(--color-text-secondary);font-size:10.5px;line-height:1.3;white-space:normal}
      .sfp-more-arrow{color:var(--color-text-muted);font-size:19px;text-align:center}
      .context-fab-label{display:none!important}
      @media(max-width:650px) and (orientation:portrait){
        .sidebar .nav button{display:none!important;min-width:0!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;padding:4px 1px!important;font-size:11px!important;gap:2px!important;text-align:center!important}
        .sidebar .nav button[data-page="hoje"],.sidebar .nav button[data-page="contas"],.sidebar .nav button[data-page="cartoes"],.sidebar .nav button[data-page="calendario"],.sidebar .nav #moreNavBtn{display:flex!important}
        .sidebar .nav button span{display:block!important;font-size:9.25px!important;line-height:1.15!important;margin-top:2px!important;overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;max-width:100%!important;text-align:center!important}
        .sidebar .nav button[data-page="hoje"]{order:1}.sidebar .nav button[data-page="contas"]{order:2}.sidebar .nav button[data-page="cartoes"]{order:3}.sidebar .nav button[data-page="calendario"]{order:4}.sidebar .nav #moreNavBtn{order:5}
        .sfp-select{z-index:auto}
        .sfp-select-menu{position:fixed!important;max-width:calc(100vw - 16px)!important}
        .sfp-select-option{white-space:nowrap}
        html,body,.shell,main,.tab,.panel,.form-section,.management-page,.management-card{max-width:100%!important;min-width:0!important}
        body,main{overflow-x:hidden!important}
        .grid2,.grid3,.two,.three,.field-group--two,.field-group--three,.management-layout,.management-facts,.projection-grid{grid-template-columns:minmax(0,1fr)!important}
        .tablewrap,.analytics-metrics{max-width:100%;overscroll-behavior-x:contain}
        .sfp-more-modal{width:min(94vw,560px);padding:14px;border-radius:18px}.sfp-more-header{top:-14px;margin:-14px -14px 10px;padding:16px 14px 11px}.sfp-more-grid{grid-template-columns:1fr}.sfp-more-item{min-height:70px;grid-template-columns:40px minmax(0,1fr) 18px;padding:11px 12px}.sfp-more-icon{width:40px;height:40px}
      }
      @media(orientation:landscape) and (max-height:600px){
        main,.tab,.panel,.form-section,.management-page,.management-card{max-width:100%!important;min-width:0!important}
        body,main{overflow-x:hidden!important}
        .grid2,.management-layout,.field-group--two,.two,.management-facts,.projection-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .grid3,.field-group--three,.three{grid-template-columns:repeat(3,minmax(0,1fr))!important}
        .transaction-form{padding-bottom:var(--space-4)!important}
      }
      [data-theme="light"] .sfp-more-modal,[data-theme="light"] .sfp-more-header{background:#fff!important;color:#0b192c!important}
      [data-theme="light"] .sfp-more-item{background:#f3f7fb!important;color:#0b192c!important;border-color:var(--color-border)!important}
      [data-theme="light"] .sfp-more-item:hover,[data-theme="light"] .sfp-more-item:focus-visible{background:rgba(0,135,124,.10)!important;border-color:var(--color-brand)!important}
    `;
    document.head.appendChild(style);
  }

  function iconFor(page){
    const svg=document.querySelector(`.sidebar .nav button[data-page="${page}"] svg`);
    return svg?svg.outerHTML:'';
  }

  function closeMore(){
    const root=document.getElementById('modalRoot');
    if(!root) return;
    root.className='';
    root.innerHTML='';
  }

  function showPriorityMoreMenu(){
    const root=document.getElementById('modalRoot');
    if(!root) return;
    root.className='modalback';
    const groups=MORE_GROUPS.map(group=>`<section class="sfp-more-group"><h3 class="sfp-more-group-title">${group.title}</h3><div class="sfp-more-grid">${group.items.map(([id,label,desc])=>`<button type="button" class="sfp-more-item" data-sfp-more-page="${id}"><span class="sfp-more-icon" aria-hidden="true">${iconFor(id)}</span><span class="sfp-more-copy"><strong>${label}</strong><small>${desc}</small></span><span class="sfp-more-arrow" aria-hidden="true">›</span></button>`).join('')}</div></section>`).join('');
    root.innerHTML=`<div class="sfp-more-modal" role="dialog" aria-modal="true" aria-labelledby="sfpMoreTitle"><header class="sfp-more-header"><div><h2 id="sfpMoreTitle">Mais</h2><p>Ferramentas organizadas por finalidade.</p></div><button type="button" class="btn2" data-sfp-more-close>Fechar</button></header><div class="sfp-more-groups">${groups}</div></div>`;
    root.onclick=event=>{
      if(event.target===root||event.target.closest('[data-sfp-more-close]')){closeMore();return;}
      const item=event.target.closest('[data-sfp-more-page]');
      if(!item) return;
      const page=item.dataset.sfpMorePage;
      closeMore();
      if(page&&typeof global.setPage==='function') global.setPage(page);
    };
  }

  function syncMoreActive(){
    const more=document.getElementById('moreNavBtn');
    if(!more) return;
    const active=document.querySelector('.sidebar .nav button[data-page].active')?.dataset.page||document.querySelector('.tab.active')?.id||'';
    more.classList.toggle('active',!!active&&!PRIMARY_PAGES.includes(active));
  }

  function isPriorityPortrait(){
    return !!global.matchMedia?.('(max-width:650px) and (orientation:portrait)').matches;
  }

  function clampOpenSelectMenus(){
    if(!isPriorityPortrait()) return;
    const nav=document.querySelector('.sidebar');
    const navRect=nav?.getBoundingClientRect();
    const viewportWidth=document.documentElement.clientWidth;
    const viewportHeight=global.innerHeight||document.documentElement.clientHeight;
    const usableBottom=navRect&&navRect.top>0&&navRect.top<viewportHeight?navRect.top:viewportHeight;
    const margin=8,gap=6;
    document.querySelectorAll('.sfp-select-menu:not([hidden])').forEach(menu=>{
      const host=menu.closest('.sfp-select');
      const button=host?.querySelector('.sfp-select-button');
      if(!button) return;
      const buttonRect=button.getBoundingClientRect();
      const optionWidth=Array.from(menu.querySelectorAll('.sfp-select-option')).reduce((max,item)=>Math.max(max,item.scrollWidth||0),0);
      const width=Math.min(Math.max(buttonRect.width,optionWidth+16,180),viewportWidth-margin*2);
      const left=Math.max(margin,Math.min(buttonRect.left,viewportWidth-margin-width));
      menu.style.width=`${width}px`;
      menu.style.maxWidth=`${viewportWidth-margin*2}px`;
      menu.style.left=`${left}px`;
      menu.style.right='auto';
      const current=menu.getBoundingClientRect();
      const maxBottom=usableBottom-margin;
      if(current.bottom>maxBottom){
        const availableAbove=Math.max(72,buttonRect.top-gap-margin);
        menu.style.maxHeight=`${Math.min(menu.scrollHeight||330,330,availableAbove)}px`;
        const measured=menu.getBoundingClientRect().height;
        menu.style.top=`${Math.max(margin,buttonRect.top-gap-measured)}px`;
        menu.style.bottom='auto';
      }
    });
  }

  function installNavigation(){
    ensureStyles();
    const more=document.getElementById('moreNavBtn');
    if(more) more.onclick=showPriorityMoreMenu;
    global.showMoreMenu=showPriorityMoreMenu;
    syncMoreActive();
    const nav=document.querySelector('.sidebar .nav');
    if(nav&&!nav.dataset.sfpPriorityObserved){
      nav.dataset.sfpPriorityObserved='1';
      new MutationObserver(syncMoreActive).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
    }
    if(!document.documentElement.dataset.sfpSelectClamp){
      document.documentElement.dataset.sfpSelectClamp='1';
      document.addEventListener('click',event=>{if(event.target.closest?.('.sfp-select-button')) global.requestAnimationFrame(clampOpenSelectMenus);});
      document.addEventListener('scroll',clampOpenSelectMenus,true);
      global.addEventListener('resize',clampOpenSelectMenus,{passive:true});
      global.visualViewport?.addEventListener('resize',clampOpenSelectMenus,{passive:true});
      global.visualViewport?.addEventListener('scroll',clampOpenSelectMenus,{passive:true});
    }
  }

  function formatIsoDates(value){
    return String(value??'').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,(_,y,m,d)=>`${d}/${m}/${y}`);
  }

  function installSophyDateGuard(){
    const fn=global.sophySendMessage;
    if(typeof fn!=='function'||fn.__sfpIsoDateGuard) return false;
    const wrapped=function(message,...args){return fn.call(this,formatIsoDates(message),...args)};
    wrapped.__sfpIsoDateGuard=true;
    global.sophySendMessage=wrapped;
    return true;
  }

  function boot(){
    installNavigation();
    installSophyDateGuard();
    let attempts=0;
    const timer=global.setInterval(()=>{
      installNavigation();
      if(installSophyDateGuard()||++attempts>20) global.clearInterval(timer);
    },150);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})(typeof window!=='undefined'?window:globalThis);