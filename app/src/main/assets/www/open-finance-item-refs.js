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

  function monthKey(value){return String(value||'').slice(0,7);}
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||'').slice(0,10));}
  function currentMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function moveDateToMonth(value,month){
    const raw=String(value||'').slice(0,10);if(!validDate(raw)||!/^\d{4}-\d{2}$/.test(month))return value;
    const [y,m]=month.split('-').map(Number),day=Number(raw.slice(8,10));
    const last=new Date(Date.UTC(y,m,0)).getUTCDate();
    return `${month}-${String(Math.min(Math.max(day,1),last)).padStart(2,'0')}`;
  }
  function normalizeStaleCreditCycles(result){
    if(!result?.ok)return result;
    const nowMonth=currentMonth();
    for(const item of Array.isArray(result.items)?result.items:[]){
      for(const account of Array.isArray(item?.accounts)?item.accounts:[]){
        if(account?.type!=='CREDIT'||!account.creditData)continue;
        const due=String(account.creditData.balanceDueDate||'').slice(0,10);
        if(!validDate(due)||monthKey(due)>=nowMonth)continue;
        account.creditData.balanceDueDate=moveDateToMonth(due,nowMonth);
        const close=String(account.creditData.balanceCloseDate||'').slice(0,10);
        if(validDate(close)&&monthKey(close)<nowMonth)account.creditData.balanceCloseDate=moveDateToMonth(close,nowMonth);
        account.sfpOriginalBalanceDueDate=due;
        account.sfpCycleNormalized=true;
      }
    }
    return result;
  }
  function installCycleHotfix(){
    const api=global.SFPOpenFinancePersonal;
    if(!api||typeof api.preview!=='function')return false;
    if(api.__sfpStaleCycleFix)return true;
    try{
      const original=api.preview;
      const wrapped={...api,preview:(...args)=>{
        const out=original(...args);
        return out&&typeof out.then==='function'?out.then(normalizeStaleCreditCycles):normalizeStaleCreditCycles(out);
      }};
      Object.defineProperty(wrapped,'__sfpStaleCycleFix',{value:true});
      global.SFPOpenFinancePersonal=Object.freeze(wrapped);
      return true;
    }catch(error){console.error('SFP stale Open Finance cycle fix:',error);return false;}
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
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      const uiReady=build();
      const cycleReady=installCycleHotfix();
      if((uiReady&&cycleReady)||attempts>120)clearInterval(timer);
    },50);
    build();
    installCycleHotfix();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);
