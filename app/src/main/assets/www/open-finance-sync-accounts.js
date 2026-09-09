(function installOpenFinanceUnifiedSync(global){
  'use strict';

  const VERSION=1;
  const INSTALL_FLAG='__SFP_OPEN_FINANCE_UNIFIED_SYNC_V1';
  const $=id=>document.getElementById(id);
  const clean=value=>value==null?'':String(value).trim();
  const dateOnly=value=>clean(value).slice(0,10);
  const sameId=(a,b)=>String(a)===String(b);

  function normalize(value){
    return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }

  function dayDiff(a,b){
    const aa=new Date(`${dateOnly(a)}T00:00:00Z`),bb=new Date(`${dateOnly(b)}T00:00:00Z`);
    if(Number.isNaN(aa.getTime())||Number.isNaN(bb.getTime()))return Infinity;
    return Math.abs(aa-bb)/86400000;
  }

  function externalKey(transaction){
    const id=clean(transaction?.id);
    return id?`pluggy:${id}`:'';
  }

  function hasExternalKey(record,key){
    if(!record||!key)return false;
    if(clean(record.externalId)===key)return true;
    return Array.isArray(record.openFinanceExternalIds)&&record.openFinanceExternalIds.includes(key);
  }

  function appendExternalKey(record,key){
    if(!record||!key||hasExternalKey(record,key))return false;
    const ids=Array.isArray(record.openFinanceExternalIds)?record.openFinanceExternalIds.slice():[];
    ids.push(key);
    record.openFinanceExternalIds=ids;
    if(!clean(record.externalId))record.externalId=key;
    return true;
  }

  function itemName(item){
    const accounts=Array.isArray(item?.accounts)?item.accounts:[];
    const accountName=accounts.map(account=>clean(account?.marketingName)||clean(account?.name)).find(Boolean);
    if(accountName)return accountName;
    const institution=clean(item?.institution);
    if(institution&&normalize(institution)!=='meupluggy')return institution;
    return accounts.map(account=>clean(account?.presentationName)).find(Boolean)||clean(item?.connectorName)||'Instituição não informada';
  }

  function transactionKind(account,transaction){
    const amount=Number(transaction?.amount);
    if(account?.type==='CREDIT')return Number.isFinite(amount)&&amount<0?'credit':'expense';
    const type=clean(transaction?.type).toUpperCase();
    if(type==='DEBIT')return'expense';
    if(type==='CREDIT')return'income';
    if(Number.isFinite(amount)&&amount<0)return'expense';
    return'review';
  }

  function isPending(transaction){return clean(transaction?.status).toUpperCase().includes('PENDING')}

  function isCardPaymentDescription(value){
    const text=normalize(value);
    return /(pagamento|pagto|pgto|pagar|pag) (?:de )?fatura/.test(text)
      ||/fatura (?:de )?(?:cartao|credito)/.test(text)
      ||/(pagamento|pagto|pgto) (?:do )?cartao/.test(text);
  }

  function transferSignal(value){
    const text=normalize(value);
    return /\b(transferencia|transfer|transf|ted|doc|pix)\b/.test(text);
  }

  function inferCategory(description){
    const d=normalize(description);
    if(/faculdade|universidade|curso|escola|livraria|mensalidade/.test(d))return'Faculdade';
    if(/uber|\b99\b|taxi|posto|combustivel|metro|onibus|transporte/.test(d))return'Transporte';
    if(/ifood|restaurante|lanch|padaria|mercado|supermercado|aliment/.test(d))return'Alimentação';
    if(/netflix|spotify|prime|disney|youtube|assinatura|subscription/.test(d))return'Assinaturas';
    if(/farmacia|drogaria|hospital|clinica|medic/.test(d))return'Saúde';
    return'Outros';
  }

  function balanceImpactFor(entity,date){
    try{
      if(typeof global.afterAccountSnapshot==='function')return global.afterAccountSnapshot(entity?.id,date)===true;
    }catch(_){}
    const anchor=dateOnly(entity?.balanceDate||global.state?.baseDate||'');
    return !anchor||dateOnly(date)>anchor;
  }

  function exactBankRecord(entity,transaction){
    const key=externalKey(transaction);if(!key)return null;
    return (global.state?.transactions||[]).find(entry=>sameId(entry?.accountId,entity?.id)&&hasExternalKey(entry,key))||null;
  }

  function exactTransferRecord(keys){
    if(!keys.length)return null;
    return (global.state?.transfers||[]).find(transfer=>keys.every(key=>hasExternalKey(transfer,key)))||null;
  }

  function heuristicTransferRecord(expense,income){
    return (global.state?.transfers||[]).find(transfer=>{
      if(!sameId(transfer?.fromId,expense.entity.id)||!sameId(transfer?.toId,income.entity.id))return false;
      if(Math.abs(Math.abs(Number(transfer?.amount))-expense.amount)>.011)return false;
      return dayDiff(transfer?.date,expense.date)<=2||dayDiff(transfer?.settledDate||transfer?.date,income.date)<=2;
    })||null;
  }

  function markLinked(record,account,item,transaction){
    const key=externalKey(transaction);if(!appendExternalKey(record,key))return false;
    record.openFinanceProvider='pluggy';
    record.openFinanceAccountId=clean(account?.id);
    record.openFinanceItemId=clean(item?.id);
    record.openFinanceLastLinkedAt=new Date().toISOString();
    return true;
  }

  function buildBankTransaction(candidate){
    const {account,item,entity,transaction,kind,date,amount}=candidate;
    const key=externalKey(transaction);
    return{
      id:typeof global.uid==='function'?global.uid():Date.now()+Math.floor(Math.random()*1000),
      accountId:entity.id,
      kind,
      desc:clean(transaction?.description)||'Lançamento Open Finance',
      amount,
      date,
      category:inferCategory(transaction?.description),
      status:'paid',
      dueDay:Number(date.slice(8,10))||null,
      tags:['open-finance','pluggy'],
      note:'Importado automaticamente pelo Open Finance (Pluggy).',
      balanceImpact:balanceImpactFor(entity,date),
      createdAt:Date.now(),
      externalId:key,
      openFinanceExternalIds:key?[key]:[],
      openFinanceProvider:'pluggy',
      openFinanceAccountId:clean(account?.id),
      openFinanceItemId:clean(item?.id),
      openFinanceStatus:clean(transaction?.status),
      openFinanceSyncedAt:new Date().toISOString()
    };
  }

  function buildTransfer(expense,income){
    const keys=[externalKey(expense.transaction),externalKey(income.transaction)].filter(Boolean);
    const byAccount={};
    byAccount[expense.entity.id]=balanceImpactFor(expense.entity,expense.date);
    byAccount[income.entity.id]=balanceImpactFor(income.entity,income.date);
    return{
      id:typeof global.uid==='function'?global.uid():Date.now()+Math.floor(Math.random()*1000),
      desc:clean(expense.transaction?.description)||clean(income.transaction?.description)||'Transferência Open Finance',
      amount:expense.amount,
      date:expense.date,
      settledDate:income.date,
      fromId:expense.entity.id,
      toId:income.entity.id,
      tags:['open-finance','pluggy','transferência'],
      note:'Transferência entre contas conciliada automaticamente pelo Open Finance (Pluggy).',
      matchedBy:'open-finance-bank-pair',
      balanceImpactByAccount:byAccount,
      balanceImpact:Object.values(byAccount).some(Boolean),
      externalId:keys[0]||'',
      openFinanceExternalIds:keys,
      openFinanceProvider:'pluggy',
      openFinanceSyncedAt:new Date().toISOString()
    };
  }

  function pairTransfers(candidates){
    const used=new Set(),pairs=[];
    for(let i=0;i<candidates.length;i++){
      const expense=candidates[i];
      if(used.has(i)||expense.kind!=='expense')continue;
      const matches=[];
      for(let j=0;j<candidates.length;j++){
        if(i===j||used.has(j))continue;
        const income=candidates[j];
        if(income.kind!=='income'||sameId(income.entity.id,expense.entity.id))continue;
        if(Math.abs(income.amount-expense.amount)>.011||dayDiff(income.date,expense.date)>2)continue;
        if(!transferSignal(expense.transaction?.description)&&!transferSignal(income.transaction?.description))continue;
        matches.push(j);
      }
      if(matches.length!==1)continue;
      const j=matches[0];used.add(i);used.add(j);pairs.push({expense,income:candidates[j]});
    }
    return{pairs,remaining:candidates.filter((_,index)=>!used.has(index))};
  }

  function planBankSync(result){
    const api=global.SFPOpenFinancePersonal;
    const plan={create:[],link:[],transferCreate:[],transferLink:[],already:0,pending:0,review:0,unmapped:0,partial:0,errors:0,bankAccounts:0};
    const raw=[];

    for(const item of Array.isArray(result?.items)?result.items:[]){
      const name=itemName(item);
      for(const account of Array.isArray(item?.accounts)?item.accounts:[]){
        if(account?.type==='CREDIT')continue;
        plan.bankAccounts++;
        const suggestion=api?.suggestSfpEntity?.(account,name);
        if(!suggestion){plan.unmapped++;continue;}
        if(account?.transactionsError){plan.errors++;continue;}
        if(account?.transactionPreviewHasMore)plan.partial++;

        for(const transaction of Array.isArray(account?.transactions)?account.transactions:[]){
          const amount=Math.abs(Number(transaction?.amount));
          if(!Number.isFinite(amount)||amount===0){plan.review++;continue;}
          if(isPending(transaction)){plan.pending++;continue;}
          const kind=transactionKind(account,transaction);
          if(kind!=='expense'&&kind!=='income'){plan.review++;continue;}
          if(kind==='expense'&&isCardPaymentDescription(transaction?.description)){plan.review++;continue;}

          const exact=exactBankRecord(suggestion.entity,transaction);
          if(exact){plan.already++;continue;}
          const heuristic=api?.likelyExisting?.(account,transaction,suggestion);
          if(heuristic?.record){plan.link.push({record:heuristic.record,account,item,transaction});continue;}
          raw.push({account,item,entity:suggestion.entity,transaction,kind,date:dateOnly(transaction?.date),amount});
        }
      }
    }

    const paired=pairTransfers(raw);
    for(const pair of paired.pairs){
      const keys=[externalKey(pair.expense.transaction),externalKey(pair.income.transaction)].filter(Boolean);
      const exact=exactTransferRecord(keys);
      if(exact){plan.already++;continue;}
      const heuristic=heuristicTransferRecord(pair.expense,pair.income);
      if(heuristic){plan.transferLink.push({record:heuristic,pair});continue;}
      plan.transferCreate.push(pair);
    }
    plan.create=paired.remaining;
    return plan;
  }

  function summaryFor(result){
    const api=global.SFPOpenFinancePersonal;
    const card=api?.planInvoiceSync?.(result)||{create:[],link:[],already:0,pending:0,review:0,unmapped:0,partial:0,errors:0};
    const bank=planBankSync(result);
    return{card,bank};
  }

  function decoratePreview(result){
    if(!result?.ok)return null;
    const {card,bank}=summaryFor(result);
    const box=$('openFinanceStagingSummary');
    if(box){
      const cardBits=[`${card.create?.length||0} compra(s) nova(s)`,`${card.link?.length||0} conciliável(is)`,`${card.already||0} já sincronizada(s)`];
      if(card.pending)cardBits.push(`${card.pending} pendente(s)`);
      if(card.review)cardBits.push(`${card.review} pagamento(s)/crédito(s) em revisão`);
      if(card.unmapped)cardBits.push(`${card.unmapped} cartão(ões) sem vínculo`);
      if(card.partial)cardBits.push(`${card.partial} cartão(ões) com leitura parcial`);
      const bankBits=[`${bank.create.length} lançamento(s) novo(s)`,`${bank.transferCreate.length} transferência(s) pareável(is)`,`${bank.link.length+bank.transferLink.length} conciliável(is)`,`${bank.already} já sincronizado(s)`];
      if(bank.pending)bankBits.push(`${bank.pending} pendente(s)`);
      if(bank.review)bankBits.push(`${bank.review} em revisão`);
      if(bank.unmapped)bankBits.push(`${bank.unmapped} conta(s) sem vínculo`);
      if(bank.partial)bankBits.push(`${bank.partial} conta(s) com cobertura parcial`);
      box.textContent=`Faturas: ${cardBits.join(' • ')}. Contas: ${bankBits.join(' • ')}.`;
    }
    document.querySelectorAll('#openFinancePreview .note').forEach(note=>{
      if(!note.textContent.includes('A consulta retornou apenas parte das transações recentes'))return;
      const block=note.parentElement;
      if(block?.textContent.includes('CREDIT')){
        note.textContent='A consulta retornou apenas parte das transações recentes. Por segurança, este cartão não será alterado até a leitura vir completa.';
      }else{
        note.textContent='A consulta retornou parte das transações recentes desta conta. As transações confirmadas recebidas podem ser sincronizadas individualmente sem presumir que a cobertura está completa.';
      }
    });
    return{card,bank};
  }

  function setStatus(kind,title,detail){
    const box=$('openFinanceStatus');if(!box)return;
    box.className=`alert ${kind==='success'?'green':kind==='error'?'red':kind==='warning'?'yellow':''}`.trim();
    box.replaceChildren();
    const strong=document.createElement('b');strong.textContent=title;
    const small=document.createElement('div');small.className='muted';small.style.marginTop='3px';small.textContent=detail||'';
    box.append(strong,small);
  }

  function setBusy(busy){
    for(const id of ['openFinancePreviewBtn','openFinanceSyncBtn','openFinanceSaveBtn','openFinanceClearBtn']){
      const button=$(id);if(button)button.disabled=Boolean(busy);
    }
  }

  function notify(message,type='info'){
    try{if(typeof global.toast==='function')global.toast(message,type)}catch(_){}
  }

  function cloneState(value){
    try{return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value))}
    catch(_){return JSON.parse(JSON.stringify(value))}
  }

  function applyCardPlan(card){
    let linked=0,created=0;
    for(const row of card.link||[]){if(markLinked(row.purchase,row.account,row.item,row.transaction))linked++}
    for(const purchase of card.create||[]){global.state.purchases.push(purchase);created++}
    return{created,linked};
  }

  function applyBankPlan(bank){
    let linked=0,created=0,transfers=0;
    for(const row of bank.link){if(markLinked(row.record,row.account,row.item,row.transaction))linked++}
    for(const row of bank.transferLink){
      const {record,pair}=row;
      const first=markLinked(record,pair.expense.account,pair.expense.item,pair.expense.transaction);
      const second=markLinked(record,pair.income.account,pair.income.item,pair.income.transaction);
      if(first||second)linked++;
    }
    for(const candidate of bank.create){global.state.transactions.push(buildBankTransaction(candidate));created++}
    for(const pair of bank.transferCreate){global.state.transfers.push(buildTransfer(pair.expense,pair.income));transfers++}
    return{created,linked,transfers};
  }

  function mutedPreview(){
    const api=global.SFPOpenFinancePersonal;
    const originalToast=global.toast;
    try{
      if(typeof originalToast==='function')global.toast=()=>{};
      return api.preview();
    }finally{
      if(typeof originalToast==='function')global.toast=originalToast;
    }
  }

  async function syncAll(){
    const api=global.SFPOpenFinancePersonal;
    if(!api||!global.state)return{ok:false,code:'OPEN_FINANCE_UNAVAILABLE'};
    setBusy(true);
    setStatus('warning','Sincronizando Open Finance','Buscando contas, cartões e transações confirmadas e conciliando com o que já existe no SFP…');
    try{
      const result=mutedPreview();
      if(!result?.ok){
        const message=result?.message||'Não foi possível consultar o Meu Pluggy.';
        setStatus('error','Sincronização não concluída',message);notify(message,'error');return result||{ok:false};
      }
      const plans=decoratePreview(result)||summaryFor(result);
      const {card,bank}=plans;
      if(card.partial>0){
        const message=`A Pluggy ainda informou leitura parcial em ${card.partial} cartão(ões). Nenhuma fatura ou conta foi alterada para evitar uma fatura incompleta.`;
        setStatus('error','Open Finance não foi alterado',message);notify(message,'error');
        return{ok:false,code:'PARTIAL_CARD_TRANSACTION_WINDOW',message,card,bank};
      }
      if(card.errors>0||bank.errors>0){
        const message=`A Pluggy não conseguiu ler transações de ${card.errors+bank.errors} conta(s)/cartão(ões). Nenhum dado foi alterado.`;
        setStatus('error','Open Finance não foi alterado',message);notify(message,'error');
        return{ok:false,code:'TRANSACTION_READ_FAILED',message,card,bank};
      }

      const before=cloneState(global.state);
      try{
        const cardApplied=applyCardPlan(card);
        const bankApplied=applyBankPlan(bank);
        const mutations=cardApplied.created+cardApplied.linked+bankApplied.created+bankApplied.linked+bankApplied.transfers;
        if(mutations){
          if(typeof global.save!=='function')throw new Error('Persistência do SFP indisponível.');
          await global.save('Sincronizar Open Finance');
        }else if(typeof global.renderAll==='function')global.renderAll();

        const detail=[
          `${cardApplied.created} compra(s) de cartão adicionada(s)`,
          `${bankApplied.created} lançamento(s) bancário(s) adicionado(s)`,
          `${bankApplied.transfers} transferência(s) conciliada(s)`,
          `${cardApplied.linked+bankApplied.linked} registro(s) vinculado(s) sem duplicar`
        ];
        if(card.pending+bank.pending)detail.push(`${card.pending+bank.pending} pendente(s) aguardando confirmação`);
        if(card.review+bank.review)detail.push(`${card.review+bank.review} item(ns) mantido(s) em revisão`);
        if(card.unmapped+bank.unmapped)detail.push(`${card.unmapped+bank.unmapped} conta(s)/cartão(ões) sem vínculo seguro`);
        if(bank.partial)detail.push(`${bank.partial} conta(s) bancária(s) com cobertura parcial; somente os registros recebidos foram processados`);
        setStatus(bank.partial?'warning':'success','Contas e faturas sincronizadas pelo Open Finance',detail.join(' • '));
        const added=cardApplied.created+bankApplied.created+bankApplied.transfers;
        if(added)notify(`${added} novo(s) registro(s) adicionado(s) pelo Open Finance.`,'success');
        else if(cardApplied.linked+bankApplied.linked)notify('Dados conciliados sem criar duplicatas.','success');
        else notify(bank.partial?'Nada novo entre as transações recebidas; a cobertura bancária ainda é parcial.':'Tudo já estava sincronizado.',bank.partial?'info':'success');
        return{ok:true,card,bank,cardApplied,bankApplied};
      }catch(error){
        try{global.state=before;if(typeof global.renderAll==='function')global.renderAll()}catch(_){}
        throw error;
      }
    }catch(error){
      const message=error?.message||'A sincronização foi cancelada antes de alterar seus dados.';
      setStatus('error','Open Finance não foi alterado',message);notify(message,'error');
      return{ok:false,code:error?.code||'SYNC_FAILED',message};
    }finally{setBusy(false)}
  }

  function previewOnly(){
    const api=global.SFPOpenFinancePersonal;if(!api)return{ok:false};
    const result=api.preview();if(result?.ok)decoratePreview(result);return result;
  }

  function enhancePanel(){
    const panel=$('openFinancePersonalPanel'),sync=$('openFinanceSyncBtn'),preview=$('openFinancePreviewBtn');
    if(!panel||!sync||!preview)return false;
    sync.textContent='Sincronizar contas e faturas';
    const subtitle=panel.querySelector('.head p');
    if(subtitle)subtitle.textContent='Meu Pluggy • Conector 200 • sincronização de contas e faturas';
    const notes=panel.querySelectorAll(':scope > .note');
    const finalNote=notes[notes.length-1];
    if(finalNote)finalNote.textContent='A sincronização importa compras confirmadas de cartões e movimentações confirmadas de contas vinculadas com segurança ao SFP. Registros já cadastrados são conciliados em vez de duplicados; pagamentos de fatura, créditos de cartão e transações pendentes ficam em revisão. Leitura parcial de cartão bloqueia o lote; conta bancária parcial processa somente os lançamentos confirmados que a Pluggy realmente retornou, sem presumir cobertura completa.';

    preview.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();previewOnly();
    },true);
    sync.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();void syncAll();
    },true);
    return true;
  }

  function install(){
    if(global[INSTALL_FLAG])return;
    if(!global.SFPOpenFinancePersonal||!enhancePanel()){
      setTimeout(install,50);return;
    }
    global[INSTALL_FLAG]=true;
    global.SFPOpenFinanceUnifiedSync=Object.freeze({version:VERSION,planBankSync,decoratePreview,syncAll});
  }

  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
    else install();
  }
})(typeof window!=='undefined'?window:globalThis);
