from pathlib import Path
import re

p=Path('app/src/main/assets/www/index.html')
s=p.read_text(encoding='utf-8')

old='''<article class="panel secondary-content"><div class="head"><div><h2>Importar fatura</h2><p>CSV ou OFX: data, descrição/título e valor</p></div><span class="badge">com conferência</span></div><div class="three"><label>Cartão<select id="cardImportCard"></select></label><label>Fatura<input id="cardImportMonth" type="month"/></label><label>Arquivo<input id="cardImportFile" type="file" accept=".csv,.ofx,text/csv,application/csv,text/comma-separated-values,application/x-ofx,application/ofx"/></label></div><div class="note">Confira a prévia antes de salvar. Valores positivos viram compras; negativos são pagamentos vinculados à fatura anterior, sem reduzir a fatura aberta. Parcelas exigem o texto “Parcela X/Y”.</div></article>
      <article class="panel secondary-content hidden" id="cardImportReview"><div class="head"><div><h2>Conferir fatura</h2><p id="cardImportSummary"></p></div><div class="actions"><button class="btn2" type="button" id="cardImportCancel">Cancelar</button><button class="btn" type="button" id="cardImportConfirm">Importar fatura</button></div></div><div class="tablewrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Destino</th><th>Status</th></tr></thead><tbody id="cardImportRows"></tbody></table></div></article>'''
new='''<article class="panel secondary-content"><div class="head"><div><h2>Importar fatura</h2><p>CSV ou OFX: data, descrição/título e valor</p></div><span class="badge">com conferência</span></div><div class="three"><label>Cartão<select id="cardImportCard"></select></label><label>Fatura<input id="cardImportMonth" type="month"/></label><label>Arquivo<input id="cardImportFile" type="file" accept=".csv,.ofx,text/csv,application/csv,text/comma-separated-values,application/x-ofx,application/ofx"/></label></div><div class="note" id="cardImportHint">O SFP identifica a convenção do arquivo, valida compra/pagamento e usa o Groq como segunda opinião quando disponível. Nada é salvo antes da sua confirmação.</div></article>
      <article class="panel secondary-content hidden" id="cardImportReview"><div class="head"><div><h2>Conferir fatura</h2><p id="cardImportSummary"></p></div><div class="actions"><button class="btn2" type="button" id="cardImportCancel">Cancelar</button><button class="btn" type="button" id="cardImportConfirm">Importar fatura</button></div></div><div class="note" id="cardImportValidation"></div><div class="tablewrap desktop-table-mobile"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Destino</th><th>Status</th></tr></thead><tbody id="cardImportRows"></tbody></table></div><div id="cardImportMobile" class="mobile-card-list"></div></article>'''
assert s.count(old)==1, f'html target count={s.count(old)}'
s=s.replace(old,new)

start=s.index('function prepareCardImport(rows,file){')
end=s.index('async function confirmCardImport(){', start)
replacement=r'''function normalizeImportSignalText(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}
function invoiceSemanticHint(desc){
  const d=normalizeImportSignalText(desc);
  if(/\b(pagamento recebido|pagamento da fatura|pagamento de fatura|payment received|pagamento cartao|pagamento cartão)\b/.test(d))return 'payment';
  if(/\b(estorno|reembolso|refund|cashback|ajuste credor|credito recebido)\b/.test(d))return 'payment';
  if(/parcela\s*\d+\s*\/\s*\d+/.test(d)||/\bpix no credito\b/.test(d))return 'purchase';
  return null;
}
function sanitizeImportDescription(desc){
  return String(desc||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'***@***').replace(/\b\d{6,}\b/g,'***').slice(0,120);
}
function localImportAnalysis({rows,ext='',text='',intendedType='statement'}={}){
  const sample=String(text||'').slice(0,16000), lower=normalizeImportSignalText(sample);
  let invoiceScore=0,statementScore=0,negPurchase=0,posPurchase=0,negPayment=0,posPayment=0;
  if(/<ccstmt|<ccacctfrom|creditcard/.test(lower))invoiceScore+=5;
  if(/<banktranlist|<bankacctfrom/.test(lower))statementScore+=2;
  (rows||[]).forEach(r=>{
    const d=normalizeImportSignalText(r.desc),hint=invoiceSemanticHint(r.desc);
    if(/parcela\s*\d+\s*\/\s*\d+/.test(d)){invoiceScore+=3;if(r.amount<0)negPurchase++;else posPurchase++;}
    if(/\bpix no credito\b/.test(d)){invoiceScore+=2;if(r.amount<0)negPurchase++;else posPurchase++;}
    if(hint==='payment'){invoiceScore+=2.5;if(r.amount<0)negPayment++;else posPayment++;}
    if(/\b(salario|ted|doc|tarifa bancaria|pix enviado|pix recebido|transferencia recebida|transferencia enviada)\b/.test(d))statementScore+=1.5;
  });
  if(posPayment>0){negPurchase+=(rows||[]).filter(r=>r.amount<0&&!invoiceSemanticHint(r.desc)).length;}
  if(negPayment>0){posPurchase+=(rows||[]).filter(r=>r.amount>0&&!invoiceSemanticHint(r.desc)).length;}
  let signConvention='unknown',signConfidence=.45;
  const negConvention=negPurchase+posPayment, posConvention=posPurchase+negPayment;
  if(negConvention>=2&&negConvention>posConvention+0.5){signConvention='debitNegative';signConfidence=Math.min(.98,.62+negConvention*.07);}
  else if(posConvention>=2&&posConvention>negConvention+0.5){signConvention='debitPositive';signConfidence=Math.min(.98,.62+posConvention*.07);}
  else if(ext==='csv'){signConvention='debitPositive';signConfidence=.58;}
  let documentType=intendedType,confidence=.55;
  if(invoiceScore>=statementScore+3){documentType='invoice';confidence=Math.min(.97,.66+(invoiceScore-statementScore)*.035);}
  else if(statementScore>=invoiceScore+3){documentType='statement';confidence=Math.min(.94,.64+(statementScore-invoiceScore)*.035);}
  return {documentType,confidence,signConvention,signConfidence,invoiceScore,statementScore,validator:'local',warnings:[]};
}
function importGroqAvailable(){
  try{return navigator.onLine!==false&&!!(window.AndroidBridge&&typeof window.AndroidBridge.callSophyGroq==='function'&&typeof window.AndroidBridge.hasSophyApiKey==='function'&&window.AndroidBridge.hasSophyApiKey())}catch{return false}
}
function parseImportGroqJson(content){
  let txt=String(content||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  let a=txt.indexOf('{'),b=txt.lastIndexOf('}');if(a<0||b<a)throw Error('Resposta de validação sem JSON');
  return JSON.parse(txt.slice(a,b+1));
}
async function validateImportWithGroq({rows,ext,intendedType,local}={}){
  if(!importGroqAvailable())return null;
  const safeRows=(rows||[]).slice(0,60).map((r,index)=>({index,date:r.date,description:sanitizeImportDescription(r.desc),amount:Number(r.amount)}));
  const instruction='Classifique um arquivo financeiro brasileiro. Responda SOMENTE JSON com documentType (invoice|statement|unknown), confidence 0..1, signConvention (debitNegative|debitPositive|unknown), rows [{index,kind,confidence}] onde kind é purchase|payment|unknown, e warnings []. Não altere data nem valor. Pagamento recebido/estorno/reembolso é crédito/pagamento; compra parcelada e Pix no Crédito são compras. Em fatura OFX, sinais podem ser o oposto de CSV.';
  const model=(state?.sophy?.settings?.model&&state.sophy.settings.model!=='default')?state.sophy.settings.model:'openai/gpt-oss-120b';
  const payload={model,messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify({intendedType,extension:ext,local:{documentType:local.documentType,confidence:local.confidence,signConvention:local.signConvention,signConfidence:local.signConfidence},rows:safeRows})}],temperature:0,max_tokens:1400};
  const raw=window.AndroidBridge.callSophyGroq(JSON.stringify(payload)),data=JSON.parse(raw||'{}');if(data.error)throw Error(data.error.message||'Groq indisponível');
  const parsed=parseImportGroqJson(data?.choices?.[0]?.message?.content||'');
  const documentType=['invoice','statement','unknown'].includes(parsed.documentType)?parsed.documentType:'unknown';
  const signConvention=['debitNegative','debitPositive','unknown'].includes(parsed.signConvention)?parsed.signConvention:'unknown';
  const confidence=Math.max(0,Math.min(1,Number(parsed.confidence)||0));
  const rowKinds={};(Array.isArray(parsed.rows)?parsed.rows:[]).forEach(x=>{let i=+x.index,c=Math.max(0,Math.min(1,Number(x.confidence)||0));if(Number.isInteger(i)&&i>=0&&i<(rows||[]).length&&['purchase','payment','unknown'].includes(x.kind))rowKinds[i]={kind:x.kind,confidence:c}});
  return {documentType,confidence,signConvention,rowKinds,warnings:Array.isArray(parsed.warnings)?parsed.warnings.slice(0,5).map(String):[]};
}
async function analyzeImportDocument({rows,ext,text,intendedType}={}){
  const local=localImportAnalysis({rows,ext,text,intendedType});let ai=null,warnings=[...(local.warnings||[])];
  try{ai=await validateImportWithGroq({rows,ext,intendedType,local});}catch(e){warnings.push('Validação Groq indisponível: '+e.message);}
  const out={...local,ai,validator:ai?'local+groq':'local',warnings};
  if(ai){
    if(ai.confidence>=.72&&ai.documentType!=='unknown'&&(local.confidence<.88||ai.documentType===local.documentType)){out.documentType=ai.documentType;out.confidence=Math.max(local.confidence,ai.confidence);}
    else if(ai.confidence>=.72&&ai.documentType!==local.documentType)warnings.push('Groq e regras locais discordaram sobre o tipo do arquivo; confira a prévia.');
    if(ai.signConvention!=='unknown'&&ai.confidence>=.68&&local.signConfidence<.9){out.signConvention=ai.signConvention;out.signConfidence=Math.max(local.signConfidence,ai.confidence);}
  }
  return out;
}
function classifyInvoiceRows(rows,analysis){
  return (rows||[]).map((r,index)=>{
    const strong=invoiceSemanticHint(r.desc),ai=analysis?.ai?.rowKinds?.[index];let invoiceKind=strong;
    if(!invoiceKind&&ai&&ai.confidence>=.68&&ai.kind!=='unknown')invoiceKind=ai.kind;
    if(!invoiceKind&&analysis?.signConvention==='debitNegative')invoiceKind=r.amount<0?'purchase':'payment';
    if(!invoiceKind&&analysis?.signConvention==='debitPositive')invoiceKind=r.amount>0?'purchase':'payment';
    if(!invoiceKind)invoiceKind=r.amount>=0?'purchase':'payment';
    return {...r,invoiceKind,classificationConfidence:strong?1:(ai?.confidence||analysis?.signConfidence||.5)};
  });
}
function prepareCardImport(rows,file,analysis=null){
  let cardId=+$('cardImportCard').value,month=$('cardImportMonth').value||currentInvoiceMonth(card(cardId));
  if(!card(cardId))throw Error('Selecione um cartão válido antes de importar a fatura.');
  let futurePurchases=[],futurePayments=[],draft=rows.map(r=>{
    const resolvedKind=r.invoiceKind||(r.amount<0?'payment':'purchase');
    if(resolvedKind==='payment'){let targetMonth=monthAdd(month,-1),row={...r,kind:'payment',targetMonth,amount:Math.abs(r.amount)},invoice=state.invoices.find(i=>i.cardId==cardId&&i.month===targetMonth)||{payments:[]},duplicate=cardPaymentDuplicate(invoice,row)||futurePayments.some(x=>x.targetMonth===targetMonth&&x.date===row.date&&x.amount===row.amount&&normalizeImportText(x.desc)===normalizeImportText(row.desc));if(!duplicate)futurePayments.push(row);return {...row,duplicate};}
    let amount=Math.abs(r.amount),pm=r.desc.match(/Parcela\s*(\d+)\s*\/\s*(\d+)/i),desc=r.desc.replace(/\s*-?\s*Parcela\s*\d+\s*\/\s*\d+/i,'').trim();
    let row=pm?{...r,amount,desc,kind:'purchase',installment:+pm[1],installments:+pm[2],firstMonth:monthAdd(month,-(+pm[1]-1)),total:Math.round(amount*(+pm[2])*100)/100}:{...r,amount,desc,kind:'purchase',installment:1,installments:1,firstMonth:month,total:amount};
    let duplicate=cardPurchaseDuplicate(cardId,{...row,purchaseDate:row.date})||futurePurchases.some(x=>x.desc===row.desc&&x.installments===row.installments&&x.firstMonth===row.firstMonth&&x.purchaseDate===row.date&&Math.abs(x.total-row.total)<.02);if(!duplicate)futurePurchases.push({...row,purchaseDate:row.date});return {...row,duplicate};
  });
  cardImportDraft={cardId,month,file,rows:draft,invalid:rows.invalid||0,analysis};renderCardImportDraft();
}
function renderCardImportDraft(){
  let draft=cardImportDraft;if(!draft)return;let fresh=draft.rows.filter(r=>!r.duplicate),purchases=fresh.filter(r=>r.kind==='purchase').length,payments=fresh.filter(r=>r.kind==='payment').length,duplicates=draft.rows.length-fresh.length;
  $('cardImportReview').classList.remove('hidden');$('cardImportSummary').textContent=`${draft.rows.length} linha(s) lida(s): ${purchases} compra(s), ${payments} pagamento(s) e ${duplicates} já importada(s)${draft.invalid?` e ${draft.invalid} linha(s) inválida(s) ignorada(s)`:''}.`;
  let a=draft.analysis,validation=$('cardImportValidation');if(validation){let type=a?.documentType==='invoice'?'Fatura':a?.documentType==='statement'?'Extrato':'Tipo incerto',pct=Math.round((a?.confidence||0)*100),sign=a?.signConvention==='debitNegative'?'débitos negativos':a?.signConvention==='debitPositive'?'débitos positivos':'sinais ambíguos',engine=a?.validator==='local+groq'?'regras locais + Groq':'regras locais';validation.textContent=a?`Detectado: ${type} (${pct}%). Convenção: ${sign}. Validação: ${engine}.${a.warnings?.length?' '+a.warnings.join(' '):''}`:'Prévia validada pelas regras locais.';}
  const rowHtml=r=>`<tr><td>${dateObj(r.date).toLocaleDateString('pt-BR')}</td><td>${sfpEsc(r.desc)}</td><td class="${r.kind==='payment'?'positive':'negative'}">${brl(r.kind==='payment'?r.amount:-r.amount)}</td><td>${r.kind==='payment'?`Pagamento/crédito da fatura ${monthName(r.targetMonth)}`:`Compra${r.installments>1?` • parcela ${r.installment}/${r.installments}`:''}`}</td><td>${r.duplicate?'Já importada':'Pronta para importar'}</td></tr>`;
  $('cardImportRows').innerHTML=draft.rows.map(rowHtml).join('');
  if($('cardImportMobile'))$('cardImportMobile').innerHTML=draft.rows.map(r=>`<div class="mobile-record"><div class="mobile-record-head"><div><b>${sfpEsc(r.desc)}</b><small>${dateObj(r.date).toLocaleDateString('pt-BR')} • ${r.kind==='payment'?`Pagamento/crédito ${monthName(r.targetMonth)}`:`Compra${r.installments>1?` • ${r.installment}/${r.installments}`:''}`}</small></div><strong class="${r.kind==='payment'?'positive':'negative'}">${brl(r.kind==='payment'?r.amount:-r.amount)}</strong></div><small>${r.duplicate?'Já importada':'Pronta para importar'}</small></div>`).join('');
}
async function importCardCsv(file){
  if(!file)return;
  let ext=(file.name.split('.').pop()||'').toLowerCase();
  if(!['csv','ofx'].includes(ext)){toast('Selecione um arquivo CSV ou OFX de fatura.','warning');$('cardImportFile').value='';return}
  let rd=new FileReader();rd.onload=async()=>{try{let rows=ext==='ofx'?parseOFX(rd.result):parseCardCsv(rd.result);if(!rows.length)throw Error('Nenhuma movimentação reconhecida no arquivo.');let analysis=await analyzeImportDocument({rows,ext,text:rd.result,intendedType:'invoice'});if(analysis.documentType==='statement'&&analysis.confidence>=.8){let ok=await sfpConfirm({title:'Este arquivo parece ser um extrato',message:`A validação classificou o arquivo como extrato com ${Math.round(analysis.confidence*100)}% de confiança. Quer continuar mesmo assim como fatura?`,confirmText:'Continuar como fatura',cancelText:'Cancelar'});if(!ok){$('cardImportFile').value='';return;}}prepareCardImport(classifyInvoiceRows(rows,analysis),file.name,analysis)}catch(e){cardImportDraft=null;$('cardImportReview').classList.add('hidden');toast('Não consegui ler a fatura: '+e.message,'error')}finally{$('cardImportFile').value=''}};rd.onerror=()=>{toast('Não consegui abrir o arquivo da fatura. Tente selecionar o CSV ou OFX novamente.','error');$('cardImportFile').value=''};rd.readAsText(file,'UTF-8')
}
'''
s=s[:start]+replacement+s[end:]

pattern=r"function readStmtFile\(f\)\{if\(!f\)return;let rd=new FileReader\(\);rd\.onload=async\(\)=>\{try\{.*?rd\.readAsText\(f,'UTF-8'\)\}"
m=re.search(pattern,s,re.S)
assert m, 'readStmtFile target not found'
new_read=r'''function readStmtFile(f){if(!f)return;let rd=new FileReader();rd.onload=async()=>{try{let ext=f.name.split('.').pop().toLowerCase();if(!['csv','ofx'].includes(ext))throw Error('Selecione um arquivo CSV ou OFX.');let rows;if(ext==='ofx')rows=parseOFX(rd.result);else{try{rows=parseCSV(rd.result)}catch{rows=await parseCSVManual(rd.result)}}if(!rows.length)throw Error('Nenhuma movimentação reconhecida. Confira as colunas e os valores.');let analysis=await analyzeImportDocument({rows,ext,text:rd.result,intendedType:'statement'});if(analysis.documentType==='invoice'&&analysis.confidence>=.8){let ok=await sfpConfirm({title:'Este arquivo parece ser uma fatura',message:`A validação classificou o arquivo como fatura com ${Math.round(analysis.confidence*100)}% de confiança. Quer continuar mesmo assim como extrato?`,confirmText:'Continuar como extrato',cancelText:'Cancelar'});if(!ok){$('stmtFile').value='';return;}}prepareStatement(rows,f.name)}catch(e){$('stmtFile').value='';toast('Não consegui ler o extrato: '+e.message,'error')}};rd.onerror=()=>{toast('Não consegui abrir o arquivo do extrato. Tente selecionar novamente.','error');$('stmtFile').value=''};rd.readAsText(f,'UTF-8')}'''
s=s[:m.start()]+new_read+s[m.end():]

p.write_text(s,encoding='utf-8')
print('patched index.html')
