(function installOpenFinancePersonal(global){
  'use strict';

  const VERSION=1;
  const PANEL_ID='openFinancePersonalPanel';
  const $=id=>document.getElementById(id);

  function parseBridge(value){
    if(value&&typeof value==='object')return value;
    try{return JSON.parse(String(value||''));}catch(_){return{ok:false,code:'INVALID_NATIVE_RESPONSE',message:'Resposta inválida da integração nativa.'};}
  }

  function getBridge(){
    const bridge=global.PluggyBridge;
    if(!bridge)return null;
    const required=['getCredentialStatus','saveCredentials','previewData','clearCredentials'];
    return required.every(name=>typeof bridge[name]==='function')?bridge:null;
  }

  function notify(message,type='info'){
    if(typeof global.toast==='function'){
      try{global.toast(message,type);return;}catch(_){}
    }
  }

  function setText(id,value){const node=$(id);if(node)node.textContent=String(value??'');}

  function setStatus(kind,title,detail){
    const box=$('openFinanceStatus');
    if(!box)return;
    box.className=`alert ${kind==='success'?'green':kind==='error'?'red':kind==='warning'?'yellow':''}`.trim();
    box.replaceChildren();
    const strong=document.createElement('b');strong.textContent=title;
    const small=document.createElement('div');small.className='muted';small.style.marginTop='3px';small.textContent=detail||'';
    box.append(strong,small);
  }

  function setBusy(busy,label){
    const button=$('openFinancePreviewBtn');
    if(button){button.disabled=Boolean(busy);button.textContent=busy?(label||'Consultando…'):'Sincronizar prévia';}
    const save=$('openFinanceSaveBtn');if(save)save.disabled=Boolean(busy);
  }

  function money(value,currency){
    const number=Number(value);
    if(!Number.isFinite(number))return 'Saldo indisponível';
    try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:currency||'BRL'}).format(number);}catch(_){return `R$ ${number.toFixed(2).replace('.',',')}`;}
  }

  function accountLabel(account){
    return account.marketingName||account.name||account.subtype||account.type||'Conta';
  }

  function appendAccount(container,account){
    const row=document.createElement('div');row.className='item';
    const left=document.createElement('div');
    const title=document.createElement('b');title.textContent=accountLabel(account);
    const meta=document.createElement('small');
    const bits=[account.type,account.subtype,account.number].filter(Boolean);
    meta.textContent=bits.join(' • ')||'Conta detectada pela Pluggy';
    left.append(title,meta);
    const right=document.createElement('div');right.style.textAlign='right';
    const balance=document.createElement('b');balance.textContent=money(account.balance,account.currencyCode);
    const readonly=document.createElement('small');readonly.textContent='somente leitura';
    right.append(balance,readonly);
    row.append(left,right);container.appendChild(row);
  }

  function renderPreview(result){
    const root=$('openFinancePreview');
    if(!root)return;
    root.replaceChildren();

    const items=Array.isArray(result?.items)?result.items:[];
    if(!items.length){
      const empty=document.createElement('div');empty.className='note';empty.textContent='A aplicação autenticou, mas nenhum Item foi retornado para estas credenciais.';
      root.appendChild(empty);return;
    }

    let accountCount=0;
    for(const item of items){
      const accounts=Array.isArray(item.accounts)?item.accounts:[];accountCount+=accounts.length;
      const section=document.createElement('div');section.style.marginTop='12px';
      const heading=document.createElement('div');heading.className='head';heading.style.marginBottom='8px';
      const headingText=document.createElement('div');
      const title=document.createElement('h2');
      const institution=accounts[0]?.marketingName||accounts[0]?.name||item.institution||item.connectorName||'MeuPluggy';
      title.textContent=institution;
      const subtitle=document.createElement('p');
      subtitle.textContent=`${item.connectorName||'MeuPluggy'} • ${item.status||'status não informado'} • ${accounts.length} conta(s)`;
      headingText.append(title,subtitle);heading.appendChild(headingText);section.appendChild(heading);

      const list=document.createElement('div');list.className='list';
      if(accounts.length)accounts.forEach(account=>appendAccount(list,account));
      else{
        const empty=document.createElement('div');empty.className='note';
        empty.textContent=item.accountsError?'O Item foi encontrado, mas as contas não puderam ser consultadas agora.':'Nenhuma conta retornada para este Item.';
        list.appendChild(empty);
      }
      section.appendChild(list);root.appendChild(section);
    }

    const summary=document.createElement('div');summary.className='note';summary.style.marginTop='12px';
    summary.textContent=`Prévia concluída: ${items.length} Item(s) e ${accountCount} conta(s)/cartão(ões). Nenhum lançamento, saldo ou patrimônio do SFP foi alterado.`;
    root.prepend(summary);
  }

  function refreshStatus(){
    const bridge=getBridge();
    const form=$('openFinanceCredentialsForm');
    const preview=$('openFinancePreviewBtn');
    const clear=$('openFinanceClearBtn');
    if(!bridge){
      if(form)form.classList.add('hidden');
      if(preview)preview.classList.add('hidden');
      if(clear)clear.classList.add('hidden');
      setStatus('warning','Disponível no aplicativo Android','A integração Open Finance usa o cofre nativo do Android e não fica disponível na versão web de QA.');
      return{ok:false,configured:false,native:false};
    }

    let status;
    try{status=parseBridge(bridge.getCredentialStatus());}catch(_){status={ok:false,configured:false};}
    const configured=Boolean(status?.ok&&status?.configured);
    if(form)form.classList.remove('hidden');
    if(preview)preview.classList.toggle('hidden',!configured);
    if(clear)clear.classList.toggle('hidden',!configured);
    if(configured){
      setStatus('success','Meu Pluggy configurado neste aparelho',`Client ID ${status.clientIdMasked||'protegido'} • Client Secret no Android Keystore`);
      setText('openFinanceCredentialHint','Para trocar as credenciais, informe um novo Client ID e Client Secret abaixo.');
    }else{
      setStatus('warning','Meu Pluggy ainda não configurado','Informe o Client ID e o Client Secret da aplicação SFP. A API Key exibida no Dashboard não é necessária.');
      setText('openFinanceCredentialHint','As credenciais ficam cifradas no Android Keystore e não entram no backup financeiro do SFP.');
    }
    return{...status,native:true,configured};
  }

  function saveCredentials(){
    const bridge=getBridge();
    const clientId=$('openFinanceClientId');
    const secret=$('openFinanceClientSecret');
    if(!bridge||!clientId||!secret)return{ok:false};
    const clientIdValue=clientId.value.trim();
    const secretValue=secret.value.trim();
    if(!clientIdValue||!secretValue){setStatus('error','Credenciais incompletas','Preencha Client ID e Client Secret.');return{ok:false};}

    let result;
    try{result=parseBridge(bridge.saveCredentials(clientIdValue,secretValue));}
    catch(_){result={ok:false,message:'Não foi possível acessar o cofre nativo.'};}
    // Never keep credentials in form fields after the native call returns.
    clientId.value='';secret.value='';
    if(result.ok){
      refreshStatus();notify('Credenciais Open Finance protegidas no aparelho.','success');
    }else{
      setStatus('error','Não foi possível salvar',result.message||'O Android Keystore recusou a gravação.');
      notify(result.message||'Falha ao salvar credenciais.','error');
    }
    return result;
  }

  function preview(){
    const bridge=getBridge();
    if(!bridge){refreshStatus();return{ok:false};}
    setBusy(true,'Consultando Meu Pluggy…');
    setStatus('warning','Consultando em modo somente leitura','Autenticando e lendo Items/contas. O estado financeiro do SFP não será alterado.');
    let result;
    try{result=parseBridge(bridge.previewData());}
    catch(_){result={ok:false,message:'Falha ao chamar a integração nativa.'};}
    setBusy(false);
    if(result.ok){
      renderPreview(result);
      setStatus('success','Conexão com Meu Pluggy confirmada',`${result.itemCount??(result.items||[]).length} Item(s) retornado(s). Prévia somente leitura.`);
      notify('Meu Pluggy conectado ao SFP em modo de prévia.','success');
    }else{
      setStatus('error','Não foi possível consultar o Meu Pluggy',result.message||'Confira a conexão e tente novamente.');
      notify(result.message||'Falha ao consultar Meu Pluggy.','error');
    }
    return result;
  }

  function clearCredentials(){
    const bridge=getBridge();if(!bridge)return false;
    if(typeof global.confirm==='function'&&!global.confirm('Remover as credenciais do Meu Pluggy deste aparelho?'))return false;
    let ok=false;try{ok=Boolean(bridge.clearCredentials());}catch(_){}
    const root=$('openFinancePreview');if(root)root.replaceChildren();
    refreshStatus();
    if(ok)notify('Credenciais Open Finance removidas deste aparelho.','success');
    return ok;
  }

  function buildPanel(){
    if(document.getElementById(PANEL_ID))return true;
    const config=document.getElementById('config');if(!config)return false;

    const panel=document.createElement('article');panel.className='panel';panel.id=PANEL_ID;
    panel.innerHTML=`
      <div class="head"><div><h2>Open Finance pessoal</h2><p>Meu Pluggy • Conector 200 • sincronização opcional e sem custo recorrente</p></div><span class="badge">POC somente leitura</span></div>
      <div id="openFinanceStatus" class="alert"></div>
      <form id="openFinanceCredentialsForm" autocomplete="off" style="margin-top:12px">
        <div class="two">
          <label>Client ID<input id="openFinanceClientId" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></label>
          <label>Client Secret<input id="openFinanceClientSecret" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="••••••••••••••••"/></label>
        </div>
        <div id="openFinanceCredentialHint" class="note"></div>
        <button class="btn wide" id="openFinanceSaveBtn" type="submit" style="margin-top:10px">Salvar com segurança</button>
      </form>
      <div class="two" style="margin-top:10px">
        <button class="btn2 wide hidden" id="openFinancePreviewBtn" type="button">Sincronizar prévia</button>
        <button class="ghost wide hidden" id="openFinanceClearBtn" type="button">Remover credenciais</button>
      </div>
      <div id="openFinancePreview" style="margin-top:12px"></div>
      <div class="note" style="margin-top:12px">Nesta fase o SFP não cria lançamentos, não altera saldos e não persiste dados vindos da Pluggy. A leitura serve somente para validar autenticação, Items e contas antes da conciliação.</div>`;
    config.appendChild(panel);

    $('openFinanceCredentialsForm').addEventListener('submit',event=>{event.preventDefault();saveCredentials();});
    $('openFinancePreviewBtn').addEventListener('click',preview);
    $('openFinanceClearBtn').addEventListener('click',clearCredentials);
    refreshStatus();
    return true;
  }

  function install(){
    if(buildPanel())return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(buildPanel()||attempts>100)clearInterval(timer);
    },50);
  }

  global.SFPOpenFinancePersonal=Object.freeze({
    version:VERSION,
    refreshStatus,
    preview,
    saveCredentials,
    clearCredentials
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);
