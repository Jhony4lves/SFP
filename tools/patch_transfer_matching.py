from pathlib import Path

INDEX = Path('app/src/main/assets/www/index.html')
STATIC = Path('qa/static-check.mjs')
POLISH = Path('qa/polish-integrity.spec.js')
MARKER = 'SFP_TRANSFER_IMPORT_MATCHING_V1'

text = INDEX.read_text(encoding='utf-8')

if MARKER in text:
    print('Transfer matching patch already applied; nothing to do.')
    raise SystemExit(0)


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 occurrence, found {count}')
    text = text.replace(old, new, 1)
    print(f'patched: {label}')


# Schema / persisted state
replace_once(
    "const VERSION=202, SCHEMA_VERSION=11, DB_NAME='SFP_JHONY_STABLE', STORE='state', DB_KEY='main';",
    "const VERSION=202, SCHEMA_VERSION=12, DB_NAME='SFP_JHONY_STABLE', STORE='state', DB_KEY='main';",
    'schema version 12',
)

replace_once(
    "goals:[],assets:[],statements:[],classificationRules:[],categoryBudgets:{},snapshots:[],trash:[],undo:[],closedMonths:[],csvTemplates:[],favorites:[],",
    "goals:[],assets:[],statements:[],transferEvidence:[],classificationRules:[],categoryBudgets:{},snapshots:[],trash:[],undo:[],closedMonths:[],csvTemplates:[],favorites:[],",
    'seed transferEvidence',
)

replace_once(
    "  if(s.schemaVersion<5){\n    (s.accounts||[]).forEach(a=>{a.balanceMode??='historical';a.balanceDate??=null});\n    s.schemaVersion=5;\n  }\n  return s",
    "  if(s.schemaVersion<5){\n    (s.accounts||[]).forEach(a=>{a.balanceMode??='historical';a.balanceDate??=null});\n    s.schemaVersion=5;\n  }\n  if(s.schemaVersion<12){\n    s.transferEvidence??=[];\n    s.schemaVersion=12;\n  }\n  return s",
    'migration transferEvidence',
)

replace_once(
    "for(const k of ['accounts','cards','transactions','transfers','purchases','invoiceAdjustments','invoices','recurring','debts','goals','assets','statements','classificationRules','snapshots','trash','undo','closedMonths','csvTemplates','favorites','creditFacilities'])state[k]??=[];",
    "for(const k of ['accounts','cards','transactions','transfers','purchases','invoiceAdjustments','invoices','recurring','debts','goals','assets','statements','transferEvidence','classificationRules','snapshots','trash','undo','closedMonths','csvTemplates','favorites','creditFacilities'])state[k]??=[];",
    'normalize transferEvidence',
)

replace_once(
    "function hasPersistedUserData(s){return !!(s&&((s.accounts||[]).length||(s.transactions||[]).length||(s.transfers||[]).length||(s.recurring||[]).length||(s.cards||[]).length||(s.goals||[]).length||(s.assets||[]).length))}",
    "function hasPersistedUserData(s){return !!(s&&((s.accounts||[]).length||(s.transactions||[]).length||(s.transfers||[]).length||(s.transferEvidence||[]).length||(s.recurring||[]).length||(s.cards||[]).length||(s.goals||[]).length||(s.assets||[]).length))}",
    'persisted user data transferEvidence',
)

replace_once(
    "const arrays=['accounts','cards','transactions','transfers','purchases','invoiceAdjustments','invoices','recurring','debts','goals','assets','statements','classificationRules','snapshots','trash','undo','closedMonths','csvTemplates','favorites','creditFacilities'];",
    "const arrays=['accounts','cards','transactions','transfers','purchases','invoiceAdjustments','invoices','recurring','debts','goals','assets','statements','transferEvidence','classificationRules','snapshots','trash','undo','closedMonths','csvTemplates','favorites','creditFacilities'];",
    'persistence validation transferEvidence',
)

replace_once(
    " state.invoices.filter(i=>i.accountId==id).forEach(i=>(i.payments||[]).filter(p=>p.balanceImpact===true).forEach(p=>v-=p.amount));\n return Math.round(v*100)/100",
    " state.invoices.filter(i=>i.accountId==id).forEach(i=>(i.payments||[]).filter(p=>p.balanceImpact===true).forEach(p=>v-=p.amount));\n (state.transferEvidence||[]).filter(e=>e.accountId==id&&e.status!=='matched'&&e.balanceImpact===true).forEach(e=>v+=Number(e.amount)||0);\n return Math.round(v*100)/100",
    'pending transfer evidence balance',
)

# Statement keys: both sides of a matched transfer remain idempotent.
replace_once(
    "function existingStmtKeys(){let keys=state.transactions.filter(t=>t.statementKey).map(t=>t.statementKey);state.transfers.filter(t=>t.statementKey).forEach(t=>keys.push(t.statementKey));state.invoices.forEach(i=>(i.payments||[]).forEach(p=>{if(p.statementKey)keys.push(p.statementKey)}));return new Set(keys)}",
    "function existingStmtKeys(){\n let keys=state.transactions.filter(t=>t.statementKey).map(t=>t.statementKey);\n state.transfers.forEach(t=>{if(t.statementKey)keys.push(t.statementKey);(t.statementKeys||[]).forEach(k=>{if(k)keys.push(k)})});\n state.invoices.forEach(i=>(i.payments||[]).forEach(p=>{if(p.statementKey)keys.push(p.statementKey)}));\n (state.transferEvidence||[]).forEach(e=>{if(e.statementKey)keys.push(e.statementKey)});\n return new Set(keys)\n}",
    'statement key coverage',
)

# Matching engine inserted next to the existing reconciliation helpers.
anchor = "function uniqueBestMatch(candidates){if(!candidates.length)return null;candidates.sort((a,b)=>b.score-a.score);return candidates[0].score>0&&(!candidates[1]||candidates[0].score-candidates[1].score>=2)?candidates[0].value:null}\n"
engine = r'''function uniqueBestMatch(candidates){if(!candidates.length)return null;candidates.sort((a,b)=>b.score-a.score);return candidates[0].score>0&&(!candidates[1]||candidates[0].score-candidates[1].score>=2)?candidates[0].value:null}

/* SFP_TRANSFER_IMPORT_MATCHING_V1
 * Concilia as duas pontas de uma transferência própria sem transformar
 * uma saída em despesa nem uma entrada em receita. Candidatos ambíguos
 * nunca são ligados automaticamente: ficam para revisão do usuário.
 */
function transferImportText(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim()}
function transferImportSignal(value){return /\b(pix|ted|doc|transfer|transferencia|transf|entre contas|conta propria|mesma titularidade)\b/.test(transferImportText(value))}
function transferAccountMention(value,accountId){let name=transferImportText(account(accountId)?.name||'');return name.length>=3&&transferImportText(value).includes(name)}
function importedTransactionSignedAmount(t){return t.kind==='income'?Math.abs(Number(t.amount)||0):-Math.abs(Number(t.amount)||0)}
function transferCandidateConfidence(row,peer){
 let days=Math.abs(dateObj(row.date)-dateObj(peer.date))/86400000;
 if(days>2)return 0;
 let confidence=days===0?.84:days===1?.76:.68;
 if(transferImportSignal(row.desc))confidence+=.06;
 if(transferImportSignal(peer.desc))confidence+=.06;
 confidence+=Math.min(.04,descriptionAffinity(row.desc,peer.desc)*.04);
 if(transferAccountMention(row.desc,peer.accountId))confidence+=.03;
 if(transferAccountMention(peer.desc,row.accountId))confidence+=.03;
 return Math.min(.99,Math.round(confidence*100)/100)
}
function transferCandidateAllowed(row,peer,semantic){
 if(!peer||peer.accountId==row.accountId)return false;
 let a=Number(row.amount)||0,b=Number(peer.signedAmount)||0;
 if(!a||!b||a*b>=0)return false;
 if(Math.abs(Math.round(Math.abs(a)*100)-Math.round(Math.abs(b)*100))!==0)return false;
 let days=Math.abs(dateObj(row.date)-dateObj(peer.date))/86400000;
 if(days>2)return false;
 let rowImpact=row.date>state.baseDate,peerImpact=peer.balanceImpact??(peer.date>state.baseDate);
 if(Boolean(rowImpact)!==Boolean(peerImpact))return false;
 if(peer.source==='transaction'){
   let rowSignal=transferImportSignal(row.desc)||semantic?.semanticClass==='possible_transfer';
   let peerSignal=transferImportSignal(peer.desc)||peer.semanticClass==='possible_transfer';
   let rowKnown=semantic?.economicImpact==='economic'&&['income','expense'].includes(semantic?.semanticClass);
   let peerKnown=peer.economicImpact==='economic'&&['income','expense'].includes(peer.semanticClass);
   if(!rowSignal&&!peerSignal&&(rowKnown||peerKnown))return false;
 }
 return true
}
function findStatementTransferMatch(r,accountId,reserved=new Set(),semantic=null){
 let row={...r,accountId};
 let peers=[];
 (state.transferEvidence||[]).filter(e=>e.status!=='matched').forEach(e=>peers.push({
   source:'evidence',id:e.id,accountId:e.accountId,date:e.date,desc:e.desc,statementKey:e.statementKey,
   signedAmount:Number(e.amount)||0,balanceImpact:e.balanceImpact,semanticClass:e.semanticClass||'possible_transfer',economicImpact:'neutral',file:e.file||null
 }));
 state.transactions.filter(t=>t.statementKey&&(t.tags||[]).includes('extrato')&&!t.recurringId&&(t.kind==='income'||t.kind==='expense')).forEach(t=>peers.push({
   source:'transaction',id:t.id,accountId:t.accountId,date:t.date,desc:t.statementDesc||t.desc,statementKey:t.statementKey,
   signedAmount:importedTransactionSignedAmount(t),balanceImpact:t.balanceImpact,semanticClass:t.semanticClass||null,economicImpact:t.economicImpact||null,file:null
 }));
 let candidates=peers.filter(peer=>{
   let reservationKey=`xfer:${peer.source}:${peer.id}`;
   return !reserved.has(reservationKey)&&transferCandidateAllowed(row,peer,semantic)
 }).map(peer=>{
   let confidence=transferCandidateConfidence(row,peer),days=Math.abs(dateObj(row.date)-dateObj(peer.date))/86400000;
   return {...peer,confidence,days,reservationKey:`xfer:${peer.source}:${peer.id}`,
     reason:`Mesmo valor (${brl(Math.abs(Number(r.amount)||0))}) com sinais opostos em contas diferentes${days===0?', na mesma data':days===1?', com 1 dia de diferença':', com 2 dias de diferença'}.`}
 }).filter(x=>x.confidence>=.80).sort((a,b)=>b.confidence-a.confidence||a.days-b.days||(a.source==='evidence'?-1:1));
 if(!candidates.length)return null;
 if(candidates[1]&&candidates[0].confidence-candidates[1].confidence<.04)return null;
 return candidates[0]
}
function statementTransferPeer(r){
 if(r.transferMatchSource==='evidence'){
   let e=(state.transferEvidence||[]).find(x=>String(x.id)===String(r.transferMatchId)&&x.status!=='matched');
   return e?{source:'evidence',id:e.id,accountId:e.accountId,date:e.date,desc:e.desc,statementKey:e.statementKey,signedAmount:Number(e.amount)||0,balanceImpact:e.balanceImpact,file:e.file||null}:null;
 }
 if(r.transferMatchSource==='transaction'){
   let t=state.transactions.find(x=>String(x.id)===String(r.transferMatchId));
   return t?{source:'transaction',id:t.id,accountId:t.accountId,date:t.date,desc:t.statementDesc||t.desc,statementKey:t.statementKey,signedAmount:importedTransactionSignedAmount(t),balanceImpact:t.balanceImpact,file:null}:null;
 }
 return null
}
function finalizeStatementTransferMatch(r){
 let peer=statementTransferPeer(r);if(!peer)return null;
 let current={source:'current',accountId:r.accountId,date:r.date,desc:r.desc,statementKey:r.key,signedAmount:Number(r.amount)||0,balanceImpact:r.date>state.baseDate,file:r.file||null};
 if(!transferCandidateAllowed(current,peer,{semanticClass:r.semanticClass,economicImpact:r.economicImpact}))return null;
 if(peer.source==='evidence')state.transferEvidence=state.transferEvidence.filter(e=>String(e.id)!==String(peer.id));
 else state.transactions=state.transactions.filter(t=>String(t.id)!==String(peer.id));
 let debit=current.signedAmount<0?current:peer,credit=current.signedAmount>0?current:peer;
 let keys=[debit.statementKey,credit.statementKey].filter(Boolean).filter((k,i,a)=>a.indexOf(k)===i);
 let desc=transferImportSignal(debit.desc)?debit.desc:transferImportSignal(credit.desc)?credit.desc:(debit.desc||credit.desc||'Transferência entre contas');
 let transfer={
   id:uid(),desc,amount:Math.abs(current.signedAmount),date:debit.date,settledDate:credit.date!==debit.date?credit.date:null,
   fromId:debit.accountId,toId:credit.accountId,tags:['extrato','transferência','conciliada'],statementKey:keys[0]||r.key,statementKeys:keys,
   statementEvidence:[debit,credit].map(x=>({accountId:x.accountId,date:x.date,amount:x.signedAmount,desc:x.desc,statementKey:x.statementKey,file:x.file||null})),
   balanceImpact:current.balanceImpact===true,matchedBy:'statement-cross-account',matchConfidence:r.transferMatchConfidence||null,matchReason:r.transferMatchReason||null
 };
 state.transfers.push(transfer);return transfer
}
'''
replace_once(anchor, engine, 'transfer matching engine')

old_prepare = r'''function prepareStatement(rows,file){
 let accountId=+$('stmtAccount').value,ex=existingStmtKeys(),seen=new Set(ex),reserved=new Set(),occurrences=new Map(),sourceHash=statementHash(rows);statementDraft=rows.map((r,i)=>{let fitid=String(r.fitid||'').trim(),fingerprint=`${r.date}|${Math.round(Number(r.amount)*100)}|${String(r.desc||'').trim().toLowerCase()}`,occurrence=(occurrences.get(fingerprint)||0)+1;occurrences.set(fingerprint,occurrence);let key=fitid?`${accountId}|fit:${fitid}`:`${accountId}|row:${sourceHash}:${fingerprint}:${occurrence}`,legacyKey=`${accountId}|${r.date}|${Number(r.amount).toFixed(2)}|${String(r.desc||'').toLowerCase().slice(0,80)}`,duplicate=seen.has(key)||(!fitid&&ex.has(legacyKey)),g=guess(r.desc,r.amount),cand=duplicate?null:reconcileCandidate(r,accountId,reserved);if(cand)reserved.add(String(cand.id));seen.add(key);return{...r,fitid:fitid||null,index:i,key,accountId,duplicate,action:duplicate?'ignore':cand?'reconcile':g.action,category:g.category,candidateId:cand?.id||null,transferAccountId:null,learn:false,file,semanticClass:g.semanticClass||null,economicImpact:g.economicImpact||'economic',classificationConfidence:g.confidence||null,classificationReason:g.reason||null}});renderStatementDraft()
}'''
new_prepare = r'''function prepareStatement(rows,file){
 let accountId=+$('stmtAccount').value,ex=existingStmtKeys(),seen=new Set(ex),reserved=new Set(),occurrences=new Map(),sourceHash=statementHash(rows);statementDraft=rows.map((r,i)=>{
   let fitid=String(r.fitid||'').trim(),fingerprint=`${r.date}|${Math.round(Number(r.amount)*100)}|${String(r.desc||'').trim().toLowerCase()}`,occurrence=(occurrences.get(fingerprint)||0)+1;
   occurrences.set(fingerprint,occurrence);
   let key=fitid?`${accountId}|fit:${fitid}`:`${accountId}|row:${sourceHash}:${fingerprint}:${occurrence}`,legacyKey=`${accountId}|${r.date}|${Number(r.amount).toFixed(2)}|${String(r.desc||'').toLowerCase().slice(0,80)}`,duplicate=seen.has(key)||(!fitid&&ex.has(legacyKey)),g=guess(r.desc,r.amount),cand=duplicate?null:reconcileCandidate(r,accountId,reserved);
   if(cand)reserved.add(String(cand.id));
   let transferMatch=!duplicate&&!cand?findStatementTransferMatch(r,accountId,reserved,g):null;
   if(transferMatch)reserved.add(transferMatch.reservationKey);
   let pendingTransfer=!duplicate&&!cand&&!transferMatch&&g.semanticClass==='possible_transfer';
   let action=duplicate?'ignore':cand?'reconcile':transferMatch?'transfer_match':pendingTransfer?'pending_transfer':g.action;
   seen.add(key);
   return{...r,fitid:fitid||null,index:i,key,accountId,duplicate,action,category:g.category,candidateId:cand?.id||null,
     transferAccountId:transferMatch?.accountId||null,transferMatchSource:transferMatch?.source||null,transferMatchId:transferMatch?.id??null,
     transferMatchAccountId:transferMatch?.accountId||null,transferMatchConfidence:transferMatch?.confidence||null,transferMatchReason:transferMatch?.reason||null,
     learn:false,file,semanticClass:transferMatch?'transfer':g.semanticClass||null,economicImpact:(transferMatch||pendingTransfer)?'neutral':g.economicImpact||'economic',
     classificationConfidence:transferMatch?transferMatch.confidence:g.confidence||null,classificationReason:transferMatch?transferMatch.reason:g.reason||null}
 });renderStatementDraft()
}'''
replace_once(old_prepare, new_prepare, 'prepareStatement cross-account matching')

replace_once(
    "function statementNeedsReview(r){\n  if(r.duplicate)return false;\n\n  if(r.economicImpact==='review')return true;",
    "function statementNeedsReview(r){\n  if(r.duplicate)return false;\n  if(r.action==='transfer_match'||r.action==='pending_transfer')return true;\n\n  if(r.economicImpact==='review')return true;",
    'transfer actions review',
)

replace_once(
    "  const neutral=statementDraft.filter(x=>\n    x.economicImpact==='neutral' ||\n    x.action==='transfer'\n  ).length;",
    "  const neutral=statementDraft.filter(x=>\n    x.economicImpact==='neutral' ||\n    x.action==='transfer' ||\n    x.action==='transfer_match' ||\n    x.action==='pending_transfer'\n  ).length;",
    'neutral transfer counters',
)

replace_once(
    "          <option value=\"transfer\" ${r.action==='transfer'?'selected':''}>Transferência</option>\n          <option value=\"reconcile\" ${r.action==='reconcile'?'selected':''}>Conciliar</option>",
    "          <option value=\"transfer\" ${r.action==='transfer'?'selected':''}>Transferência</option>\n          <option value=\"transfer_match\" ${r.action==='transfer_match'?'selected':''}>Transferência detectada</option>\n          <option value=\"pending_transfer\" ${r.action==='pending_transfer'?'selected':''}>Aguardar outra conta</option>\n          <option value=\"reconcile\" ${r.action==='reconcile'?'selected':''}>Conciliar</option>",
    'statement transfer action options',
)

replace_once(
    "          ${r.learn?'checked':''}\n        />",
    "          ${r.learn?'checked':''}\n          ${['income','expense','transfer','ignore'].includes(r.action)?'':'disabled'}\n        />",
    'disable learning for reconciliation-only actions',
)

replace_once(
    "            : r.candidateId\n              ? 'Possível correspondência'\n              : review\n                ? 'Revisar'\n                : 'Reconhecido'",
    "            : r.transferMatchId\n              ? `Possível transferência · ${Math.round((r.transferMatchConfidence||0)*100)}%`\n              : r.action==='pending_transfer'\n                ? 'Aguardando extrato da outra conta'\n                : r.candidateId\n                  ? 'Possível correspondência'\n                  : review\n                    ? 'Revisar'\n                    : 'Reconhecido'",
    'transfer status text',
)

# Import execution: pending evidence, matched conversion and safe learning.
replace_once(
    "   if(r.duplicate||r.action==='ignore'||used.has(r.key))continue;\n   if(r.action==='reconcile'&&r.candidateId){",
    "   if(r.duplicate||r.action==='ignore'||used.has(r.key))continue;\n   if(r.action==='pending_transfer'){\n    if(!(state.transferEvidence||[]).some(e=>e.statementKey===r.key))state.transferEvidence.push({id:uid(),statementKey:r.key,accountId:r.accountId,date:r.date,amount:Number(r.amount)||0,desc:r.desc,fitid:r.fitid||null,file:r.file||null,status:'pending',balanceImpact:r.date>state.baseDate,semanticClass:'possible_transfer',createdAt:Date.now()});\n    used.add(r.key);accepted.push(r);continue\n   }\n   if(r.action==='transfer_match'||(r.action==='transfer'&&r.transferMatchId&&r.transferAccountId==r.transferMatchAccountId)){\n    let matched=finalizeStatementTransferMatch(r);if(!matched)continue;used.add(r.key);accepted.push(r);continue\n   }\n   if(r.action==='reconcile'&&r.candidateId){",
    'import pending and matched transfers',
)

replace_once(
    "   used.add(r.key);accepted.push(r);if(r.learn){let pattern=r.desc.split(/\\s+/).slice(0,3).join(' ');if(pattern.length>3&&!state.classificationRules.some(x=>String(x.pattern||'').toLowerCase()===pattern.toLowerCase()))state.classificationRules.push({pattern,action:r.action,category:r.category,source:'learned',learnedAt:new Date().toISOString(),example:r.desc})}",
    "   used.add(r.key);accepted.push(r);if(r.learn&&['income','expense','transfer','ignore'].includes(r.action)){let pattern=r.desc.split(/\\s+/).slice(0,3).join(' ');if(pattern.length>3&&!state.classificationRules.some(x=>String(x.pattern||'').toLowerCase()===pattern.toLowerCase()))state.classificationRules.push({pattern,action:r.action,category:r.category,source:'learned',learnedAt:new Date().toISOString(),example:r.desc})}",
    'safe learned classifications',
)

INDEX.write_text(text, encoding='utf-8')

# Keep static contracts aligned with the schema bump.
static = STATIC.read_text(encoding='utf-8')
static = static.replace("source.includes('SCHEMA_VERSION=11')", "source.includes('SCHEMA_VERSION=12')")
static = static.replace('divergente de 11', 'divergente de 12')
static = static.replace('schema v11', 'schema v12')
STATIC.write_text(static, encoding='utf-8')

polish = POLISH.read_text(encoding='utf-8')
polish = polish.replace('SCHEMA_VERSION=11 é dinâmico', 'SCHEMA_VERSION=12 é dinâmico')
polish = polish.replace('expect(versions.schemaVersion).toBe(11);', 'expect(versions.schemaVersion).toBe(12);')
polish = polish.replace('expect(versions.constantSchema).toBe(11);', 'expect(versions.constantSchema).toBe(12);')
polish = polish.replace("expect(versions.domValue).toBe('v11');", "expect(versions.domValue).toBe('v12');")
POLISH.write_text(polish, encoding='utf-8')

print('Transfer import matching patch applied successfully.')
