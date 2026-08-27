import fs from 'node:fs';

const path = 'app/src/main/assets/www/index.html';
let source = fs.readFileSync(path, 'utf8');

function replaceExact(from, to, label) {
  if (!source.includes(from)) throw new Error(`Não encontrei trecho: ${label}`);
  source = source.replace(from, to);
}

function replaceBetween(startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Não encontrei início de ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Não encontrei fim de ${label}`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

const code = value => value.replaceAll('__BT__', '`').replaceAll('__EXPR__', '${');

replaceExact('<span>Conta</span></button>', '<span>Conta a pagar</span></button>', 'rótulo Conta');
replaceExact('<div class="form-section__header"><div><h3 class="form-section__title" id="txEssentialTitle">Essencial</h3><p class="form-section__description">O que você está registrando e quanto.</p></div></div>', '<div class="form-section__header"><div><h3 class="form-section__title" id="txEssentialTitle">Essencial</h3><p class="form-section__description" id="txEssentialDescription">O que você está registrando e quanto.</p></div></div>', 'descrição Essencial');
replaceExact('<label>Descrição<input id="txDesc" required autocomplete="off" placeholder="Ex.: Mercado, salário, faculdade"/></label>', '<label><span id="txDescLabel">Descrição do gasto</span><input id="txDesc" required autocomplete="off" placeholder="Ex.: Mercado, farmácia, transporte"/></label>', 'campo descrição');
replaceExact('<div class="form-section__header"><div><h3 class="form-section__title" id="txWhenTitle">Quando</h3><p class="form-section__description">A data usada por este lançamento.</p></div></div>', '<div class="form-section__header"><div><h3 class="form-section__title" id="txWhenTitle">Quando</h3><p class="form-section__description" id="txWhenDescription">A data usada por este lançamento.</p></div></div>', 'descrição Quando');
replaceExact('<label>Data<input id="txDate" type="date" required/></label>', '<label><span id="txDateLabel">Data do pagamento</span><input id="txDate" type="date" required/></label>', 'campo data');
replaceExact('<div class="form-section__header"><div><h3 class="form-section__title" id="txSourceTitle">Origem / destino</h3><p class="form-section__description">De onde o dinheiro entra, sai ou é transferido.</p></div></div>', '<div class="form-section__header"><div><h3 class="form-section__title" id="txSourceTitle">Origem / destino</h3><p class="form-section__description" id="txSourceDescription">De onde o dinheiro entra, sai ou é transferido.</p></div></div>', 'descrição Origem');
replaceExact('<label>Conta<select id="txAccount"></select><small class="field-help">Conta vinculada à movimentação.</small></label>', '<label id="txAccountField"><span id="txAccountLabel">Conta de pagamento</span><select id="txAccount"></select><small class="field-help" id="txAccountHelp">Conta usada para esta movimentação.</small></label>', 'campo conta');
replaceExact('<div class="form-section__header"><div><h3 class="form-section__title" id="txClassTitle">Classificação</h3><p class="form-section__description">Ajuda a entender para onde vai seu dinheiro.</p></div></div>', '<div class="form-section__header"><div><h3 class="form-section__title" id="txClassTitle">Classificação</h3><p class="form-section__description" id="txClassDescription">Ajuda a entender para onde vai seu dinheiro.</p></div></div>', 'descrição classificação');
replaceExact('<label class="check"><input id="txRecurring" type="checkbox"/> Criar regra recorrente mensal a partir deste lançamento</label>', '<label class="check" id="txRecurringField"><input id="txRecurring" type="checkbox"/> Criar regra recorrente mensal a partir deste lançamento</label>', 'recorrência genérica');

replaceBetween(
  'function setTxFormMode(editing=false)',
  '\nfunction moveToTrash(type,item)',
  `const TX_KIND_COPY={
 expense:{subtitle:'Registre um gasto que saiu da sua conta.',essential:'O que você pagou e quanto.',descLabel:'Descrição do gasto',placeholder:'Ex.: Mercado, farmácia, transporte',when:'Quando o pagamento aconteceu.',dateLabel:'Data do pagamento',source:'Escolha a conta de onde o dinheiro saiu.',accountLabel:'Conta de pagamento',accountHelp:'Conta debitada por este gasto.',classification:'Classifique o gasto para entender para onde foi seu dinheiro.'},
 bill:{subtitle:'Cadastre uma conta a pagar e acompanhe vencimento e status.',essential:'Qual compromisso você precisa pagar e quanto.',descLabel:'Conta / compromisso',placeholder:'Ex.: Faculdade, internet, aluguel',when:'Informe a referência, o vencimento e o status da conta.',dateLabel:'Data de referência',source:'Escolha a conta usada ou prevista para o pagamento.',accountLabel:'Conta de pagamento',accountHelp:'Conta usada ou prevista para pagar esta conta.',classification:'Classifique a conta para organizar seus compromissos.'},
 card:{subtitle:'Adicione uma compra diretamente à fatura do cartão.',essential:'O que você comprou e qual foi o valor total.',descLabel:'Descrição da compra',placeholder:'Ex.: Mercado, celular, assinatura',when:'Informe a data em que a compra foi feita.',dateLabel:'Data da compra',source:'Escolha o cartão, as parcelas e a primeira fatura.',accountLabel:'Conta',accountHelp:'',classification:'Classifique a compra para entender a composição das faturas.'},
 income:{subtitle:'Registre um dinheiro que entrou ou ainda vai entrar.',essential:'De onde veio a receita e quanto você vai receber.',descLabel:'Origem da receita',placeholder:'Ex.: Salário, freela, reembolso',when:'Informe a data do recebimento ou da previsão.',dateLabel:'Data do recebimento',source:'Escolha a conta que recebe este dinheiro.',accountLabel:'Conta de recebimento',accountHelp:'Conta em que a receita entra.',classification:'Classifique a receita para entender de onde vem seu dinheiro.'},
 transfer:{subtitle:'Mova dinheiro entre duas contas sem criar receita ou despesa.',essential:'Identifique a transferência e o valor movimentado.',descLabel:'Descrição da transferência',placeholder:'Ex.: Reserva do mês, aporte, ajuste entre contas',when:'Informe a data da movimentação entre contas.',dateLabel:'Data da transferência',source:'Escolha contas diferentes para origem e destino.',accountLabel:'Conta',accountHelp:'',classification:''}
};
function applyTxKindCopy(){
 const copy=TX_KIND_COPY[currentKind]||TX_KIND_COPY.expense;
 $('txFormSubtitle').textContent=copy.subtitle;$('txEssentialDescription').textContent=copy.essential;$('txDescLabel').textContent=copy.descLabel;$('txDesc').placeholder=copy.placeholder;$('txWhenDescription').textContent=copy.when;$('txDateLabel').textContent=copy.dateLabel;$('txSourceDescription').textContent=copy.source;$('txAccountLabel').textContent=copy.accountLabel;$('txAccountHelp').textContent=copy.accountHelp;$('txClassDescription').textContent=copy.classification;
}
function setTxFormMode(editing=false){$('txFormTitle').textContent=editing?'Editar lançamento':'Novo lançamento';$('txModeBadge').textContent=editing?'Editando':'Criando';$('txCancelEdit').classList.toggle('hidden',!editing);document.querySelectorAll('.quicktype').forEach(b=>{b.disabled=editing&&b.dataset.kind!==currentKind});applyTxKindCopy()}
function setKind(k){
 if(!TX_KIND_COPY[k])return;currentKind=k;document.querySelectorAll('.quicktype').forEach(b=>{let active=b.dataset.kind===k;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 $('normalFields').classList.toggle('hidden',k==='transfer');$('transferFields').classList.toggle('hidden',k!=='transfer');$('billFields').classList.toggle('hidden',k!=='bill');$('cardFields').classList.toggle('hidden',k!=='card');$('incomeFields').classList.toggle('hidden',k!=='income');$('txClassificationSection').classList.toggle('hidden',k==='transfer');$('txStatusSection').classList.toggle('hidden',k!=='income');$('txAccountField').classList.toggle('hidden',k==='card');$('txRecurringField').classList.toggle('hidden',['card','transfer','income'].includes(k));$('txSubmit').textContent={expense:'Registrar gasto',bill:'Adicionar conta a pagar',card:'Adicionar compra',income:'Adicionar receita',transfer:'Transferir'}[k];applyTxKindCopy()
}
`,
  'modo/contexto de lançamento'
);

replaceBetween(
  'function renderTx(){',
  '\nfunction renderCreditFacilities(){',
  code(`function transactionEntryType(t){
 if(!t)return 'expense';if(['expense','bill','income'].includes(t.entryType))return t.entryType;if(t.kind==='income')return 'income';if(t.kind==='expense'){let dateDay=+String(t.date||'').slice(8,10),dueDay=+t.dueDay;if(t.status==='pending'||t.status==='planned'||(dueDay&&dateDay&&dueDay!==dateDay))return 'bill'}return 'expense'
}
window.transactionEntryType=transactionEntryType;
function transactionTypeLabel(t){if(t.kind==='transfer')return 'Transferência';let entry=transactionEntryType(t);return entry==='bill'?'Conta a pagar':entry==='income'?'Receita':'Gasto'}
function renderTx(){
 let q=$('txSearch').value.toLowerCase(),f=$('txFilter').value,arr=txInMonth().filter(t=>(f==='all'||t.kind===f||(f==='expense'&&t.kind==='expense'))&&(!q||__BT____EXPR__t.desc} __EXPR__t.category} __EXPR__(t.tags||[]).join(' ')}__BT__.toLowerCase().includes(q)));
 let transfers=state.transfers.filter(t=>ym(t.date)===state.mesAtual).map(t=>({...t,kind:'transfer',accountId:t.fromId,status:'paid'}));if(f==='all'||f==='transfer')arr=[...arr,...transfers];arr.sort((a,b)=>b.date.localeCompare(a.date));
 $('txTable').innerHTML=arr.map(t=>{let transfer=t.kind==='transfer',editAction=transfer?__BT__editTransfer(__EXPR__t.id})__BT__:__BT__editTx(__EXPR__t.id})__BT__,deleteAction=transfer?__BT__trashTransfer(__EXPR__t.id})__BT__:__BT__trashTx(__EXPR__t.id})__BT__,accountText=transfer?__BT____EXPR__account(t.fromId)?.name||'—'} → __EXPR__account(t.toId)?.name||'—'}__BT__:(account(t.accountId)?.name||'—');return __BT__<tr><td data-label="Data">__EXPR__dateObj(t.date).toLocaleDateString('pt-BR')}</td><td data-label="Descrição"><b>__EXPR__t.desc}</b>__EXPR__originChip(t)}<br><small>__EXPR__t.category||''}</small></td><td data-label="Tipo">__EXPR__transactionTypeLabel(t)}</td><td data-label="Conta">__EXPR__accountText}</td><td data-label="Valor" class="__EXPR__t.kind==='income'?'positive':transfer?'blue':'negative'}">__EXPR__t.kind==='income'?'+ ':t.kind==='expense'?'- ':''}__EXPR__brl(t.amount)}</td><td data-label="Status">__EXPR__transfer?'—':__BT__<button class="status __EXPR__t.status==='paid'?'ok':t.status==='pending'?'wait':''}" onclick="toggleTx(__EXPR__t.id})">__EXPR__statusLabel(t.status)}</button>__BT__}</td><td data-label="Ações"><button class="btn2 tiny" onclick="__EXPR__editAction}">Editar</button> <button class="danger tiny" onclick="__EXPR__deleteAction}">Excluir</button></td></tr>__BT__}).join('')||'<tr class="table-empty-row"><td colspan="7"><div class="empty-state"><b>Nenhuma movimentação neste mês</b>Adicione seu primeiro lançamento para começar a montar o fluxo financeiro.<br><button class="btn tiny" data-go="lancamentos">Adicionar lançamento</button></div></td></tr>'
}
`),
  'renderTx'
);

replaceBetween(
  'window.toggleTx=async id=>',
  'window.editAccount=',
  `window.toggleTx=async id=>{let t=state.transactions.find(x=>x.id===id);if(t){t.status=t.status==='paid'?'pending':'paid';t.balanceImpact=t.status==='paid'&&t.date>state.baseDate;await save('Alterar status do lançamento')}}
window.trashTx=async id=>{let i=state.transactions.findIndex(x=>x.id===id);if(i>=0){moveToTrash('transaction',state.transactions[i]);state.transactions.splice(i,1);await save('Excluir lançamento');toast('Movido para a lixeira')}}
window.trashTransfer=async id=>{let i=state.transfers.findIndex(x=>x.id===id);if(i>=0){moveToTrash('transfer',state.transfers[i]);state.transfers.splice(i,1);await save('Excluir transferência');toast('Transferência movida para a lixeira')}}
window.editTx=id=>{let t=state.transactions.find(x=>x.id===id);if(!t)return;let formKind=transactionEntryType(t);setPage('lancamentos');setKind(formKind);$('txEditId').value=t.id;$('txDesc').value=t.desc;$('txAmount').value=t.amount;$('txDate').value=t.date;$('txCategory').value=t.category||'Outros';$('txAccount').value=t.accountId||'';if(formKind==='bill'){$('txDueDay').value=t.dueDay||+String(t.date||'').slice(8,10);$('txStatus').value=['pending','paid','planned'].includes(t.status)?t.status:'pending'}if(formKind==='income')$('txIncomeStatus').value=t.status==='pending'?'pending':'paid';$('txNote').value=t.note||'';$('txTags').value=(t.tags||[]).join(', ');$('txMoreDetails').open=!!(t.note||(t.tags||[]).length);setTxFormMode(true);$('txFormTitle').scrollIntoView({block:'start'})}
window.editTransfer=id=>{let t=state.transfers.find(x=>x.id===id);if(!t)return;setPage('lancamentos');setKind('transfer');$('txEditId').value=t.id;$('txDesc').value=t.desc||'Transferência';$('txAmount').value=t.amount;$('txDate').value=t.date;$('txFrom').value=t.fromId;$('txTo').value=t.toId;$('txNote').value=t.note||'';$('txTags').value=(t.tags||[]).join(', ');$('txMoreDetails').open=!!(t.note||(t.tags||[]).length);setTxFormMode(true);$('txFormTitle').scrollIntoView({block:'start'})}
window.editAccount=`,
  'ações de lançamento/transferência'
);

replaceBetween(
  " $('txForm').onsubmit=async e=>",
  " $('accountForm').onsubmit=async e=>",
  code(` $('txForm').onsubmit=async e=>{
  e.preventDefault();let id=+$('txEditId').value,amount=+$('txAmount').value,date=$('txDate').value,desc=$('txDesc').value.trim(),note=$('txNote').value,tags=$('txTags').value.split(',').map(x=>x.trim()).filter(Boolean);
  if(!desc)return toast('Informe uma descrição.','warning');if(!requirePositiveAmount(amount,'O valor do lançamento'))return;
  if(currentKind==='transfer'){let from=+$('txFrom').value,to=+$('txTo').value,old=id?state.transfers.find(t=>t.id===id):null;if(id&&!old)return toast('A transferência em edição não foi encontrada.','error');if(from===to)return toast('Origem e destino precisam ser diferentes.','warning');let err=validateMoneyAction({amount,accountId:from,allowNegative:true,label:'transferência'});if(err)return toast(err,'warning');if(accountBalance(from)<amount&&!(await sfpConfirm({title:'Saldo Negativo',message:__BT__Esta transferência deixará a conta "__EXPR__account(from)?.name||'de origem'}" com saldo negativo (__EXPR__brl(accountBalance(from)-amount)}).\n\nDeseja continuar?__BT__,confirmText:'Continuar',cancelText:'Cancelar',danger:true})))return;let obj={...(old||{}),id:id||uid(),desc,amount,date,fromId:from,toId:to,tags,note,balanceImpact:true};if(old)state.transfers=state.transfers.map(t=>t.id===id?obj:t);else state.transfers.push(obj);await save(old?'Editar transferência':'Nova transferência')}
  else if(currentKind==='card'){if(id)return toast('Para mudar o tipo de um lançamento, finalize ou cancele a edição atual.','warning');let cd=card($('txCard').value),first=ym(date),day=+date.slice(8,10),mode=$('txFirstBill').value;if(mode==='auto'&&cd&&day>cd.closeDay)first=monthAdd(first,1);if(mode==='next')first=monthAdd(first,1);state.purchases.push({id:uid(),cardId:+$('txCard').value,desc,total:amount,installments:+$('txInstallments').value||1,purchaseDate:date,firstMonth:first,category:$('txCategory').value,status:'active',note,tags});await save('Nova compra no cartão')}
  else{let old=id?state.transactions.find(t=>t.id===id):null;if(id&&!old)return toast('O lançamento em edição não foi encontrado.','error');let kind=currentKind==='income'?'income':'expense',status=currentKind==='income'?$('txIncomeStatus').value:(currentKind==='expense'?'paid':$('txStatus').value),dueDay=currentKind==='bill'?+$('txDueDay').value:+date.slice(8,10),obj={...(old||{}),id:id||uid(),kind,entryType:currentKind,desc,amount,date,category:$('txCategory').value,accountId:+$('txAccount').value,status,dueDay,note,tags,balanceImpact:status==='paid',createdAt:old?.createdAt||Date.now()};if(old)state.transactions=state.transactions.map(t=>t.id===id?obj:t);else state.transactions.push(obj);if($('txRecurring').checked||(currentKind==='income'&&$('txIncomeRecurring').value==='yes')){let rec={id:uid(),desc,type:kind,amount,day:dueDay,category:obj.category,accountId:obj.accountId,start:ym(date),end:'',active:true,skips:[]};if(isPayrollRecurring(rec)){rec.dateRule='business-day-before-anchor';rec.payrollAnchor=+rec.day||1}state.recurring.push(rec)};await save(old?'Editar lançamento':'Novo lançamento')}
  let effect=currentKind==='income'?__BT__Receita de __EXPR__brl(amount)} registrada.__BT__:currentKind==='transfer'?__BT__Transferência de __EXPR__brl(amount)} registrada.__BT__:currentKind==='card'?__BT__Compra de __EXPR__brl(amount)} adicionada ao cartão.__BT__:currentKind==='bill'?__BT__Conta de __EXPR__brl(amount)} registrada.__BT__:__BT__Gasto de __EXPR__brl(amount)} registrado.__BT__;resetTxForm();setPage('hoje',{mode:'replace'});showFeedback(__BT____EXPR__effect} Livre projetado agora: __EXPR__brl(allAccountBalance()-commitmentUntilNextIncome())}__BT__)
 };
`),
  'submit de lançamento'
);

fs.writeFileSync(path, source);
console.log('P1 de Lançamentos aplicado: semântica, contexto e ações de transferência.');
