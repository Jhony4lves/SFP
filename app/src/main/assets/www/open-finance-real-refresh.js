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
    return `Atualização automática ativa: o SFP relê a Pluggy ao abrir, ao voltar para o app e a cada 15 minutos enquanto ele estiver visível. Items MeuPluggy não aceitam refresh forçado pelo SFP; a coleta bancária é gerenciada pelo provedor.${suffix}`;
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
      const result=await unified.syncAll();
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
    lastAttempt={schema:'sfp-refresh-diagnostic-v2',attemptedAt:new Date().toISOString(),request:null,status:null,polls:0,outcome:'requesting',privacy:{credentials:false,itemIds:false,accountIds:false}};

    const originalText=button?.textContent||'Atualizar dados agora';
    if(button){
      button.disabled=true;
      button.textContent='Verificando atualização…';
    }

    try{
      const bridge=global.PluggyRefreshBridge;
      if(!bridge||typeof bridge.refreshItems!=='function'){
        lastAttempt.outcome='bridge-unavailable';
        message('Refresh bancário explícito indisponível neste APK. O SFP releu os dados mais recentes disponíveis na Pluggy.');
        await syncCurrentData();
        return;
      }

      let started=parse(bridge.refreshItems());
      if(!started){
        started={ok:false,requested:0,started:0,status:500,code:'NATIVE_RESPONSE_INVALID',message:'A ponte nativa retornou uma resposta inválida.',items:[]};
      }
      lastAttempt.request=evidence(started);
      if(!started.ok||Number(started.started||0)<=0){
        if(isMeuPluggyManaged(started)){
          lastAttempt.outcome='provider-managed';
          await syncCurrentData();
          message('O MeuPluggy gerencia a atualização bancária destas conexões. O SFP releu agora o snapshot mais recente disponível; ele também fará isso automaticamente ao abrir, ao voltar para o app e a cada 15 minutos.');
          return;
        }
        lastAttempt.outcome='rejected';
        await syncCurrentData();
        message(refreshFailureText(started),'error');
        return;
      }

      message(`Atualização em tempo real iniciada em ${Number(started.started)} conexão(ões). Aguardando o banco…`);
      if(button)button.textContent='Banco sincronizando…';

      let finalStatus=null;
      for(let attempt=0;attempt<30;attempt++){
        await wait(attempt===0?1500:2500);
        finalStatus=parse(bridge.refreshStatus?.());
        if(!finalStatus){
          lastAttempt.status=evidence({ok:false,status:500,code:'STATUS_RESPONSE_INVALID',message:'A ponte nativa retornou um status inválido.',items:[]});
          lastAttempt.polls=attempt+1;
          lastAttempt.outcome='status-invalid';
          await syncCurrentData();
          message('A atualização foi solicitada, mas o SFP não conseguiu confirmar o status final. A leitura disponível foi preservada.','error');
          return;
        }
        lastAttempt.status=evidence(finalStatus);
        lastAttempt.polls=attempt+1;
        if(finalStatus.needsUser){
          lastAttempt.outcome='needs-user';
          await syncCurrentData();
          message('A instituição pediu autenticação adicional. Revalide a conexão Open Finance para concluir a atualização.','error');
          return;
        }
        if(finalStatus.failed){
          lastAttempt.outcome='provider-failed';
          await syncCurrentData();
          message('A atualização terminou com erro ou dados parciais na instituição. A consulta usa os dados disponíveis; confira o diagnóstico.','error');
          return;
        }
        if(finalStatus.ok&&finalStatus.complete){
          if(button)button.textContent='Aplicando dados novos…';
          const applied=await syncCurrentData();
          lastAttempt.outcome=applied?.ok===false?'apply-failed':Number(started.started)<Number(started.requested)?'partially-refreshed':'completed';
          if(applied?.ok===false){message(applied.message||'A leitura nova não pôde ser aplicada. Dados anteriores preservados.','error');return;}
          if(lastAttempt.outcome==='partially-refreshed')message('Somente parte das conexões foi atualizada. '+refreshFailureText({items:started.items.filter(row=>!row.accepted)}),'error');
          else if(Number(applied?.card?.unmapped||0)+Number(applied?.bank?.unmapped||0)>0)message('Dados bancários consultados. Há contas ou cartões sem vínculo: cadastre-os no SFP e confira os vínculos para importar.');
          else message('Dados atualizados diretamente da instituição e aplicados ao SFP.','success');
          try{global.renderAll?.();}catch(_){}
          return;
        }
      }
      lastAttempt.outcome='timeout';
      await syncCurrentData();
      message('A instituição ainda está sincronizando. O SFP manteve a leitura mais recente disponível.');
    }catch(error){
      console.error('SFP Open Finance real refresh:',error);
      lastAttempt.outcome='request-failed';
      try{await syncCurrentData();}catch(_){}
      message('Falha ao solicitar atualização da instituição. Os dados anteriores foram preservados.','error');
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

  if(!hook()){
    observer=new MutationObserver(()=>{
      if(hook()&&observer){observer.disconnect();observer=null;}
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>{if(observer){observer.disconnect();observer=null;}},120000);
  }

  global.SFPOpenFinanceRealRefresh=Object.freeze({
    version:5,
    autoIntervalMs:AUTO_INTERVAL_MS,
    diagnostic,
    exportDiagnostic,
    hook,
    syncSnapshot:automaticSync,
    refresh:()=>handleRefresh(null,document.getElementById('openFinanceSyncBtn'))
  });
})(typeof window!=='undefined'?window:globalThis);