(function(global){
  'use strict';

  const VERSION=1;
  const PANEL_ID='sophyProactiveBrief';
  const STYLE_ID='sophyProactiveBriefStyles';
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const cents=value=>Number.isFinite(Number(value))?Math.round(Number(value)):0;
  const safeArray=value=>Array.isArray(value)?value:[];
  const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents(value)/100);
  const escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const datePt=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return value||'—';const [y,m,d]=String(value).split('-');return `${d}/${m}/${y}`};
  const pct=value=>`${Math.round((Number(value)||0)*100)}%`;

  const actionByType=Object.freeze({
    cashflow_pressure:'calendario',
    cashflow_risk:'calendario',
    upcoming_obligations:'calendario',
    category_deviation:'relatorios',
    duplicate_candidate:'lancamentos',
    low_savings:'orcamento',
    tight_margin:'orcamento',
    healthy:'dashboard'
  });

  function insightEvidence(insight){
    const e=insight?.evidence||{};
    switch(insight?.type){
      case 'cashflow_risk':
        return [
          {label:'Menor saldo',value:money(e.minBalanceCents),kind:'money'},
          {label:'Quando',value:datePt(e.minDate),kind:'date'}
        ];
      case 'duplicate_candidate':
        return [
          {label:'Valor',value:money(e.amountCents),kind:'money'},
          {label:'Data',value:datePt(e.date),kind:'date'}
        ];
      case 'category_deviation':
        return [
          {label:'Categoria',value:e.category||'—',kind:'text'},
          {label:'Desvio',value:pct((Number(e.ratio)||1)-1),kind:'text'}
        ];
      case 'low_savings':
        return [
          {label:'Taxa',value:pct(e.savingsRate),kind:'text'},
          {label:'Resultado',value:money(e.resultCents),kind:'money'}
        ];
      case 'upcoming_obligations':
        return [
          {label:'Compromissos',value:String(safeArray(e.events).length),kind:'text'},
          {label:'Total',value:money(e.totalCents),kind:'money'}
        ];
      default:
        return [];
    }
  }

  function materialInsight(report){
    const insights=safeArray(report?.insights);
    return insights.find(i=>i?.severity==='critical')||insights.find(i=>i?.severity==='warning')||null;
  }

  function build({insightsReport={},safeSpendReport={},referenceDate=null,force=false}={}){
    const insights=clone(insightsReport)||{};
    const safe=clone(safeSpendReport)||{};
    const top=materialInsight(insights);
    const projection=safe?.projection||{};
    const shortfallCents=Math.max(0,cents(safe.shortfallCents));
    const safeToSpendCents=Math.max(0,cents(safe.safeToSpendCents));
    const minBalanceCents=cents(projection.minBalanceCents);
    const negativeRisk=Boolean(projection.negativeRisk)||minBalanceCents<0;
    const nextIncome=safe.nextIncome||null;

    let priority='healthy';
    let source='healthy';
    let title='Cenário sem alerta material';
    let summary='Os motores locais não encontraram um sinal crítico ou de atenção que justifique interromper você agora.';
    let reason='O brief só promove alertas materiais. Informações normais continuam disponíveis nos painéis do SFP sem gerar notificação espontânea.';
    let confidence=1;
    let actionPage=actionByType.healthy;
    let evidence=[
      {label:'Gasto seguro conhecido',value:money(safeToSpendCents),kind:'money'},
      {label:'Menor saldo projetado',value:money(minBalanceCents),kind:'money'}
    ];

    if(shortfallCents>0||negativeRisk){
      priority='critical';source='cashflow_pressure';title='Pressão de caixa merece atenção';
      summary=shortfallCents>0
        ?`As obrigações conhecidas excedem o saldo disponível em ${money(shortfallCents)}; o gasto seguro conhecido está em ${money(0)}.`
        :`A trajetória conhecida cai até ${money(minBalanceCents)}${projection.minDate?` em ${datePt(projection.minDate)}`:''}, mesmo que o saldo livre atual ainda não esteja negativo.`;
      reason='O sinal vem do mesmo Local Financial Core usado no painel “Quanto posso gastar?”. A Sophy não refaz a conta e não adiciona buffer oculto.';
      actionPage=actionByType.cashflow_pressure;
      evidence=[
        {label:'Gasto seguro',value:money(safeToSpendCents),kind:'money'},
        {label:'Reservado',value:money(safe.reservedCents),kind:'money'},
        {label:'Menor saldo',value:money(minBalanceCents),kind:'money'},
        ...(nextIncome?[{label:'Próxima entrada',value:`${datePt(nextIncome.date)} · ${money(nextIncome.amountCents)}`,kind:'money'}]:[])
      ];
    }else if(top){
      priority=top.severity==='critical'?'critical':'warning';source=top.type||'financial_insight';title=top.title||'Sinal financeiro relevante';
      summary=top.message||'O motor determinístico encontrou um sinal que merece revisão.';
      reason=top.explanation||'Sinal calculado pelo motor de inteligência financeira local.';
      confidence=Number.isFinite(Number(top.confidence))?Math.max(0,Math.min(1,Number(top.confidence))):1;
      actionPage=actionByType[source]||'dashboard';
      evidence=insightEvidence(top);
    }else if(safe.status==='tight'){
      priority='warning';source='tight_margin';title='Margem de gasto está curta';
      summary=`Depois das obrigações conhecidas, o gasto seguro calculado pelo core está em ${money(safeToSpendCents)}.`;
      reason='A margem é classificada como curta pelo motor de gasto seguro; nenhuma reserva adicional foi inventada para produzir esse aviso.';
      actionPage=actionByType.tight_margin;
      evidence=[
        {label:'Disponível',value:money(safe.availableCents),kind:'money'},
        {label:'Reservado',value:money(safe.reservedCents),kind:'money'},
        {label:'Livre',value:money(safe.freeCents),kind:'money'}
      ];
    }else{
      const upcoming=safeArray(insights?.insights).find(i=>i?.type==='upcoming_obligations');
      if(upcoming){
        const e=upcoming.evidence||{};
        summary=`Sem alerta material. Há ${safeArray(e.events).length} compromisso(s) conhecido(s) na janela acompanhada, somando ${money(e.totalCents)}.`;
        evidence=[...evidence,{label:'Compromissos próximos',value:money(e.totalCents),kind:'money'}];
      }
    }

    const shouldNotify=priority==='critical'||priority==='warning';
    const fingerprint=[
      `v${VERSION}`,source,priority,
      top?.id||'',
      cents(safe.safeToSpendCents),
      cents(safe.shortfallCents),
      cents(projection.minBalanceCents),
      projection.minDate||'',
      nextIncome?.date||''
    ].join('|');

    const mood=priority==='critical'?'concerned':priority==='warning'?'focused':'cheerful';
    const message=priority==='healthy'
      ?`**Brief financeiro:** ${summary} Gasto seguro conhecido: **${money(safeToSpendCents)}**. Se quiser, eu detalho as evidências sem recalcular nem inventar valores.`
      :`**${title}**\n\n${summary}\n\n${reason}`;

    return {
      version:VERSION,
      generatedFor:referenceDate||insights.generatedFor||safe.generatedFor||null,
      priority,source,title,summary,reason,confidence,shouldNotify:Boolean(shouldNotify),forced:Boolean(force),
      fingerprint,mood,actionPage,evidence,message,
      contracts:{financialIntelligenceVersion:insights.version??null,safeSpendVersion:safe.version??null,recalculate:false,hiddenBuffer:false}
    };
  }

  function snapshot({force=false}={}){
    const insightsReport=typeof global.financialIntelligenceSnapshot==='function'?global.financialIntelligenceSnapshot():{version:0,insights:[],summary:{}};
    const safeSpendReport=typeof global.safeSpendingSnapshot==='function'?global.safeSpendingSnapshot():{version:0,status:'healthy',safeToSpendCents:0,projection:{minBalanceCents:0}};
    return build({insightsReport,safeSpendReport,referenceDate:insightsReport?.generatedFor||safeSpendReport?.generatedFor||null,force});
  }

  function ensureStyles(){
    if(typeof document==='undefined'||document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .sophy-proactive-brief{flex:0 0 auto;border:1px solid var(--color-border);border-radius:14px;background:linear-gradient(180deg,#0b1b2d,#081626);padding:10px 12px;display:grid;gap:8px;box-shadow:var(--shadow-sm)}
      .sophy-proactive-brief[data-priority="critical"]{border-color:var(--color-negative-border);background:linear-gradient(180deg,rgba(244,63,94,.09),#081626 78%)}
      .sophy-proactive-brief[data-priority="warning"]{border-color:var(--color-warning-border);background:linear-gradient(180deg,rgba(245,158,11,.075),#081626 78%)}
      .sophy-brief-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .sophy-brief-head b{display:block;font-size:12.5px;color:var(--color-text)}
      .sophy-brief-head p{margin:2px 0 0;color:var(--color-text-secondary);font-size:9.8px;line-height:1.4}
      .sophy-brief-evidence{display:flex;gap:6px;flex-wrap:wrap}
      .sophy-brief-evidence span{font-size:9px;color:var(--color-text-secondary);background:#071423;border:1px solid rgba(26,52,82,.7);border-radius:999px;padding:4px 8px;white-space:nowrap}
      .sophy-brief-evidence strong{color:var(--color-text);font-weight:750}
      .sophy-brief-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .sophy-brief-foot details{min-width:0;flex:1;color:var(--color-text-secondary);font-size:9px}
      .sophy-brief-foot summary{cursor:pointer;font-weight:700}
      .sophy-brief-foot details p{margin:5px 0 0;line-height:1.4}
      .sophy-brief-actions{display:flex;gap:5px;flex:0 0 auto}
      .sophy-brief-actions button{min-height:30px;padding:5px 9px;font-size:9.5px}
      @media(max-width:650px){.sophy-proactive-brief{padding:8px 10px;gap:6px}.sophy-brief-head p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sophy-brief-evidence{overflow-x:auto;flex-wrap:nowrap;padding-bottom:1px}.sophy-brief-foot{align-items:flex-end}.sophy-brief-actions button:first-child{display:none}}
      @media(orientation:landscape) and (max-height:500px){
        .sophy-proactive-brief{position:absolute;top:0;left:0;right:0;z-index:4;margin:0;border-radius:12px;padding:5px 8px;display:flex;align-items:center;gap:7px;box-shadow:0 4px 14px rgba(0,0,0,.38)}
        .sophy-brief-head{flex:1 1 auto;min-width:0;align-items:center}
        .sophy-brief-head>div{min-width:0}
        .sophy-brief-head b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sophy-brief-head p,.sophy-brief-evidence,.sophy-brief-foot details{display:none}
        .sophy-brief-foot{flex:0 0 auto}
        .sophy-brief-actions button:first-child{display:none}
        .sophy-brief-actions button{min-height:28px;padding:4px 8px}
        body[data-page="sophy"] .sophy-chat-scroll{padding-top:48px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    if(typeof document==='undefined')return null;
    let panel=document.getElementById(PANEL_ID);
    if(panel)return panel;
    const chat=document.querySelector('#sophy .sophy-chat-card');
    const scroll=chat?.querySelector('.sophy-chat-scroll');
    if(!chat||!scroll)return null;
    panel=document.createElement('section');
    panel.id=PANEL_ID;
    panel.className='sophy-proactive-brief';
    panel.setAttribute('aria-labelledby','sophyBriefTitle');
    scroll.insertAdjacentElement('beforebegin',panel);
    return panel;
  }

  function priorityLabel(priority){return priority==='critical'?'Crítico':priority==='warning'?'Atenção':'Estável'}

  function renderSophyProactiveBrief(){
    ensureStyles();
    const panel=ensurePanel();
    if(!panel)return null;
    let brief;
    try{brief=snapshot()}catch(error){brief=null}
    if(!brief){panel.innerHTML='<div class="sophy-brief-head"><div><b id="sophyBriefTitle">Brief financeiro</b><p>Temporariamente indisponível. A conversa da Sophy continua funcionando.</p></div></div>';return null}
    panel.dataset.priority=brief.priority;
    const evidence=safeArray(brief.evidence).slice(0,4).map(item=>`<span${item.kind==='money'?' data-money':''}>${escapeHtml(item.label)}: <strong>${escapeHtml(item.value)}</strong></span>`).join('');
    const badgeClass=brief.priority==='critical'?'negative':brief.priority==='warning'?'warning':'positive';
    panel.innerHTML=`
      <div class="sophy-brief-head"><div><b id="sophyBriefTitle">${escapeHtml(brief.title)}</b><p data-money>${escapeHtml(brief.summary)}</p></div><span class="badge ${badgeClass}">${priorityLabel(brief.priority)}</span></div>
      <div class="sophy-brief-evidence">${evidence}</div>
      <div class="sophy-brief-foot"><details><summary>Por que a Sophy mostrou isso?</summary><p data-money>${escapeHtml(brief.reason)}</p></details><div class="sophy-brief-actions"><button type="button" class="btn2" data-sophy-brief-open="${escapeHtml(brief.actionPage)}">Abrir</button><button type="button" class="ghost" id="sophyBriefAsk">Detalhar</button></div></div>`;
    panel.querySelector('[data-sophy-brief-open]')?.addEventListener('click',event=>{
      const page=event.currentTarget?.dataset?.sophyBriefOpen;
      if(page&&typeof global.setPage==='function')global.setPage(page);
    });
    panel.querySelector('#sophyBriefAsk')?.addEventListener('click',async()=>{
      if(typeof global.sophySendMessage!=='function')return;
      const prompt=`Detalhe meu brief financeiro atual: "${brief.title}". Use exatamente as evidências do Local Financial Core e dos motores de inteligência já calculados. Explique o significado e opções que eu posso considerar. Não recalcule, não invente valores, não crie buffer oculto e deixe claras as limitações.`;
      await global.sophySendMessage(prompt);
    });
    return brief;
  }

  global.SFPProactiveBrief=Object.freeze({version:VERSION,build});
  global.sophyProactiveBriefSnapshot=snapshot;
  global.renderSophyProactiveBrief=renderSophyProactiveBrief;
})(typeof window!=='undefined'?window:globalThis);
