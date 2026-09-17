(function installOpenFinanceRealRefresh(global){
  'use strict';

  const FLAG='__SFP_OPEN_FINANCE_REAL_REFRESH_V1';
  if(global[FLAG])return;
  global[FLAG]=true;

  const AUTO_INTERVAL_MS=15*60*1000;
  const PAGE_ID='openfinance';
  let busy=false;
  let autoBusy=false;
  let observer=null;
  let autoTimer=null;
  let startupTimer=null;
  let lastAttempt=null;
  let lastSnapshotReadAt=0;
  let financialTruthReady=null;
  const code=value=>/^[A-Z][A-Z0-9_:-]{0,79}$/.test(String(value||''))?String(value):'';
  const safeText=value=>String(value||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,300);
  const safeStatus=value=>Number.isFinite(Number(value))?Number(value):code(value);

  function evidence(result){
    if(!result)return null;
    return {
      ok:result.ok===true,
      requested:Number(result.requested)||0,
      started:Number(result.started)||0,
      complete:result.complete===true,
      needsUser:result.needsUser===true,
      failed:result.failed===true,
      status:safeStatus(result.status),
      code:code(result.code),
      message:safeText(result.message),
      stage:code(result.stage),
      items:(Array.isArray(result.items)?result.items:[]).map((row,index)=>({
        connection:index+1,
        accepted:row.accepted===true,
        status:safeStatus(row.status),
        code:code(row.code),
        providerCode:code(row.providerCode),
        providerMessage:safeText(row.providerMessage),
        executionStatus:code(row.executionStatus),
        lastUpdatedAt:/^\d{4}-\d{2}-\d{2}T[0-9:.Z+-]+$/.test(row.lastUpdatedAt||'')?row.lastUpdatedAt:null
      }))
    };
  }

  function diagnostic(){return lastAttempt?JSON.parse(JSON.stringify(lastAttempt)):null;}
  function exportDiagnostic(){
    global.download?.(JSON.stringify(diagnostic(),null,2),'sfp-sincronizacao-diagnostico.json','application/json');
  }

  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function parse(raw){
    if(raw&&typeof raw==='object')return raw;
    try{return JSON.parse(String(raw||''));}catch(_){return null;}
  }

  function ensureFinancialTruthController(){
    if(global.SFPOpenFinanceFinancialTruth?.version>=1)return Promise.resolve(global.SFPOpenFinanceFinancialTruth);
    if(financialTruthReady)return financialTruthReady;
    financialTruthReady=new Promise(resolve=>{
      if(typeof document==='undefined'){resolve(null);return;}
      const existing=document.getElementById('sfp-open-finance-financial-truth');
      if(existing){
        let attempts=0;
        const timer=setInterval(()=>{
          attempts++;
          if(global.SFPOpenFinanceFinancialTruth?.version>=1||attempts>80){clearInterval(timer);resolve(global.SFPOpenFinanceFinancialTruth||null);}
        },25);
        return;
      }
      const script=document.createElement('script');
      script.id='sfp-open-finance-financial-truth';
      script.src='open-finance-financial-truth-v1.js';
      script.onload=()=>resolve(global.SFPOpenFinanceFinancialTruth||null);
      script.onerror=()=>resolve(null);
      document.head.appendChild(script);
    });
    return financialTruthReady;
  }

  function formatClock(timestamp){
    if(!timestamp)return'—';
    try{return new Date(timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch(_){return'—';}
  }

  function updateAutoNote(text){
    const node=document.getElementById('openFinanceAutoSyncNote');
    if(node)node.textContent=text;
  }

  function baseAutoText(){
    const suffix=lastSnapshotReadAt?` Última leitura desta sessão: ${formatClock(lastSnapshotReadAt)}.`:'';
    return `Sincronização automática ativa: o SFP consulta os dados já disponíveis na Pluggy ao abrir, ao voltar para o app e a cada 15 minutos enquanto ele estiver visível. A atualização das instituições é gerenciada pelo MeuPluggy; o SFP apenas lê e aplica o snapshot disponível.${suffix}`;
  }

  function message(text,kind='info'){
    const clean=String(text||'').trim();
    if(!clean)return;
    try{
      if(typeof global.toast==='function')global.toast(clean,kind==='error'?'bad':kind==='success'?'good':'');
    }catch(_){}
    const root=document.getElementById('openFinancePreview');
    if(!root)return;
    let note=root.querySelector('[data-sfp-real-refresh-note="1"]');
    if(!note){
      note=document.createElement('div');
      note.dataset.sfpRealRefreshNote='1';
      note.className='note';
      note.style.marginBottom='10px';
      note.style.padding='10px 12px';
      note.style.border='1px solid var(--line, rgba(120,140,160,.25))';
      note.style.borderRadius='12px';
      root.prepend(note);
    }
    note.textContent=clean;
    if(lastAttempt){
      const exportButton=document.createElement('button');
      exportButton.type='button';
      exportButton.textContent='Exportar diagnóstico da sincronização';
      exportButton.style.marginTop='10px';
      exportButton.addEventListener('click',exportDiagnostic);
      note.append(document.createElement('br'),exportButton);
    }
  }

  function isMeuPluggyManaged(result){
    const rows=Array.isArray(result?.items)?result.items:[];
    return rows.length>0&&rows.every(row=>Number(row?.status)===400&&/MeuPluggy item cant be updated/i.test(String(row?.providerMessage||'')));
  }

  function refreshFailureText(result){
    const rows=Array.isArray(result?.items)?result.items:[];
    const codes=[code(result?.code),...rows.flatMap(row=>[code(row?.providerCode),code(row?.code)])].filter(Boolean);
    const topStatus=Number(result?.status)||0;
    const topMessage=safeText(result?.message);
    const details=rows.map((row,index)=>`Conexão ${index+1}: HTTP ${Number(row.status)||'indisponível'} ${code(row.providerCode)||code(row.code)||'sem código'}${row.providerMessage?' — '+safeText(row.providerMessage):''}`).join('; ');
    let text='A instituição não iniciou uma nova sincronização. A consulta usa os dados já disponíveis.';
    if(codes.some(value=>value.includes('BEFORE_ALLOWED_FREQUENCY')||value==='REFRESH_RATE_LIMITED'))
      text='A Pluggy bloqueou uma nova atualização por limite de frequência. A consulta usa a leitura mais recente disponível.';
    else if(codes.some(value=>/MFA|CREDENTIAL|AUTH_REJECTED|AUTH_REQUIRED|AUTH_/.test(value)))
      text='A conexão precisa de autenticação ou a autenticação da Pluggy falhou. A leitura disponível foi preservada.';
    else if(codes.some(value=>/DNS|NETWORK|TIMEOUT|TLS|IO/.test(value)))
      text='A comunicação com a Pluggy falhou antes de chegar à instituição. A leitura disponível foi preservada.';
    else if(codes.some(value=>/ITEM_DISCOVERY|ITEMS_/.test(value)))
      text='A autenticação respondeu, mas o SFP não conseguiu descobrir as conexões Open Finance para atualizar.';
    else if(isMeuPluggyManaged(result))
      text='O MeuPluggy gerencia a atualização bancária destas conexões e não permite refresh forçado pelo SFP. O SFP releu o snapshot mais recente disponível.';
    else if(codes.includes('REFRESH_NEEDS_ATTENTION'))
      text='A Pluggy recusou a atualização da conexão. O diagnóstico registra o retorno recebido.';

    const topDetails=[];
    if(topStatus)topDetails.push(`HTTP ${topStatus}`);
    if(code(result?.code))topDetails.push(code(result.code));
    if(topMessage)topDetails.push(topMessage);
    return `${text} ${details||topDetails.join(' — ')||codes.join(', ')}`.trim();
  }

  async function syncCurrentData(){
    let result=null;
    await ensureFinancialTruthController();
    const unified=global.SFPOpenFinanceUnifiedSync;
    if(typeof unified?.syncAll==='function')result=await unified.syncAll();
    else{
      const personal=global.SFPOpenFinancePersonal;
      if(personal&&typeof personal.syncInvoices==='function')result=await personal.syncInvoices();
      else if(personal&&typeof personal.preview==='function'){
        result=await personal.preview();
        try{global.renderAll?.();}catch(_){}
      }
    }
    if(result&&result.ok!==false){
      const truth=await global.SFPOpenFinanceFinancialTruth?.reconcileLatest?.();
      if(truth)result.financialTruth=truth;
      if(truth?.ok===false&&truth?.code!=='SNAPSHOT_UNAVAILABLE'){
        result.financialTruthWarning=truth.message||'A verdade bancária não pôde ser conciliada.';
      }
      lastSnapshotReadAt=Date.now();
      updateAutoNote(baseAutoText());
    }
    return result;
  }

  function configured(){
    const bridge=global.PluggyBridge;
    if(!bridge||typeof bridge.getCredentialStatus!=='function')return false;
    const status=parse(bridge.getCredentialStatus());
    return status?.ok===true&&status?.configured===true;
  }

  async function automaticSync(reason='interval'){
    if(autoBusy||busy||document.visibilityState==='hidden')return false;
    if(!configured()){
      updateAutoNote('Atualização automática pronta. Configure a Pluggy para o SFP reler os dados ao abrir, ao voltar para o app e a cada 15 minutos.');
      return false;
    }
    const unified=global.SFPOpenFinanceUnifiedSync;
    if(typeof unified?.syncAll!=='function'||!global.state)return false;
    const button=document.getElementById('openFinanceSyncBtn');
    if(button?.disabled)return false;

    autoBusy=true;
    updateAutoNote(reason==='startup'?'Abrindo o SFP: consultando automaticamente o snapshot mais recente da Pluggy…':reason==='resume'?'SFP aberto novamente: consultando o snapshot mais recente da Pluggy…':'Atualização automática: consultando o snapshot mais recente da Pluggy…');
    const originalToast=global.toast;
    try{
      if(typeof originalToast==='function')global.toast=()=>{};
      const result=await syncCurrentData();
      if(result?.ok!==false){
        lastSnapshotReadAt=Date.now();
        updateAutoNote(baseAutoText());
        return true;
      }
      updateAutoNote(`A leitura automática não alterou os dados agora. O SFP tentará novamente quando estiver aberto. ${safeText(result?.message)}`.trim());
      return false;
    }catch(error){
      updateAutoNote('A leitura automática não pôde ser concluída agora. Os dados anteriores foram preservados e o SFP tentará novamente enquanto estiver aberto.');
      return false;
    }finally{
      if(typeof originalToast==='function')global.toast=originalToast;
      autoBusy=false;
    }
  }

  function appendMoreMenuEntry(){
    const root=document.getElementById('modalRoot');
    if(!root||root.querySelector(`[data-sfp-more-page="${PAGE_ID}"]`))return false;
    const sections=Array.from(root.querySelectorAll('.sfp-more-group'));
    const dataSection=sections.find(section=>section.querySelector('.sfp-more-group-title')?.textContent.trim()==='Dados');
    const grid=dataSection?.querySelector('.sfp-more-grid');
    if(!grid)return false;

    const item=document.createElement('button');
    item.type='button';
    item.className='sfp-more-item';
    item.dataset.sfpMorePage=PAGE_ID;
    const icon=document.querySelector(`.sidebar .nav button[data-page="${PAGE_ID}"] svg`)?.outerHTML||'';
    item.innerHTML=`<span class="sfp-more-icon" aria-hidden="true">${icon}</span><span class="sfp-more-copy"><strong>Sincronização</strong><small>Open Finance e atualização de dados</small></span><span class="sfp-more-arrow" aria-hidden="true">›</span>`;
    grid.prepend(item);
    return true;
  }

  function installMoreMenuHook(){
    const more=document.getElementById('moreNavBtn');
    if(!more||more.dataset.sfpOpenFinanceMoreHook==='1')return Boolean(more);
    more.dataset.sfpOpenFinanceMoreHook='1';
    more.addEventListener('click',()=>queueMicrotask(appendMoreMenuEntry));
    return true;
  }

  function installNavigation(){
    const panel=document.getElementById('openFinancePersonalPanel');
    const main=document.querySelector('main');
    const nav=document.querySelector('.sidebar .nav');
    if(!panel||!main||!nav)return false;

    try{
      if(typeof PAGE_TITLES!=='undefined')PAGE_TITLES[PAGE_ID]=['Sincronização','Open Finance e atualização de dados'];
    }catch(_){}

    let page=document.getElementById(PAGE_ID);
    if(!page){
      page=document.createElement('section');
      page.id=PAGE_ID;
      page.className='tab';
      main.appendChild(page);
    }
    if(panel.parentElement!==page)page.appendChild(panel);

    let navButton=nav.querySelector(`button[data-page="${PAGE_ID}"]`);
    if(!navButton){
      navButton=document.createElement('button');
      navButton.type='button';
      navButton.dataset.page=PAGE_ID;
      navButton.setAttribute('aria-label','Sincronização Open Finance');
      navButton.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg><span>Sincronização</span>';
      const contas=nav.querySelector('button[data-page="contas"]');
      if(contas)contas.insertAdjacentElement('afterend',navButton);
      else nav.insertBefore(navButton,nav.querySelector('button[data-page="config"]')||null);
      navButton.addEventListener('click',()=>{
        if(typeof global.setPage==='function')global.setPage(PAGE_ID);
      });
    }

    document.getElementById('sfp-openfinance-nav-style')?.remove();
    installMoreMenuHook();

    const title=panel.querySelector('.head h2');
    const subtitle=panel.querySelector('.head p');
    const syncButton=document.getElementById('openFinanceSyncBtn');
    if(title)title.textContent='Open Finance';
    if(subtitle)subtitle.textContent='MeuPluggy • leitura automática e sincronização segura com o SFP';
    if(syncButton)syncButton.textContent='Atualizar dados agora';

    let autoNote=document.getElementById('openFinanceAutoSyncNote');
    if(!autoNote){
      autoNote=document.createElement('div');
      autoNote.id='openFinanceAutoSyncNote';
      autoNote.className='note';
      autoNote.style.margin='10px 0 12px';
      const status=document.getElementById('openFinanceStatus');
      if(status)status.insertAdjacentElement('afterend',autoNote);
      else panel.prepend(autoNote);
    }
    updateAutoNote(baseAutoText());
    return true;
  }

  function startAutomaticSync(){
    if(autoTimer)return;
    const attemptStartup=()=>{
      if(document.visibilityState==='hidden')return;
      if(typeof global.SFPOpenFinanceUnifiedSync?.syncAll==='function'&&global.state){
        if(startupTimer){clearInterval(startupTimer);startupTimer=null;}
        void automaticSync('startup');
      }
    };
    startupTimer=setInterval(attemptStartup,750);
    attemptStartup();
    autoTimer=setInterval(()=>{
      if(document.visibilityState!=='hidden'&&Date.now()-lastSnapshotReadAt>=AUTO_INTERVAL_MS)void automaticSync('interval');
    },AUTO_INTERVAL_MS);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')void automaticSync('resume');
    });
  }

  async function handleRefresh(event,button){
    if(event){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    if(busy)return;
    busy=true;
    lastAttempt={schema:'sfp-refresh-diagnostic-v2',attemptedAt:new Date().toISOString(),request:null,status:null,polls:0,outcome:'reading-pluggy',privacy:{credentials:false,itemIds:false,accountIds:false}};

    const originalText=button?.textContent||'Atualizar dados agora';
    if(button){
      button.disabled=true;
      button.textContent='Consultando Pluggy…';
    }

    try{
      const applied=await syncCurrentData();
      if(!applied){
        lastAttempt.request={ok:false,source:'pluggy',mode:'read-only',message:'Sincronização Open Finance indisponível neste APK.'};
        lastAttempt.outcome='sync-unavailable';
        message('A leitura da Pluggy está indisponível neste APK. Os dados anteriores foram preservados.','error');
        return;
      }

      lastAttempt.request={
        ok:applied.ok!==false,
        source:'pluggy',
        mode:'read-only',
        message:safeText(applied.message),
        bank:{unmapped:Number(applied?.bank?.unmapped)||0},
        card:{unmapped:Number(applied?.card?.unmapped)||0},
        truth:applied?.financialTruth?{
          ok:applied.financialTruth.ok!==false,
          snapshots:Number(applied.financialTruth.snapshots)||0,
          payments:Number(applied.financialTruth.payments)||0,
          already:Number(applied.financialTruth.already)||0,
          review:Number(applied.financialTruth.review)||0
        }:null
      };

      if(applied.ok===false){
        lastAttempt.outcome='apply-failed';
        message(applied.message||'A Pluggy respondeu, mas a leitura não pôde ser aplicada. Os dados anteriores foram preservados.','error');
        return;
      }

      lastAttempt.outcome='completed';
      if(applied.financialTruthWarning){
        message(`Dados sincronizados, mas a conciliação de saldo/fatura precisa de atenção: ${safeText(applied.financialTruthWarning)}`,'error');
      }else if(Number(applied?.card?.unmapped||0)+Number(applied?.bank?.unmapped||0)>0){
        message('Dados da Pluggy consultados. Há contas ou cartões sem vínculo: cadastre-os no SFP e confira os vínculos para importar.');
      }else{
        message('Dados mais recentes disponíveis na Pluggy foram aplicados ao SFP.','success');
      }
      try{global.renderAll?.();}catch(_){}
    }catch(error){
      console.error('SFP Open Finance snapshot sync:',error);
      lastAttempt.outcome='request-failed';
      lastAttempt.request={ok:false,source:'pluggy',mode:'read-only',message:safeText(error?.message)};
      message('Falha ao consultar os dados disponíveis na Pluggy. Os dados anteriores foram preservados.','error');
    }finally{
      global.SFPOpenFinanceBankTruth?.patchGrid?.();
      global.SFPOpenFinanceBankTruth?.patchInvoiceFocus?.();
      busy=false;
      if(button){
        button.disabled=false;
        button.textContent=originalText;
      }
      updateAutoNote(baseAutoText());
    }
  }

  function hook(){
    const button=document.getElementById('openFinanceSyncBtn');
    if(!button)return false;
    installNavigation();
    button.textContent='Atualizar dados agora';
    if(button.dataset.sfpRealRefresh==='1'){
      startAutomaticSync();
      return true;
    }
    button.dataset.sfpRealRefresh='1';
    button.addEventListener('click',event=>handleRefresh(event,button),true);
    startAutomaticSync();
    return true;
  }

  void ensureFinancialTruthController();

  if(!hook()){
    observer=new MutationObserver(()=>{
      if(hook()&&observer){observer.disconnect();observer=null;}
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>{if(observer){observer.disconnect();observer=null;}},120000);
  }

  global.SFPOpenFinanceRealRefresh=Object.freeze({
    version:7,
    autoIntervalMs:AUTO_INTERVAL_MS,
    diagnostic,
    exportDiagnostic,
    hook,
    syncSnapshot:automaticSync,
    refresh:()=>handleRefresh(null,document.getElementById('openFinanceSyncBtn'))
  });
})(typeof window!=='undefined'?window:globalThis);
