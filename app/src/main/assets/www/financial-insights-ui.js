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
      .financial-insights-panel .head{min-width:0}
      .financial-insights-panel .head>div:first-child{min-width:0}
      .financial-insights-summary{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;min-width:0;max-width:100%}
      .financial-insights-summary .badge{background:rgba(255,255,255,.025);white-space:nowrap;max-width:100%}
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
      @media(max-width:720px){
        .financial-insight-actions button{flex:1 1 auto}
        .financial-insight-top{gap:8px}
        .financial-insights-panel .head{display:flex;flex-wrap:wrap}
        .financial-insights-summary{flex:1 1 100%;justify-content:flex-start;margin-top:2px}
      }
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

  function naturalInsightPrompt(insight){
    const evidence=evidenceLine(insight);
    return `Sophy, me explica esse alerta de um jeito simples: “${insight.title}”. O SFP encontrou: ${evidence} O que isso significa para o meu mês e qual é a ação mais útil agora?`;
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
      <details class="financial-insight-details"><summary>Como o SFP chegou nisso</summary><p${moneySensitive?' data-money':''}>${escapeHtml(insight.explanation||'Insight calculado a partir dos dados financeiros registrados no SFP.')}</p></details>
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
        await global.sophySendMessage(naturalInsightPrompt(insight));
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

(function(global){
  'use strict';

  const STYLE_ID='sfpProductPolishStyles';
  const EXPENSE_CATEGORIES=['Essencial','Alimentação','Transporte','Faculdade','Saúde','Assinaturas','Dívida','Lazer','Casa','Trabalho','Ajuste','Outros'];
  const INCOME_CATEGORIES=['Salário','Adiantamento salarial','Hora extra','Benefícios','Freelance / renda extra','Reembolso','Rendimentos','Venda','Presente','Ajuste','Outros'];

  function ensureStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      select.sfp-review-native-select{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;margin:0!important;padding:0!important;border:0!important;clip-path:inset(50%)!important}
      .sfp-review-select{position:relative;margin-top:4px;min-width:0}
      .sfp-review-select-button{width:100%;min-height:var(--control-height);display:flex;align-items:center;justify-content:space-between;gap:12px;background:#071423;border:1px solid var(--color-border);color:var(--color-text);border-radius:10px;padding:10px 12px;font:inherit;font-weight:650;text-align:left;box-shadow:none;min-width:0}
      .sfp-review-select-button:disabled{opacity:.55;cursor:not-allowed}
      .sfp-review-select-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .sfp-review-select-button:focus,.sfp-review-select-button[aria-expanded="true"]{outline:none;border-color:var(--color-brand);box-shadow:0 0 0 3px var(--color-brand-glow)}
      .sfp-review-select-chevron{width:9px;height:9px;flex:0 0 auto;border-right:2px solid var(--color-text-secondary);border-bottom:2px solid var(--color-text-secondary);transform:rotate(45deg) translateY(-2px);transition:transform .15s ease}
      .sfp-review-select-button[aria-expanded="true"] .sfp-review-select-chevron{transform:rotate(225deg) translate(-2px,-2px)}
      .sfp-review-select-menu{position:absolute;z-index:20000;left:0;right:0;top:calc(100% + 6px);max-height:min(44vh,330px);overflow:auto;padding:6px;background:linear-gradient(180deg,var(--color-surface-elevated),var(--color-surface-1));border:1px solid var(--color-border-strong);border-radius:12px;box-shadow:var(--shadow-lg);overscroll-behavior:contain}
      .sfp-review-select-menu[hidden]{display:none!important}
      .sfp-review-select-option{width:100%;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border:0;border-radius:9px;background:transparent;color:var(--color-text);font:inherit;text-align:left}
      .sfp-review-select-option:hover,.sfp-review-select-option:focus{outline:none;background:rgba(255,255,255,.055)}
      .sfp-review-select-option[aria-selected="true"]{background:var(--color-brand-muted);color:var(--color-brand);font-weight:800}
      .sfp-review-select-option[aria-selected="true"]:after{content:"✓";font-weight:900}
      .field-help,.sfp-field-help{display:block;margin-top:5px;color:var(--color-text-muted);font-size:9.5px;line-height:1.4}
      .head,.management-form-panel .head{overflow:visible!important}
      .head h2,.management-form-panel .head h2{line-height:1.35!important;padding-top:1px;overflow:visible!important}
      .form-section{min-width:0}
      .management-form,.management-form-panel form{min-width:0}
      @media(max-width:720px){
        .sfp-review-select-menu{position:fixed;left:12px;right:12px;top:auto;bottom:calc(var(--bottom-nav-height,62px) + env(safe-area-inset-bottom,0px) + 12px);max-height:58vh;border-radius:16px;padding:8px;box-shadow:0 20px 70px rgba(0,0,0,.72)}
        .sfp-review-select-button,.sfp-review-select-option{font-size:16px}
        .form-section,.management-form-panel,.panel{scroll-margin-top:12px}
        .field-group--two,.two,.three{gap:10px}
      }
      @media(orientation:landscape) and (max-height:600px){
        main{padding:10px 14px 78px!important}
        .top{margin-bottom:12px!important}
        .grid2,.grid3,.management-layout,.field-group--two,.two,.three{grid-template-columns:1fr!important}
        .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .panel{padding:13px!important}
        .sidebar{padding-top:8px!important;padding-bottom:8px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function closeOtherMenus(except){
    document.querySelectorAll('.sfp-review-select-menu').forEach(menu=>{
      if(menu===except) return;
      menu.hidden=true;
      menu.parentElement?.querySelector('.sfp-review-select-button')?.setAttribute('aria-expanded','false');
    });
  }

  function optionSignature(select){
    return Array.from(select.options).map(option=>`${option.value}:${option.textContent}:${option.disabled?'1':'0'}`).join('|');
  }

  function refreshCustom(select){
    const host=select?._sfpReviewHost;
    if(!host) return;
    const button=host.querySelector('.sfp-review-select-button');
    const menu=host.querySelector('.sfp-review-select-menu');
    const selected=select.options[select.selectedIndex];
    const label=host.querySelector('.sfp-review-select-label');
    const labelText=selected?.textContent||select.getAttribute('placeholder')||'Selecione';
    if(label&&label.textContent!==labelText) label.textContent=labelText;
    if(button) button.disabled=!!select.disabled;
    if(!menu) return;
    const signature=optionSignature(select);
    if(menu.dataset.optionsSignature!==signature){
      menu.dataset.optionsSignature=signature;
      menu.replaceChildren(...Array.from(select.options).map(option=>{
        const item=document.createElement('button');
        item.type='button';
        item.className='sfp-review-select-option';
        item.setAttribute('role','option');
        item.dataset.value=option.value;
        item.disabled=option.disabled;
        item.textContent=option.textContent;
        item.onclick=()=>{
          if(option.disabled) return;
          select.value=option.value;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          menu.hidden=true;
          button?.setAttribute('aria-expanded','false');
          button?.focus();
        };
        return item;
      }));
    }
    menu.querySelectorAll('.sfp-review-select-option').forEach(item=>{
      item.setAttribute('aria-selected',String(item.dataset.value===select.value));
    });
  }

  function focusOption(menu,direction){
    const options=Array.from(menu.querySelectorAll('.sfp-review-select-option:not(:disabled)'));
    if(!options.length) return;
    const current=document.activeElement;
    const index=options.indexOf(current);
    const next=index<0?(direction>0?0:options.length-1):(index+direction+options.length)%options.length;
    options[next].focus();
  }

  function enhanceSelect(select){
    if(!select||select.multiple||select.dataset.sfpReviewEnhanced==='1') return;
    select.dataset.sfpReviewEnhanced='1';
    select.classList.add('sfp-review-native-select');
    const host=document.createElement('div');
    host.className='sfp-review-select';
    host.dataset.forSelect=select.id||'';
    host.innerHTML='<button type="button" class="sfp-review-select-button" aria-haspopup="listbox" aria-expanded="false"><span class="sfp-review-select-label"></span><span class="sfp-review-select-chevron" aria-hidden="true"></span></button><div class="sfp-review-select-menu" role="listbox" hidden></div>';
    select.insertAdjacentElement('afterend',host);
    select._sfpReviewHost=host;
    const button=host.querySelector('.sfp-review-select-button');
    const menu=host.querySelector('.sfp-review-select-menu');
    button.onclick=()=>{
      if(select.disabled) return;
      const opening=menu.hidden;
      closeOtherMenus(menu);
      menu.hidden=!opening;
      button.setAttribute('aria-expanded',String(opening));
      if(opening) requestAnimationFrame(()=>menu.querySelector('[aria-selected="true"]')?.focus());
    };
    button.onkeydown=event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        if(menu.hidden) button.click();
        requestAnimationFrame(()=>focusOption(menu,event.key==='ArrowDown'?1:-1));
      }else if(event.key==='Escape'){
        menu.hidden=true;
        button.setAttribute('aria-expanded','false');
      }
    };
    menu.onkeydown=event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        focusOption(menu,event.key==='ArrowDown'?1:-1);
      }else if(event.key==='Escape'){
        menu.hidden=true;
        button.setAttribute('aria-expanded','false');
        button.focus();
      }
    };
    select.addEventListener('change',()=>refreshCustom(select));
    refreshCustom(select);
  }

  function replaceCategoryOptions(select,categories,preserve=true){
    if(!select||!categories?.length) return;
    const previous=select.value;
    const current=Array.from(select.options).map(option=>option.value);
    const changed=current.length!==categories.length||current.some((value,index)=>value!==categories[index]);
    if(changed){
      select.replaceChildren(...categories.map(category=>{
        const option=document.createElement('option');
        option.value=category;
        option.textContent=category;
        return option;
      }));
    }
    const next=preserve&&categories.includes(previous)?previous:'Outros';
    if(select.value!==next) select.value=next;
    refreshCustom(select);
  }

  function visible(element){
    return !!element&&!element.classList.contains('hidden')&&element.offsetParent!==null;
  }

  function syncSemanticCategories(){
    const reviewNature=document.getElementById('financialReviewNature');
    const reviewCategory=document.getElementById('financialReviewCategory');
    if(reviewNature&&reviewCategory){
      if(reviewNature.value==='income') replaceCategoryOptions(reviewCategory,INCOME_CATEGORIES);
      else if(reviewNature.value==='expense') replaceCategoryOptions(reviewCategory,EXPENSE_CATEGORIES);
    }

    const recType=document.getElementById('recType');
    const recCategory=document.getElementById('recCategory');
    if(recType&&recCategory) replaceCategoryOptions(recCategory,recType.value==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES);

    const ruleAction=document.getElementById('ruleEditAction');
    const ruleCategory=document.getElementById('ruleEditCategory');
    if(ruleAction&&ruleCategory&&ruleAction.value!=='transfer') replaceCategoryOptions(ruleCategory,ruleAction.value==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES);

    const txCategory=document.getElementById('txCategory');
    if(txCategory){
      const incomeFields=document.getElementById('incomeFields');
      const transferFields=document.getElementById('transferFields');
      if(visible(incomeFields)) replaceCategoryOptions(txCategory,INCOME_CATEGORIES);
      else if(!visible(transferFields)) replaceCategoryOptions(txCategory,EXPENSE_CATEGORIES);
    }

    document.querySelectorAll('select[data-sa]').forEach(action=>{
      const row=action.closest('tr');
      const category=row?.querySelector('select[data-sc]');
      if(!category||action.value==='transfer'||action.value==='transfer_match'||action.value==='pending_transfer'||action.value==='ignore') return;
      replaceCategoryOptions(category,action.value==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES);
    });
  }

  function addHelp(id,text){
    const field=document.getElementById(id);
    if(!field||field.dataset.sfpHelpAdded==='1') return;
    field.dataset.sfpHelpAdded='1';
    const help=document.createElement('small');
    help.className='sfp-field-help';
    help.textContent=text;
    const host=field._sfpReviewHost;
    (host||field).insertAdjacentElement('afterend',help);
  }

  function improveClarity(){
    addHelp('txFirstBill','Escolhe em qual fatura a compra começa. “Automática” usa a data de fechamento do cartão.');
    addHelp('debtRatePeriod','Define se a taxa informada é diária, mensal ou anual.');
    addHelp('debtAmortization','Price estima a parcela automaticamente; Manual preserva o valor definido no contrato.');
    addHelp('budgetPreset','É apenas um ponto de partida. Você pode personalizar os percentuais depois.');
    addHelp('cfgDay1','Usado para organizar seu primeiro ciclo principal de recebimento.');
    addHelp('cfgDay2','Usado para organizar seu segundo ciclo principal de recebimento.');
  }

  function enhanceAll(){
    ensureStyles();
    document.querySelectorAll('select:not([multiple])').forEach(enhanceSelect);
    syncSemanticCategories();
    document.querySelectorAll('select.sfp-review-native-select').forEach(refreshCustom);
    improveClarity();
  }

  function safeSpendPrompt(report){
    const available=Number(report?.availableCents)||0;
    const reserved=Number(report?.reservedCents)||0;
    const free=Number(report?.freeCents)||0;
    const safe=Number(report?.safeToSpendCents)||0;
    const min=Number(report?.projection?.minBalanceCents)||0;
    const next=report?.nextIncome;
    const nextText=next?`${next.date}, ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(next.amountCents)||0)/100)}`:'nenhuma entrada conhecida';
    const fmt=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
    return `Sophy, quanto eu posso gastar sem me apertar? Agora o SFP mostra ${fmt(available)} disponível, ${fmt(reserved)} reservado, ${fmt(free)} livre e ${fmt(safe)} como gasto seguro. O menor saldo projetado é ${fmt(min)} e a próxima entrada conhecida é ${nextText}. Me explica isso de forma simples e me diz o que merece atenção.`;
  }

  document.addEventListener('change',event=>{
    const target=event.target;
    if(!(target instanceof HTMLSelectElement)) return;
    syncSemanticCategories();
    refreshCustom(target);
  });

  document.addEventListener('click',event=>{
    if(!event.target.closest('.sfp-review-select')) closeOtherMenus(null);
  });

  document.addEventListener('click',async event=>{
    const ask=event.target.closest('#safeSpendAskSophy');
    if(!ask) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const report=typeof global.safeSpendingSnapshot==='function'?global.safeSpendingSnapshot():null;
    if(typeof global.setPage==='function') global.setPage('sophy');
    if(report&&typeof global.sophySendMessage==='function') await global.sophySendMessage(safeSpendPrompt(report));
  },true);

  const start=()=>{
    enhanceAll();
    let scheduled=false;
    new MutationObserver(()=>{
      if(scheduled) return;
      scheduled=true;
      queueMicrotask(()=>{
        scheduled=false;
        enhanceAll();
      });
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','disabled']});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})(typeof window!=='undefined'?window:globalThis);
