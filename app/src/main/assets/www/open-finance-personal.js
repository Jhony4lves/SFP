(function installOpenFinancePersonal(global){
  'use strict';

  const VERSION=3;
  const PANEL_ID='openFinancePersonalPanel';
  const $=id=>document.getElementById(id);
  let lastPreview=null;

  function parseBridge(value){
    if(value&&typeof value==='object')return value;
    try{return JSON.parse(String(value||''));}
    catch(_){return{ok:false,code:'INVALID_NATIVE_RESPONSE',message:'Resposta inválida da integração nativa.'};}
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

  function cleanText(value){
    if(value===null||value===undefined)return'';
    const text=String(value).trim();
    if(!text||/^null$|^undefined$/i.test(text))return'';
    return text;
  }

  function setText(id,value){const node=$(id);if(node)node.textContent=cleanText(value);}

  function setStatus(kind,title,detail){
    const box=$('openFinanceStatus');
    if(!box)return;
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

  function money(value,currency){
    const number=Number(value);
    if(!Number.isFinite(number))return'Saldo indisponível';
    try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:currency||'BRL'}).format(number);}
    catch(_){return`R$ ${number.toFixed(2).replace('.',',')}`;}
  }

  function normalize(value){
    return cleanText(value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }

  function canonicalInstitution(value){
    const text=normalize(value);
    if(!text)return'';
    if(text.includes('nu pagamentos')||text.includes('nubank'))return'nubank';
    if(text.includes('mercado pago'))return'mercado pago';
    if(text.includes('itau'))return'itau';
    if(text.includes('caixa economica')||text==='caixa')return'caixa';
    if(text.includes('banco inter')||text==='inter')return'inter';
    if(text.includes('picpay'))return'picpay';
    return text;
  }

  function accountLabel(account){
    return cleanText(account?.presentationName)
      ||cleanText(account?.marketingName)
      ||cleanText(account?.name)
      ||`${account?.type==='CREDIT'?'Cartão':'Conta'}${cleanText(account?.lastFour)?` final ${account.lastFour}`:''}`;
  }

  function itemDisplayName(item){
    const accounts=Array.isArray(item?.accounts)?item.accounts:[];
    const informative=accounts
      .map(account=>cleanText(account?.marketingName)||cleanText(account?.name))
      .find(Boolean);
    const institution=cleanText(item?.institution);
    if(informative)return informative;
    if(institution&&canonicalInstitution(institution)!=='meupluggy')return institution;
    const bank=accounts.find(account=>account?.type!=='CREDIT');
    if(bank)return accountLabel(bank);
    const card=accounts.find(account=>account?.type==='CREDIT');
    if(card)return`Instituição não informada • cartão final ${cleanText(card.lastFour)||'—'}`;
    return'Instituição não informada';
  }

  function tokens(value){return new Set(normalize(value).split(' ').filter(token=>token.length>2));}

  function entityScore(external,candidate){
    const a=canonicalInstitution(external);
    const b=canonicalInstitution(candidate);
    if(!a||!b)return 0;
    if(a===b)return 6;
    if(a.includes(b)||b.includes(a))return 4;
    const at=tokens(a),bt=tokens(b);
    let common=0;for(const token of at)if(bt.has(token))common++;
    return common>=2?3:common===1?1:0;
  }

  function suggestSfpEntity(account,itemName){
    if(typeof global.state==='undefined'||!global.state)return null;
    const credit=account?.type==='CREDIT';
    const list=credit?(Array.isArray(global.state.cards)?global.state.cards:[]):(Array.isArray(global.state.accounts)?global.state.accounts:[]);
    const external=[account?.marketingName,account?.name,account?.presentationName,itemName].map(cleanText).filter(Boolean).join(' ');
    let best=null;
    for(const entity of list){
      const score=entityScore(external,entity?.name);
      if(!best||score>best.score)best={entity,score};
    }
    return best&&best.score>=4?best:null;
  }

  function dateOnly(value){return cleanText(value).slice(0,10);}

  function dayDiff(a,b){
    const ad=new Date(`${dateOnly(a)}T00:00:00Z`),bd=new Date(`${dateOnly(b)}T00:00:00Z`);
    if(Number.isNaN(ad.getTime())||Number.isNaN(bd.getTime()))return Infinity;
    return Math.abs(ad-bd)/86400000;
  }

  function descriptionScore(a,b){
    const aa=normalize(a),bb=normalize(b);
    if(!aa||!bb)return 0;
    if(aa===bb)return 3;
    if(aa.includes(bb)||bb.includes(aa))return 2;
    const at=tokens(aa),bt=tokens(bb);let common=0;
    for(const token of at)if(bt.has(token))common++;
    return common>=2?2:common===1?1:0;
  }

  function transactionKind(account,transaction){
    const amount=Number(transaction?.amount);
    if(account?.type==='CREDIT'){
      if(Number.isFinite(amount)&&amount<0)return'credit';
      return'expense';
    }
    const type=cleanText(transaction?.type).toUpperCase();
    if(type==='DEBIT')return'expense';
    if(type==='CREDIT')return'income';
    if(Number.isFinite(amount)&&amount<0)return'expense';
    return'review';
  }

  function externalTransactionKey(transaction){
    const id=cleanText(transaction?.id);
    return id?`pluggy:${id}`:'';
  }

  function purchaseHasExternalKey(purchase,key){
    if(!purchase||!key)return false;
    if(cleanText(purchase.externalId)===key)return true;
    return Array.isArray(purchase.openFinanceExternalIds)&&purchase.openFinanceExternalIds.includes(key);
  }

  function monthShift(month,delta){
    const match=String(month||'').match(/^(\d{4})-(\d{2})$/);if(!match)return month;
    const date=new Date(Date.UTC(+match[1],+match[2]-1+Number(delta||0),1));
    return`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
  }

  function invoiceMonthForCard(card,date){
    const dayText=dateOnly(date);if(!/^\d{4}-\d{2}-\d{2}$/.test(dayText))return dayText.slice(0,7);
    let month=dayText.slice(0,7);
    const day=Number(dayText.slice(8,10)),closeDay=Number(card?.closeDay);
    if(Number.isFinite(closeDay)&&closeDay>0&&day>closeDay)month=monthShift(month,1);
    return month;
  }

  function installmentMatchScore(purchase,transaction,card){
    const meta=transaction?.installment||{};
    const totalInstallments=Number(meta.totalInstallments)||0;
    if(totalInstallments<=1||Number(purchase?.installments)!==totalInstallments)return 0;
    const target=Math.abs(Number(transaction?.amount));
    if(!Number.isFinite(target))return 0;
    let score=descriptionScore(purchase?.desc,transaction?.description);
    const totalAmount=Math.abs(Number(meta.totalAmount));
    if(Number.isFinite(totalAmount)&&totalAmount>0&&Math.abs(Math.abs(Number(purchase?.total))-totalAmount)<.02)score+=6;
    const month=invoiceMonthForCard(card,transaction?.date);
    if(typeof global.purchaseInstallment==='function'){
      try{
        const charge=global.purchaseInstallment(purchase,month);
        if(charge&&Math.abs(Math.abs(Number(charge.amount))-target)<.02)score+=4;
      }catch(_){}
    }
    return score;
  }

  function likelyExisting(account,transaction,suggestion){
    if(typeof global.state==='undefined'||!global.state||!suggestion?.entity)return null;
    const kind=transactionKind(account,transaction);
    const target=Math.abs(Number(transaction?.amount));
    if(!Number.isFinite(target))return null;

    if(account?.type==='CREDIT'){
      if(kind!=='expense')return null;
      const list=Array.isArray(global.state.purchases)?global.state.purchases:[];
      const key=externalTransactionKey(transaction);
      const exact=key?list.find(p=>String(p?.cardId)===String(suggestion.entity.id)&&purchaseHasExternalKey(p,key)):null;
      if(exact)return{source:'purchase',record:exact,score:99,exact:true};

      let best=null;
      for(const purchase of list){
        if(String(purchase?.cardId)!==String(suggestion.entity.id))continue;
        const installmentScore=installmentMatchScore(purchase,transaction,suggestion.entity);
        if(installmentScore>=7){
          const candidate={source:'purchase',record:purchase,score:10+installmentScore,installment:true};
          if(!best||candidate.score>best.score)best=candidate;
          continue;
        }
        const amount=Math.abs(Number(purchase?.total));
        if(!Number.isFinite(amount)||Math.abs(amount-target)>.011)continue;
        const days=dayDiff(purchase?.purchaseDate,transaction?.date);
        if(days>2)continue;
        const score=4+(days===0?2:1)+descriptionScore(purchase?.desc,transaction?.description);
        if(!best||score>best.score)best={source:'purchase',record:purchase,score};
      }
      return best&&best.score>=6?best:null;
    }

    if(kind!=='expense'&&kind!=='income')return null;
    const list=Array.isArray(global.state.transactions)?global.state.transactions:[];
    let best=null;
    for(const entry of list){
      if(String(entry?.accountId)!==String(suggestion.entity.id))continue;
      if(entry?.kind&&entry.kind!==kind)continue;
      const amount=Math.abs(Number(entry?.amount));
      if(!Number.isFinite(amount)||Math.abs(amount-target)>.011)continue;
      const days=dayDiff(entry?.date,transaction?.date);
      if(days>2)continue;
      const score=4+(days===0?2:1)+descriptionScore(entry?.desc,transaction?.description);
      if(!best||score>best.score)best={source:'transaction',record:entry,score};
    }
    return best&&best.score>=6?best:null;
  }

  function displayTransactionAmount(account,transaction){
    const raw=Number(transaction?.amount);
    if(!Number.isFinite(raw))return'Valor indisponível';
    const kind=transactionKind(account,transaction);
    const magnitude=money(Math.abs(raw),transaction?.currencyCode||account?.currencyCode);
    if(kind==='income'||kind==='credit')return`+ ${magnitude}`;
    if(kind==='expense')return`− ${magnitude}`;
    return magnitude;
  }

  function transactionStatusLabel(account,transaction,match){
    if(match)return match.exact?'já sincronizado':'provável lançamento já existente';
    const kind=transactionKind(account,transaction);
    if(account?.type==='CREDIT'&&kind==='credit')return'crédito/pagamento • revisar';
    if(cleanText(transaction?.status).toUpperCase().includes('PENDING'))return'pendente • não será importado ainda';
    if(kind==='review')return'precisa de revisão';
    return'novo candidato';
  }

  function appendTransaction(container,account,transaction,suggestion,staging){
    const row=document.createElement('div');row.className='item';
    const left=document.createElement('div');
    const title=document.createElement('b');title.textContent=cleanText(transaction?.description)||'Lançamento';
    const meta=document.createElement('small');
    const installment=transaction?.installment;
    const installmentText=installment&&Number(installment.installmentNumber)>0&&Number(installment.totalInstallments)>0
      ?` • ${installment.installmentNumber}/${installment.totalInstallments}`:'';
    meta.textContent=`${dateOnly(transaction?.date)||'data não informada'} • ${cleanText(transaction?.status)||'status não informado'}${installmentText}`;
    left.append(title,meta);

    const right=document.createElement('div');right.style.textAlign='right';
    const amount=document.createElement('b');amount.textContent=displayTransactionAmount(account,transaction);
    const match=likelyExisting(account,transaction,suggestion);
    const status=document.createElement('small');status.textContent=transactionStatusLabel(account,transaction,match);
    if(match)staging.existing++;
    else if(cleanText(transaction?.status).toUpperCase().includes('PENDING'))staging.pending++;
    else if(account?.type==='CREDIT'&&transactionKind(account,transaction)==='credit')staging.review++;
    else if(transactionKind(account,transaction)==='review')staging.review++;
    else staging.candidates++;
    right.append(amount,status);
    row.append(left,right);container.appendChild(row);
  }

  function appendAccount(container,account,itemName,staging){
    const block=document.createElement('div');block.style.marginBottom='10px';
    const row=document.createElement('div');row.className='item';
    const left=document.createElement('div');
    const title=document.createElement('b');title.textContent=accountLabel(account);
    const meta=document.createElement('small');
    const bits=[account?.type,account?.subtype,cleanText(account?.lastFour)?`final ${account.lastFour}`:''].filter(Boolean);
    meta.textContent=bits.join(' • ')||'Conta detectada pela Pluggy';
    left.append(title,meta);

    const suggestion=suggestSfpEntity(account,itemName);
    const mapping=document.createElement('small');
    mapping.textContent=suggestion?`Vínculo sugerido SFP: ${suggestion.entity.name}`:'Sem vínculo automático seguro';
    left.appendChild(mapping);

    const right=document.createElement('div');right.style.textAlign='right';
    const balance=document.createElement('b');balance.textContent=money(account?.balance,account?.currencyCode);
    const meaning=document.createElement('small');
    meaning.textContent=account?.type==='CREDIT'?'uso do crédito informado':'saldo disponível';
    right.append(balance,meaning);

    const creditData=account?.creditData||{};
    if(account?.type==='CREDIT'&&Number.isFinite(Number(creditData.availableCreditLimit))){
      const available=document.createElement('small');
      available.textContent=`Disponível: ${money(creditData.availableCreditLimit,account?.currencyCode)}`;
      right.appendChild(available);
    }
    row.append(left,right);block.appendChild(row);

    const transactions=Array.isArray(account?.transactions)?account.transactions:[];
    const txNote=document.createElement('div');txNote.className='note';txNote.style.marginTop='6px';
    if(account?.transactionsError){
      txNote.textContent='Conta lida, mas as transações recentes não puderam ser consultadas agora.';
      staging.transactionErrors++;
    }else if(account?.transactionPreviewHasMore){
      txNote.textContent=`A consulta retornou apenas parte das transações recentes. Por segurança, este cartão não será alterado até a leitura vir completa.`;
      staging.partialAccounts++;
    }else if(!transactions.length){
      txNote.textContent=`Nenhuma transação retornada na janela recente de ${Number(account?.transactionWindowDays)||45} dias.`;
    }else{
      txNote.textContent=`${transactions.length} transação(ões) recentes disponíveis para conferência.`;
    }
    block.appendChild(txNote);

    if(transactions.length){
      const txList=document.createElement('div');txList.className='list';txList.style.marginTop='6px';
      transactions.slice(0,6).forEach(transaction=>appendTransaction(txList,account,transaction,suggestion,staging));
      if(transactions.length>6){
        const more=document.createElement('div');more.className='note';
        more.textContent=`+ ${transactions.length-6} transação(ões) recebidas. Todas entram na análise, mesmo que a tela mostre só as primeiras.`;
        txList.appendChild(more);
      }
      block.appendChild(txList);
    }
    container.appendChild(block);
  }

  function renderPreview(result){
    const root=$('openFinancePreview');
    if(!root)return;
    root.replaceChildren();

    const items=Array.isArray(result?.items)?result.items:[];
    if(!items.length){
      const empty=document.createElement('div');empty.className='note';
      empty.textContent='A aplicação autenticou, mas nenhum Item foi retornado para estas credenciais.';
      root.appendChild(empty);return;
    }

    const staging={existing:0,candidates:0,review:0,pending:0,transactionErrors:0,partialAccounts:0};
    let accountCount=0;
    let transactionCount=0;

    for(const item of items){
      const accounts=Array.isArray(item?.accounts)?item.accounts:[];
      accountCount+=accounts.length;
      transactionCount+=accounts.reduce((sum,account)=>sum+(Array.isArray(account?.transactions)?account.transactions.length:0),0);
      const name=itemDisplayName(item);

      const section=document.createElement('div');section.style.marginTop='12px';
      const heading=document.createElement('div');heading.className='head';heading.style.marginBottom='8px';
      const headingText=document.createElement('div');
      const title=document.createElement('h2');title.textContent=name;
      const subtitle=document.createElement('p');
      subtitle.textContent=`${cleanText(item?.connectorName)||'MeuPluggy'} • ${cleanText(item?.status)||'status não informado'} • ${accounts.length} conta(s)`;
      headingText.append(title,subtitle);heading.appendChild(headingText);section.appendChild(heading);

      const list=document.createElement('div');list.className='list';
      if(accounts.length)accounts.forEach(account=>appendAccount(list,account,name,staging));
      else{
        const empty=document.createElement('div');empty.className='note';
        empty.textContent=item?.accountsError?'O Item foi encontrado, mas as contas não puderam ser consultadas agora.':'Nenhuma conta retornada para este Item.';
        list.appendChild(empty);
      }
      section.appendChild(list);root.appendChild(section);
    }

    const summary=document.createElement('div');summary.className='note';summary.style.marginTop='12px';
    summary.textContent=`Consulta concluída: ${items.length} Item(s), ${accountCount} conta(s)/cartão(ões) e ${transactionCount} transação(ões) recentes.`;
    root.prepend(summary);

    const stagingBox=document.createElement('div');stagingBox.className='note';stagingBox.style.marginTop='8px';
    stagingBox.id='openFinanceStagingSummary';
    stagingBox.textContent=`Análise: ${staging.existing} já existente(s) ou conciliável(is) • ${staging.candidates} novo(s) candidato(s) • ${staging.review} crédito(s)/pagamento(s) para revisar • ${staging.pending} pendente(s) aguardando confirmação${staging.partialAccounts?` • ${staging.partialAccounts} conta(s) com leitura parcial`:''}${staging.transactionErrors?` • ${staging.transactionErrors} conta(s) com falha`:''}.`;
    summary.insertAdjacentElement('afterend',stagingBox);
  }

  function inferCategory(description){
    const d=normalize(description);
    if(/uber|99 |taxi|posto|combustivel|metro|onibus/.test(d))return'Transporte';
    if(/ifood|restaurante|lanch|padaria|mercado|supermercado|aliment/.test(d))return'Alimentação';
    if(/netflix|spotify|prime|disney|max |youtube|assinatura|subscription/.test(d))return'Assinaturas';
    if(/farmacia|drogaria|hospital|clinica|medic/.test(d))return'Saúde';
    if(/faculdade|universidade|curso|escola|livraria/.test(d))return'Educação';
    return'Outros';
  }

  function buildPurchase(account,item,card,transaction){
    const key=externalTransactionKey(transaction);
    const date=dateOnly(transaction?.date);
    const currentMonth=invoiceMonthForCard(card,date);
    const meta=transaction?.installment||{};
    const installmentNumber=Math.max(0,Number(meta.installmentNumber)||0);
    const totalInstallments=Math.max(1,Number(meta.totalInstallments)||1);
    const providerTotal=Math.abs(Number(meta.totalAmount));
    const charge=Math.abs(Number(transaction?.amount));
    const reconstructInstallment=totalInstallments>1&&installmentNumber>0&&Number.isFinite(providerTotal)&&providerTotal>0;
    const installments=reconstructInstallment?totalInstallments:1;
    const total=reconstructInstallment?providerTotal:charge;
    const firstMonth=reconstructInstallment?monthShift(currentMonth,-(installmentNumber-1)):currentMonth;
    const noteBits=['Importado automaticamente pelo Open Finance (Pluggy).'];
    if(reconstructInstallment)noteBits.push(`Parcela observada ${installmentNumber}/${totalInstallments}; total informado pela instituição ${money(providerTotal,transaction?.currencyCode||account?.currencyCode)}.`);
    else if(totalInstallments>1)noteBits.push(`Parcela ${installmentNumber||'?'} / ${totalInstallments}; total original não foi informado, então somente a cobrança atual foi registrada.`);
    return{
      id:typeof global.uid==='function'?global.uid():Date.now()+Math.floor(Math.random()*1000),
      cardId:card.id,
      desc:cleanText(transaction?.description)||'Compra Open Finance',
      total,
      installments,
      purchaseDate:date,
      firstMonth,
      category:inferCategory(transaction?.description),
      status:'active',
      note:noteBits.join(' '),
      tags:['open-finance','pluggy'],
      refunds:[],
      externalId:key,
      openFinanceExternalIds:key?[key]:[],
      openFinanceProvider:'pluggy',
      openFinanceAccountId:cleanText(account?.id),
      openFinanceItemId:cleanText(item?.id),
      openFinanceStatus:cleanText(transaction?.status),
      openFinanceSyncedAt:new Date().toISOString(),
      openFinanceInstallment:meta&&typeof meta==='object'?{...meta}:null
    };
  }

  function linkExistingPurchase(purchase,account,item,transaction){
    const key=externalTransactionKey(transaction);if(!purchase||!key)return false;
    const ids=Array.isArray(purchase.openFinanceExternalIds)?purchase.openFinanceExternalIds.slice():[];
    if(ids.includes(key)||cleanText(purchase.externalId)===key)return false;
    ids.push(key);
    purchase.openFinanceExternalIds=ids;
    purchase.openFinanceProvider='pluggy';
    purchase.openFinanceAccountId=cleanText(account?.id);
    purchase.openFinanceItemId=cleanText(item?.id);
    purchase.openFinanceLastLinkedAt=new Date().toISOString();
    return true;
  }

  function planInvoiceSync(result){
    const plan={create:[],link:[],newCount:0,linkedCount:0,already:0,review:0,pending:0,unmapped:0,partial:0,errors:0,creditAccounts:0};
    for(const item of Array.isArray(result?.items)?result.items:[]){
      const itemName=itemDisplayName(item);
      for(const account of Array.isArray(item?.accounts)?item.accounts:[]){
        if(account?.type!=='CREDIT')continue;
        plan.creditAccounts++;
        const suggestion=suggestSfpEntity(account,itemName);
        if(!suggestion){plan.unmapped++;continue;}
        if(account?.transactionsError){plan.errors++;continue;}
        if(account?.transactionPreviewHasMore){plan.partial++;continue;}
        for(const transaction of Array.isArray(account?.transactions)?account.transactions:[]){
          const amount=Number(transaction?.amount);
          if(!Number.isFinite(amount)||amount===0){plan.review++;continue;}
          if(cleanText(transaction?.status).toUpperCase().includes('PENDING')){plan.pending++;continue;}
          if(transactionKind(account,transaction)!=='expense'||amount<0){plan.review++;continue;}
          const match=likelyExisting(account,transaction,suggestion);
          if(match?.record){
            const key=externalTransactionKey(transaction);
            if(key&&purchaseHasExternalKey(match.record,key))plan.already++;
            else plan.link.push({purchase:match.record,account,item,transaction});
            continue;
          }
          plan.create.push(buildPurchase(account,item,suggestion.entity,transaction));
        }
      }
    }
    return plan;
  }

  function cloneState(value){
    try{return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
    catch(_){return JSON.parse(JSON.stringify(value));}
  }

  async function applyInvoiceSync(result){
    if(!global.state||!Array.isArray(global.state.purchases))throw new Error('Estado financeiro do SFP indisponível.');
    const plan=planInvoiceSync(result);
    if(plan.partial>0){
      const error=new Error(`A Pluggy informou leitura parcial em ${plan.partial} cartão(ões). Nenhuma fatura foi alterada para evitar total incompleto.`);
      error.code='PARTIAL_TRANSACTION_WINDOW';error.plan=plan;throw error;
    }
    const before=cloneState(global.state);
    try{
      for(const link of plan.link)if(linkExistingPurchase(link.purchase,link.account,link.item,link.transaction))plan.linkedCount++;
      for(const purchase of plan.create){global.state.purchases.push(purchase);plan.newCount++;}
      if(plan.newCount||plan.linkedCount){
        if(typeof global.save!=='function')throw new Error('Persistência do SFP indisponível.');
        await global.save('Sincronizar faturas Open Finance');
      }else if(typeof global.renderAll==='function')global.renderAll();
      return plan;
    }catch(error){
      try{global.state=before;if(typeof global.renderAll==='function')global.renderAll();}catch(_){}
      throw error;
    }
  }

  function refreshStatus(){
    const bridge=getBridge();
    const form=$('openFinanceCredentialsForm');
    const preview=$('openFinancePreviewBtn');
    const sync=$('openFinanceSyncBtn');
    const clear=$('openFinanceClearBtn');
    if(!bridge){
      if(form)form.classList.add('hidden');
      if(preview)preview.classList.add('hidden');
      if(sync)sync.classList.add('hidden');
      if(clear)clear.classList.add('hidden');
      setStatus('warning','Disponível no aplicativo Android','A integração Open Finance usa o cofre nativo do Android e não fica disponível na versão web de QA.');
      return{ok:false,configured:false,native:false};
    }

    let status;
    try{status=parseBridge(bridge.getCredentialStatus());}catch(_){status={ok:false,configured:false};}
    const configured=Boolean(status?.ok&&status?.configured);
    if(form)form.classList.remove('hidden');
    if(preview)preview.classList.toggle('hidden',!configured);
    if(sync)sync.classList.toggle('hidden',!configured);
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
    if(!clientIdValue||!secretValue){
      setStatus('error','Credenciais incompletas','Preencha Client ID e Client Secret.');return{ok:false};
    }

    let result;
    try{result=parseBridge(bridge.saveCredentials(clientIdValue,secretValue));}
    catch(_){result={ok:false,message:'Não foi possível acessar o cofre nativo.'};}
    clientId.value='';secret.value='';
    if(result.ok){
      refreshStatus();notify('Credenciais Open Finance protegidas no aparelho.','success');
    }else{
      setStatus('error','Não foi possível salvar',result.message||'O Android Keystore recusou a gravação.');
      notify(result.message||'Falha ao salvar credenciais.','error');
    }
    return result;
  }

  function readPreview(){
    const bridge=getBridge();if(!bridge)return{ok:false,message:'Bridge nativa indisponível.'};
    let result;
    try{result=parseBridge(bridge.previewData());}
    catch(_){result={ok:false,message:'Falha ao chamar a integração nativa.'};}
    if(result.ok)lastPreview=result;
    return result;
  }

  function preview(){
    const bridge=getBridge();
    if(!bridge){refreshStatus();return{ok:false};}
    setBusy(true);
    setStatus('warning','Consultando Open Finance','Lendo Items, contas e transações recentes. Esta consulta ainda não altera suas faturas.');
    const result=readPreview();
    setBusy(false);
    if(result.ok){
      renderPreview(result);
      setStatus('success','Conexão com Meu Pluggy confirmada',`${result.itemCount??(result.items||[]).length} Item(s) • ${result.accountCount??0} conta(s)/cartão(ões) • ${result.transactionPreviewCount??0} transação(ões) recebidas.`);
      notify('Dados Open Finance consultados.','success');
    }else{
      setStatus('error','Não foi possível consultar o Meu Pluggy',result.message||'Confira a conexão e tente novamente.');
      notify(result.message||'Falha ao consultar Meu Pluggy.','error');
    }
    return result;
  }

  async function syncInvoices(){
    const bridge=getBridge();
    if(!bridge){refreshStatus();return{ok:false};}
    setBusy(true);
    setStatus('warning','Atualizando faturas','Buscando as transações mais recentes e conciliando com o que já existe no SFP…');
    const result=readPreview();
    if(!result.ok){
      setBusy(false);
      setStatus('error','Não foi possível consultar o Meu Pluggy',result.message||'Confira a conexão e tente novamente.');
      notify(result.message||'Falha ao consultar Meu Pluggy.','error');
      return result;
    }
    renderPreview(result);
    try{
      const plan=await applyInvoiceSync(result);
      const detail=[`${plan.newCount} compra(s) nova(s)`,`${plan.linkedCount} conciliada(s)`,`${plan.already} já sincronizada(s)`];
      if(plan.unmapped)detail.push(`${plan.unmapped} cartão(ões) sem vínculo seguro`);
      if(plan.pending)detail.push(`${plan.pending} pendente(s) aguardando confirmação`);
      if(plan.review)detail.push(`${plan.review} crédito(s)/pagamento(s) não importado(s)`);
      setStatus('success','Faturas atualizadas pelo Open Finance',detail.join(' • '));
      notify(plan.newCount?`${plan.newCount} compra(s) adicionada(s) às faturas.`:'Nenhuma compra nova para adicionar.','success');
      return{ok:true,plan};
    }catch(error){
      const message=error?.message||'A sincronização foi cancelada antes de alterar as faturas.';
      setStatus('error','Faturas não foram alteradas',message);
      notify(message,'error');
      return{ok:false,code:error?.code||'SYNC_FAILED',message,plan:error?.plan};
    }finally{setBusy(false);}
  }

  function clearCredentials(){
    const bridge=getBridge();if(!bridge)return false;
    if(typeof global.confirm==='function'&&!global.confirm('Remover as credenciais do Meu Pluggy deste aparelho?'))return false;
    let ok=false;try{ok=Boolean(bridge.clearCredentials());}catch(_){}
    lastPreview=null;
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
      <div class="head"><div><h2>Open Finance pessoal</h2><p>Meu Pluggy • Conector 200 • consulta e atualização de faturas</p></div><span class="badge">Sincronização ativa</span></div>
      <div id="openFinanceStatus" class="alert"></div>
      <form id="openFinanceCredentialsForm" autocomplete="off" style="margin-top:12px">
        <div class="two">
          <label>Client ID<input id="openFinanceClientId" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></label>
          <label>Client Secret<input id="openFinanceClientSecret" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="••••••••••••••••"/></label>
        </div>
        <div id="openFinanceCredentialHint" class="note"></div>
        <button class="btn wide" id="openFinanceSaveBtn" type="submit" style="margin-top:10px">Salvar com segurança</button>
      </form>
      <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px">
        <button class="btn wide hidden" id="openFinanceSyncBtn" type="button">Atualizar faturas agora</button>
        <button class="btn2 wide hidden" id="openFinancePreviewBtn" type="button">Consultar sem alterar</button>
        <button class="ghost wide hidden" id="openFinanceClearBtn" type="button">Remover credenciais</button>
      </div>
      <div id="openFinancePreview" style="margin-top:12px"></div>
      <div class="note" style="margin-top:12px">A atualização importa somente compras confirmadas de cartões vinculados com segurança ao SFP. Compras já cadastradas são conciliadas em vez de duplicadas; pagamentos, créditos e transações pendentes ficam fora da importação automática. Se a Pluggy devolver uma leitura parcial, o SFP cancela o lote inteiro para não salvar uma fatura incompleta.</div>`;
    config.appendChild(panel);

    $('openFinanceCredentialsForm').addEventListener('submit',event=>{event.preventDefault();saveCredentials();});
    $('openFinancePreviewBtn').addEventListener('click',preview);
    $('openFinanceSyncBtn').addEventListener('click',syncInvoices);
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
    syncInvoices,
    saveCredentials,
    clearCredentials,
    cleanText,
    suggestSfpEntity,
    likelyExisting,
    planInvoiceSync,
    invoiceMonthForCard,
    externalTransactionKey
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);