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
      .safe-spend-hero,.safe-spend-projection{border:1px solid var(--color-border);border-radius:var(--radius-md);background:#081626;padding:14px}
      .safe-spend-eyebrow{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.055em;color:var(--color-text-muted)}
      .safe-spend-value{display:block;font-size:29px;line-height:1.05;font-weight:850;margin:7px 0 5px;color:var(--color-positive);font-variant-numeric:tabular-nums}
      .safe-spend-panel[data-status="tight"] .safe-spend-value{color:var(--color-warning)}
      .safe-spend-panel[data-status="critical"] .safe-spend-value{color:var(--color-negative)}
      .safe-spend-caption{font-size:10.5px;line-height:1.45;color:var(--color-text-secondary);margin:0}
      .safe-spend-equation{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}
      .safe-spend-equation>div{padding:9px;border-radius:10px;background:#0b192b;border:1px solid rgba(26,52,82,.7)}
      .safe-spend-equation small{display:block;color:var(--color-text-muted);font-size:8.5px;text-transform:uppercase;font-weight:750}
      .safe-spend-equation strong{display:block;margin-top:3px;font-size:12px;color:var(--color-text);font-variant-numeric:tabular-nums}
      .safe-spend-projection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .safe-spend-projection-head b{display:block;font-size:12.5px;color:var(--color-text)}
      .safe-spend-projection-head small{display:block;font-size:9.5px;color:var(--color-text-secondary);margin-top:2px}
      .safe-spend-min{font-size:10px;text-align:right;color:var(--color-text-secondary)}
      .safe-spend-min strong{display:block;font-size:13px;color:var(--color-text);font-variant-numeric:tabular-nums}
      .safe-spend-panel[data-status="critical"] .safe-spend-min strong{color:var(--color-negative)}
      .safe-spend-chart{height:92px;border:1px solid rgba(26,52,82,.55);border-radius:10px;background:#071423;padding:7px;margin-bottom:10px;color:var(--color-brand)}
      .safe-spend-chart svg{width:100%;height:100%;display:block;overflow:visible}
      .safe-spend-chart .baseline{stroke:var(--color-border);stroke-width:1;stroke-dasharray:3 3}
      .safe-spend-chart .line{fill:none;stroke:currentColor;stroke-width:2;vector-effect:non-scaling-stroke}
      .safe-spend-chart .point{fill:currentColor}
      .safe-spend-timeline{display:grid;gap:5px;max-height:172px;overflow:auto;padding-right:2px}
      .safe-spend-event{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 8px;border-radius:9px;background:#0a1829;border:1px solid rgba(26,52,82,.58);font-size:9.5px}
      .safe-spend-event-date{color:var(--color-text-muted);font-variant-numeric:tabular-nums}
      .safe-spend-event-desc{min-width:0;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .safe-spend-event-balance{font-weight:750;color:var(--color-text);font-variant-numeric:tabular-nums}
      .safe-spend-event[data-type="income"] .safe-spend-event-desc{color:var(--color-positive)}
      .safe-spend-event[data-type="expense"] .safe-spend-event-desc{color:var(--color-warning)}
      .safe-spend-foot{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;margin-top:11px;padding-top:10px;border-top:1px solid rgba(26,52,82,.55)}
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

// Custom select triggers live inside labels; cancel the label's default activation so
// tapping the SFP control does not immediately re-trigger the hidden native select.
document.addEventListener('click',event=>{
  if(event.target.closest?.('.sfp-select-button,.sfp-select-option')) event.preventDefault();
},true);
