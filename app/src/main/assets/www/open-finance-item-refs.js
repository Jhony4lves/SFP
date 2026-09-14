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

  // Bank snapshots must remain unchanged. Cycle fallback belongs to the invoice
  // resolver and must never be written back into the provider's creditData.

  function pending(value){return String(value||'').toUpperCase().includes('PENDING');}
  function hasExternalKey(purchase,key){
    if(!purchase||!key)return false;
    if(String(purchase.externalId||'')===key)return true;
    return Array.isArray(purchase.openFinanceExternalIds)&&purchase.openFinanceExternalIds.includes(key);
  }
  function linkPendingPurchase(purchase,account,item,transaction,key){
    if(!purchase||!key||hasExternalKey(purchase,key))return false;
    const ids=Array.isArray(purchase.openFinanceExternalIds)?purchase.openFinanceExternalIds.slice():[];
    ids.push(key);
    purchase.openFinanceExternalIds=[...new Set(ids)];
    if(!purchase.externalId)purchase.externalId=key;
    purchase.openFinanceProvider='pluggy';
    purchase.openFinanceAccountId=String(account?.id||'');
    purchase.openFinanceItemId=String(item?.id||'');
    purchase.openFinanceStatus=String(transaction?.status||'PENDING');
    purchase.openFinanceLastLinkedAt=new Date().toISOString();
    return true;
  }
  function reconcilePendingExisting(result){
    const api=global.SFPOpenFinancePersonal;
    const report={linked:0,already:0,unmatched:0,review:0,unmapped:0};
    if(!result?.ok||!api||typeof api.likelyExisting!=='function'||typeof api.suggestSfpEntity!=='function')return report;
    for(const item of Array.isArray(result.items)?result.items:[]){
      const accounts=Array.isArray(item?.accounts)?item.accounts:[];
      const itemName=String(item?.institution||item?.connectorName||'');
      for(const account of accounts){
        if(account?.type!=='CREDIT'||account?.transactionsError||account?.transactionPreviewHasMore)continue;
        const suggestion=api.suggestSfpEntity(account,itemName);
        if(!suggestion?.entity){report.unmapped++;continue;}
        for(const transaction of Array.isArray(account?.transactions)?account.transactions:[]){
          if(!pending(transaction?.status))continue;
          const amount=Number(transaction?.amount);
          if(!Number.isFinite(amount)||amount<=0){report.review++;continue;}
          const match=api.likelyExisting(account,transaction,suggestion);
          if(!match?.record){report.unmatched++;continue;}
          const key=api.externalTransactionKey?.(transaction)||'';
          if(!key){report.unmatched++;continue;}
          if(hasExternalKey(match.record,key)){report.already++;continue;}
          if(linkPendingPurchase(match.record,account,item,transaction,key))report.linked++;
        }
      }
    }
    return report;
  }
  function updatePendingStatus(report){
    const box=$('openFinanceStatus');
    if(!box)return;
    const strong=box.querySelector('b');
    const detail=box.querySelector('.muted');
    if(strong)strong.textContent='Faturas conciliadas pelo Open Finance';
    if(detail){
      const bits=[];
      if(report.linked)bits.push(`${report.linked} pendente(s) vinculada(s) a compra(s) já existente(s)`);
      if(report.already)bits.push(`${report.already} vínculo(s) já existente(s)`);
      if(report.unmatched)bits.push(`${report.unmatched} pendente(s) ainda sem correspondência segura`);
      if(report.review)bits.push(`${report.review} pagamento(s)/crédito(s) em revisão`);
      if(report.unmapped)bits.push(`${report.unmapped} cartão(ões) sem vínculo`);
      detail.textContent=bits.join(' • ')||'Nenhuma alteração adicional necessária.';
    }
  }
  function installPendingReconciler(){
    const button=$('openFinanceSyncBtn');
    const api=global.SFPOpenFinancePersonal;
    const bridge=global.PluggyBridge;
    if(!button||!api||typeof api.syncInvoices!=='function'||!bridge||typeof bridge.previewData!=='function')return false;
    if(button.__sfpPendingReconciler)return true;
    const replacement=button.cloneNode(true);
    Object.defineProperty(replacement,'__sfpPendingReconciler',{value:true});
    button.replaceWith(replacement);
    replacement.addEventListener('click',async()=>{
      replacement.disabled=true;
      try{
        const activeApi=global.SFPOpenFinancePersonal;
        const base=await activeApi.syncInvoices();
        if(!base?.ok)return;
        let latest;
        try{latest=parseBridge(bridge.previewData());}
        catch(_){latest={ok:false};}
        if(!latest?.ok)return;
        const report=reconcilePendingExisting(latest);
        if(report.linked){
          if(typeof global.save==='function')await global.save('Conciliar pendentes Open Finance');
          else if(typeof global.renderAll==='function')global.renderAll();
          toast(`${report.linked} compra(s) pendente(s) vinculada(s) sem duplicar a fatura.`,'success');
        }
        updatePendingStatus(report);
      }catch(error){
        console.error('SFP pending Open Finance reconcile:',error);
        toast('Não foi possível concluir a conciliação dos pendentes.','error');
      }finally{replacement.disabled=false;}
    });
    return true;
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
      const pendingReady=installPendingReconciler();
      if((uiReady&&pendingReady)||attempts>120)clearInterval(timer);
    },50);
    build();
    installPendingReconciler();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);
