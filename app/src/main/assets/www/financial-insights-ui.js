(function(global){
  'use strict';

  const MAX_VISIBLE = 5;
  const PANEL_ID = 'financialInsightsPanel';
  const STYLE_ID = 'financialInsightsStyles';

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

  const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const pct = value => `${Math.round((Number(value)||0)*100)}%`;

  function ensureStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .financial-insights-panel{position:relative;overflow:hidden}
      .financial-insights-panel:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,var(--color-brand),transparent 88%);opacity:.75}
      .financial-insights-summary{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .financial-insights-summary .badge{background:rgba(255,255,255,.025)}
      .financial-insights-list{display:grid;gap:9px}
      .financial-insight{border:1px solid var(--color-border);border-radius:var(--radius-md);background:#081626;padding:12px;display:grid;gap:9px}
      .financial-insight[data-severity="critical"]{border-color:var(--color-negative-border);background:linear-gradient(180deg,rgba(244,63,94,.075),#081626 70%)}
      .financial-insight[data-severity="warning"]{border-color:var(--color-warning-border);background:linear-gradient(180deg,rgba(245,158,11,.06),#081626 70%)}
      .financial-insight-top{display:flex;gap:10px;align-items:flex-start}
      .financial-insight-marker{width:30px;height:30px;border-radius:9px;border:1px solid var(--color-border);display:grid;place-items:center;font-weight:850;flex:0 0 auto;color:var(--color-brand);background:#0b1b2e}
      .financial-insight[data-severity="critical"] .financial-insight-marker{color:var(--color-negative);border-color:var(--color-negative-border);background:var(--color-negative-bg)}
      .financial-insight[data-severity="warning"] .financial-insight-marker{color:var(--color-warning);border-color:var(--color-warning-border);background:var(--color-warning-bg)}
      .financial-insight-copy{min-width:0;flex:1}
      .financial-insight-copy b{display:block;font-size:12.5px;color:var(--color-text);line-height:1.35}
      .financial-insight-copy p{margin:3px 0 0;color:var(--color-text-secondary);font-size:10.5px;line-height:1.45}
      .financial-insight-meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:5px}
      .financial-insight-severity{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted)}
      .financial-insight-evidence{font-size:10px;color:var(--color-text-secondary);padding:8px 9px;border-radius:9px;border:1px dashed var(--color-border);background:rgba(0,0,0,.08)}
      .financial-insight-details{border-top:1px solid rgba(26,52,82,.55);padding-top:8px}
      .financial-insight-details summary{cursor:pointer;color:var(--color-text-secondary);font-size:10px;font-weight:700;list-style:none}
      .financial-insight-details summary::-webkit-details-marker{display:none}
      .financial-insight-details p{margin:7px 0 0;font-size:10px;color:var(--color-text-secondary);line-height:1.45}
      .financial-insight-actions{display:flex;gap:7px;flex-wrap:wrap}
      .financial-insight-actions button{min-height:34px;padding:6px 10px;font-size:10px}
      .financial-insights-empty{display:flex;gap:10px;align-items:center;padding:12px;border:1px solid rgba(34,197,94,.22);border-radius:var(--radius-md);background:rgba(34,197,94,.055)}
      .financial-insights-empty strong{display:block;font-size:12px;color:var(--color-text)}
      .financial-insights-empty small{display:block;margin-top:2px;color:var(--color-text-secondary);font-size:10px}
      @media(max-width:720px){.financial-insight-actions button{flex:1 1 auto}.financial-insight-top{gap:8px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    let panel=document.getElementById(PANEL_ID);
    if(panel) return panel;
    const anchor=document.querySelector('.today-secondary-grid');
    if(!anchor) return null;
    panel=document.createElement('section');
    panel.id=PANEL_ID;
    panel.className='panel financial-insights-panel';
    panel.setAttribute('aria-labelledby','financialInsightsTitle');
    anchor.insertAdjacentElement('afterend',panel);
    return panel;
  }

  function severityLabel(severity){
    return severity==='critical'?'Crítico':severity==='warning'?'Atenção':'Informativo';
  }

  function markerFor(type){
    return ({cashflow_risk:'!',upcoming_obligations:'↗',category_deviation:'Δ',duplicate_candidate:'=',low_savings:'%'}[type]||'•');
  }

  function destinationFor(type){
    return ({
      cashflow_risk:{page:'calendario',label:'Ver calendário'},
      upcoming_obligations:{page:'calendario',label:'Ver compromissos'},
      category_deviation:{page:'relatorios',label:'Ver relatórios'},
      duplicate_candidate:{page:'lancamentos',label:'Revisar lançamentos'},
      low_savings:{page:'orcamento',label:'Ver orçamento'}
    })[type]||{page:'dashboard',label:'Ver detalhes'};
  }

  function evidenceLine(insight){
    const e=insight?.evidence||{};
    switch(insight?.type){
      case 'cashflow_risk':
        return `Menor saldo projetado: ${money(e.minBalanceCents)}${e.minDate?` em ${escapeHtml(e.minDate)}`:''}.`;
      case 'upcoming_obligations':
        return `${Number(e.events?.length)||0} obrigação(ões) conhecida(s), total de ${money(e.totalCents)}.`;
      case 'category_deviation':
        return `Atual: ${money(e.currentCents)} · média recente: ${money(e.baselineCents)} · desvio: ${pct((Number(e.ratio)||1)-1)}.`;
      case 'duplicate_candidate':
        return `${escapeHtml(e.date||'Data não informada')} · ${money(e.amountCents)} · mesma conta, natureza, valor e descrição normalizada.`;
      case 'low_savings':
        return `Receitas: ${money(e.incomeCents)} · resultado: ${money(e.resultCents)} · taxa: ${pct(e.savingsRate)}.`;
      default:
        return insight?.explanation||'';
    }
  }

  function headerHtml(report){
    const s=report?.summary||{};
    const badges=[];
    if(s.critical) badges.push(`<span class="badge negative">${s.critical} crítico${s.critical===1?'':'s'}</span>`);
    if(s.warning) badges.push(`<span class="badge warning">${s.warning} atenção</span>`);
    if(s.info) badges.push(`<span class="badge">${s.info} informativo${s.info===1?'':'s'}</span>`);
    if(!badges.length) badges.push('<span class="badge positive">Tudo tranquilo</span>');
    return `<div class="head"><div><h2 id="financialInsightsTitle">O que merece atenção</h2><p>Leitura determinística do seu cenário financeiro. Nenhum alerta altera seus dados.</p></div><div class="financial-insights-summary">${badges.join('')}</div></div>`;
  }

  function cardHtml(insight,index){
    const dest=destinationFor(insight.type);
    const moneySensitive=['cashflow_risk','upcoming_obligations','category_deviation','duplicate_candidate','low_savings'].includes(insight.type);
    return `<article class="financial-insight" data-insight-id="${escapeHtml(insight.id)}" data-severity="${escapeHtml(insight.severity)}">
      <div class="financial-insight-top">
        <div class="financial-insight-marker" aria-hidden="true">${escapeHtml(markerFor(insight.type))}</div>
        <div class="financial-insight-copy">
          <b>${escapeHtml(insight.title)}</b>
          <p${moneySensitive?' data-money':''}>${escapeHtml(insight.message)}</p>
          <div class="financial-insight-meta"><span class="financial-insight-severity">${escapeHtml(severityLabel(insight.severity))}</span><span class="badge">Confiança ${Math.round((Number(insight.confidence)||0)*100)}%</span></div>
        </div>
      </div>
      <div class="financial-insight-evidence"${moneySensitive?' data-money':''}>${evidenceLine(insight)}</div>
      <details class="financial-insight-details"><summary>Como o SFP chegou nisso</summary><p${moneySensitive?' data-money':''}>${escapeHtml(insight.explanation||'Insight calculado a partir do Local Financial Core.')}</p></details>
      <div class="financial-insight-actions">
        <button type="button" class="btn2" data-insight-open="${escapeHtml(dest.page)}">${escapeHtml(dest.label)}</button>
        <button type="button" class="ghost" data-insight-ask="${index}">Perguntar à Sophy</button>
      </div>
    </article>`;
  }

  function bindActions(panel,report){
    panel.querySelectorAll('[data-insight-open]').forEach(btn=>{
      btn.onclick=()=>{
        const page=btn.dataset.insightOpen;
        if(page&&typeof global.setPage==='function') global.setPage(page);
      };
    });
    panel.querySelectorAll('[data-insight-ask]').forEach(btn=>{
      btn.onclick=async()=>{
        const insight=report?.insights?.[Number(btn.dataset.insightAsk)];
        if(!insight||typeof global.sophySendMessage!=='function') return;
        if(typeof global.setPage==='function') global.setPage('sophy');
        const prompt=`Explique o insight determinístico "${insight.title}" usando o escopo de insights do SFP. Mostre o que ele significa, quais evidências sustentam o alerta e quais ações eu posso considerar. Não recalcule nem invente valores; use o Local Financial Core e deixe claro qualquer limitação.`;
        await global.sophySendMessage(prompt);
      };
    });
  }

  function renderFinancialInsights(){
    ensureStyles();
    const panel=ensurePanel();
    if(!panel) return null;
    let report;
    try{
      report=typeof global.financialIntelligenceSnapshot==='function'
        ? global.financialIntelligenceSnapshot()
        : {summary:{total:0,critical:0,warning:0,info:0},insights:[],error:'snapshot_unavailable'};
    }catch(error){
      report={summary:{total:0,critical:0,warning:0,info:0},insights:[],error:String(error?.message||error)};
    }
    const insights=Array.isArray(report?.insights)?report.insights.slice(0,MAX_VISIBLE):[];
    if(report?.error){
      panel.innerHTML=`${headerHtml(report)}<div class="financial-insights-empty"><div><strong>Insights temporariamente indisponíveis</strong><small>O restante do SFP continua funcionando normalmente.</small></div></div>`;
      return report;
    }
    if(!insights.length){
      panel.innerHTML=`${headerHtml(report)}<div class="financial-insights-empty"><div><strong>Nenhum sinal relevante agora</strong><small>O motor não encontrou risco ou desvio material nas regras atuais.</small></div></div>`;
      return report;
    }
    panel.innerHTML=`${headerHtml(report)}<div class="financial-insights-list">${insights.map(cardHtml).join('')}</div>${report.insights.length>MAX_VISIBLE?`<small class="muted">Mostrando ${MAX_VISIBLE} de ${report.insights.length} insights, priorizados por severidade.</small>`:''}`;
    bindActions(panel,{...report,insights});
    return report;
  }

  global.renderFinancialInsights=renderFinancialInsights;
})(typeof window!=='undefined'?window:globalThis);
