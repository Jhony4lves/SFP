(function(global){
  'use strict';

  const VERSION=2;
  const PANEL_ID='sophyProactiveBrief';
  const STYLE_ID='sophyProactiveBriefStylesV2';
  const INSTALL_FLAG='__SFP_SOPHY_A3_INSTALLED';
  const DISMISSED_BRIEF_KEY='sfp_sophy_dismissed_brief_fingerprint_v1';
  const MONTH_CONTEXT_PATCH_FLAG='__SFP_SOPHY_MONTH_CONTEXT_V1';
  const GROQ_CONTEXT_PATCH_FLAG='__SFP_SOPHY_GROQ_MONTH_CONTEXT_V1';
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const cents=value=>Number.isFinite(Number(value))?Math.round(Number(value)):0;
  const safeArray=value=>Array.isArray(value)?value:[];
  const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents(value)/100);
  const escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const datePt=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return value||'—';const [y,m,d]=String(value).split('-');return `${d}/${m}/${y}`};
  const pct=value=>`${Math.round((Number(value)||0)*100)}%`;
  const materialBucket=(value,step=2000)=>Math.round(cents(value)/step)*step;
  const brlNumber=value=>Math.round((Number(value)||0)*100)/100;

  const actionByType=Object.freeze({
    cashflow_pressure:'calendario',cashflow_risk:'calendario',upcoming_obligations:'calendario',
    category_deviation:'relatorios',duplicate_candidate:'lancamentos',low_savings:'orcamento',
    tight_margin:'orcamento',healthy:'dashboard'
  });

  function evidence(label,value,kind='text',rawCents=null){return {label,value,kind,rawCents:rawCents==null?null:cents(rawCents)};}

  function insightEvidence(insight){
    const e=insight?.evidence||{};
    switch(insight?.type){
      case 'cashflow_risk': return [evidence('Menor saldo',money(e.minBalanceCents),'money',e.minBalanceCents),evidence('Quando',datePt(e.minDate),'date')];
      case 'duplicate_candidate': return [evidence('Valor',money(e.amountCents),'money',e.amountCents),evidence('Data',datePt(e.date),'date')];
      case 'category_deviation': return [evidence('Categoria',e.category||'—'),evidence('Desvio',pct((Number(e.ratio)||1)-1))];
      case 'low_savings': return [evidence('Taxa',pct(e.savingsRate)),evidence('Resultado',money(e.resultCents),'money',e.resultCents)];
      case 'upcoming_obligations': return [evidence('Compromissos',String(safeArray(e.events).length)),evidence('Total',money(e.totalCents),'money',e.totalCents)];
      default:return [];
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

    let priority='healthy',source='healthy',title='Cenário sem alerta material';
    let summary='Os motores locais não encontraram um sinal crítico ou de atenção que justifique interromper você agora.';
    let reason='O brief só promove alertas materiais. Informações normais continuam disponíveis nos painéis do SFP sem gerar notificação espontânea.';
    let confidence=1,actionPage=actionByType.healthy;
    let items=[evidence('Gasto seguro conhecido',money(safeToSpendCents),'money',safeToSpendCents),evidence('Menor saldo projetado',money(minBalanceCents),'money',minBalanceCents)];

    if(shortfallCents>0||negativeRisk){
      priority='critical';source='cashflow_pressure';title='Pressão de caixa merece atenção';
      summary=shortfallCents>0
        ?`As obrigações conhecidas excedem o saldo disponível em ${money(shortfallCents)}; o gasto seguro conhecido está em ${money(0)}.`
        :`A trajetória conhecida cai até ${money(minBalanceCents)}${projection.minDate?` em ${datePt(projection.minDate)}`:''}, mesmo que o saldo livre atual ainda não esteja negativo.`;
      reason='O sinal vem do mesmo Local Financial Core usado em “Quanto posso gastar?”. A Sophy não refaz a conta e não adiciona margem oculta.';
      actionPage=actionByType.cashflow_pressure;
      items=[
        evidence('Gasto seguro',money(safeToSpendCents),'money',safeToSpendCents),
        evidence('Reservado',money(safe.reservedCents),'money',safe.reservedCents),
        evidence('Menor saldo',money(minBalanceCents),'money',minBalanceCents),
        ...(nextIncome?[evidence('Próxima entrada',`${datePt(nextIncome.date)} · ${money(nextIncome.amountCents)}`,'money',nextIncome.amountCents)]:[])
      ];
    }else if(top){
      priority=top.severity==='critical'?'critical':'warning';source=top.type||'financial_insight';title=top.title||'Sinal financeiro relevante';
      summary=top.message||'O motor determinístico encontrou um sinal que merece revisão.';
      reason=top.explanation||'Sinal calculado pelo motor de inteligência financeira local.';
      confidence=Number.isFinite(Number(top.confidence))?Math.max(0,Math.min(1,Number(top.confidence))):1;
      actionPage=actionByType[source]||'dashboard';items=insightEvidence(top);
    }else if(safe.status==='tight'){
      priority='warning';source='tight_margin';title='Margem de gasto está curta';
      summary=`Depois das obrigações conhecidas, o gasto seguro calculado pelo core está em ${money(safeToSpendCents)}.`;
      reason='A margem foi classificada como curta pelo motor de gasto seguro; nenhuma reserva adicional foi inventada para produzir esse aviso.';
      actionPage=actionByType.tight_margin;
      items=[evidence('Disponível',money(safe.availableCents),'money',safe.availableCents),evidence('Reservado',money(safe.reservedCents),'money',safe.reservedCents),evidence('Livre',money(safe.freeCents),'money',safe.freeCents)];
    }else{
      const upcoming=safeArray(insights?.insights).find(i=>i?.type==='upcoming_obligations');
      if(upcoming){
        const e=upcoming.evidence||{};
        summary=`Sem alerta material. Há ${safeArray(e.events).length} compromisso(s) conhecido(s) na janela acompanhada, somando ${money(e.totalCents)}.`;
        items=[...items,evidence('Compromissos próximos',money(e.totalCents),'money',e.totalCents)];
      }
    }

    const shouldNotify=priority==='critical'||priority==='warning';
    const fingerprint=[
      `v${VERSION}`,source,priority,top?.id||'',safe.status||'',
      materialBucket(shortfallCents),materialBucket(safeToSpendCents),materialBucket(minBalanceCents),
      projection.minDate||'',nextIncome?.date||''
    ].join('|');
    const mood=priority==='critical'?'concerned':priority==='warning'?'focused':'cheerful';
    const message=priority==='healthy'
      ?`**Brief financeiro:** ${summary} Gasto seguro conhecido: **${money(safeToSpendCents)}**.`
      :`**${title}**\n\n${summary}\n\n${reason}`;

    return {
      version:VERSION,generatedFor:referenceDate||insights.generatedFor||safe.generatedFor||null,
      priority,source,title,summary,reason,confidence,shouldNotify:Boolean(shouldNotify),forced:Boolean(force),
      fingerprint,mood,actionPage,evidence:items,message,financial:true,
      contracts:{financialIntelligenceVersion:insights.version??null,safeSpendVersion:safe.version??null,recalculate:false,hiddenBuffer:false,readOnly:true}
    };
  }

  function snapshot({force=false}={}){
    const insightsReport=typeof global.financialIntelligenceSnapshot==='function'?global.financialIntelligenceSnapshot():{version:0,insights:[],summary:{}};
    const safeSpendReport=typeof global.safeSpendingSnapshot==='function'?global.safeSpendingSnapshot():{version:0,status:'healthy',safeToSpendCents:0,projection:{minBalanceCents:0}};
    return build({insightsReport,safeSpendReport,referenceDate:insightsReport?.generatedFor||safeSpendReport?.generatedFor||null,force});
  }

  function detailText(brief){
    if(!brief)return 'Brief financeiro indisponível.';
    const lines=safeArray(brief.evidence).map(item=>`• ${item.label}: ${item.value}`);
    return [
      brief.title,
      brief.summary,
      '',
      'Evidências usadas:',
      ...(lines.length?lines:['• Nenhuma evidência adicional disponível.']),
      '',
      `Por que apareceu: ${brief.reason}`,
      '',
      'Limites: esta leitura usa somente os dados já conhecidos pelo SFP. O cenário não é recalculado aqui, não cria margem oculta e não altera nenhum dado.'
    ].join('\n');
  }

  function civilDate(reference=new Date()){
    try{return typeof global.localCivilDate==='function'?global.localCivilDate(reference):`${reference.getFullYear()}-${String(reference.getMonth()+1).padStart(2,'0')}-${String(reference.getDate()).padStart(2,'0')}`}
    catch(_){return new Date(reference).toISOString().slice(0,10)}
  }

  function monthEndIso(month){
    const match=String(month||'').match(/^(\d{4})-(\d{2})$/);if(!match)return null;
    const date=new Date(Number(match[1]),Number(match[2]),0,12,0,0,0);
    return civilDate(date);
  }

  function dayDistance(from,to){
    const a=new Date(`${from}T12:00:00`),b=new Date(`${to}T12:00:00`);
    if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return 0;
    return Math.max(0,Math.ceil((b-a)/86400000));
  }

  function eventAmountBRL(event){return brlNumber(Math.abs(Number(event?.amount)||0));}

  function monthlyPlanningContext({month=null,reference=new Date()}={}){
    const appState=getState();
    const today=civilDate(reference),todayMonth=today.slice(0,7),target=String(month||appState?.mesAtual||todayMonth).slice(0,7);
    const monthEnd=monthEndIso(target)||today;
    let realized={incomeBRL:0,expenseBRL:0,resultBRL:0};
    try{
      if(typeof global.cashView==='function'){
        const cash=global.cashView(target)||{};
        realized={incomeBRL:brlNumber(cash.income),expenseBRL:brlNumber(cash.expense),resultBRL:brlNumber(cash.result)};
      }
    }catch(_){}

    let projection=null,liquidity=null,events=[];
    try{
      const horizon=dayDistance(today,monthEnd)+1;
      if(global.SFPFinancialIntegrityV2?.buildProjection)projection=global.SFPFinancialIntegrityV2.buildProjection(horizon,reference);
      if(global.SFPFinancialIntegrityV2?.liquiditySnapshot)liquidity=global.SFPFinancialIntegrityV2.liquiditySnapshot({reference,days:horizon});
      const all=safeArray(projection?.allEvents);
      events=all.filter(event=>{
        if(event?.cashIgnored||!['income','expense'].includes(event?.type))return false;
        const due=String(event?.dueDate||event?.date||'').slice(0,10),effective=String(event?.effectiveDate||due).slice(0,10);
        if(event?.overdue&&target===todayMonth)return true;
        if(due.slice(0,7)!==target)return false;
        return target>todayMonth||effective>=today;
      });
    }catch(_){}

    if(!projection&&typeof global.dueEvents==='function'){
      try{
        events=safeArray(global.dueEvents(target)).filter(event=>{
          if(!['income','expense'].includes(event?.type))return false;
          const due=String(event?.date||'').slice(0,10),status=String(event?.status||'');
          return due.slice(0,7)===target&&status!=='paid'&&status!=='closed'&&(target>todayMonth||due>=today);
        });
      }catch(_){}
    }

    const remainingIncomeBRL=brlNumber(events.filter(e=>e.type==='income').reduce((sum,e)=>sum+eventAmountBRL(e),0));
    const remainingExpenseBRL=brlNumber(events.filter(e=>e.type==='expense').reduce((sum,e)=>sum+eventAmountBRL(e),0));
    const overdueExpenseBRL=brlNumber(events.filter(e=>e.type==='expense'&&e.overdue).reduce((sum,e)=>sum+eventAmountBRL(e),0));
    let currentOperationalBalanceBRL=0;
    if(liquidity&&Number.isFinite(Number(liquidity.operationalAvailableCents)))currentOperationalBalanceBRL=brlNumber(liquidity.operationalAvailableCents/100);
    else{
      try{currentOperationalBalanceBRL=brlNumber(typeof global.allAccountBalance==='function'?global.allAccountBalance():0)}catch(_){}
    }
    const resourcesThroughMonthEndBRL=brlNumber(currentOperationalBalanceBRL+remainingIncomeBRL);
    const projectedMonthEndBalanceBRL=projection&&Number.isFinite(Number(projection.projectedCents))
      ?brlNumber(projection.projectedCents/100)
      :brlNumber(resourcesThroughMonthEndBRL-remainingExpenseBRL);

    return {
      version:1,scope:'cashflow',month:target,asOf:today,readOnly:true,
      currentOperationalBalanceBRL,
      realized,
      remaining:{
        incomeBRL:remainingIncomeBRL,
        expenseBRL:remainingExpenseBRL,
        netBRL:brlNumber(remainingIncomeBRL-remainingExpenseBRL),
        overdueExpenseBRL,
        events:events.slice(0,30).map(event=>({
          type:event.type,description:event.desc||event.description||'Evento financeiro',date:event.dueDate||event.date||null,
          amountBRL:eventAmountBRL(event),status:event.status||'planned',overdue:Boolean(event.overdue),source:event.source||null,accountId:event.accountId??null
        }))
      },
      resourcesThroughMonthEndBRL,
      projectedMonthEndBalanceBRL,
      safeToSpendBRL:liquidity&&Number.isFinite(Number(liquidity.safeToSpendCents))?brlNumber(liquidity.safeToSpendCents/100):null,
      preserveBRL:liquidity&&Number.isFinite(Number(liquidity.preserveCents))?brlNumber(liquidity.preserveCents/100):null,
      semantics:'Saldo atual não é receita. resourcesThroughMonthEndBRL = saldo operacional atual + entradas conhecidas restantes. projectedMonthEndBalanceBRL considera também as saídas conhecidas até o fim do mês.'
    };
  }

  function promptMonth(prompt,reference=new Date()){
    const text=String(prompt||'').toLowerCase();
    const months={janeiro:1,fevereiro:2,marco:3,'março':3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
    const yearMatch=text.match(/\b(20\d{2})\b/),fallbackYear=reference.getFullYear();
    for(const [name,index] of Object.entries(months))if(text.includes(name))return `${yearMatch?yearMatch[1]:fallbackYear}-${String(index).padStart(2,'0')}`;
    const numeric=text.match(/\b(0?[1-9]|1[0-2])[\/-](20\d{2})\b/);if(numeric)return `${numeric[2]}-${String(Number(numeric[1])).padStart(2,'0')}`;
    return String(getState()?.mesAtual||civilDate(reference).slice(0,7)).slice(0,7);
  }

  function promptNeedsMonthlyContext(prompt){
    const text=String(prompt||'');
    return /(restante do m[eê]s|fim do m[eê]s|despesas?\s+(?:que\s+)?falt|receitas?\s+(?:que\s+)?falt|ainda\s+(?:vai|vou|falta|faltam|entra|entrar|receb)|quanto.*(?:m[eê]s|entrar|pagar|sobrar)|somando.*(?:entr|receb)|proje[cç][aã]o.*m[eê]s|o que ainda (?:entra|sai|falta))/i.test(text);
  }

  function installMonthlyContextBridge(){
    if(global[MONTH_CONTEXT_PATCH_FLAG])return;
    const broker=global.sophyContextBroker,tool=global.sophyToolRegistry?.tools?.get_financial_context;
    if(!broker||typeof broker.buildContext!=='function'||!tool)return;
    const original=broker.buildContext.bind(broker);
    broker.buildContext=function(scope='overview',options={}){
      const base=original(scope,options);
      if(scope==='cashflow')return {...base,...monthlyPlanningContext({month:options?.month})};
      if(scope==='overview')return {...base,monthPlanning:monthlyPlanningContext({month:options?.month})};
      return base;
    };
    tool.description='Obtém dados determinísticos e read-only do Local Financial Core. Para fluxo de caixa, inclui saldo operacional atual, receitas/despesas realizadas, entradas e obrigações restantes do mês, recursos até o fim do mês e saldo projetado. Use antes de pedir ao usuário valores que podem já existir no SFP.';
    global[MONTH_CONTEXT_PATCH_FLAG]=true;
  }

  function installGroqMonthlyContext(){
    if(global[GROQ_CONTEXT_PATCH_FLAG])return;
    const provider=global.sophyProviderRegistry?.groq;if(!provider||typeof provider.generateResponse!=='function')return;
    const original=provider.generateResponse;
    const wrapped=async function(args={}){
      if(!promptNeedsMonthlyContext(args?.prompt))return original.call(this,args);
      let context=null;try{context=monthlyPlanningContext({month:promptMonth(args.prompt)})}catch(_){}
      if(!context)return original.call(this,args);
      const appendix=[
        'CONTEXTO FINANCEIRO DETERMINÍSTICO DO SFP (read-only):',
        JSON.stringify(context),
        'REGRAS PARA ESTA RESPOSTA: use os valores acima diretamente; não peça ao usuário números que já estejam presentes. Diferencie saldo atual de receita. Se algum componente estiver ausente, diga exatamente qual está ausente em vez de afirmar genericamente que não tem acesso. Não invente valores e não altere dados.'
      ].join('\n');
      const rolling=[args?.rollingSummary,appendix].filter(Boolean).join('\n\n');
      return original.call(this,{...args,rollingSummary:rolling});
    };
    wrapped.__sfpMonthlyContextWrapped=true;wrapped.__sfpOriginalGenerateResponse=original;provider.generateResponse=wrapped;global[GROQ_CONTEXT_PATCH_FLAG]=true;
  }

  function sessionStore(){try{return global.sessionStorage||null}catch(_){return null}}
  function dismissedFingerprint(){try{return sessionStore()?.getItem(DISMISSED_BRIEF_KEY)||''}catch(_){return''}}
  function isBriefDismissed(brief){return Boolean(brief?.fingerprint&&dismissedFingerprint()===brief.fingerprint)}
  function dismissBrief(brief,panel){
    if(!brief?.fingerprint||!panel)return;
    try{sessionStore()?.setItem(DISMISSED_BRIEF_KEY,brief.fingerprint)}catch(_){}
    panel.hidden=true;
  }

  function ensureStyles(){
    if(typeof document==='undefined'||document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      .sophy-proactive-brief{flex:0 0 auto;border:1px solid var(--color-border);border-radius:14px;background:linear-gradient(180deg,#0b1b2d,#081626);padding:10px 12px;display:grid;gap:8px;box-shadow:var(--shadow-sm)}
      .sophy-proactive-brief[hidden]{display:none!important}
      .sophy-proactive-brief[data-priority="critical"]{border-color:var(--color-negative-border);background:linear-gradient(180deg,rgba(244,63,94,.09),#081626 78%)}
      .sophy-proactive-brief[data-priority="warning"]{border-color:var(--color-warning-border);background:linear-gradient(180deg,rgba(245,158,11,.075),#081626 78%)}
      .sophy-brief-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.sophy-brief-head>div:first-child{min-width:0}
      .sophy-brief-head-side{display:flex;align-items:center;gap:5px;flex:0 0 auto}.sophy-brief-dismiss{width:34px;height:34px;min-height:34px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--color-text-secondary);font-size:22px;line-height:1}.sophy-brief-dismiss:hover,.sophy-brief-dismiss:focus-visible{background:rgba(255,255,255,.06);color:var(--color-text);outline:1px solid var(--color-border-strong)}
      .sophy-brief-head b{display:block;font-size:12.5px;color:var(--color-text)}.sophy-brief-head p{margin:2px 0 0;color:var(--color-text-secondary);font-size:11px;line-height:1.4}
      .sophy-brief-evidence{display:flex;gap:6px;flex-wrap:wrap}.sophy-brief-evidence span{font-size:11px;color:var(--color-text-secondary);background:#071423;border:1px solid rgba(26,52,82,.7);border-radius:999px;padding:4px 8px;white-space:nowrap}.sophy-brief-evidence strong{color:var(--color-text);font-weight:750}
      .sophy-brief-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}.sophy-brief-foot details{min-width:0;flex:1;color:var(--color-text-secondary);font-size:11px}.sophy-brief-foot summary{cursor:pointer;font-weight:700}.sophy-brief-foot details p{margin:5px 0 0;line-height:1.4}
      .sophy-brief-actions{display:flex;gap:5px;flex:0 0 auto}.sophy-brief-actions button{min-height:44px;padding:8px 10px;font-size:11px}
      .sophy-brief-detail{display:none;border-top:1px solid var(--color-border);padding-top:8px;white-space:pre-line;color:var(--color-text-secondary);font-size:11px;line-height:1.5}.sophy-brief-detail.is-open{display:block}
      @media(max-width:650px){.sophy-proactive-brief{padding:8px 10px;gap:6px}.sophy-brief-head p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sophy-brief-evidence{overflow-x:auto;flex-wrap:nowrap;padding-bottom:1px}.sophy-brief-foot{align-items:flex-end}.sophy-brief-actions button:first-child{display:none}}
      @media(orientation:landscape) and (max-height:520px){.sophy-proactive-brief{padding:6px 9px;gap:5px}.sophy-brief-head p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sophy-brief-evidence{max-height:38px;overflow:auto}.sophy-brief-detail{max-height:76px;overflow:auto}}
    `;document.head.appendChild(style);
  }

  function ensurePanel(){
    if(typeof document==='undefined')return null;
    let panel=document.getElementById(PANEL_ID);if(panel)return panel;
    const chat=document.querySelector('#sophy .sophy-chat-card');const scroll=chat?.querySelector('.sophy-chat-scroll');
    if(!chat||!scroll)return null;
    panel=document.createElement('section');panel.id=PANEL_ID;panel.className='sophy-proactive-brief';panel.setAttribute('aria-labelledby','sophyBriefTitle');scroll.insertAdjacentElement('beforebegin',panel);return panel;
  }

  function priorityLabel(priority){return priority==='critical'?'Crítico':priority==='warning'?'Atenção':'Estável'}

  function renderSophyProactiveBrief(){
    ensureStyles();const panel=ensurePanel();if(!panel)return null;
    let brief;try{brief=snapshot()}catch(error){brief=null}
    if(!brief){panel.hidden=false;panel.innerHTML='<div class="sophy-brief-head"><div><b id="sophyBriefTitle">Brief financeiro</b><p>Temporariamente indisponível. A conversa da Sophy continua funcionando.</p></div></div>';return null}
    if(isBriefDismissed(brief)){panel.hidden=true;return brief}
    panel.hidden=false;panel.dataset.priority=brief.priority;
    const chips=safeArray(brief.evidence).slice(0,4).map(item=>`<span${item.kind==='money'?' data-money':''}>${escapeHtml(item.label)}: <strong>${escapeHtml(item.value)}</strong></span>`).join('');
    const badgeClass=brief.priority==='critical'?'negative':brief.priority==='warning'?'warning':'positive';
    panel.innerHTML=`<div class="sophy-brief-head"><div><b id="sophyBriefTitle">${escapeHtml(brief.title)}</b><p data-money>${escapeHtml(brief.summary)}</p></div><div class="sophy-brief-head-side"><span class="badge ${badgeClass}">${priorityLabel(brief.priority)}</span><button type="button" class="sophy-brief-dismiss" id="sophyBriefDismissBtn" aria-label="Ocultar este aviso" title="Ocultar este aviso nesta sessão">×</button></div></div><div class="sophy-brief-evidence">${chips}</div><div class="sophy-brief-foot"><details><summary>Por que a Sophy mostrou isso?</summary><p data-money>${escapeHtml(brief.reason)}</p></details><div class="sophy-brief-actions"><button type="button" class="btn2" data-sophy-brief-open="${escapeHtml(brief.actionPage)}">Abrir</button><button type="button" class="ghost" id="sophyBriefDetailBtn">Detalhar</button></div></div><div class="sophy-brief-detail" id="sophyBriefDetail" data-money>${escapeHtml(detailText(brief))}</div>`;
    panel.querySelector('#sophyBriefDismissBtn')?.addEventListener('click',()=>dismissBrief(brief,panel));
    panel.querySelector('[data-sophy-brief-open]')?.addEventListener('click',event=>{const page=event.currentTarget?.dataset?.sophyBriefOpen;if(page&&typeof global.setPage==='function')global.setPage(page);});
    panel.querySelector('#sophyBriefDetailBtn')?.addEventListener('click',()=>{const detail=panel.querySelector('#sophyBriefDetail');if(!detail)return;const open=detail.classList.toggle('is-open');panel.querySelector('#sophyBriefDetailBtn').textContent=open?'Ocultar':'Detalhar';});
    if(typeof global.applyPrivacy==='function')global.applyPrivacy();
    return brief;
  }

  function getState(){try{return typeof state!=='undefined'?state:null}catch(error){return null}}
  function currentSophy(){const s=getState();if(!s)return null;if(!s.sophy&&typeof normalize==='function')normalize();return s.sophy||null}

  function recentFingerprint(sophy,fingerprint,now,hours=24){
    if(!fingerprint)return false;
    const match=[...safeArray(sophy?.messages)].reverse().find(m=>m?.proactiveFingerprint===fingerprint&&m?.at);if(!match)return false;
    const at=new Date(match.at).getTime();return Number.isFinite(at)&&(now-at)<hours*60*60*1000;
  }

  function pushProactive(sophy,text,{mood='cheerful',fingerprint=null,source='deterministic',priority='info',items=[],briefVersion=null,financial=true}={}){
    if(!sophy||!text)return null;const at=new Date().toISOString();
    sophy.personaState=(typeof SOPHY_PERSONAS!=='undefined'&&SOPHY_PERSONAS[mood])?mood:'cheerful';sophy.lastProactiveAt=at;sophy.messages=safeArray(sophy.messages);
    sophy.messages.push({id:typeof uid==='function'?uid():`proactive-${Date.now()}`,sender:'sophy',text,at,emotion:sophy.personaState,proactive:true,proactiveFinancial:Boolean(financial),proactiveFingerprint:fingerprint,proactiveSource:source,proactivePriority:priority,proactiveEvidence:clone(items),proactiveBriefVersion:briefVersion});
    sophy.messages=sophy.messages.slice(-50);return text;
  }

  function proactiveCheck({force=false,baselineAt=null}={}){
    const sophy=currentSophy();if(!sophy)return null;
    if(!sophy.settings?.proactivityEnabled&&!force)return null;
    const now=Date.now(),baseline=Number(baselineAt);
    if(!sophy.lastProactiveAt&&!force&&!Number.isFinite(baseline))return null;
    if(!sophy.introDone&&!force)return null;
    const lastAt=sophy.lastProactiveAt?new Date(sophy.lastProactiveAt).getTime():(Number.isFinite(baseline)?baseline:now),hoursSince=(now-lastAt)/(1000*60*60);
    if(!force&&hoursSince<4)return null;

    let brief=null;try{brief=snapshot({force})}catch(error){console.warn('Brief proativo da Sophy indisponível:',error)}
    if(brief&&(force||brief.shouldNotify)&&!(!force&&recentFingerprint(sophy,brief.fingerprint,now,24))){
      return pushProactive(sophy,brief.message,{mood:brief.mood,fingerprint:brief.fingerprint,source:brief.source,priority:brief.priority,items:brief.evidence,briefVersion:brief.version,financial:true});
    }

    try{
      const appState=getState();
      const completedGoal=safeArray(appState?.goals).find(g=>g.target>0&&typeof goalBalance==='function'&&goalBalance(g)>=g.target);
      if(completedGoal){
        const balance=goalBalance(completedGoal),targetCents=Math.round((Number(completedGoal.target)||0)*100),fingerprint=`goal-complete:${completedGoal.id||completedGoal.name}:${targetCents}`;
        if(!recentFingerprint(sophy,fingerprint,now,24))return pushProactive(sophy,`🎉 Parabéns! Sua meta **${completedGoal.name}** atingiu 100% da reserva (${typeof brl==='function'?brl(balance):money(balance*100)})!`,{mood:'proud',fingerprint,source:'goal_completed',priority:'info',items:[evidence('Meta',completedGoal.name),evidence('Reserva',typeof brl==='function'?brl(balance):money(balance*100),'money',Math.round(balance*100))],financial:true});
      }
    }catch(error){}

    try{
      const nextInc=typeof financialContextSnapshot==='function'?financialContextSnapshot({months:3}).nextIncome:null;
      const today=typeof localCivilDate==='function'?localCivilDate(new Date()):null,tomorrowRef=new Date();tomorrowRef.setDate(tomorrowRef.getDate()+1);const tomorrow=typeof localCivilDate==='function'?localCivilDate(tomorrowRef):null;
      if(nextInc&&(nextInc.date===today||nextInc.date===tomorrow)){
        const fingerprint=`next-income:${nextInc.date}:${cents(nextInc.amountCents)}:${nextInc.id||nextInc.desc||''}`;
        if(!recentFingerprint(sophy,fingerprint,now,24)){
          const isToday=nextInc.date===today,hour=new Date().getHours(),greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite',amount=money(nextInc.amountCents),desc=nextInc.desc||'Recebimento';
          const text=isToday?`${greeting}! Hoje há uma entrada conhecida: **${desc}** (${amount}). Vale conferir quando cair na conta.`:`Amanhã há uma entrada conhecida de **${desc}** (${amount}). Ela já está considerada pelo Local Financial Core.`;
          return pushProactive(sophy,text,{mood:'cheerful',fingerprint,source:'next_income',priority:'info',items:[evidence('Data',nextInc.date),evidence('Valor',amount,'money',nextInc.amountCents)],financial:true});
        }
      }
    }catch(error){}

    if(force)return pushProactive(sophy,'**Brief financeiro:** os motores determinísticos estão temporariamente indisponíveis. Não vou inventar uma análise até conseguir ler o Local Financial Core.',{mood:'focused',fingerprint:'brief-unavailable',source:'brief_unavailable',priority:'info',items:[],financial:false});
    return null;
  }

  function decorateFinancialBubbles(){
    if(typeof document==='undefined')return;const appState=getState(),messages=safeArray(appState?.sophy?.messages),rows=Array.from(document.querySelectorAll('#sophyChatList .sophy-msg-row'));
    if(!messages.length||!rows.length)return;const offset=Math.max(0,rows.length-messages.length);
    messages.forEach((msg,index)=>{const bubble=rows[index+offset]?.querySelector('.sophy-bubble');if(!bubble)return;if(msg?.proactiveFinancial){bubble.setAttribute('data-money','');}else{bubble.removeAttribute('data-money');bubble.classList.remove('private-value');}});
    if(typeof global.applyPrivacy==='function')global.applyPrivacy();
  }

  function installChatObserver(){
    if(typeof document==='undefined'||global.__SFP_SOPHY_A3_CHAT_OBSERVER)return;
    const list=document.getElementById('sophyChatList');if(!list)return;
    const observer=new MutationObserver(()=>decorateFinancialBubbles());observer.observe(list,{childList:true});global.__SFP_SOPHY_A3_CHAT_OBSERVER=observer;decorateFinancialBubbles();
  }

  function wrapGlobal(name,after){
    const original=global[name];if(typeof original!=='function'||original.__sfpA3Wrapped)return;
    const wrapped=function(...args){const result=original.apply(this,args);try{after(...args)}catch(error){}return result};wrapped.__sfpA3Wrapped=true;global[name]=wrapped;
  }

  function install(){
    if(global[INSTALL_FLAG])return;global[INSTALL_FLAG]=true;
    installMonthlyContextBridge();installGroqMonthlyContext();
    if(typeof global.sophyCheckProactivity==='function')global.sophyCheckProactivity=proactiveCheck;
    wrapGlobal('setPage',id=>{if(id==='sophy')queueMicrotask(()=>{renderSophyProactiveBrief();decorateFinancialBubbles()})});
    wrapGlobal('renderAll',()=>queueMicrotask(()=>renderSophyProactiveBrief()));
    wrapGlobal('renderSophy',()=>queueMicrotask(()=>decorateFinancialBubbles()));
    ensureStyles();renderSophyProactiveBrief();installChatObserver();decorateFinancialBubbles();
  }

  global.SFPProactiveBrief=Object.freeze({version:VERSION,build,detailText,monthlyPlanningContext,promptNeedsMonthlyContext});
  global.sophyProactiveBriefSnapshot=snapshot;
  global.renderSophyProactiveBrief=renderSophyProactiveBrief;
  global.sophyCheckProactivityA3=proactiveCheck;

  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else queueMicrotask(install);
  }
})(typeof window!=='undefined'?window:globalThis);