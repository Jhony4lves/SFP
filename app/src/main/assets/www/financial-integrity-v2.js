(function(global){
  'use strict';

  const VERSION=2;
  const HORIZON_DAYS=365;
  const MAX_BACKLOG_MONTHS=36;
  const cents=value=>Math.round((Number(value)||0)*100);
  const money=value=>Math.round((Number(value)||0)*100)/100;
  const clamp0=value=>Math.max(0,Math.round(Number(value)||0));
  const isoDate=ref=>{
    const d=ref instanceof Date?ref:new Date(ref||Date.now());
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const isoMonth=value=>String(value||'').slice(0,7);
  const asDate=value=>new Date(`${String(value||'').slice(0,10)}T12:00:00`);
  const addDays=(date,days)=>{const d=asDate(date);d.setDate(d.getDate()+Number(days||0));return isoDate(d)};
  const addMonths=(month,delta)=>{const [y,m]=String(month).split('-').map(Number),d=new Date(y,(m||1)-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const monthDistance=(a,b)=>{const [ay,am]=String(a).split('-').map(Number),[by,bm]=String(b).split('-').map(Number);return (by-ay)*12+(bm-am)};
  const idKey=e=>`${e.source||'event'}:${e.sourceId??e.id??`${e.date}:${e.type}:${e.desc}:${e.amount}`}`;
  const isPaid=status=>status==='paid'||status==='closed';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  let originals=null;
  let installed=false;

  function payrollBasis(){
    return global.state?.settings?.payrollIncomeBasis==='gross-before-payroll'?'gross-before-payroll':'net-after-payroll';
  }

  function isProtectedAccount(account){
    if(!account)return false;
    if(account.spendable===true)return false;
    if(account.spendable===false)return true;
    return /Reserva|Investimento/i.test(String(account.type||''));
  }

  function spendableAccount(account){return !!account&&!isProtectedAccount(account)}

  function linkedFacility(facility){
    const debtId=facility?.debtId??facility?.linkedDebtId;
    return debtId!=null&&(global.state?.debts||[]).some(d=>String(d.id)===String(debtId));
  }

  function unresolvedCreditFacilities(){
    return (global.state?.creditFacilities||[]).filter(f=>(Number(f.used)||0)>0&&!linkedFacility(f));
  }

  function unresolvedCreditUsed(){
    return unresolvedCreditFacilities().reduce((sum,f)=>sum+(Number(f.used)||0),0);
  }

  function currentAccountBalance(id){return Number(global.accountBalance?.(id)||0)}
  function allBalances(){return (global.state?.accounts||[]).reduce((sum,a)=>sum+currentAccountBalance(a.id),0)}
  function operationalBalances(){return (global.state?.accounts||[]).filter(spendableAccount).reduce((sum,a)=>sum+currentAccountBalance(a.id),0)}
  function protectedBalances(){return (global.state?.accounts||[]).filter(isProtectedAccount).reduce((sum,a)=>sum+currentAccountBalance(a.id),0)}

  function deriveInvoiceAccount(event){
    if(event.accountId!=null)return event.accountId;
    if(event.source!=='invoice'||event.cardId==null)return null;
    const month=isoMonth(event.date);
    const invoice=(global.state?.invoices||[]).find(i=>String(i.cardId)===String(event.cardId)&&i.month===month);
    const card=(global.state?.cards||[]).find(c=>String(c.id)===String(event.cardId));
    return invoice?.accountId??card?.payAccountId??null;
  }

  function eventStatus(event,reference){
    const today=isoDate(reference);
    if(String(event.date||'')<today&&event.type==='expense'&&!isPaid(event.status))return 'overdue';
    if(String(event.date||'')>today&&isPaid(event.status))return 'scheduled';
    return event.status||'planned';
  }

  function normalizeEconomicEvent(event,reference){
    const today=isoDate(reference),status=eventStatus(event,reference),overdue=status==='overdue';
    const accountId=deriveInvoiceAccount(event);
    const cashIgnored=event.source==='payroll'&&payrollBasis()==='net-after-payroll';
    return {...event,accountId,status,overdue,dueDate:event.date,effectiveDate:overdue?today:event.date,cashIgnored,id:idKey(event)};
  }

  function backlogStartMonth(reference){
    const todayMonth=isoMonth(isoDate(reference));
    let start=isoMonth(global.state?.baseDate)||todayMonth;
    const distance=monthDistance(start,todayMonth);
    if(!Number.isFinite(distance)||distance<0)start=todayMonth;
    if(distance>MAX_BACKLOG_MONTHS)start=addMonths(todayMonth,-MAX_BACKLOG_MONTHS);
    return start;
  }

  function monthRange(startMonth,endMonth){
    const out=[];let cursor=startMonth,guard=0;
    while(cursor<=endMonth&&guard<60){out.push(cursor);cursor=addMonths(cursor,1);guard++}
    return out;
  }

  function baseEconomicEvents(days=HORIZON_DAYS,reference=new Date()){
    const today=isoDate(reference),end=addDays(today,days),months=monthRange(backlogStartMonth(reference),isoMonth(end));
    const seen=new Set(),events=[];
    months.forEach(month=>{
      (global.dueEvents?.(month)||[]).forEach(raw=>{
        if(!raw?.date||raw.date>end)return;
        const past=raw.date<today,future=raw.date>today;
        const shouldKeep=past?raw.type==='expense'&&!isPaid(raw.status):(!isPaid(raw.status)||future);
        if(!shouldKeep)return;
        const normalized=normalizeEconomicEvent(raw,reference),key=idKey(normalized);
        if(seen.has(key))return;seen.add(key);events.push(normalized);
      });
    });

    unresolvedCreditFacilities().forEach(f=>{
      const amount=Number(f.totalDue||f.used)||0;if(!(amount>0))return;
      const rawDate=/^\d{4}-\d{2}-\d{2}$/.test(String(f.dueDate||''))?f.dueDate:today;
      const event={id:`credit-facility:${f.id}`,source:'credit-facility',sourceId:f.id,type:'expense',amount,desc:`Crédito utilizado — ${f.institution||''}${f.name?` ${f.name}`:''}`.trim(),date:rawDate,status:rawDate<=today?'overdue':'planned',accountId:null,overdue:rawDate<=today,dueDate:rawDate,effectiveDate:rawDate<=today?today:rawDate,unresolvedCredit:true,cashIgnored:false};
      if(event.effectiveDate<=end)events.push(event);
    });

    return events.sort(eventComparator);
  }

  function projectedTransfers(days=HORIZON_DAYS,reference=new Date()){
    const today=isoDate(reference),end=addDays(today,days);
    return (global.state?.transfers||[]).filter(t=>{const date=String(t.date||'');return date>=today&&date<=end&&(Number(t.amount)||0)>0;}).map(t=>({id:`transfer:${t.id}`,source:'transfer',sourceId:t.id,type:'transfer',amount:Number(t.amount)||0,desc:t.desc||'Transferência',date:t.date,effectiveDate:t.date,dueDate:t.date,fromId:t.fromId,toId:t.toId,status:t.date>today?'scheduled':'paid'})).sort(eventComparator);
  }

  function priority(event){
    if(event.overdue)return -2;
    if(event.type==='expense')return 0;
    if(event.type==='transfer'){
      const from=(global.state?.accounts||[]).find(a=>String(a.id)===String(event.fromId));
      const to=(global.state?.accounts||[]).find(a=>String(a.id)===String(event.toId));
      const delta=(spendableAccount(to)?1:0)-(spendableAccount(from)?1:0);
      return delta<0?0:delta>0?2:1;
    }
    return 2;
  }

  function eventComparator(a,b){
    const date=String(a.effectiveDate||a.date||''),other=String(b.effectiveDate||b.date||'');
    return date.localeCompare(other)||priority(a)-priority(b)||String(idKey(a)).localeCompare(String(idKey(b)));
  }

  function globalDeltaCents(item){
    if(item.cashIgnored)return 0;
    if(item.type==='transfer'){
      const from=(global.state?.accounts||[]).find(a=>String(a.id)===String(item.fromId));
      const to=(global.state?.accounts||[]).find(a=>String(a.id)===String(item.toId));
      return cents(item.amount)*((spendableAccount(to)?1:0)-(spendableAccount(from)?1:0));
    }
    if(item.accountId!=null){
      const account=(global.state?.accounts||[]).find(a=>String(a.id)===String(item.accountId));
      if(account&&isProtectedAccount(account))return 0;
    }
    return item.type==='income'?cents(item.amount):-cents(item.amount);
  }

  function buildProjection(days=HORIZON_DAYS,reference=new Date()){
    const referenceDate=isoDate(reference),openingCents=cents(operationalBalances()),economic=baseEconomicEvents(days,reference),transfers=projectedTransfers(days,reference);
    const flow=[...economic,...transfers].sort(eventComparator);
    let balance=openingCents,minBalance=openingCents,minDate=referenceDate;
    const accountState=new Map();
    (global.state?.accounts||[]).filter(spendableAccount).forEach(a=>accountState.set(String(a.id),{id:a.id,name:a.name,balanceCents:cents(currentAccountBalance(a.id)),minBalanceCents:cents(currentAccountBalance(a.id)),minDate:referenceDate}));
    const trace=[];

    const applyAccount=(id,delta,date)=>{const row=accountState.get(String(id));if(!row)return;row.balanceCents+=delta;if(row.balanceCents<row.minBalanceCents){row.minBalanceCents=row.balanceCents;row.minDate=date}};

    flow.forEach(item=>{
      const date=item.effectiveDate||item.date||referenceDate;
      const delta=globalDeltaCents(item);balance+=delta;
      if(balance<minBalance){minBalance=balance;minDate=date}
      if(item.type==='transfer'){applyAccount(item.fromId,-cents(item.amount),date);applyAccount(item.toId,cents(item.amount),date)}
      else if(!item.cashIgnored&&item.accountId!=null)applyAccount(item.accountId,item.type==='income'?cents(item.amount):-cents(item.amount),date);
      if(item.type!=='transfer'&&!item.cashIgnored&&delta!==0)trace.push({id:item.id,date:item.dueDate||item.date,type:item.type,amountCents:cents(item.amount),balanceCents:balance,origin:item.source,accountId:item.accountId??null,overdue:!!item.overdue,effectiveDate:date});
    });

    const accountRisks=[...accountState.values()].filter(a=>a.minBalanceCents<0).map(a=>({accountId:a.id,accountName:a.name,minBalanceCents:a.minBalanceCents,minDate:a.minDate,requiredTransferCents:-a.minBalanceCents}));
    const safeToSpendCents=clamp0(Math.min(openingCents,minBalance));
    const shortfallCents=clamp0(-minBalance);
    return {days,referenceDate,availableCents:openingCents,projectedCents:balance,minBalanceCents:minBalance,minDate,negativeRisk:minBalance<0,safeToSpendCents,shortfallCents,preserveCents:clamp0(openingCents-safeToSpendCents),events:trace,accountRisks,protectedCents:cents(protectedBalances()),unresolvedCreditCents:cents(unresolvedCreditUsed()),overdueEvents:economic.filter(e=>e.overdue),allEvents:economic};
  }

  function liquiditySnapshot({reference=new Date(),days=HORIZON_DAYS}={}){
    const projection=buildProjection(days,reference),nextIncome=baseEconomicEvents(days,reference).filter(e=>e.type==='income'&&!e.overdue&&!e.cashIgnored&&String(e.date)>=isoDate(reference)).sort(eventComparator)[0]||null;
    return {version:VERSION,horizonDays:days,referenceDate:isoDate(reference),totalAccountCents:cents(allBalances()),operationalAvailableCents:projection.availableCents,protectedCents:projection.protectedCents,safeToSpendCents:projection.safeToSpendCents,preserveCents:projection.preserveCents,shortfallCents:projection.shortfallCents,nextIncome:nextIncome?{...nextIncome,amountCents:cents(nextIncome.amount)}:null,overdueEvents:projection.overdueEvents.map(e=>({...e,amountCents:cents(e.amount)})),accountRisks:projection.accountRisks,unresolvedCreditCents:projection.unresolvedCreditCents,projection};
  }

  function installTemporalBalanceGuard(){
    if(typeof global.accountBalance!=='function'||global.accountBalance.__sfpTemporalRealizationV2)return;
    const original=global.accountBalance;
    const guarded=function(id){
      let value=Number(original(id)||0),today=isoDate(new Date());
      (global.state?.transactions||[]).filter(t=>String(t.accountId)===String(id)&&t.status==='paid'&&t.balanceImpact===true&&String(t.date||'')>today).forEach(t=>{value+=t.kind==='income'?-Number(t.amount||0):Number(t.amount||0)});
      (global.state?.transfers||[]).forEach(t=>{const impact=t.balanceImpactByAccount?.[id]??(t.balanceImpact!==false);if(!impact)return;if(String(t.fromId)===String(id)&&String(t.date||'')>today)value+=Number(t.amount||0);const inDate=t.settledDate||t.date;if(String(t.toId)===String(id)&&String(inDate||'')>today)value-=Number(t.amount||0)});
      (global.state?.invoices||[]).filter(i=>String(i.accountId)===String(id)).forEach(i=>(i.payments||[]).filter(p=>p.balanceImpact===true&&String(p.date||'')>today).forEach(p=>value+=Number(p.amount||0)));
      return money(value);
    };
    Object.defineProperty(guarded,'__sfpTemporalRealizationV2',{value:true});
    Object.defineProperty(guarded,'__sfpOriginalAccountBalance',{value:original});
    global.accountBalance=guarded;try{accountBalance=guarded}catch{}
    const all=function(){return (global.state?.accounts||[]).reduce((sum,a)=>sum+guarded(a.id),0)};
    global.allAccountBalance=all;try{allAccountBalance=all}catch{}
  }

  function installDebtGuard(){
    if(typeof global.debtTotal!=='function'||global.debtTotal.__sfpFacilityLiabilityV2)return;
    const original=global.debtTotal;
    const patched=function(){return money(Number(original()||0)+unresolvedCreditUsed())};
    Object.defineProperty(patched,'__sfpFacilityLiabilityV2',{value:true});
    global.debtTotal=patched;try{debtTotal=patched}catch{}
  }

  function installTimeAndLiquidityCore(){
    originals={upcomingEvents:global.upcomingEvents,pendingUpcomingEvents:global.pendingUpcomingEvents,nextIncomeEvent:global.nextIncomeEvent,commitmentUntilNextIncome:global.commitmentUntilNextIncome,projectionFor:global.projectionFor,financialContextSnapshot:global.financialContextSnapshot,statusLabel:global.statusLabel,renderToday:global.renderToday,renderTop:global.renderTop,renderCreditFacilities:global.renderCreditFacilities,renderSafeSpendProjection:global.renderSafeSpendProjection,renderAll:global.renderAll};
    const upcoming=function(days=75,reference=new Date()){const today=isoDate(reference),end=addDays(today,days);return baseEconomicEvents(days,reference).filter(e=>!e.overdue&&String(e.date)>=today&&String(e.date)<=end).map(e=>({...e,date:e.dueDate||e.date})).sort(eventComparator)};
    const pending=function(days=7,reference=new Date()){return upcoming(days,reference).filter(e=>e.type==='expense'?e.status!=='paid':true)};
    const nextIncome=function(reference=new Date(),days=HORIZON_DAYS){const today=isoDate(reference);return baseEconomicEvents(days,reference).filter(e=>e.type==='income'&&!e.overdue&&!e.cashIgnored&&String(e.date)>=today).sort(eventComparator)[0]||null};
    const projection=function(days=HORIZON_DAYS,reference=new Date()){return buildProjection(days,reference)};
    const preserve=function(reference=new Date(),days=HORIZON_DAYS){const l=liquiditySnapshot({reference,days}),total=cents(allBalances());return money((total-l.safeToSpendCents)/100)};
    const context=function(options={}){
      const reference=options.reference instanceof Date?options.reference:new Date(),base=originals.financialContextSnapshot?originals.financialContextSnapshot(options):{};
      const liquidity=liquiditySnapshot({reference,days:HORIZON_DAYS});
      const projections=[7,30,60,90,120,HORIZON_DAYS].filter((v,i,a)=>a.indexOf(v)===i).map(days=>buildProjection(days,reference));
      const commitments=baseEconomicEvents(HORIZON_DAYS,reference).filter(e=>e.type==='expense'&&!e.cashIgnored);
      return {...base,availableCents:liquidity.operationalAvailableCents,protected:{status:'known',amountCents:liquidity.protectedCents},commitments:{totalCents:commitments.reduce((s,e)=>s+cents(e.amount),0),events:commitments.map(e=>({...e,amountCents:cents(e.amount)}))},nextIncome:liquidity.nextIncome,projections,reserved:{status:'known',amountCents:liquidity.preserveCents,reasons:commitments.map(e=>({id:e.id,date:e.dueDate||e.date,amountCents:cents(e.amount),origin:e.source,overdue:!!e.overdue}))},free:{status:'known',amountCents:liquidity.safeToSpendCents,formula:'MIN_OPERATIONAL_BALANCE_WITHIN_HORIZON'},negativeRisk:liquidity.shortfallCents>0||projections.some(p=>p.negativeRisk),liquidity};
    };
    const status=function(value){if(value==='overdue')return'Atrasado';if(value==='scheduled')return'Agendado';return originals.statusLabel?originals.statusLabel(value):value||'—'};
    global.upcomingEvents=upcoming;global.pendingUpcomingEvents=pending;global.nextIncomeEvent=nextIncome;global.commitmentUntilNextIncome=preserve;global.projectionFor=projection;global.financialContextSnapshot=context;global.sfpFinancialContextSnapshot=context;global.statusLabel=status;
    try{upcomingEvents=upcoming;pendingUpcomingEvents=pending;nextIncomeEvent=nextIncome;commitmentUntilNextIncome=preserve;projectionFor=projection;financialContextSnapshot=context;sfpFinancialContextSnapshot=context;statusLabel=status}catch{}
  }

  function installSafeSpendAnalyzer(){
    if(!global.SFPSafeSpend?.analyze||global.SFPSafeSpend.version>=2)return;
    const baseAnalyze=global.SFPSafeSpend.analyze;
    global.SFPSafeSpend=Object.freeze({version:2,analyze(options={}){
      const report=baseAnalyze(options),liquidity=options.snapshot?.liquidity;if(!liquidity)return report;
      report.availableCents=liquidity.operationalAvailableCents;report.reservedCents=liquidity.preserveCents;report.freeCents=liquidity.safeToSpendCents;report.safeToSpendCents=liquidity.safeToSpendCents;report.shortfallCents=liquidity.shortfallCents;
      report.coverageRatio=liquidity.operationalAvailableCents>0?Math.max(0,Math.min(1,(liquidity.operationalAvailableCents-liquidity.shortfallCents)/liquidity.operationalAvailableCents)):liquidity.shortfallCents?0:1;
      if(liquidity.shortfallCents>0)report.status='critical';else if((liquidity.accountRisks||[]).length||liquidity.preserveCents>0)report.status='tight';else report.status='healthy';
      report.formula='SAFE_TO_SPEND = MAX(0, menor saldo operacional projetado na janela)';
      report.basis=`Trajetória determinística de ${liquidity.horizonDays} dias, incluindo atrasados, entradas e saídas conhecidas. Reservas/Investimentos protegidos ficam fora do dinheiro operacional.`;
      report.protectedCents=liquidity.protectedCents;report.accountRisks=liquidity.accountRisks||[];report.overdueEvents=liquidity.overdueEvents||[];report.unresolvedCreditCents=liquidity.unresolvedCreditCents||0;return report;
    }});
  }

  function updateTodayLabels(){
    const committed=document.getElementById('todayCommitted');if(committed){const metric=committed.closest('.metric'),label=metric?.querySelector('span'),hint=metric?.querySelector('small');if(label)label.textContent='Preservar agora';if(hint)hint.textContent='Obrigações + valores protegidos'}
    const sideHint=document.getElementById('sideHint');if(sideHint)sideHint.textContent='Após preservar obrigações e reservas';
  }

  function renderLiquidityWarnings(){
    const panel=document.getElementById('safeSpendPanel');if(!panel)return;panel.querySelectorAll('[data-sfp-integrity-warning]').forEach(n=>n.remove());
    const l=liquiditySnapshot({days:HORIZON_DAYS}),messages=[];
    if(l.overdueEvents.length)messages.push(`${l.overdueEvents.length} obrigação(ões) atrasada(s) já reduzem o gasto seguro.`);
    if(l.accountRisks.length){const first=l.accountRisks[0];messages.push(`Há cobertura global, mas ${first.accountName} pode faltar ${typeof global.brl==='function'?global.brl(first.requiredTransferCents/100):money(first.requiredTransferCents/100)} antes de ${first.minDate}. Planeje uma transferência.`)}
    if(l.unresolvedCreditCents>0)messages.push('Existe crédito utilizado sem cronograma vinculado. O SFP preserva esse valor até a dívida ser detalhada.');
    if(!messages.length)return;const node=document.createElement('div');node.dataset.sfpIntegrityWarning='1';node.className='note warning';node.style.marginTop='10px';node.innerHTML=`<b>Atenção de liquidez</b><br>${messages.map(escapeHtml).join('<br>')}`;panel.appendChild(node);
  }

  function enhanceCreditFacilities(){
    const root=document.getElementById('creditFacilities');if(!root)return;const items=global.state?.creditFacilities||[];if(!items.length)return;
    root.innerHTML=items.map(f=>{const used=Math.max(0,Number(f.used)||0),available=Math.max(0,(Number(f.limit)||0)-used),linked=linkedFacility(f);const label=used>0?`Utilizado ${typeof global.brl==='function'?global.brl(used):used.toFixed(2)}${linked?' • vinculado à dívida':' • passivo sem cronograma'}`:'Disponível; não entra no saldo nem no patrimônio';return `<div class="item"><div><b>${escapeHtml(f.institution||'')} • ${escapeHtml(f.name||'')}</b><small>${label}</small></div><strong>${typeof global.brl==='function'?global.brl(available):available.toFixed(2)}</strong></div>`}).join('');
  }

  function ensureSettingsPanel(){
    const config=document.getElementById('config');if(!config||document.getElementById('financialIntegritySettingsV2'))return;
    const panel=document.createElement('article');panel.id='financialIntegritySettingsV2';panel.className='panel';panel.innerHTML=`<div class="head"><div><h2>Liquidez e folha</h2><p>Defina o que realmente pode ser gasto e como descontos em folha entram na projeção.</p></div><span class="badge">Financeiro</span></div><label>Receitas salariais cadastradas representam<select id="payrollIncomeBasisV2"><option value="net-after-payroll">Valor líquido que cai na conta, já após descontos em folha</option><option value="gross-before-payroll">Valor antes dos descontos em folha</option></select></label><div id="spendableAccountsV2" class="list" style="margin-top:12px"></div>`;config.appendChild(panel);
    const select=panel.querySelector('#payrollIncomeBasisV2');select.value=payrollBasis();select.onchange=async()=>{global.state.settings??={};global.state.settings.payrollIncomeBasis=select.value;if(typeof global.save==='function')await global.save('Configurar base salarial');else if(typeof global.dbSet==='function')await global.dbSet(global.state);global.renderAll?.()};refreshAccountSettings();
  }

  function refreshAccountSettings(){
    const root=document.getElementById('spendableAccountsV2');if(!root)return;const accounts=global.state?.accounts||[];
    root.innerHTML=accounts.length?accounts.map(a=>{const checked=spendableAccount(a)?'checked':'';return `<label class="item" style="cursor:pointer"><div><b>${escapeHtml(a.name||'Conta')}</b><small>${escapeHtml(a.type||'')} • ${checked?'participa do dinheiro operacional':'protegida do gasto seguro'}</small></div><input type="checkbox" data-spendable-account="${escapeHtml(a.id)}" ${checked} style="width:auto;min-height:auto;margin:0"></label>`}).join(''):'<div class="empty-state"><b>Nenhuma conta cadastrada</b></div>';
    root.querySelectorAll('[data-spendable-account]').forEach(input=>input.onchange=async()=>{const a=(global.state?.accounts||[]).find(x=>String(x.id)===String(input.dataset.spendableAccount));if(!a)return;a.spendable=!!input.checked;if(typeof global.save==='function')await global.save('Configurar liquidez da conta');else if(typeof global.dbSet==='function')await global.dbSet(global.state);global.renderAll?.()});
  }

  function installRenderHooks(){
    if(typeof originals.renderToday==='function'){const wrapped=function(...args){const result=originals.renderToday.apply(this,args);updateTodayLabels();return result};global.renderToday=wrapped;try{renderToday=wrapped}catch{}}
    if(typeof originals.renderTop==='function'){const wrapped=function(...args){const result=originals.renderTop.apply(this,args);updateTodayLabels();return result};global.renderTop=wrapped;try{renderTop=wrapped}catch{}}
    if(typeof originals.renderCreditFacilities==='function'){const wrapped=function(...args){const result=originals.renderCreditFacilities.apply(this,args);enhanceCreditFacilities();return result};global.renderCreditFacilities=wrapped;try{renderCreditFacilities=wrapped}catch{}}
    if(typeof originals.renderSafeSpendProjection==='function'){const wrapped=function(...args){const result=originals.renderSafeSpendProjection.apply(this,args);renderLiquidityWarnings();return result};global.renderSafeSpendProjection=wrapped;try{renderSafeSpendProjection=wrapped}catch{}}
    if(typeof originals.renderAll==='function'){const wrapped=function(...args){const result=originals.renderAll.apply(this,args);ensureSettingsPanel();refreshAccountSettings();updateTodayLabels();enhanceCreditFacilities();renderLiquidityWarnings();return result};global.renderAll=wrapped;try{renderAll=wrapped}catch{}}
  }

  function install(){
    if(installed)return true;
    if(!global.state||typeof global.dueEvents!=='function'||typeof global.accountBalance!=='function'||typeof global.financialContextSnapshot!=='function')return false;
    installTemporalBalanceGuard();installDebtGuard();installTimeAndLiquidityCore();installSafeSpendAnalyzer();installRenderHooks();
    global.state.settings??={};if(!global.state.settings.payrollIncomeBasis)global.state.settings.payrollIncomeBasis='net-after-payroll';
    ensureSettingsPanel();refreshAccountSettings();updateTodayLabels();enhanceCreditFacilities();
    global.SFPFinancialIntegrityV2=Object.freeze({version:VERSION,horizonDays:HORIZON_DAYS,liquiditySnapshot,buildProjection,isProtectedAccount,unresolvedCreditUsed});installed=true;
    try{global.renderAll?.()}catch(error){console.error('SFP financial integrity render:',error)}return true;
  }

  const start=()=>{if(install())return;let attempts=0;const timer=setInterval(()=>{attempts++;if(install()||attempts>80)clearInterval(timer)},25)};
  if(document.readyState==='complete')start();else global.addEventListener('load',start,{once:true});
})(typeof window!=='undefined'?window:globalThis);
