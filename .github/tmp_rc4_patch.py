from pathlib import Path
import re

HTML = Path('app/src/main/assets/www/index.html')
QA = Path('qa/import-mobile-pdf-autoclassification.spec.js')
GRADLE = Path('gradle.properties')

s = HTML.read_text(encoding='utf-8')

old = "const CATEGORIES=['Essencial','Alimentação','Transporte','Faculdade','Saúde','Assinaturas','Dívida','Lazer','Casa','Trabalho','Ajuste','Outros'];"
new = """const EXPENSE_CATEGORIES=['Essencial','Alimentação','Transporte','Faculdade','Educação','Saúde','Assinaturas','Dívida','Lazer','Casa','Contas','Trabalho','Investimentos','Cartão','Ajuste','Outros'];
const INCOME_CATEGORIES=['Trabalho','Rendimentos','Reembolso','Venda','Benefícios','Investimentos','Ajuste','Outros'];
const CATEGORIES=[...new Set([...EXPENSE_CATEGORIES,...INCOME_CATEGORIES])];
function statementActionHasCategory(action){return action==='income'||action==='expense'}
function categoriesForAction(action){return action==='income'?INCOME_CATEGORIES:action==='expense'?EXPENSE_CATEGORIES:[]}
function normalizedCategoryForAction(action,category){const allowed=categoriesForAction(action);return allowed.includes(category)?category:'Outros'}
function categoryOptionsMarkup(action,current){const allowed=categoriesForAction(action),selected=normalizedCategoryForAction(action,current);return allowed.map(c=>`<option ${selected===c?'selected':''}>${sfpEsc(c)}</option>`).join('')}
function setCategorySelectOptions(select,categories,preferred=''){if(!select)return;const allowed=categories?.length?categories:['Outros'],selected=allowed.includes(preferred)?preferred:(allowed.includes('Outros')?'Outros':allowed[0]);select.innerHTML=allowed.map(c=>`<option>${sfpEsc(c)}</option>`).join('');select.value=selected}
function syncTxCategoryOptions(preferred=null){const select=$('txCategory');if(!select)return;const action=currentKind==='income'?'income':'expense';setCategorySelectOptions(select,categoriesForAction(action),preferred??select.value)}
function syncRecCategoryOptions(preferred=null){const select=$('recCategory');if(!select)return;const action=$('recType')?.value==='income'?'income':'expense';setCategorySelectOptions(select,categoriesForAction(action),preferred??select.value)}
function normalizeStatementLabel(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim()}
function isStatementBalanceLabel(value){const d=normalizeStatementLabel(value);return /^(?:saldo|saldo do dia|saldo atual|saldo anterior|saldo final|saldo inicial|saldo disponivel|saldo em conta|saldo da conta|saldo total|saldo bancario)$/.test(d)}
function isStatementBalanceRow(row){return isStatementBalanceLabel(row?.desc)}"""
assert old in s, 'category constant not found'
s = s.replace(old, new, 1)

parser = r"""function parsePdfFinancialText(text,{intendedType='statement',month=null}={}){
  const lines=String(text||'').replace(/\u00a0/g,' ').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),rows=[];
  const hasValueBalanceColumns=intendedType==='statement'&&lines.some(line=>/\bvalor\b/i.test(line)&&/\bsaldo\b/i.test(line));
  const amountRe=/([+-]?\s*(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2}|\.\d{2}))\s*([CD])?/ig;
  for(const line of lines){
    const dt=pdfImportDate(line,{month});if(!dt)continue;
    const body=line.replace(dt.raw,' ').replace(/\s+/g,' ').trim();
    const monetary=[...body.matchAll(amountRe)];if(!monetary.length)continue;
    const movement=hasValueBalanceColumns&&monetary.length>=2?monetary[monetary.length-2]:monetary[monetary.length-1];
    let amount=parseMoney(movement[1]);const explicit=/^[+-]/.test(movement[1].replace(/\s|R\$/gi,''))||Boolean(movement[2]);
    if(movement[2]?.toUpperCase()==='D')amount=-Math.abs(amount);else if(movement[2]?.toUpperCase()==='C')amount=Math.abs(amount);
    const operationId=hasValueBalanceColumns?(body.match(/\b\d{10,20}\b/)||[])[0]||null:null;
    let desc=body.replace(amountRe,' ').replace(hasValueBalanceColumns?/\b\d{10,20}\b/g:/$^/g,' ').replace(/^[-–—|:;\s]+|[-–—|:;\s]+$/g,'').replace(/\s+/g,' ').trim();
    if(!desc||isStatementBalanceLabel(desc)||/^(total|vencimento|limite|resumo|valor)$/i.test(desc))continue;
    if(intendedType==='statement'&&!explicit){let d=normalizeStatementLabel(desc);if(/compra|debito|saque|tarifa|pix enviado|transferencia enviada|pagamento efetuado/.test(d))amount=-Math.abs(amount);else if(/credito|recebido|salario|pix recebido|estorno|rendimento/.test(d))amount=Math.abs(amount)}
    if(amount)rows.push({date:dt.date,desc,amount,fitid:operationId});
  }
  return rows;
}"""
s, n = re.subn(r"function parsePdfFinancialText\(text,\{intendedType='statement',month=null\}=\{\}\)\{.*?\n\}\n\nasync function importCardCsv", parser + "\n\nasync function importCardCsv", s, count=1, flags=re.S)
assert n == 1, f'PDF parser replacement count={n}'

old = "function prepareStatement(rows,file){\n let accountId="
new = "function prepareStatement(rows,file){\n rows=(rows||[]).filter(r=>!isStatementBalanceRow(r));\n let accountId="
assert old in s, 'prepareStatement start not found'
s = s.replace(old, new, 1)

old = """   seen.add(key);
   return{...r,fitid:fitid||null,index:i,key,accountId,duplicate,action,category:g.category,candidateId:cand?.id||null,"""
new = """   seen.add(key);
   let category=statementActionHasCategory(action)?normalizedCategoryForAction(action,g.category):null;
   return{...r,fitid:fitid||null,index:i,key,accountId,duplicate,action,category,candidateId:cand?.id||null,"""
assert old in s, 'statement category assignment not found'
s = s.replace(old, new, 1)

mobile = r"""function renderStatementDraftMobile(visibleIndexes){
  const host=$('stmtMobile');if(!host)return;
  host.innerHTML=visibleIndexes.map(i=>{
    const r=statementDraft[i],review=statementNeedsReview(r),transferVisible=['transfer','transfer_match','pending_transfer'].includes(r.action),categoryVisible=statementActionHasCategory(r.action);
    const categoryField=categoryVisible?`<label>Categoria<select data-sc="${i}">${categoryOptionsMarkup(r.action,r.category)}</select></label>`:'';
    return `<article class="stmt-review-card" data-review="${review?'true':'false'}"><div class="stmt-review-card__head"><div><b>${sfpEsc(r.desc)}</b><small>${dateObj(r.date).toLocaleDateString('pt-BR')} · <span class="stmt-review-card__status">${sfpEsc(statementDraftStatus(r))}</span></small></div><strong class="stmt-review-card__amount ${r.amount>0?'positive':'negative'}">${brl(r.amount)}</strong></div><div class="stmt-review-controls"><label>Ação<select data-sa="${i}">${statementActionOptions(r)}</select></label>${categoryField}${transferVisible?`<label>Transferir para<select data-st="${i}"><option value="">—</option>${state.accounts.filter(a=>a.id!=r.accountId).map(a=>`<option value="${a.id}" ${r.transferAccountId==a.id?'selected':''}>${sfpEsc(a.name)}</option>`).join('')}</select></label>`:''}<label class="stmt-review-learn"><input type="checkbox" data-sl="${i}" ${r.learn?'checked':''} ${['income','expense','transfer','ignore'].includes(r.action)?'':'disabled'}/> Aprender esta decisão</label></div></article>`;
  }).join('');
}"""
s, n = re.subn(r"function renderStatementDraftMobile\(visibleIndexes\)\{.*?\n\}\n\nfunction renderStatementDraft\(\)", mobile + "\n\nfunction renderStatementDraft()", s, count=1, flags=re.S)
assert n == 1, f'mobile renderer replacement count={n}'

old = """      <td>
        <select data-sc="${i}">
          ${CATEGORIES.map(c=>
            `<option ${r.category===c?'selected':''}>${c}</option>`
          ).join('')}
        </select>
      </td>"""
new = """      <td>
        ${statementActionHasCategory(r.action)?`<select data-sc="${i}">${categoryOptionsMarkup(r.action,r.category)}</select>`:'—'}
      </td>"""
assert old in s, 'desktop category cell not found'
s = s.replace(old, new, 1)

old = """  document.querySelectorAll('[data-sa]').forEach(e=>
    e.onchange=()=>{
      statementDraft[+e.dataset.sa].action=e.value;
      if(['income','expense','transfer','ignore'].includes(e.value))statementDraft[+e.dataset.sa].learn=true;
      renderStatementDraft();
    }
  );"""
new = """  document.querySelectorAll('[data-sa]').forEach(e=>
    e.onchange=()=>{
      const r=statementDraft[+e.dataset.sa];r.action=e.value;
      if(statementActionHasCategory(e.value))r.category=normalizedCategoryForAction(e.value,r.category);else r.category=null;
      if(['income','expense','transfer','ignore'].includes(e.value))r.learn=true;
      renderStatementDraft();
    }
  );"""
assert old in s, 'statement action handler not found'
s = s.replace(old, new, 1)

render_selects = r"""function renderSelects(){
 let acc=state.accounts.map(a=>`<option value="${a.id}">${sfpEsc(a.name)}</option>`).join(''),transferAcc=state.accounts.map(a=>`<option value="${a.id}">${sfpEsc(a.name)} • ${state.settings?.privacy?'••••':brl(accountBalance(a.id))}</option>`).join(''),cards=state.cards.map(c=>`<option value="${c.id}">${sfpEsc(c.name)}</option>`).join('');
 ['txAccount','stmtAccount','cardPayAccount','recAccount','debtAccount','goalAccount'].forEach(id=>{if($(id))$(id).innerHTML=acc});
 ['txFrom','txTo'].forEach(id=>{if($(id))$(id).innerHTML=transferAcc});
 ['txCard','invoiceCard','cardImportCard'].forEach(id=>{if($(id))$(id).innerHTML=cards});
 syncTxCategoryOptions();syncRecCategoryOptions();
 if($('catBudgetCategory'))setCategorySelectOptions($('catBudgetCategory'),EXPENSE_CATEGORIES,$('catBudgetCategory').value);
}"""
s, n = re.subn(r"function renderSelects\(\)\{.*?\n\}\nfunction renderTop\(\)", render_selects + "\nfunction renderTop()", s, count=1, flags=re.S)
assert n == 1, f'renderSelects replacement count={n}'

old = "$('txSubmit').textContent={expense:'Registrar gasto',bill:'Adicionar conta a pagar',card:'Adicionar compra',income:'Adicionar receita',transfer:'Transferir'}[k];applyTxKindCopy()\n}"
new = "$('txSubmit').textContent={expense:'Registrar gasto',bill:'Adicionar conta a pagar',card:'Adicionar compra',income:'Adicionar receita',transfer:'Transferir'}[k];applyTxKindCopy();syncTxCategoryOptions()\n}"
assert old in s, 'setKind tail not found'
s = s.replace(old, new, 1)

old = "window.editRec=id=>{let r=state.recurring.find(x=>x.id===id);if(!r)return;$('recId').value=r.id;$('recDesc').value=r.desc;$('recType').value=r.type;$('recAmount').value=r.amount;$('recDay').value=r.day;$('recCategory').value=r.category;$('recAccount').value=r.accountId;$('recStart').value=r.start;$('recEnd').value=r.end||'';setPage('recorrencias')}"
new = "window.editRec=id=>{let r=state.recurring.find(x=>x.id===id);if(!r)return;$('recId').value=r.id;$('recDesc').value=r.desc;$('recType').value=r.type;syncRecCategoryOptions(r.category);$('recAmount').value=r.amount;$('recDay').value=r.day;$('recAccount').value=r.accountId;$('recStart').value=r.start;$('recEnd').value=r.end||'';setPage('recorrencias')}"
assert old in s, 'editRec not found'
s = s.replace(old, new, 1)

old = "function initOther(){\n updateContextFab();"
new = "function initOther(){\n updateContextFab();\n if($('recType'))$('recType').onchange=()=>syncRecCategoryOptions();"
assert old in s, 'initOther start not found'
s = s.replace(old, new, 1)

old = "category:$('recCategory').value,accountId:+$('recAccount').value"
new = "category:normalizedCategoryForAction($('recType').value,$('recCategory').value),accountId:+$('recAccount').value"
assert old in s, 'recurring category persistence not found'
s = s.replace(old, new, 1)

old = "category:$('txCategory').value,accountId:+$('txAccount').value,status"
new = "category:normalizedCategoryForAction(kind,$('txCategory').value),accountId:+$('txAccount').value,status"
assert old in s, 'transaction category persistence not found'
s = s.replace(old, new, 1)

HTML.write_text(s, encoding='utf-8')

q = QA.read_text(encoding='utf-8')
marker = "RC4 separa Valor de Saldo"
if marker not in q:
    q += r'''

test('RC4 separa Valor de Saldo em extrato tabular e remove ID operacional da descrição',async({page})=>{
  await boot(page);
  const rows=await page.evaluate(()=>parsePdfFinancialText(`Data Descrição ID da operação Valor Saldo
07/08/2026 Pagamento Loja Exemplo 171601400157 R$ -28,00 R$ 1.068,67
08/08/2026 Pagamento Mercado Exemplo 171822116995 R$ -77,91 R$ 941,05`,{intendedType:'statement',month:'2026-08'}));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({date:'2026-08-07',desc:'Pagamento Loja Exemplo',amount:-28,fitid:'171601400157'});
  expect(rows[1]).toMatchObject({date:'2026-08-08',desc:'Pagamento Mercado Exemplo',amount:-77.91,fitid:'171822116995'});
  expect(rows.map(r=>r.amount)).not.toContain(1068.67);
  expect(rows.map(r=>r.amount)).not.toContain(941.05);
});

test('linhas de saldo são descartadas antes da revisão',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const parsed=parsePdfFinancialText(`Data Descrição ID da operação Valor Saldo
26/08/2026 SALDO DO DIA R$ -22,18
26/08/2026 Pagamento real 172000000001 R$ -22,18 R$ 100,00`,{intendedType:'statement',month:'2026-08'});
    document.querySelector('#stmtAccount').value=String(state.accounts[0].id);
    prepareStatement([...parsed,{date:'2026-08-26',desc:'Saldo atual',amount:100}], 'saldo.pdf');
    return {parsed,draft:statementDraft.map(r=>({desc:r.desc,amount:r.amount}))};
  });
  expect(result.parsed).toHaveLength(1);
  expect(result.parsed[0]).toMatchObject({desc:'Pagamento real',amount:-22.18});
  expect(result.draft).toEqual([{desc:'Pagamento real',amount:-22.18}]);
});

test('transferência não exibe categoria e receita usa apenas categorias de entrada',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  await page.evaluate(()=>{
    statementReviewMode='all';
    document.querySelector('#stmtAccount').value=String(state.accounts[0].id);
    prepareStatement([
      {date:'2026-08-17',desc:'PIX TRANSF CONTA PROPRIA',amount:-50},
      {date:'2026-08-21',desc:'SALARIO EMPRESA',amount:1000}
    ],'categorias.csv');
  });
  const cards=page.locator('#stmtMobile .stmt-review-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('[data-sc]')).toHaveCount(0);
  const incomeSelect=cards.nth(1).locator('[data-sc]');
  await expect(incomeSelect).toHaveCount(1);
  const labels=await incomeSelect.locator('option').allTextContents();
  expect(labels).toContain('Trabalho');
  expect(labels).toContain('Rendimentos');
  expect(labels).not.toContain('Faculdade');
  expect(labels).not.toContain('Saúde');
  expect(labels).not.toContain('Assinaturas');
  expect(labels).not.toContain('Dívida');
});
'''
QA.write_text(q, encoding='utf-8')

g = GRADLE.read_text(encoding='utf-8')
old = "# RC3 do ciclo 2.2: importação mobile, PDF local, autoclassificação e reimportação idempotente.\nSFP_VERSION_CODE=12\nSFP_VERSION_NAME=2.2.0-rc.3"
new = "# RC4 do ciclo 2.2: parser Valor x Saldo e semântica de categorias por natureza.\nSFP_VERSION_CODE=13\nSFP_VERSION_NAME=2.2.0-rc.4"
assert old in g, 'RC3 version block not found'
g = g.replace(old, new, 1)
GRADLE.write_text(g, encoding='utf-8')
