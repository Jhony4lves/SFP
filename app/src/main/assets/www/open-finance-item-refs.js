(function installOpenFinanceItemRefs(global){
  'use strict';

  const $=id=>document.getElementById(id);

  function parseBridge(value){
    if(value&&typeof value==='object')return value;
    try{return JSON.parse(String(value||''));}catch(_){return{ok:false,message:'Resposta inválida da integração nativa.'};}
  }

  function toast(message,type='info'){
    try{if(typeof global.toast==='function')global.toast(message,type);}catch(_){}
  }

  function refreshHint(){
    const hint=$('openFinanceItemRefsHint');
    const bridge=global.PluggyBridge;
    if(!hint||!bridge||typeof bridge.getCredentialStatus!=='function')return;
    let status={};
    try{status=parseBridge(bridge.getCredentialStatus());}catch(_){}
    const count=Number(status?.itemReferenceCount)||0;
    hint.textContent=count
      ? `${count} Item ID(s) salvo(s) neste aparelho. Para substituir, cole novamente a lista completa.`
      : 'No Dashboard Pluggy, selecione cada MeuPluggy e copie o ID exibido no topo ou em “Visualizar JSON” → campo “id”. Um por linha.';
  }

  function saveRefs(){
    const bridge=global.PluggyBridge;
    const input=$('openFinanceItemRefs');
    if(!bridge||typeof bridge.saveItemIds!=='function'||!input)return;
    let result;
    try{result=parseBridge(bridge.saveItemIds(input.value));}
    catch(_){result={ok:false,message:'Não foi possível salvar as referências dos Items.'};}
    input.value='';
    if(result.ok){
      refreshHint();
      toast(`${result.itemReferenceCount||0} Item ID(s) salvo(s) para o Open Finance.`,'success');
    }else{
      const hint=$('openFinanceItemRefsHint');
      if(hint)hint.textContent=result.message||'Confira os Item IDs e tente novamente.';
      toast(result.message||'Falha ao salvar Item IDs.','error');
    }
  }

  function build(){
    if($('openFinanceItemRefsBox'))return true;
    const panel=$('openFinancePersonalPanel');
    const form=$('openFinanceCredentialsForm');
    if(!panel||!form)return false;
    const bridge=global.PluggyBridge;
    if(!bridge||typeof bridge.saveItemIds!=='function')return false;

    const box=document.createElement('div');
    box.id='openFinanceItemRefsBox';
    box.className='panel';
    box.style.margin='12px 0 0';
    box.style.padding='12px';
    box.innerHTML=`
      <div class="head" style="margin-bottom:8px"><div><h2>Referências das conexões</h2><p>Item IDs já criados no Dashboard • não cria novas conexões</p></div></div>
      <label>Item IDs
        <textarea id="openFinanceItemRefs" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\nxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></textarea>
      </label>
      <div id="openFinanceItemRefsHint" class="note"></div>
      <button class="btn2 wide" id="openFinanceItemRefsSaveBtn" type="button" style="margin-top:10px">Salvar Item IDs</button>`;
    form.insertAdjacentElement('afterend',box);
    $('openFinanceItemRefsSaveBtn').addEventListener('click',saveRefs);
    refreshHint();
    return true;
  }

  function install(){
    if(build())return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(build()||attempts>120)clearInterval(timer);
    },50);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);
