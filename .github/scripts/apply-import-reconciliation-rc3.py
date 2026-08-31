from pathlib import Path

ROOT = Path('.')

def must_replace(text, old, new, label, count=1):
    if old not in text:
        raise SystemExit(f'Missing anchor: {label}')
    return text.replace(old, new, count)

# ------------------------------------------------------------
# Android: local PDF text extraction via PDFBox-Android
# ------------------------------------------------------------
build = ROOT / 'app/build.gradle'
s = build.read_text(encoding='utf-8')
s = must_replace(
    s,
    "    implementation 'androidx.webkit:webkit:1.12.1'\n",
    "    implementation 'androidx.webkit:webkit:1.12.1'\n    implementation 'com.tom-roush:pdfbox-android:2.0.27.0'\n",
    'pdfbox dependency'
)
build.write_text(s, encoding='utf-8')

main = ROOT / 'app/src/main/java/com/jhony/sfp/MainActivity.java'
s = main.read_text(encoding='utf-8')
s = must_replace(
    s,
    '                        "application/ofx",\n                        "text/plain"',
    '                        "application/ofx",\n                        "application/pdf",\n                        "text/plain"',
    'pdf mime chooser'
)
main.write_text(s, encoding='utf-8')

bridge = ROOT / 'app/src/main/java/com/jhony/sfp/AndroidBridge.java'
s = bridge.read_text(encoding='utf-8')
s = must_replace(
    s,
    'import org.json.JSONObject;\n',
    'import org.json.JSONObject;\n\nimport com.tom_roush.pdfbox.android.PDFBoxResourceLoader;\nimport com.tom_roush.pdfbox.pdmodel.PDDocument;\nimport com.tom_roush.pdfbox.text.PDFTextStripper;\n',
    'pdfbox imports'
)
s = must_replace(
    s,
    '    AndroidBridge(Context context) {\n        this.context = context;\n        createNotificationChannel();\n    }',
    '    AndroidBridge(Context context) {\n        this.context = context;\n        PDFBoxResourceLoader.init(context.getApplicationContext());\n        createNotificationChannel();\n    }',
    'pdfbox init'
)
pdf_method = r'''
    @JavascriptInterface
    public String extractPdfText(String base64Pdf) {
        JSONObject result = new JSONObject();
        try {
            if (base64Pdf == null || base64Pdf.trim().isEmpty()) {
                result.put("ok", false);
                result.put("error", "PDF vazio.");
                return result.toString();
            }
            byte[] bytes = Base64.decode(base64Pdf, Base64.DEFAULT);
            if (bytes.length == 0) {
                result.put("ok", false);
                result.put("error", "PDF vazio.");
                return result.toString();
            }
            if (bytes.length > 20 * 1024 * 1024) {
                result.put("ok", false);
                result.put("error", "PDF maior que 20 MB. Exporte uma versão menor para importar no SFP.");
                return result.toString();
            }
            try (PDDocument document = PDDocument.load(bytes)) {
                PDFTextStripper stripper = new PDFTextStripper();
                stripper.setSortByPosition(true);
                String text = stripper.getText(document);
                result.put("ok", text != null && !text.trim().isEmpty());
                result.put("text", text == null ? "" : text);
                result.put("pages", document.getNumberOfPages());
                if (text == null || text.trim().isEmpty()) {
                    result.put("error", "O PDF não contém texto pesquisável. PDFs escaneados ainda precisam de OCR.");
                }
                return result.toString();
            }
        } catch (Exception e) {
            try {
                result.put("ok", false);
                result.put("error", "Não foi possível extrair o texto deste PDF.");
                return result.toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"error\":\"Falha ao ler PDF.\"}";
            }
        }
    }
'''
s = must_replace(
    s,
    '    // ============================================================\n    // SOPHY V3 SECURE ANDROID KEYSTORE & NATIVE GROQ BRIDGE',
    pdf_method + '\n    // ============================================================\n    // SOPHY V3 SECURE ANDROID KEYSTORE & NATIVE GROQ BRIDGE',
    'pdf bridge method'
)
bridge.write_text(s, encoding='utf-8')

# ------------------------------------------------------------
# Web UI/import pipeline
# ------------------------------------------------------------
index = ROOT / 'app/src/main/assets/www/index.html'
s = index.read_text(encoding='utf-8')

mobile_css = r'''

/* IMPORT_RECONCILIATION_MOBILE_V2 */
.statement-review-mobile{display:none}
@media(max-width:760px){
  #stmtReview .tablewrap{display:none!important}
  .statement-review-mobile{display:grid;gap:10px;margin-top:12px;min-width:0}
  .stmt-review-card{min-width:0;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface-1);padding:12px;display:grid;gap:10px;overflow:hidden}
  .stmt-review-card__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0}
  .stmt-review-card__head>div{min-width:0}
  .stmt-review-card__head b{display:block;font-size:13px;line-height:1.35;white-space:normal;overflow-wrap:anywhere}
  .stmt-review-card__head small{display:block;margin-top:3px;color:var(--color-text-secondary);font-size:10px}
  .stmt-review-card__amount{flex:0 0 auto;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
  .stmt-review-card__status{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.025em;color:var(--color-text-secondary)}
  .stmt-review-controls{display:grid;grid-template-columns:1fr;gap:8px;min-width:0}
  .stmt-review-controls label{margin:0;min-width:0}
  .stmt-review-controls select{min-width:0;width:100%;max-width:100%}
  .stmt-review-learn{display:flex!important;align-items:center;gap:9px;padding:8px 0;margin:0!important}
  .stmt-review-learn input{width:20px;height:20px;min-height:20px;margin:0;flex:0 0 auto}
  .stmt-review-card[data-review="true"]{border-color:var(--color-warning-border)}
  .stmt-review-card[data-review="false"] .stmt-review-card__status{color:var(--color-positive)}
  #stmtReview{overflow:hidden}
}
'''
s = must_replace(s, '</style>\n</head>', mobile_css + '\n</style>\n</head>', 'mobile CSS')

s = must_replace(
    s,
    '<div class="head"><div><h2>Importar extrato</h2><p>CSV ou OFX, com conferência antes de entrar</p></div><span class="badge">offline</span></div>',
    '<div class="head"><div><h2>Importar extrato</h2><p>CSV, OFX ou PDF, com conferência antes de entrar</p></div><span class="badge">offline</span></div>',
    'statement heading'
)
s = must_replace(
    s,
    '<div class="statement-drop" id="stmtDrop"><b>Solte o arquivo aqui</b><small>ou toque para escolher um CSV/OFX. Nada sai do aparelho.</small><label class="btn2" style="display:inline-block;margin-top:10px;cursor:pointer">Selecionar<input id="stmtFile" type="file" accept=".csv,.ofx" hidden/></label></div>',
    '<div class="statement-drop" id="stmtDrop"><b>Solte o arquivo aqui</b><small>ou toque para escolher um CSV, OFX ou PDF. A leitura do PDF é local e nada sai do aparelho.</small><label class="btn2" style="display:inline-block;margin-top:10px;cursor:pointer">Selecionar<input id="stmtFile" type="file" accept=".csv,.ofx,.pdf,text/csv,application/x-ofx,application/ofx,application/pdf" hidden/></label></div>',
    'statement file accept'
)
s = must_replace(
    s,
    '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Ação</th><th>Categoria</th><th>Transferir p/</th><th>Aprender?</th><th>Conciliação</th></tr></thead><tbody id="stmtRows"></tbody></table></div>',
    '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Ação</th><th>Categoria</th><th>Transferir p/</th><th>Aprender?</th><th>Conciliação</th></tr></thead><tbody id="stmtRows"></tbody></table></div><div id="stmtMobile" class="statement-review-mobile"></div>',
    'statement mobile host'
)
s = must_replace(
    s,
    '<article class="panel secondary-content"><div class="head"><div><h2>Importar fatura</h2><p>CSV ou OFX: data, descrição/título e valor</p></div><span class="badge">com conferência</span></div>',
    '<article class="panel secondary-content"><div class="head"><div><h2>Importar fatura</h2><p>CSV, OFX ou PDF: data, descrição/título e valor</p></div><span class="badge">com conferência</span></div>',
    'invoice heading'
)
s = must_replace(
    s,
    '<label>Arquivo<input id="cardImportFile" type="file" accept=".csv,.ofx,text/csv,application/csv,text/comma-separated-values,application/x-ofx,application/ofx"/></label>',
    '<label>Arquivo<input id="cardImportFile" type="file" accept=".csv,.ofx,.pdf,text/csv,application/csv,text/comma-separated-values,application/x-ofx,application/ofx,application/pdf"/></label>',
    'invoice pdf accept'
)

classification_helpers = r'''
function classificationConfidenceScore(value){
  if(value==null||value==='')return null;
  if(Number.isFinite(Number(value)))return Math.max(0,Math.min(1,Number(value)));
  let v=String(value).toLowerCase();
  if(v==='high'||v==='alta')return .96;
  if(v==='medium'||v==='media'||v==='média')return .82;
  if(v==='low'||v==='baixa')return .5;
  return null;
}
function normalizeImportMerchant(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\b(compra\s+(?:no\s+)?debito|compra\s+debito|cartao\s+debito|debito\s+cartao)\b/g,' ')
    .replace(/\b(pagamento|compra|debito|credito|cartao|visa|mastercard|elo)\b/g,' ')
    .replace(/\b\d{5,}\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,5).join(' ');
}
function inferImportCategory(value){
  let d=String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/mercado|supermerc|supermarket|mercat|atacadao|assai|carrefour|mundial|hortifruti|padaria|lanch|sorvet|restaur|ifood|pizza|burger|grao de ouro/.test(d))return 'Alimentação';
  if(/uber|99\b|taxi|onibus|metro|combust|posto\b|gasolina|estacion/.test(d))return 'Transporte';
  if(/farmac|drog|hospital|clinica|laboratorio|medic/.test(d))return 'Saúde';
  if(/faculdade|universidade|curso|escola|livraria/.test(d))return 'Educação';
  if(/netflix|spotify|disney|prime video|youtube|stream|assinatura/.test(d))return 'Assinaturas';
  if(/luz|energia|agua|gas\b|internet|telefone|vivo|claro|tim\b/.test(d))return 'Contas';
  if(/cinema|show|ingresso|jogo|steam|playstation|xbox/.test(d))return 'Lazer';
  return 'Outros';
}
function historicalImportClassification(raw,amount){
  const key=normalizeImportMerchant(raw);if(key.length<3)return null;
  const candidates=[];
  const add=(desc,action,category,confidence,manual)=>{const k=normalizeImportMerchant(desc);if(!k)return;let affinity=k===key?1:(k.includes(key)||key.includes(k)?0.9:descriptionAffinity(k,key));if(affinity<.72)return;candidates.push({action,category:category||'Outros',affinity,confidence:classificationConfidenceScore(confidence)??.7,manual:Boolean(manual)});};
  (state.transactions||[]).forEach(t=>{if(t.economicImpact!=='economic'||!['income','expense'].includes(t.kind))return;add(t.statementDesc||t.desc,t.kind,t.category,t.classificationConfidence,String(t.semanticClass||'').startsWith('user_')||Number(t.classificationConfidence)>=.99)});
  (state.purchases||[]).forEach(p=>{if(p.economicImpact!=='economic')return;add(p.desc,'expense',p.category,p.classificationConfidence,String(p.semanticClass||'').startsWith('user_')||Number(p.classificationConfidence)>=.99)});
  if(!candidates.length)return null;
  const groups=new Map();
  candidates.forEach(c=>{let id=`${c.action}|${c.category}`,g=groups.get(id)||{...c,weight:0,count:0};g.weight+=c.affinity*(c.manual?3:Math.max(1,c.confidence*2));g.count++;groups.set(id,g)});
  const ranked=[...groups.values()].sort((a,b)=>b.weight-a.weight);const best=ranked[0],next=ranked[1];
  if(best.weight<1.75||(next&&best.weight-next.weight<.55))return null;
  return{action:best.action,category:best.category,semanticClass:'historical_rule',economicImpact:'economic',confidence:best.manual?.97:.9,reason:`Reconhecido pelo histórico: ${key}`};
}
'''
s = must_replace(
    s,
    'function ruleFor(desc){let d=desc.toLowerCase();return state.classificationRules.find(r=>d.includes(r.pattern.toLowerCase()))}\n\nfunction semanticClassify(desc,amount){',
    'function ruleFor(desc){let d=desc.toLowerCase();return state.classificationRules.find(r=>d.includes(r.pattern.toLowerCase()))}\n\n' + classification_helpers + '\nfunction semanticClassify(desc,amount){',
    'classification helpers'
)
learned_block = '''  if(learned){\n    return{\n      action:learned.action,\n      category:learned.category,\n      semanticClass:'learned_rule',\n      economicImpact:learned.action==='transfer'?'neutral':'economic',\n      confidence:'high',\n      reason:`Regra aprendida: ${learned.pattern}`\n    };\n  }'''
s = must_replace(
    s,
    learned_block,
    learned_block + "\n\n  const historical=historicalImportClassification(raw,amount);\n  if(historical)return historical;",
    'historical classifier hook'
)
debit_rule = r'''  if(/\b(compra\s+(?:no\s+)?debito|compra\s+debito|cartao\s+debito|debito\s+cartao)\b/.test(d)){
    const category=inferImportCategory(d);
    return{
      action:'expense',category,semanticClass:'expense',economicImpact:'economic',
      confidence:category==='Outros'?.86:.94,
      reason:category==='Outros'?'Compra no débito reconhecida como gasto; categoria ainda genérica.':'Compra no débito reconhecida e categorizada pelo estabelecimento.'
    };
  }

'''
s = must_replace(s, '  if(/pix|transfer|ted|doc/.test(d)){', debit_rule + '  if(/pix|transfer|ted|doc/.test(d)){', 'debit purchase classifier')

# Normalize confidence threshold instead of Number('medium')/Number('low').
s = must_replace(
    s,
    "  if(r.classificationConfidence!=null &&\n     Number(r.classificationConfidence)<0.75)return true;",
    "  const confidence=classificationConfidenceScore(r.classificationConfidence);\n  if(confidence!=null&&confidence<0.75)return true;",
    'review confidence normalization'
)

mobile_renderer = r'''
function statementDraftStatus(r){
  if(r.duplicate)return 'Já importado';
  if(r.transferMatchId)return `Possível transferência · ${Math.round((r.transferMatchConfidence||0)*100)}%`;
  if(r.action==='pending_transfer')return 'Aguardando extrato da outra conta';
  if(r.candidateId)return 'Possível correspondência';
  return statementNeedsReview(r)?'Revisar':'Reconhecido';
}
function statementActionOptions(r){
  const options=[['expense','Gasto'],['income','Receita'],['transfer','Transferência'],['transfer_match','Transferência detectada'],['pending_transfer','Aguardar outra conta'],['reconcile','Conciliar'],['ignore','Ignorar']];
  return options.filter(([value])=>!['transfer_match','pending_transfer','reconcile'].includes(value)||r.action===value||value==='reconcile'&&r.candidateId).map(([value,label])=>`<option value="${value}" ${r.action===value?'selected':''}>${label}</option>`).join('');
}
function renderStatementDraftMobile(visibleIndexes){
  const host=$('stmtMobile');if(!host)return;
  host.innerHTML=visibleIndexes.map(i=>{const r=statementDraft[i],review=statementNeedsReview(r),transferVisible=['transfer','transfer_match','pending_transfer'].includes(r.action);return `<article class="stmt-review-card" data-review="${review?'true':'false'}"><div class="stmt-review-card__head"><div><b>${sfpEsc(r.desc)}</b><small>${dateObj(r.date).toLocaleDateString('pt-BR')} · <span class="stmt-review-card__status">${sfpEsc(statementDraftStatus(r))}</span></small></div><strong class="stmt-review-card__amount ${r.amount>0?'positive':'negative'}">${brl(r.amount)}</strong></div><div class="stmt-review-controls"><label>Ação<select data-sa="${i}">${statementActionOptions(r)}</select></label><label>Categoria<select data-sc="${i}">${CATEGORIES.map(c=>`<option ${r.category===c?'selected':''}>${c}</option>`).join('')}</select></label>${transferVisible?`<label>Transferir para<select data-st="${i}"><option value="">—</option>${state.accounts.filter(a=>a.id!=r.accountId).map(a=>`<option value="${a.id}" ${r.transferAccountId==a.id?'selected':''}>${sfpEsc(a.name)}</option>`).join('')}</select></label>`:''}<label class="stmt-review-learn"><input type="checkbox" data-sl="${i}" ${r.learn?'checked':''} ${['income','expense','transfer','ignore'].includes(r.action)?'':'disabled'}/> Aprender esta decisão</label></div></article>`}).join('');
}
'''
s = must_replace(s, '\nfunction renderStatementDraft(){', '\n' + mobile_renderer + '\nfunction renderStatementDraft(){', 'mobile statement renderer')
s = must_replace(
    s,
    "\n\n  document.querySelectorAll('[data-sa]').forEach(e=>",
    "\n\n  renderStatementDraftMobile(visibleIndexes);\n\n  document.querySelectorAll('[data-sa]').forEach(e=>",
    'invoke mobile renderer'
)
# User changes are strong training signals: default Learn on after a manual decision.
s = must_replace(
    s,
    "      statementDraft[+e.dataset.sa].action=e.value;\n      renderStatementDraft();",
    "      statementDraft[+e.dataset.sa].action=e.value;\n      if(['income','expense','transfer','ignore'].includes(e.value))statementDraft[+e.dataset.sa].learn=true;\n      renderStatementDraft();",
    'auto learn action'
)
s = must_replace(
    s,
    "      statementDraft[+e.dataset.sc].category=e.value",
    "      statementDraft[+e.dataset.sc].category=e.value;\n      statementDraft[+e.dataset.sc].learn=true",
    'auto learn category'
)

pdf_helpers = r'''
function readFileAsText(file){return new Promise((resolve,reject)=>{let rd=new FileReader();rd.onload=()=>resolve(String(rd.result||''));rd.onerror=()=>reject(Error('Não consegui abrir o arquivo.'));rd.readAsText(file,'UTF-8')})}
function readFileAsDataUrl(file){return new Promise((resolve,reject)=>{let rd=new FileReader();rd.onload=()=>resolve(String(rd.result||''));rd.onerror=()=>reject(Error('Não consegui abrir o PDF.'));rd.readAsDataURL(file)})}
async function extractPdfTextLocal(file){
  if(!window.AndroidBridge||typeof AndroidBridge.extractPdfText!=='function')throw Error('A leitura de PDF está disponível no aplicativo Android.');
  const dataUrl=await readFileAsDataUrl(file),base64=(dataUrl.split(',')[1]||'');
  if(!base64)throw Error('PDF vazio ou ilegível.');
  let parsed;try{parsed=JSON.parse(AndroidBridge.extractPdfText(base64))}catch{throw Error('O leitor local de PDF retornou uma resposta inválida.')}
  if(!parsed?.ok)throw Error(parsed?.error||'Não foi possível extrair texto do PDF.');
  return String(parsed.text||'');
}
function pdfImportDate(line,{month=null}={}){
  let m=String(line||'').match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if(m){let year=m[3]?(m[3].length===2?'20'+m[3]:m[3]):(month?.slice(0,4)||String(new Date().getFullYear()));return {raw:m[0],date:`${year}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`}}
  const map={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  m=String(line||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/\b(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(\d{2,4}))?\b/);
  if(!m)return null;let year=m[3]?(m[3].length===2?'20'+m[3]:m[3]):(month?.slice(0,4)||String(new Date().getFullYear()));return {raw:m[0],date:`${year}-${String(map[m[2]]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`};
}
function parsePdfFinancialText(text,{intendedType='statement',month=null}={}){
  const lines=String(text||'').replace(/\u00a0/g,' ').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),rows=[];
  const amountRe=/([+-]?\s*(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2}|\.\d{2}))\s*([CD])?\s*$/i;
  for(const line of lines){
    const dt=pdfImportDate(line,{month});if(!dt)continue;const am=line.match(amountRe);if(!am)continue;
    let amount=parseMoney(am[1]);const explicit=/^[+-]/.test(am[1].replace(/\s|R\$/gi,''))||Boolean(am[2]);
    if(am[2]?.toUpperCase()==='D')amount=-Math.abs(amount);else if(am[2]?.toUpperCase()==='C')amount=Math.abs(amount);
    let desc=line.replace(am[0],'').replace(dt.raw,'').replace(/^[-–—|:;\s]+|[-–—|:;\s]+$/g,'').trim();
    if(!desc||/^(total|saldo|vencimento|limite|resumo|valor)$/i.test(desc))continue;
    if(intendedType==='statement'&&!explicit){let d=desc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/compra|debito|saque|tarifa|pix enviado|transferencia enviada|pagamento efetuado/.test(d))amount=-Math.abs(amount);else if(/credito|recebido|salario|pix recebido|estorno/.test(d))amount=Math.abs(amount)}
    if(amount)rows.push({date:dt.date,desc,amount,fitid:null});
  }
  return rows;
}
'''
s = must_replace(s, '\nasync function importCardCsv(file){', '\n' + pdf_helpers + '\nasync function importCardCsv(file){', 'pdf parsing helpers')

old_card = """async function importCardCsv(file){\n  if(!file)return;\n  let ext=(file.name.split('.').pop()||'').toLowerCase();\n  if(!['csv','ofx'].includes(ext)){toast('Selecione um arquivo CSV ou OFX de fatura.','warning');$('cardImportFile').value='';return}\n  let rd=new FileReader();rd.onload=async()=>{try{let rows=ext==='ofx'?parseOFX(rd.result):parseCardCsv(rd.result);if(!rows.length)throw Error('Nenhuma movimentação reconhecida no arquivo.');let analysis=await analyzeImportDocument({rows,ext,text:rd.result,intendedType:'invoice'});if(analysis.documentType==='statement'&&analysis.confidence>=.8){let ok=await sfpConfirm({title:'Este arquivo parece ser um extrato',message:`A validação classificou o arquivo como extrato com ${Math.round(analysis.confidence*100)}% de confiança. Quer continuar mesmo assim como fatura?`,confirmText:'Continuar como fatura',cancelText:'Cancelar'});if(!ok){$('cardImportFile').value='';return;}}prepareCardImport(classifyInvoiceRows(rows,analysis),file.name,analysis)}catch(e){cardImportDraft=null;$('cardImportReview').classList.add('hidden');toast('Não consegui ler a fatura: '+e.message,'error')}finally{$('cardImportFile').value=''}};rd.onerror=()=>{toast('Não consegui abrir o arquivo da fatura. Tente selecionar o CSV ou OFX novamente.','error');$('cardImportFile').value=''};rd.readAsText(file,'UTF-8')\n}"""
new_card = """async function importCardCsv(file){\n  if(!file)return;\n  let ext=(file.name.split('.').pop()||'').toLowerCase();\n  if(!['csv','ofx','pdf'].includes(ext)){toast('Selecione um arquivo CSV, OFX ou PDF de fatura.','warning');$('cardImportFile').value='';return}\n  try{\n    let text=ext==='pdf'?await extractPdfTextLocal(file):await readFileAsText(file);\n    let rows=ext==='ofx'?parseOFX(text):ext==='pdf'?parsePdfFinancialText(text,{intendedType:'invoice',month:$('cardImportMonth').value}):parseCardCsv(text);\n    if(!rows.length)throw Error(ext==='pdf'?'Não encontrei linhas com data e valor no PDF. Se ele for escaneado, será necessário OCR.':'Nenhuma movimentação reconhecida no arquivo.');\n    let analysis=await analyzeImportDocument({rows,ext,text,intendedType:'invoice'});\n    if(analysis.documentType==='statement'&&analysis.confidence>=.8){let ok=await sfpConfirm({title:'Este arquivo parece ser um extrato',message:`A validação classificou o arquivo como extrato com ${Math.round(analysis.confidence*100)}% de confiança. Quer continuar mesmo assim como fatura?`,confirmText:'Continuar como fatura',cancelText:'Cancelar'});if(!ok)return;}\n    prepareCardImport(classifyInvoiceRows(rows,analysis),file.name,analysis);\n  }catch(e){cardImportDraft=null;$('cardImportReview').classList.add('hidden');toast('Não consegui ler a fatura: '+e.message,'error')}finally{$('cardImportFile').value=''}\n}"""
s = must_replace(s, old_card, new_card, 'invoice pdf reader')

# Replace statement reader by locating the single-line function through its following global-search function.
start = s.find('function readStmtFile(f){')
end = s.find('\nfunction renderGlobalSearch()', start)
if start < 0 or end < 0:
    raise SystemExit('Missing anchor: statement file reader')
new_stmt = r'''function readStmtFile(f){
 if(!f)return;
 (async()=>{try{
   let ext=(f.name.split('.').pop()||'').toLowerCase();if(!['csv','ofx','pdf'].includes(ext))throw Error('Selecione um arquivo CSV, OFX ou PDF.');
   let text=ext==='pdf'?await extractPdfTextLocal(f):await readFileAsText(f),rows;
   if(ext==='ofx')rows=parseOFX(text);else if(ext==='pdf')rows=parsePdfFinancialText(text,{intendedType:'statement',month:state.mesAtual});else{try{rows=parseCSV(text)}catch{rows=await parseCSVManual(text)}}
   if(!rows.length)throw Error(ext==='pdf'?'Não encontrei linhas com data e valor no PDF. Se ele for escaneado, será necessário OCR.':'Nenhuma movimentação reconhecida. Confira as colunas e os valores.');
   let analysis=await analyzeImportDocument({rows,ext,text,intendedType:'statement'});
   if(analysis.documentType==='invoice'&&analysis.confidence>=.8){let ok=await sfpConfirm({title:'Este arquivo parece ser uma fatura',message:`A validação classificou o arquivo como fatura com ${Math.round(analysis.confidence*100)}% de confiança. Quer continuar mesmo assim como extrato?`,confirmText:'Continuar como extrato',cancelText:'Cancelar'});if(!ok)return;}
   prepareStatement(rows,f.name);
 }catch(e){toast('Não consegui ler o extrato: '+e.message,'error')}finally{$('stmtFile').value=''}})();
}'''
s = s[:start] + new_stmt + s[end:]

index.write_text(s, encoding='utf-8')

# ------------------------------------------------------------
# QA: new coverage for the three physical findings
# ------------------------------------------------------------
qa = ROOT / 'qa/import-mobile-pdf-autoclassification.spec.js'
qa.write_text(r'''const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
  const value=fixture('Importação RC3');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof lastSavedState!=='undefined'&&lastSavedState);
}

test('inputs de extrato e fatura aceitam PDF',async({page})=>{
  await boot(page);
  expect(await page.locator('#stmtFile').getAttribute('accept')).toContain('.pdf');
  expect(await page.locator('#cardImportFile').getAttribute('accept')).toContain('.pdf');
});

test('parser local de PDF reconhece compra no débito e o classificador não exige revisão',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const rows=parsePdfFinancialText('01/08/2026 Compra no débito - SUPERMARKET 11,98\n02/08/2026 Compra no débito - JoseCarlosGanier 41,73',{intendedType:'statement',month:'2026-08'});
    const classified=rows.map(r=>({row:r,sem:semanticClassify(r.desc,r.amount)}));
    return {rows,classified,review:classified.map(x=>statementNeedsReview({...x.row,action:x.sem.action,category:x.sem.category,semanticClass:x.sem.semanticClass,economicImpact:x.sem.economicImpact,classificationConfidence:x.sem.confidence}))};
  });
  expect(result.rows.map(r=>r.amount)).toEqual([-11.98,-41.73]);
  expect(result.classified[0].sem).toMatchObject({action:'expense',category:'Alimentação',economicImpact:'economic'});
  expect(result.classified[1].sem).toMatchObject({action:'expense',economicImpact:'economic'});
  expect(result.review).toEqual([false,false]);
});

test('classificador reaproveita classificação manual anterior do mesmo estabelecimento',async({page})=>{
  await boot(page);
  const sem=await page.evaluate(()=>{
    state.transactions.push({id:99991,kind:'expense',desc:'Compra no débito - LOJA EXEMPLO',amount:20,date:'2026-07-10',category:'Lazer',accountId:1,economicImpact:'economic',semanticClass:'user_expense',classificationConfidence:1});
    return semanticClassify('Compra no débito - LOJA EXEMPLO FILIAL 2',-35);
  });
  expect(sem.action).toBe('expense');
  expect(sem.category).toBe('Lazer');
  expect(sem.semanticClass).toBe('historical_rule');
  expect(Number(sem.confidence)).toBeGreaterThanOrEqual(.9);
});

test('revisão de extrato vira cartões mobile sem arrastar a página para o lado',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  await page.evaluate(()=>{
    setPage('extratos');
    document.querySelector('#stmtAccount').value=String(state.accounts[0].id);
    prepareStatement([
      {date:'2026-08-01',desc:'Compra no débito - SUPERMARKET',amount:-11.98},
      {date:'2026-08-02',desc:'Compra no débito - JoseCarlosGanier',amount:-41.73}
    ],'teste.csv');
  });
  await expect(page.locator('#stmtMobile .stmt-review-card')).toHaveCount(2);
  await expect(page.locator('#stmtMobile')).toBeVisible();
  await expect(page.locator('#stmtReview .tablewrap')).toBeHidden();
  const overflow=await page.evaluate(()=>({review:document.querySelector('#stmtReview').scrollWidth-document.querySelector('#stmtReview').clientWidth,body:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
  expect(overflow.review).toBeLessThanOrEqual(2);
  expect(overflow.body).toBeLessThanOrEqual(2);
});
''',encoding='utf-8')

print('Import/reconciliation RC3 patch applied.')
