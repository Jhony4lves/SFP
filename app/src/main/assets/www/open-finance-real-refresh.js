(function installOpenFinanceRealRefresh(global){
  'use strict';

  const FLAG='__SFP_OPEN_FINANCE_REAL_REFRESH_V1';
  if(global[FLAG])return;
  global[FLAG]=true;

  let busy=false;
  let observer=null;

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
  }

  function refreshFailureText(result){
    const rows=Array.isArray(result?.items)?result.items:[];
    const codes=rows.map(row=>String(row?.providerCode||row?.code||'')).filter(Boolean);
    if(codes.some(code=>code.includes('BEFORE_ALLOWED_FREQUENCY')||code==='REFRESH_RATE_LIMITED')){
      return 'A Pluggy bloqueou uma nova atualização por limite de frequência. Vou usar a leitura mais recente disponível.';
    }
    if(codes.some(code=>/MFA|CREDENTIAL|PARAMETER|ATTENTION/i.test(code))){
      return 'O banco precisa de nova autenticação para atualizar. A leitura atual será mantida até a conexão ser revalidada.';
    }
    return String(result?.message||'A instituição não iniciou uma nova sincronização agora. Vou usar a leitura mais recente disponível.');
  }

  async function syncCurrentData(){
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
      if(!started?.ok||Number(started?.started||0)<=0){
        message(refreshFailureText(started),'error');
        await syncCurrentData();
        return;
      }

      message(`Atualização em tempo real iniciada em ${Number(started.started)} conexão(ões). Aguardando o banco…`);
      if(button)button.textContent='Banco sincronizando…';

      let finalStatus=null;
      for(let attempt=0;attempt<30;attempt++){
        await wait(attempt===0?1500:2500);
        finalStatus=parse(bridge.refreshStatus?.());
        if(finalStatus?.needsUser){
          message('A instituição pediu autenticação adicional. Revalide a conexão Open Finance para concluir a atualização.','error');
          await syncCurrentData();
          return;
        }
        if(finalStatus?.ok&&finalStatus?.complete){
          if(button)button.textContent='Aplicando dados novos…';
          await syncCurrentData();
          message('Dados atualizados diretamente da instituição e faturas recalculadas.','success');
          try{global.renderAll?.();}catch(_){}
          return;
        }
      }

      message('A instituição ainda está sincronizando. Mantive a última leitura; toque em atualizar novamente em alguns instantes.');
      await syncCurrentData();
    }catch(error){
      console.error('SFP Open Finance real refresh:',error);
      message('Falha ao atualizar a instituição. Mantive os dados anteriores sem sobrescrever a fatura.','error');
      try{await syncCurrentData();}catch(_){}
    }finally{
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
    version:1,
    hook,
    refresh:()=>handleRefresh(null,document.getElementById('openFinanceSyncBtn'))
  });
})(typeof window!=='undefined'?window:globalThis);
