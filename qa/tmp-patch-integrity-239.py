from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

# -----------------------------------------------------------------------------
# Open Finance: collision-proof internal ids
# -----------------------------------------------------------------------------
of_path = Path('app/src/main/assets/www/open-finance-sync-accounts.js')
of = of_path.read_text(encoding='utf-8')
of = replace_once(of, "  const VERSION=2;", "  const VERSION=3;", 'OF version')
of = replace_once(
    of,
    "  const sameId=(a,b)=>String(a)===String(b);\n",
    "  const sameId=(a,b)=>String(a)===String(b);\n  const generatedInternalIds=new Set();\n\n  function nextInternalId(){\n    const used=new Set(generatedInternalIds);\n    const collections=['accounts','cards','transactions','purchases','transfers','debts','invoices','invoiceAdjustments','recurring','goals'];\n    for(const name of collections){\n      for(const row of Array.isArray(global.state?.[name])?global.state[name]:[]){\n        if(row?.id!==undefined&&row?.id!==null)used.add(String(row.id));\n      }\n    }\n    let candidate=Date.now();\n    while(used.has(String(candidate)))candidate++;\n    generatedInternalIds.add(String(candidate));\n    return candidate;\n  }\n",
    'OF id helper'
)
of = of.replace("id:typeof global.uid==='function'?global.uid():Date.now()+Math.floor(Math.random()*1000),", "id:nextInternalId(),")
if of.count('id:nextInternalId(),') != 2:
    raise SystemExit(f'OF id usages: expected 2 replacements, found {of.count("id:nextInternalId(),")}')
of = replace_once(
    of,
    "global.SFPOpenFinanceUnifiedSync=Object.freeze({version:VERSION,planBankSync,decoratePreview,syncAll});",
    "global.SFPOpenFinanceUnifiedSync=Object.freeze({version:VERSION,planBankSync,decoratePreview,syncAll,nextInternalId});",
    'OF export helper'
)
of_path.write_text(of, encoding='utf-8')

# -----------------------------------------------------------------------------
# Audit: distinguish bank truth from missing local detail + repair duplicate ids
# -----------------------------------------------------------------------------
a_path = Path('app/src/main/assets/www/audit-hardening.js')
a = a_path.read_text(encoding='utf-8')
anchor = "    const invoiceById=id=>(state.invoices||[]).find(inv=>String(inv.id)===String(id));\n    const cardName=inv=>card(inv?.cardId)?.name||inv?.cardId||'cartão';\n"
insert = anchor + """
    const sameEntityId=(a,b)=>String(a)===String(b);

    function invoiceHasLocalDetail(inv){
      if(!inv)return false;
      let purchaseRows=[];
      try{
        purchaseRows=typeof installments==='function'
          ?(installments(inv.month)||[]).filter(row=>sameEntityId(row?.card?.id??row?.purchase?.cardId,inv.cardId))
          :[];
      }catch(_){purchaseRows=[]}
      let adjustments=[];
      try{adjustments=typeof invoiceAdjustments==='function'?(invoiceAdjustments(inv.cardId,inv.month)||[]):[]}catch(_){adjustments=[]}
      const imports=(state.invoiceImports||[]).filter(row=>sameEntityId(row?.cardId,inv.cardId)&&[row?.month,row?.invoiceMonth,row?.targetMonth].includes(inv.month));
      const importedRows=imports.some(row=>Number(row?.count??row?.importedCount??row?.created??0)>0);
      return purchaseRows.length>0||adjustments.length>0||importedRows;
    }

    function openFinanceOfficialWithoutLocalDetail(inv){
      if(!inv)return false;
      const official=Number(inv.officialTotal);
      const calc=Number(invoiceCalculated(inv.cardId,inv.month))||0;
      const authoritative=String(inv.officialTotalSource||'').trim()==='open-finance-bill'||Boolean(String(inv.openFinanceBillId||'').trim());
      return authoritative&&Number.isFinite(official)&&official>0&&Math.abs(calc)<=.01&&!invoiceHasLocalDetail(inv);
    }

    function duplicateTransactionGroups(){
      const groups=new Map();
      for(const tx of state.transactions||[]){
        const key=String(tx?.id);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(tx);
      }
      return Array.from(groups.entries()).filter(([,rows])=>rows.length>1).map(([id,rows])=>({id,rows}));
    }

    function transactionReferencePaths(id){
      const hits=[],seen=new Set(),target=String(id);
      const visit=(value,path)=>{
        if(!value||typeof value!=='object'||seen.has(value))return;
        seen.add(value);
        if(Array.isArray(value)){
          value.forEach((child,index)=>visit(child,`${path}[${index}]`));
          return;
        }
        for(const [key,child] of Object.entries(value)){
          const next=path?`${path}.${key}`:key;
          if(/transaction.*id/i.test(key)&&child!==null&&child!==undefined&&String(child)===target)hits.push(next);
          if(child&&typeof child==='object')visit(child,next);
        }
      };
      for(const [key,value] of Object.entries(state||{})){
        if(key==='transactions')continue;
        visit(value,key);
      }
      return hits;
    }

    function duplicateTransactionPlans(){
      return duplicateTransactionGroups().map(group=>({...group,references:transactionReferencePaths(group.id)}));
    }

    function safeDuplicateTransactionPlans(){
      return duplicateTransactionPlans().filter(group=>group.references.length===0);
    }

    function nextUniqueTransactionId(used){
      let candidate=Date.now();
      while(used.has(String(candidate)))candidate++;
      used.add(String(candidate));
      return candidate;
    }
"""
a = replace_once(a, anchor, insert, 'audit helper insertion')

old_loop = """        const issue={...raw};
        const inv=issue.invoiceId!=null?invoiceById(issue.invoiceId):null;
        if(inv?.historicalOnly&&issue.type==='invoice-total-mismatch')continue;
        const plan=inv?historicalRepairPlan(inv):null;
"""
new_loop = """        const issue={...raw};
        const inv=issue.invoiceId!=null?invoiceById(issue.invoiceId):null;
        if(issue.type==='invoice-total-mismatch'&&openFinanceOfficialWithoutLocalDetail(inv))continue;
        if(inv?.historicalOnly&&issue.type==='invoice-total-mismatch')continue;
        const duplicateMatch=issue.level==='critical'?String(issue.text||'').match(/^ID duplicado em transactions:\\s*(.+)$/i):null;
        if(duplicateMatch){
          const duplicateId=duplicateMatch[1].trim();
          const duplicatePlan=duplicateTransactionPlans().find(row=>row.id===duplicateId);
          issue.type='duplicate-transaction-id';
          issue.duplicateId=duplicateId;
          issue.solution=duplicatePlan?.references?.length
            ?`Este ID é referenciado em ${duplicatePlan.references.length} vínculo(s) interno(s). O SFP não vai reindexá-lo automaticamente; exporte o diagnóstico para revisão.`
            :'O SFP pode reindexar somente as cópias extras desse ID, preservando todos os valores e saldos.';
        }
        const plan=inv?historicalRepairPlan(inv):null;
"""
a = replace_once(a, old_loop, new_loop, 'audit issue loop')

old_before_render = """    window.renderAudit=function(){
      const out=originalRenderAudit.apply(this,arguments);
      const rows=safeRows();
      const button=document.getElementById('repairSafeHistoricalAudit');
"""
new_before_render = """    window.repairSafeDuplicateTransactionIds=async()=>{
      const allPlans=duplicateTransactionPlans();
      const rows=allPlans.filter(group=>group.references.length===0);
      if(!rows.length){
        const blocked=allPlans.length;
        toast(blocked?'Os IDs duplicados encontrados possuem referências internas e não serão alterados automaticamente.':'Nenhum ID duplicado de transação precisa de correção.','info');
        return false;
      }
      const changedCount=rows.reduce((sum,row)=>sum+Math.max(0,row.rows.length-1),0);
      const ok=await sfpConfirm({
        title:'Corrigir IDs duplicados',
        message:`O SFP encontrou ${rows.length} grupo(s) de ID duplicado sem referências ambíguas. Apenas ${changedCount} cópia(s) extra(s) receberão novos IDs internos; valores, datas, contas, descrições, saldos e quantidade de lançamentos serão preservados. Continuar?`,
        confirmText:'Corrigir IDs',cancelText:'Cancelar'
      });
      if(!ok)return false;
      const beforeBalances=balancesSnapshot(),beforeCount=(state.transactions||[]).length;
      const changed=[];
      const used=new Set((state.transactions||[]).map(tx=>String(tx.id)));
      for(const group of rows){
        for(const tx of group.rows.slice(1)){
          changed.push({tx,id:tx.id});
          tx.id=nextUniqueTransactionId(used);
        }
      }
      await save('Corrigir IDs duplicados de transações');
      const safe=sameBalances(beforeBalances,balancesSnapshot())&&beforeCount===(state.transactions||[]).length;
      if(!safe){
        changed.forEach(row=>{row.tx.id=row.id});
        await save('Reverter correção de IDs duplicados por proteção de integridade');
        renderAll();
        showFeedback('A correção de IDs foi revertida porque alteraria a integridade financeira. Nenhuma mudança foi mantida.',{title:'Proteção de integridade',type:'error'});
        return false;
      }
      renderAll();
      showFeedback(`${changed.length} ID(s) interno(s) duplicado(s) foram reindexados sem alterar nenhum valor financeiro.`,{title:'IDs corrigidos',type:'success'});
      return true;
    };

    window.renderAudit=function(){
      const out=originalRenderAudit.apply(this,arguments);
      const rows=safeRows();
      const button=document.getElementById('repairSafeHistoricalAudit');
"""
a = replace_once(a, old_before_render, new_before_render, 'duplicate repair function')

old_render_tail = """      if(button){
        button.disabled=!rows.length;
        button.textContent=rows.length?`Corrigir ${rows.length} inconsistência${rows.length===1?'':'s'} histórica${rows.length===1?'':'s'} segura${rows.length===1?'':'s'}`:'Nenhuma correção histórica segura';
      }
      document.querySelectorAll('[data-audit-repair]').forEach(btn=>btn.onclick=()=>window.repairHistoricalInvoice(+btn.dataset.auditRepair));
      return out;
    };

    const anchor=document.getElementById('repairOrphans');
"""
new_render_tail = """      if(button){
        button.disabled=!rows.length;
        button.textContent=rows.length?`Corrigir ${rows.length} inconsistência${rows.length===1?'':'s'} histórica${rows.length===1?'':'s'} segura${rows.length===1?'':'s'}`:'Nenhuma correção histórica segura';
      }
      const duplicatePlans=duplicateTransactionPlans();
      const safeDuplicates=duplicatePlans.filter(group=>group.references.length===0);
      const duplicateButton=document.getElementById('repairSafeDuplicateTransactionIds');
      if(duplicateButton){
        const copies=safeDuplicates.reduce((sum,row)=>sum+Math.max(0,row.rows.length-1),0);
        duplicateButton.disabled=!copies;
        duplicateButton.textContent=copies?`Corrigir ${copies} ID${copies===1?'':'s'} duplicado${copies===1?'':'s'} com segurança`:(duplicatePlans.length?'IDs duplicados exigem revisão':'Nenhum ID duplicado');
      }
      document.querySelectorAll('[data-audit-repair]').forEach(btn=>btn.onclick=()=>window.repairHistoricalInvoice(+btn.dataset.auditRepair));
      return out;
    };

    const anchor=document.getElementById('repairOrphans');
"""
a = replace_once(a, old_render_tail, new_render_tail, 'audit render duplicate state')

old_button_block = """    if(anchor&&!document.getElementById('repairSafeHistoricalAudit')){
      const button=document.createElement('button');
      button.type='button';button.className='btn2 wide';button.id='repairSafeHistoricalAudit';
      button.onclick=()=>window.repairSafeHistoricalAudit();
      anchor.parentElement?.insertBefore(button,anchor);
    }
"""
new_button_block = """    if(anchor&&!document.getElementById('repairSafeHistoricalAudit')){
      const button=document.createElement('button');
      button.type='button';button.className='btn2 wide';button.id='repairSafeHistoricalAudit';
      button.onclick=()=>window.repairSafeHistoricalAudit();
      anchor.parentElement?.insertBefore(button,anchor);
    }
    if(anchor&&!document.getElementById('repairSafeDuplicateTransactionIds')){
      const button=document.createElement('button');
      button.type='button';button.className='btn2 wide';button.id='repairSafeDuplicateTransactionIds';
      button.onclick=()=>window.repairSafeDuplicateTransactionIds();
      anchor.parentElement?.insertBefore(button,anchor);
    }
"""
a = replace_once(a, old_button_block, new_button_block, 'duplicate repair button')
a_path.write_text(a, encoding='utf-8')

# -----------------------------------------------------------------------------
# Focused Playwright regression coverage
# -----------------------------------------------------------------------------
test_path = Path('qa/audit-openfinance-integrity-239.spec.js')
test_path.write_text(r'''const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(name => typeof state !== 'undefined' && state?.settings?.name === name, value.settings.name);
}

test('AUDIT-OF-239-01: total oficial Open Finance sem detalhe local não é divergência', async ({ page }) => {
  const value = fixture('Open Finance sem fatura importada');
  value.invoices.push({
    id: 9001, cardId: 1, month: '2026-09', status: 'open', paidAmount: 0,
    officialTotal: 170.84, officialTotalSource: 'open-finance-bill', openFinanceBillId: 'bill-sep', payments: []
  });
  await boot(page, value);
  const issue = await page.evaluate(() => auditData().issues.find(i => i.invoiceId === 9001));
  expect(issue).toBeUndefined();
});

test('AUDIT-OF-239-02: divergência continua visível quando existem compras locais', async ({ page }) => {
  const value = fixture('Open Finance com detalhe divergente');
  value.purchases.push({
    id: 9002, cardId: 1, desc: 'Compra local', total: 252.48, installments: 1,
    purchaseDate: '2026-08-05', firstMonth: '2026-08', category: 'Outros', status: 'active', refunds: []
  });
  value.invoices.push({
    id: 9003, cardId: 1, month: '2026-08', status: 'closed', paidAmount: 0,
    officialTotal: 59.99, officialTotalSource: 'open-finance-bill', openFinanceBillId: 'bill-aug', payments: []
  });
  await boot(page, value);
  const issue = await page.evaluate(() => auditData().issues.find(i => i.invoiceId === 9003));
  expect(issue).toMatchObject({ type: 'invoice-total-mismatch', level: 'warning' });
});

test('AUDIT-ID-239-03: IDs duplicados sem referência são reindexados sem mudar saldo ou lançamentos', async ({ page }) => {
  const value = fixture('IDs duplicados seguros');
  value.transactions.push(
    { id: 9911, kind: 'expense', desc: 'Duplicado A', amount: 10, date: '2026-09-10', category: 'Outros', accountId: 1, status: 'paid', balanceImpact: true },
    { id: 9911, kind: 'expense', desc: 'Duplicado B', amount: 20, date: '2026-09-11', category: 'Outros', accountId: 1, status: 'paid', balanceImpact: true }
  );
  await boot(page, value);
  const before = await page.evaluate(() => ({ balance: accountBalance(1), count: state.transactions.length }));
  await page.evaluate(() => setPage('auditoria'));
  const button = page.locator('#repairSafeDuplicateTransactionIds');
  await expect(button).toBeEnabled();
  await expect(button).toContainText('Corrigir 1 ID duplicado com segurança');
  await button.click();
  await page.getByRole('button', { name: 'Corrigir IDs' }).click();
  await expect.poll(() => page.evaluate(() => new Set(state.transactions.map(t => String(t.id))).size)).toBe(value.transactions.length);
  const after = await page.evaluate(() => ({
    balance: accountBalance(1), count: state.transactions.length,
    duplicateIssue: auditData().issues.some(i => /ID duplicado em transactions/i.test(i.text)),
    rows: state.transactions.filter(t => ['Duplicado A','Duplicado B'].includes(t.desc)).map(t => ({ id: t.id, desc: t.desc, amount: t.amount }))
  }));
  expect(after.balance).toBe(before.balance);
  expect(after.count).toBe(before.count);
  expect(after.duplicateIssue).toBe(false);
  expect(after.rows.map(r => r.amount).sort((a,b)=>a-b)).toEqual([10,20]);
  expect(new Set(after.rows.map(r => String(r.id))).size).toBe(2);
});

test('AUDIT-ID-239-04: ID duplicado referenciado não é alterado automaticamente', async ({ page }) => {
  const value = fixture('ID duplicado ambíguo');
  value.transactions.push(
    { id: 9922, kind: 'expense', desc: 'Ambíguo A', amount: 10, date: '2026-09-10', category: 'Outros', accountId: 1, status: 'paid' },
    { id: 9922, kind: 'expense', desc: 'Ambíguo B', amount: 20, date: '2026-09-11', category: 'Outros', accountId: 1, status: 'paid' }
  );
  value.transfers.push({ id: 9933, desc: 'Referência existente', amount: 10, date: '2026-09-10', fromId: 1, toId: 2, sourceTransactionId: 9922 });
  await boot(page, value);
  const issue = await page.evaluate(() => auditData().issues.find(i => /ID duplicado em transactions: 9922/i.test(i.text)));
  expect(issue.solution).toMatch(/não vai reindexá-lo automaticamente/i);
  await page.evaluate(() => setPage('auditoria'));
  await expect(page.locator('#repairSafeDuplicateTransactionIds')).toBeDisabled();
});

test('OF-ID-239-05: gerador Open Finance permanece único mesmo com relógio congelado', async ({ page }) => {
  const value = fixture('IDs Open Finance');
  await boot(page, value);
  const ids = await page.evaluate(() => {
    const originalNow = Date.now;
    Date.now = () => 1789424856875;
    try {
      state.transactions.push({ id: 1789424856875, kind: 'expense', desc: 'ID já usado', amount: 1, date: '2026-09-01', category: 'Outros', accountId: 1, status: 'paid' });
      return Array.from({ length: 50 }, () => SFPOpenFinanceUnifiedSync.nextInternalId());
    } finally {
      Date.now = originalNow;
    }
  });
  expect(new Set(ids.map(String)).size).toBe(50);
  expect(ids.map(String)).not.toContain('1789424856875');
  const source = fs.readFileSync('app/src/main/assets/www/open-finance-sync-accounts.js', 'utf8');
  expect(source).not.toContain("Date.now()+Math.floor(Math.random()*1000)");
  expect((source.match(/id:nextInternalId\(\),/g) || []).length).toBe(2);
});
''', encoding='utf-8')

print('Integrity #239 patch applied')
