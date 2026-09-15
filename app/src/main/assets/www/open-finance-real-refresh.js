(function installOpenFinanceRealRefresh(global){
  'use strict';

  const FLAG='__SFP_OPEN_FINANCE_REAL_REFRESH_V1';
  if(global[FLAG])return;
  global[FLAG]=true;

  let busy=false;
  let observer=null;
  let lastAttempt=null;
  const code=value=>/^[A-Z][A-Z0-9_:-]{0,79}$/.test(String(value||''))?String(value):'';
  function evidence(result){
    if(!result)return null;
    return {ok:result.ok===true,requested:Number(result.requested)||0,started:Number(result.started)||0,
      complete:result.complete===true,needsUser:result.needsUser===true,failed:result.failed===true,
      code:code(result.code),items:(Array.isArray(result.items)?result.items:[]).map((row,index)=>({
        connection:index+1,accepted:row.accepted===true,status:typeof row.status==='number'?row.status:code(row.status),
        code:code(row.code),providerCode:code(row.providerCode),providerMessage:String(row.providerMessage||'').slice(0,300),executionStatus:code(row.executionStatus),
        lastUpdatedAt:/^\d{4}-\d{2}-\d{2}T[0-9:.Z+-]+$/.test(row.lastUpdatedAt||'')?row.lastUpdatedAt:null
      }))};
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

  function refreshFailureText(result){
    const rows=Array.isArray(result?.items)?result.items:[];
    const codes=[code(result?.code),...rows.flatMap(row=>[code(row?.providerCode),code(row?.code)])].filter(Boolean);
    const details=rows.map((row,index)=>`Conexão ${index+1}: HTTP ${Number(row.status)||'indisponível'} ${code(row.providerCode)||code(row.code)||'sem código'}${row.providerMessage?' — '+String(row.providerMessage).slice(0,300):''}`).join('; ');
    let text='A instituição não iniciou uma nova sincronização. A consulta usa os dados já disponíveis.';
    if(codes.some(value=>value.includes('BEFORE_ALLOWED_FREQUENCY')||value==='REFRESH_RATE_LIMITED'))
      text='A Pluggy bloqueou uma nova atualização por limite de frequência. A consulta usa a leitura mais recente disponível.';
    else if(codes.some(value=>/MFA|CREDENTIAL|AUTH_REJECTED|AUTH_REQUIRED/.test(value)))
      text='A conexão precisa de autenticação. Revalide o Open Finance para atualizar.';
    else if(rows.some(row=>/MeuPluggy item cant be updated/i.test(row.providerMessage||'')))
      text='Esta conexão é gerenciada pelo MeuPluggy e não permite iniciar atualização pelo SFP. Atualize no MeuPluggy; o SFP consulta e importa os dados disponíveis.';
    else if(codes.includes('REFRESH_NEEDS_ATTENTION'))
      text='A Pluggy recusou a atualização da conexão. O diagnóstico registra o retorno recebido.';
    return `${text} ${details||codes.join(', ')}`.trim();
  }

  async function syncCurrentData(){
    const unified=global.SFPOpenFinanceUnifiedSync;
    if(typeof unified?.syncAll==='function')return await unified.syncAll();
    const personal=global.SFPOpenFinancePersonal;
    if(personal&&typeof personal.syncInvoices==='function'){
      return await personal.syncInvoices();
    }
    if(personal&&typeof personal.preview==='function'){
      const result=await personal.preview();
      try{global.renderAll?.();}catch(_){}
      return result;
    }
    return null;
  }

  async function handleRefresh(event,button){
    if(event){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    if(busy)return;
    busy=true;
    lastAttempt={schema:'sfp-refresh-diagnostic-v1',attemptedAt:new Date().toISOString(),
      request:null,status:null,polls:0,outcome:'requesting',privacy:{credentials:false,itemIds:false,accountIds:false}};

    const originalText=button?.textContent||'Atualizar faturas agora';
    if(button){
      button.disabled=true;
      button.textContent='Pedindo atualização ao banco…';
    }

    try{
      const bridge=global.PluggyRefreshBridge;
      if(!bridge||typeof bridge.refreshItems!=='function'){
        message('Este APK ainda não tem o refresh bancário em tempo real. Usando a leitura disponível.');
        await syncCurrentData();
        return;
      }

      const started=parse(bridge.refreshItems());
      lastAttempt.request=evidence(started);
      if(!started?.ok||Number(started?.started||0)<=0){
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
        lastAttempt.status=evidence(finalStatus);
        lastAttempt.polls=attempt+1;
        if(finalStatus?.needsUser){
          lastAttempt.outcome='needs-user';
          await syncCurrentData();
          message('A instituição pediu autenticação adicional. Revalide a conexão Open Finance para concluir a atualização.','error');
          return;
        }
        if(finalStatus?.failed){
          lastAttempt.outcome='provider-failed';
          await syncCurrentData();
          message('A atualização terminou com erro ou dados parciais na instituição. A consulta usa os dados disponíveis; confira o diagnóstico.','error');
          return;
        }
        if(finalStatus?.ok&&finalStatus?.complete){
          if(button)button.textContent='Aplicando dados novos…';
          const applied=await syncCurrentData();
          lastAttempt.outcome=applied?.ok===false?'apply-failed':Number(started.started)<Number(started.requested)?'partially-refreshed':'completed';
          if(applied?.ok===false){message(applied.message||'A leitura nova não pôde ser aplicada. Dados anteriores preservados.','error');return;}
          if(lastAttempt.outcome==='partially-refreshed')message('Somente parte das conexões foi atualizada. '+refreshFailureText({items:started.items.filter(row=>!row.accepted)}),'error');
          else if(Number(applied?.card?.unmapped||0)+Number(applied?.bank?.unmapped||0)>0)message('Dados bancários consultados. Há contas ou cartões sem vínculo: cadastre-os no SFP e confira os vínculos para importar.');
          else message('Dados atualizados diretamente da instituição e faturas recalculadas.','success');
          try{global.renderAll?.();}catch(_){}
          return;
        }
      }

      lastAttempt.outcome='timeout';
      await syncCurrentData();
      message('A instituição ainda está sincronizando. A consulta usa a última leitura disponível.');
    }catch(error){
      console.error('SFP Open Finance real refresh:',error);
      lastAttempt.outcome='request-failed';
      try{await syncCurrentData();}catch(_){}
      message('Falha ao atualizar a instituição. Não foi possível confirmar uma nova leitura bancária.','error');
    }finally{
      // Failed/partial sync returns before renderAll; refresh the evidence labels as well.
      global.SFPOpenFinanceBankTruth?.patchGrid?.();
      global.SFPOpenFinanceBankTruth?.patchInvoiceFocus?.();
      busy=false;
      if(button){
        button.disabled=false;
        button.textContent=originalText;
      }
    }
  }

  function hook(){
    const button=document.getElementById('openFinanceSyncBtn');
    if(!button)return false;
    if(button.dataset.sfpRealRefresh==='1')return true;
    button.dataset.sfpRealRefresh='1';
    button.addEventListener('click',event=>handleRefresh(event,button),true);
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
    version:2,
    diagnostic,
    exportDiagnostic,
    hook,
    refresh:()=>handleRefresh(null,document.getElementById('openFinanceSyncBtn'))
  });
})(typeof window!=='undefined'?window:globalThis);
