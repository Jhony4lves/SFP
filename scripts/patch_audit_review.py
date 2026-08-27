from pathlib import Path
import re

path = Path('app/src/main/assets/www/index.html')
s = path.read_text(encoding='utf-8')


def one(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    s = s.replace(old, new, 1)

# 1) UI wording: invoice rows are debit/credit entries, not automatically economic purchases.
one(
    'O SFP identifica a convenção do arquivo, valida compra/pagamento e usa o Groq como segunda opinião quando disponível. Nada é salvo antes da sua confirmação.',
    'O SFP identifica a convenção do arquivo, valida débitos/créditos e usa o Groq como segunda opinião quando disponível. A finalidade econômica (gasto, transferência etc.) é separada do débito do cartão. Nada é salvo antes da sua confirmação.',
    'card import hint'
)

# Pix no Crédito is evidence of a card debit/sign convention, but not a strong economic "purchase" semantic.
one(
    "  if(/parcela\\s*\\d+\\s*\\/\\s*\\d+/.test(d)||/\\bpix no credito\\b/.test(d))return 'purchase';",
    "  if(/parcela\\s*\\d+\\s*\\/\\s*\\d+/.test(d))return 'purchase';",
    'invoice semantic strong pix'
)

one(
    "  const instruction='Classifique um arquivo financeiro brasileiro. Responda SOMENTE JSON com documentType (invoice|statement|unknown), confidence 0..1, signConvention (debitNegative|debitPositive|unknown), rows [{index,kind,confidence}] onde kind é purchase|payment|unknown, e warnings []. Não altere data nem valor. Pagamento recebido/estorno/reembolso é crédito/pagamento; compra parcelada e Pix no Crédito são compras. Em fatura OFX, sinais podem ser o oposto de CSV.';",
    "  const instruction='Classifique um arquivo financeiro brasileiro. Responda SOMENTE JSON com documentType (invoice|statement|unknown), confidence 0..1, signConvention (debitNegative|debitPositive|unknown), rows [{index,kind,confidence}] onde kind é purchase|payment|unknown, e warnings []. Não altere data nem valor. Aqui purchase significa somente débito/encargo na fatura, não prova de despesa econômica. Pagamento recebido/estorno/reembolso é crédito/pagamento. Compra parcelada é débito da fatura. Pix no Crédito é débito do cartão, mas sua finalidade econômica pode ser gasto, transferência ou outra movimentação e pode exigir revisão. Em fatura OFX, sinais podem ser o oposto de CSV.';",
    'groq import instruction'
)

# 2) Clear labels in invoice preview.
old_render = """function renderCardImportDraft(){
  let draft=cardImportDraft;if(!draft)return;let fresh=draft.rows.filter(r=>!r.duplicate),purchases=fresh.filter(r=>r.kind==='purchase').length,payments=fresh.filter(r=>r.kind==='payment').length,duplicates=draft.rows.length-fresh.length;
  $('cardImportReview').classList.remove('hidden');$('cardImportSummary').textContent=`${draft.rows.length} linha(s) lida(s): ${purchases} compra(s), ${payments} pagamento(s) e ${duplicates} já importada(s)${draft.invalid?` e ${draft.invalid} linha(s) inválida(s) ignorada(s)`:''}.`;
  let a=draft.analysis,validation=$('cardImportValidation');if(validation){let type=a?.documentType==='invoice'?'Fatura':a?.documentType==='statement'?'Extrato':'Tipo incerto',pct=Math.round((a?.confidence||0)*100),sign=a?.signConvention==='debitNegative'?'débitos negativos':a?.signConvention==='debitPositive'?'débitos positivos':'sinais ambíguos',engine=a?.validator==='local+groq'?'regras locais + Groq':'regras locais';validation.textContent=a?`Detectado: ${type} (${pct}%). Convenção: ${sign}. Validação: ${engine}.${a.warnings?.length?' '+a.warnings.join(' '):''}`:'Prévia validada pelas regras locais.';}
  const rowHtml=r=>`<tr><td>${dateObj(r.date).toLocaleDateString('pt-BR')}</td><td>${sfpEsc(r.desc)}</td><td class=\"${r.kind==='payment'?'positive':'negative'}\">${brl(r.kind==='payment'?r.amount:-r.amount)}</td><td>${r.kind==='payment'?`Pagamento/crédito da fatura ${monthName(r.targetMonth)}`:`Compra${r.installments>1?` • parcela ${r.installment}/${r.installments}`:''}`}</td><td>${r.duplicate?'Já importada':'Pronta para importar'}</td></tr>`;
  $('cardImportRows').innerHTML=draft.rows.map(rowHtml).join('');
  if($('cardImportMobile'))$('cardImportMobile').innerHTML=draft.rows.map(r=>`<div class=\"mobile-record\"><div class=\"mobile-record-head\"><div><b>${sfpEsc(r.desc)}</b><small>${dateObj(r.date).toLocaleDateString('pt-BR')} • ${r.kind==='payment'?`Pagamento/crédito ${monthName(r.targetMonth)}`:`Compra${r.installments>1?` • ${r.installment}/${r.installments}`:''}`}</small></div><strong class=\"${r.kind==='payment'?'positive':'negative'}\">${brl(r.kind==='payment'?r.amount:-r.amount)}</strong></div><small>${r.duplicate?'Já importada':'Pronta para importar'}</small></div>`).join('');
}"""
new_render = """function cardImportNatureLabel(r,{mobile=false}={}){
  if(r.kind==='payment')return `${mobile?'Pagamento/crédito':'Pagamento/crédito da fatura'} ${monthName(r.targetMonth)}`;
  const pix=/\\bpix no credito\\b/.test(normalizeImportSignalText(r.desc));
  const base=pix?'Pix no crédito • débito na fatura':'Débito na fatura';
  return `${base}${r.installments>1?` • parcela ${r.installment}/${r.installments}`:''}`;
}
function renderCardImportDraft(){
  let draft=cardImportDraft;if(!draft)return;let fresh=draft.rows.filter(r=>!r.duplicate),purchases=fresh.filter(r=>r.kind==='purchase').length,payments=fresh.filter(r=>r.kind==='payment').length,duplicates=draft.rows.length-fresh.length;
  $('cardImportReview').classList.remove('hidden');$('cardImportSummary').textContent=`${draft.rows.length} linha(s) lida(s): ${purchases} débito(s) de fatura, ${payments} pagamento(s)/crédito(s) e ${duplicates} já importada(s)${draft.invalid?` e ${draft.invalid} linha(s) inválida(s) ignorada(s)`:''}.`;
  let a=draft.analysis,validation=$('cardImportValidation');if(validation){let type=a?.documentType==='invoice'?'Fatura':a?.documentType==='statement'?'Extrato':'Tipo incerto',pct=Math.round((a?.confidence||0)*100),sign=a?.signConvention==='debitNegative'?'débitos negativos':a?.signConvention==='debitPositive'?'débitos positivos':'sinais ambíguos',engine=a?.validator==='local+groq'?'regras locais + Groq':'regras locais';validation.textContent=a?`Detectado: ${type} (${pct}%). Convenção: ${sign}. Validação: ${engine}.${a.warnings?.length?' '+a.warnings.join(' '):''}`:'Prévia validada pelas regras locais.';}
  const rowHtml=r=>`<tr><td>${dateObj(r.date).toLocaleDateString('pt-BR')}</td><td>${sfpEsc(r.desc)}</td><td class=\"${r.kind==='payment'?'positive':'negative'}\">${brl(r.kind==='payment'?r.amount:-r.amount)}</td><td>${sfpEsc(cardImportNatureLabel(r))}</td><td>${r.duplicate?'Já importada':'Pronta para importar'}</td></tr>`;
  $('cardImportRows').innerHTML=draft.rows.map(rowHtml).join('');
  if($('cardImportMobile'))$('cardImportMobile').innerHTML=draft.rows.map(r=>`<div class=\"mobile-record\"><div class=\"mobile-record-head\"><div><b>${sfpEsc(r.desc)}</b><small>${dateObj(r.date).toLocaleDateString('pt-BR')} • ${sfpEsc(cardImportNatureLabel(r,{mobile:true}))}</small></div><strong class=\"${r.kind==='payment'?'positive':'negative'}\">${brl(r.kind==='payment'?r.amount:-r.amount)}</strong></div><small>${r.duplicate?'Já importada':'Pronta para importar'}</small></div>`).join('');
}"""
one(old_render, new_render, 'render card import draft')

# 3) Imported card debits keep invoice obligation but also receive economic semantics for review.
old_confirm = """async function confirmCardImport(){
  let draft=cardImportDraft;if(!draft)return;let before=clone(state);try{
    let added=0,credits=0;for(let r of draft.rows){if(r.duplicate)continue;if(r.kind==='payment'){let inv=ensureInvoice(draft.cardId,r.targetMonth);if(cardPaymentDuplicate(inv,r))continue;inv.payments.push({date:r.date,amount:r.amount,balanceImpact:false,targetMonth:r.targetMonth,sourceDesc:r.desc});inv.paidAmount=Math.round(((inv.paidAmount||0)+r.amount)*100)/100;if(inv.officialTotal==null)inv.officialTotal=inv.paidAmount;credits++;continue}if(cardPurchaseDuplicate(draft.cardId,{...r,purchaseDate:r.date}))continue;state.purchases.push({id:uid(),cardId:draft.cardId,desc:r.desc,total:r.total,installments:r.installments,purchaseDate:r.date,firstMonth:r.firstMonth,category:'Outros',status:'active',note:'Importado de fatura.',tags:['fatura-importada'],refunds:[]});added++;}
    let inv=ensureInvoice(draft.cardId,draft.month);inv.officialTotal=invoiceCalculated(draft.cardId,draft.month);state.ui.invoiceMonthByCard[draft.cardId]=draft.month;await save('Importar fatura de cartão');cardImportDraft=null;$('cardImportReview').classList.add('hidden');toast(`${added} compras e ${credits} pagamentos importados.`,'success')
  }catch(e){state=before;lastSavedState=clone(before);renderAll();toast('Não foi possível importar a fatura. Nenhuma alteração foi aplicada.','error');console.error('Falha ao importar fatura:',e)}
}"""
new_confirm = """async function confirmCardImport(){
  let draft=cardImportDraft;if(!draft)return;let before=clone(state);try{
    let added=0,credits=0;for(let r of draft.rows){if(r.duplicate)continue;if(r.kind==='payment'){let inv=ensureInvoice(draft.cardId,r.targetMonth);if(cardPaymentDuplicate(inv,r))continue;inv.payments.push({date:r.date,amount:r.amount,balanceImpact:false,targetMonth:r.targetMonth,sourceDesc:r.desc});inv.paidAmount=Math.round(((inv.paidAmount||0)+r.amount)*100)/100;if(inv.officialTotal==null&&invoiceCalculated(draft.cardId,r.targetMonth)<=0)inv.historicalOnly=true;credits++;continue}if(cardPurchaseDuplicate(draft.cardId,{...r,purchaseDate:r.date}))continue;let sem=semanticClassify(r.desc,-Math.abs(r.total));state.purchases.push({id:uid(),cardId:draft.cardId,desc:r.desc,total:r.total,installments:r.installments,purchaseDate:r.date,firstMonth:r.firstMonth,category:sem.category||'Outros',status:'active',note:'Importado de fatura.',tags:['fatura-importada'],refunds:[],semanticClass:sem.semanticClass||'unclassified',economicImpact:sem.economicImpact||'review',classificationConfidence:sem.confidence||null,classificationReason:sem.reason||null});added++;}
    let inv=ensureInvoice(draft.cardId,draft.month);inv.officialTotal=invoiceCalculated(draft.cardId,draft.month);state.ui.invoiceMonthByCard[draft.cardId]=draft.month;await save('Importar fatura de cartão');cardImportDraft=null;$('cardImportReview').classList.add('hidden');toast(`${added} débitos de fatura e ${credits} pagamentos/créditos importados.`,'success')
  }catch(e){state=before;lastSavedState=clone(before);renderAll();toast('Não foi possível importar a fatura. Nenhuma alteração foi aplicada.','error');console.error('Falha ao importar fatura:',e)}
}"""
one(old_confirm, new_confirm, 'confirm card import')

# 4) Economic reports exclude only user-confirmed neutral card movements while invoice debt stays intact.
one(
    "function invoiceTotal(cardId,m){let i=invoiceStatus(cardId,m);return i.officialTotal!=null?+i.officialTotal:invoiceCalculated(cardId,m)}",
    "function invoiceTotal(cardId,m){let i=invoiceStatus(cardId,m);return i.officialTotal!=null?+i.officialTotal:invoiceCalculated(cardId,m)}\nfunction invoiceEconomicTotal(cardId,m){let rows=installments(m).filter(x=>x.card?.id==cardId);if(!rows.some(x=>x.purchase?.economicImpact==='neutral'))return invoiceTotal(cardId,m);let p=rows.filter(x=>x.purchase?.economicImpact!=='neutral').reduce((sum,x)=>sum+x.amount,0),a=invoiceAdjustments(cardId,m).reduce((sum,x)=>sum+x.amount,0);return Math.round((p+a)*100)/100}",
    'invoice economic total helper'
)
one(
    " let cardExp=state.cards.reduce((s,c)=>s+invoiceTotal(c.id,m),0);",
    " let cardExp=state.cards.reduce((s,c)=>s+invoiceEconomicTotal(c.id,m),0);",
    'month calc economic card expense'
)
one(
    "  installments(m).forEach(i=>{\n    items.push({",
    "  installments(m).forEach(i=>{\n    if(i.purchase?.economicImpact==='neutral')return;\n    items.push({",
    'accrual neutral card filter'
)
one(
    " installments(m).forEach(i=>map[i.purchase.category]=(map[i.purchase.category]||0)+i.amount);",
    " installments(m).filter(i=>i.purchase?.economicImpact!=='neutral').forEach(i=>map[i.purchase.category]=(map[i.purchase.category]||0)+i.amount);",
    'category spend neutral card filter'
)
one(
    "  installments(m)\n    .filter(i=>(i.purchase.category||'Outros')===cat)",
    "  installments(m)\n    .filter(i=>i.purchase?.economicImpact!=='neutral' && (i.purchase.category||'Outros')===cat)",
    'category detail neutral card filter'
)

# 5) Financial audit: identify entity kind and include imported card debits needing economic review.
one(
    "  const add=(level,type,text,item=null)=>issues.push({\n    level,type,text,\n    itemId:item?.id ?? null,\n    date:item?.date ?? null,\n    desc:item?.desc ?? null\n  });",
    "  const add=(level,type,text,item=null,itemKind='transaction')=>issues.push({\n    level,type,text,itemKind,\n    itemId:item?.id ?? null,\n    date:item?.date ?? item?.purchaseDate ?? null,\n    desc:item?.desc ?? null\n  });",
    'financial audit add entity kind'
)
one(
    "  return {\n    warnings:issues.filter(x=>x.level==='warning').length,\n    info:issues.filter(x=>x.level==='info').length,\n    issues\n  };\n}",
    "  for(const p of state.purchases||[]){\n    const desc=String(p.desc||'');\n    const impact=p.economicImpact||null;\n    if(impact==='review'){\n      add('warning','card-semantic-review',`Defina a finalidade econômica do débito de cartão: \\\"${desc}\\\". Ele continuará compondo a fatura; aqui você decide se é gasto real ou movimentação neutra.`,p,'purchase');\n      continue;\n    }\n    if(!impact&&/\\bpix no cr[eé]dito\\b/i.test(desc)){\n      add('warning','card-semantic-review',`Pix no Crédito precisa de contexto: \\\"${desc}\\\". Ser débito do cartão não significa automaticamente ser uma compra/despesa econômica.`,p,'purchase');\n    }\n  }\n\n  return {\n    warnings:issues.filter(x=>x.level==='warning').length,\n    info:issues.filter(x=>x.level==='info').length,\n    issues\n  };\n}",
    'financial audit purchase review'
)

# 6) Replace passive audit cards with an actionable review flow.
old_render_fin = """function renderFinancialAudit(){
  const box=$('financialAuditIssues');
  const count=$('financialAuditCount');
  if(!box||!count)return;

  const a=financialAuditData();
  const total=a.issues.length;

  count.textContent=total
    ? `${total} para revisar`
    : 'Tudo certo';

  count.className=total?'badge warning':'badge';

  if(!total){
    box.innerHTML='<div class=\"alert green\">Nenhuma movimentação financeira suspeita detectada.</div>';
    return;
  }

  box.innerHTML=a.issues.map(i=>{
    const cls=i.level==='warning'?'warning':'';
    const label=i.level==='warning'?'Revisar':'Informação';
    const meta=[
      i.date||'',
      i.type==='semantic-review'?'classificação incerta':
      i.type==='legacy-investment'?'movimentação patrimonial':
      i.type==='possible-transfer'?'possível transferência':
      i.type==='possible-card-payment'?'possível pagamento de fatura':
      i.type==='refund-review'?'estorno/reembolso':
      i.type==='semantic-incomplete'?'semântica incompleta':
      'revisão financeira'
    ].filter(Boolean).join(' • ');

    return `<div class=\"item\">
      <div>
        <b class=\"${cls}\">${label}</b>
        <small>${sfpEsc(i.text)}</small>
        <small>${sfpEsc(meta)}</small>
      </div>
    </div>`;
  }).join('');
}"""
new_render_fin = """function financialReviewEntity(kind,id){return kind==='purchase'?(state.purchases||[]).find(x=>x.id==id):(state.transactions||[]).find(x=>x.id==id)}
window.openFinancialReview=(kind,id)=>{
  const item=financialReviewEntity(kind,id);if(!item)return toast('Movimentação não encontrada.','warning');
  const isPurchase=kind==='purchase',root=$('modalRoot');root.className='modalback';
  const currentCategory=item.category||'Outros';
  const options=isPurchase
    ? `<option value=\"expense\">Gasto/compra real</option><option value=\"transfer\">Transferência ou movimentação patrimonial</option>`
    : `<option value=\"expense\">Despesa real</option><option value=\"income\">Receita real</option><option value=\"transfer\">Transferência entre contas / movimentação patrimonial</option><option value=\"card-payment\">Pagamento de fatura</option><option value=\"neutral\">Outro movimento neutro</option>`;
  root.innerHTML=`<div class=\"modal\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Revisar classificação financeira\"><div class=\"head\"><div><h2>Revisar classificação</h2><p>${sfpEsc(item.desc||'Movimentação')} · ${sfpEsc(item.date||item.purchaseDate||'')}</p></div><button class=\"btn2\" id=\"financialReviewCancel\">Cancelar</button></div><div class=\"note\">${isPurchase?'Este item continuará como débito/obrigação da fatura. A escolha abaixo altera apenas o impacto econômico nos relatórios e orçamento.':'Escolha o que esta movimentação representa economicamente. O SFP não altera o valor nem a data.'}</div><label>O que isto representa?<select id=\"financialReviewNature\">${options}</select></label><label id=\"financialReviewCategoryWrap\">Categoria<select id=\"financialReviewCategory\">${CATEGORIES.map(c=>`<option ${c===currentCategory?'selected':''}>${sfpEsc(c)}</option>`).join('')}</select></label><div class=\"section-actions\"><button class=\"btn\" id=\"financialReviewSave\">Salvar classificação</button></div></div>`;
  const sync=()=>{let n=$('financialReviewNature').value;$('financialReviewCategoryWrap').classList.toggle('hidden',['transfer','card-payment','neutral'].includes(n))};
  $('financialReviewNature').onchange=sync;sync();$('financialReviewCancel').onclick=()=>{root.className='hidden';root.replaceChildren()};
  $('financialReviewSave').onclick=async()=>{let n=$('financialReviewNature').value,cat=$('financialReviewCategory').value||'Outros';
    if(isPurchase){if(n==='transfer'){item.economicImpact='neutral';item.semanticClass='user_card_transfer';item.category='Transferência'}else{item.economicImpact='economic';item.semanticClass='user_expense';item.category=cat}}
    else if(n==='transfer'){item.economicImpact='neutral';item.semanticClass='user_transfer';item.category='Transferência'}
    else if(n==='card-payment'){item.kind='expense';item.economicImpact='neutral';item.semanticClass='invoice_payment';item.category='Cartão'}
    else if(n==='neutral'){item.economicImpact='neutral';item.semanticClass='user_neutral'}
    else{item.kind=n==='income'?'income':'expense';item.economicImpact='economic';item.semanticClass=n==='income'?'user_income':'user_expense';item.category=cat}
    item.classificationConfidence=1;item.classificationReason='Classificado manualmente pelo usuário na Auditoria.';
    await save('Revisar classificação financeira');root.className='hidden';root.replaceChildren();renderAll();showFeedback('Classificação salva. A integridade financeira foi recalculada.',{title:'Revisão concluída',type:'success'});
  };
};
function renderFinancialAudit(){
  const box=$('financialAuditIssues');
  const count=$('financialAuditCount');
  if(!box||!count)return;

  const a=financialAuditData();
  const total=a.issues.length;

  count.textContent=total?`${total} para revisar`:'Tudo certo';
  count.className=total?'badge warning':'badge';

  if(!total){box.innerHTML='<div class=\"alert green\">Nenhuma movimentação financeira suspeita detectada.</div>';return;}

  box.innerHTML=a.issues.map(i=>{
    const cls=i.level==='warning'?'warning':'';
    const meta=[i.date||'',i.type==='semantic-review'?'classificação incerta':i.type==='card-semantic-review'?'finalidade do débito de cartão':i.type==='legacy-investment'?'movimentação patrimonial':i.type==='possible-transfer'?'possível transferência':i.type==='possible-card-payment'?'possível pagamento de fatura':i.type==='refund-review'?'estorno/reembolso':i.type==='semantic-incomplete'?'semântica incompleta':'revisão financeira'].filter(Boolean).join(' • ');
    const action=i.itemId!=null?`<button type=\"button\" class=\"btn2 tiny\" data-fin-review=\"${sfpEsc(i.itemKind||'transaction')}:${i.itemId}\">Revisar</button>`:'';
    return `<div class=\"item\"><div style=\"flex:1\"><b class=\"${cls}\">${i.level==='warning'?'Revisão necessária':'Informação'}</b><small>${sfpEsc(i.text)}</small><small>${sfpEsc(meta)}</small></div>${action}</div>`;
  }).join('');
  box.querySelectorAll('[data-fin-review]').forEach(btn=>btn.onclick=()=>{let [kind,id]=btn.dataset.finReview.split(':');openFinancialReview(kind,+id)});
}"""
one(old_render_fin, new_render_fin, 'render financial audit actionable')

# 7) Invoice integrity: historical imported payments without invoice lines are not corruption.
old_invoice_audit = "state.invoices.forEach(i=>{let calc=invoiceCalculated(i.cardId,i.month);if(i.officialTotal!=null&&Math.abs(calc-i.officialTotal)>.01)issues.push({level:'warning',text:`Fatura ${card(i.cardId)?.name||i.cardId} ${i.month}: soma calculada ${brl(calc)} difere do total oficial ${brl(i.officialTotal)}.`});if((i.paidAmount||0)>invoiceTotal(i.cardId,i.month)+.01)issues.push({level:'critical',text:`Fatura ${i.month}: pagamento maior que o total.`})});"
new_invoice_audit = """state.invoices.forEach(i=>{
  let calc=invoiceCalculated(i.cardId,i.month),paid=i.paidAmount||0,official=i.officialTotal;
  let importedHistoricalPlaceholder=calc<=.01&&paid>0&&official!=null&&Math.abs(official-paid)<.01&&(i.payments||[]).length>0&&(i.payments||[]).every(p=>p.balanceImpact===false&&p.sourceDesc);
  if(importedHistoricalPlaceholder){issues.push({level:'warning',type:'historical-invoice-placeholder',invoiceId:i.id,cardId:i.cardId,month:i.month,repairable:true,text:`Fatura ${card(i.cardId)?.name||i.cardId} ${i.month}: há pagamento histórico importado, mas as compras dessa fatura não estão na base.`,solution:'Marque como pagamento histórico para remover o falso conflito sem inventar o total da fatura.'});return}
  if(official!=null&&Math.abs(calc-official)>.01)issues.push({level:'warning',type:'invoice-total-mismatch',invoiceId:i.id,cardId:i.cardId,month:i.month,text:`Fatura ${card(i.cardId)?.name||i.cardId} ${i.month}: soma calculada ${brl(calc)} difere do total oficial ${brl(official)}.`,solution:'Abra a fatura e confira compras, ajustes e o total oficial antes de corrigir.'});
  let knownTotal=official!=null||calc>.01;if(knownTotal&&paid>invoiceTotal(i.cardId,i.month)+.01)issues.push({level:'critical',type:'invoice-overpaid',invoiceId:i.id,cardId:i.cardId,month:i.month,text:`Fatura ${i.month}: pagamento ${brl(paid)} é maior que o total conhecido ${brl(invoiceTotal(i.cardId,i.month))}.`,solution:'Abra a fatura e revise pagamentos/total. O SFP não altera dinheiro automaticamente.'})
});"""
one(old_invoice_audit, new_invoice_audit, 'invoice audit historical handling')

old_render_audit = """function renderAudit(){
 if(!$('auditIssues'))return;let a=auditData(),backs=[];try{backs=JSON.parse(localStorage.getItem('sfp_auto_backups')||'[]')}catch{}
 $('auditCritical').textContent=a.critical;$('auditWarnings').textContent=a.warnings;$('auditDuplicates').textContent=a.dups;$('auditBackup').textContent=backs.length?new Date(backs.at(-1).at).toLocaleDateString('pt-BR'):'—';
 $('auditCritical').className=a.critical?'negative':'positive';$('auditWarnings').className=a.warnings?'warning':'positive';
 $('auditIssues').innerHTML=a.issues.length?a.issues.map(i=>`<div class=\"item\"><div><b class=\"${i.level==='critical'?'negative':'warning'}\">${i.level==='critical'?'Crítico':'Aviso'}</b><small>${i.text}</small></div></div>`).join(''):'<div class=\"alert green\">Base íntegra: nenhuma inconsistência detectada.</div>'
}"""
new_render_audit = """function openAuditInvoice(cardId,month){if(!card(cardId))return toast('Cartão da fatura não encontrado.','warning');setPage('cartoes');state.ui.invoiceMonthByCard[cardId]=month;if($('invoiceCard'))$('invoiceCard').value=cardId;if($('invoiceMonth'))$('invoiceMonth').value=month;renderCards();setTimeout(()=>$('invoiceTotalView')?.scrollIntoView({behavior:'smooth',block:'center'}),60)}
async function repairHistoricalInvoice(invoiceId){let inv=state.invoices.find(i=>i.id==invoiceId);if(!inv)return;let calc=invoiceCalculated(inv.cardId,inv.month),paid=inv.paidAmount||0,safe=calc<=.01&&paid>0&&inv.officialTotal!=null&&Math.abs(inv.officialTotal-paid)<.01&&(inv.payments||[]).length>0&&(inv.payments||[]).every(p=>p.balanceImpact===false&&p.sourceDesc);if(!safe)return toast('Esse registro não pode ser corrigido automaticamente com segurança.','warning');let ok=await sfpConfirm({title:'Marcar pagamento histórico',message:'As compras desta fatura não estão na base. O SFP vai remover o total inferido pelo pagamento e manter o pagamento histórico, sem alterar saldo de conta. Continuar?',confirmText:'Corrigir registro',cancelText:'Cancelar'});if(!ok)return;inv.officialTotal=null;inv.historicalOnly=true;await save('Corrigir pagamento histórico de fatura');renderAll();showFeedback('Pagamento histórico preservado sem inventar o total da fatura.',{title:'Integridade corrigida',type:'success'})}
function renderAudit(){
 if(!$('auditIssues'))return;let a=auditData(),backs=[];try{backs=JSON.parse(localStorage.getItem('sfp_auto_backups')||'[]')}catch{}
 $('auditCritical').textContent=a.critical;$('auditWarnings').textContent=a.warnings;$('auditDuplicates').textContent=a.dups;$('auditBackup').textContent=backs.length?new Date(backs.at(-1).at).toLocaleDateString('pt-BR'):'—';
 $('auditCritical').className=a.critical?'negative':'positive';$('auditWarnings').className=a.warnings?'warning':'positive';
 $('auditIssues').innerHTML=a.issues.length?a.issues.map((i,idx)=>{let action='';if(i.repairable)action=`<button type=\"button\" class=\"btn2 tiny\" data-audit-repair=\"${i.invoiceId}\">Corrigir com segurança</button>`;else if(i.cardId&&i.month)action=`<button type=\"button\" class=\"btn2 tiny\" data-audit-invoice=\"${i.cardId}:${i.month}\">Abrir fatura</button>`;return `<div class=\"item\"><div style=\"flex:1\"><b class=\"${i.level==='critical'?'negative':'warning'}\">${i.level==='critical'?'Crítico':'Aviso'}</b><small>${sfpEsc(i.text)}</small>${i.solution?`<small><b>Como resolver:</b> ${sfpEsc(i.solution)}</small>`:''}</div>${action}</div>`}).join(''):'<div class=\"alert green\">Base íntegra: nenhuma inconsistência detectada.</div>';
 $('auditIssues').querySelectorAll('[data-audit-repair]').forEach(b=>b.onclick=()=>repairHistoricalInvoice(+b.dataset.auditRepair));$('auditIssues').querySelectorAll('[data-audit-invoice]').forEach(b=>b.onclick=()=>{let [cid,m]=b.dataset.auditInvoice.split(':');openAuditInvoice(+cid,m)});
}"""
one(old_render_audit, new_render_audit, 'render audit solutions')

path.write_text(s, encoding='utf-8')
print('patched audit review + invoice semantics')
