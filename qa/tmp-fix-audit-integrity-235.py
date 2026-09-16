from pathlib import Path

AUDIT = Path('app/src/main/assets/www/audit-hardening.js')
QA = Path('.github/workflows/qa.yml')
SPEC = Path('qa/audit-historical-integrity-repair.spec.js')

text = AUDIT.read_text(encoding='utf-8')
marker = "  function install(){\n"
if marker not in text:
    raise SystemExit('marker install() not found in audit-hardening.js')
if 'installAuditIntegrityRepair' in text:
    raise SystemExit('audit integrity repair already installed')

block = r'''  function installAuditIntegrityRepair(){
    if(window.__SFP_SAFE_AUDIT_REPAIR_V1) return;
    const originalAuditData=window.auditData;
    const originalRenderAudit=window.renderAudit;
    if(typeof originalAuditData!=='function'||typeof originalRenderAudit!=='function')return;
    window.__SFP_SAFE_AUDIT_REPAIR_V1=true;

    const roundMoney=value=>Math.round((Number(value)||0)*100)/100;
    const monthNow=()=>{
      if(typeof localCivilMonth==='function')return localCivilMonth();
      const d=new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    };
    const invoiceById=id=>(state.invoices||[]).find(inv=>String(inv.id)===String(id));
    const cardName=inv=>card(inv?.cardId)?.name||inv?.cardId||'cartão';

    function historicalRepairPlan(inv){
      if(!inv||inv.historicalOnly)return null;
      const official=Number(inv.officialTotal);
      const paid=Number(inv.paidAmount)||0;
      const calc=Number(invoiceCalculated(inv.cardId,inv.month))||0;
      if(!Number.isFinite(official)||official<=0||Math.abs(official-paid)>.01)return null;
      const payments=Array.isArray(inv.payments)?inv.payments:[];
      const neutralEvidence=payments.length>0&&payments.every(p=>p&&p.balanceImpact===false&&(Number(p.amount)||0)>0);
      if(!neutralEvidence)return null;
      const sourceEvidence=payments.every(p=>String(p.sourceDesc||p.source||'').trim());
      if(calc<=.01&&sourceEvidence){
        return{mode:'placeholder',official:roundMoney(official),paid:roundMoney(paid),calc:roundMoney(calc)};
      }
      const month=String(inv.month||'');
      const settledStatus=inv.status==='paid'||inv.status==='closed';
      if(!settledStatus||!/^\d{4}-\d{2}$/.test(month)||month>=monthNow())return null;
      if(calc<=.01||Math.abs(calc-official)<=.01)return null;
      return{mode:'partial-history',official:roundMoney(official),paid:roundMoney(paid),calc:roundMoney(calc)};
    }

    function safeRows(){
      return(state.invoices||[]).map(inv=>({inv,plan:historicalRepairPlan(inv)})).filter(row=>row.plan);
    }

    function criticalSolution(issue){
      if(issue?.solution||issue?.level!=='critical')return issue?.solution||'';
      const text=String(issue?.text||'');
      if(issue?.type==='orphan-reference')return 'Não apague registros no escuro. Exporte o diagnóstico e refaça o vínculo com a conta ou cartão correto.';
      if(/ID duplicado/i.test(text))return 'Exporte o diagnóstico antes de alterar. IDs são chaves internas e precisam ser reconciliados sem apagar histórico financeiro.';
      if(/valor inválido/i.test(text))return 'Abra o lançamento correspondente e corrija o valor para um número positivo; se veio de importação, confira também a origem.';
      if(/parcelas inválidas/i.test(text))return 'Abra a compra e defina pelo menos 1 parcela, preservando o valor total e a data original.';
      if(/saldo negativo/i.test(text))return 'Revise o contrato e o histórico da dívida antes de ajustar o saldo devedor.';
      if(/limite inválido/i.test(text))return 'Revise o orçamento da categoria e informe um limite maior que zero.';
      return 'Exporte o diagnóstico antes de alterar dados. Este caso não é corrigido automaticamente porque pode afetar dinheiro ou vínculos.';
    }

    const wrappedAuditData=function(){
      const result=originalAuditData.apply(this,arguments)||{issues:[],dups:0};
      const issues=[];
      for(const raw of Array.isArray(result.issues)?result.issues:[]){
        const issue={...raw};
        const inv=issue.invoiceId!=null?invoiceById(issue.invoiceId):null;
        if(inv?.historicalOnly&&issue.type==='invoice-total-mismatch')continue;
        const plan=inv?historicalRepairPlan(inv):null;
        if(plan&&issue.type==='invoice-total-mismatch'){
          issue.type='historical-invoice-partial';
          issue.repairable=true;
          issue.text=`Fatura ${cardName(inv)} ${inv.month}: liquidada por ${brl(plan.official)}, mas o histórico local soma ${brl(plan.calc)}.`;
          issue.solution='Classifique como histórico seguro: o SFP mantém pagamento e total oficial e não altera saldo de conta.';
        }else if(plan&&issue.type==='historical-invoice-placeholder'){
          issue.repairable=true;
          issue.solution='Marque como pagamento histórico para remover o falso conflito sem inventar compras ou alterar saldo.';
        }else if(!issue.solution){
          issue.solution=criticalSolution(issue);
        }
        issues.push(issue);
      }
      return{...result,issues,critical:issues.filter(i=>i.level==='critical').length,warnings:issues.filter(i=>i.level==='warning').length};
    };
    wrappedAuditData.__sfpSafeHistoricalRepair=true;
    window.auditData=wrappedAuditData;

    function applyHistoricalRepair(inv,plan){
      inv.historicalOnly=true;
      inv.historicalRepairMode=plan.mode;
      inv.historicalRepairAt=new Date().toISOString();
      if(plan.mode==='placeholder')inv.officialTotal=null;
    }

    function balancesSnapshot(){
      return(state.accounts||[]).map(a=>[String(a.id),Math.round((Number(accountBalance(a.id))||0)*100)]).sort((a,b)=>a[0].localeCompare(b[0]));
    }

    function sameBalances(a,b){
      return a.length===b.length&&a.every((row,index)=>row[0]===b[index][0]&&row[1]===b[index][1]);
    }

    async function persistRepairs(rows,label){
      const before=balancesSnapshot();
      const backup=rows.map(({inv})=>({
        id:inv.id,
        officialTotal:inv.officialTotal,
        historicalOnly:inv.historicalOnly,
        historicalRepairMode:inv.historicalRepairMode,
        historicalRepairAt:inv.historicalRepairAt
      }));
      rows.forEach(({inv,plan})=>applyHistoricalRepair(inv,plan));
      await save(label);
      const after=balancesSnapshot();
      if(!sameBalances(before,after)){
        backup.forEach(old=>{
          const inv=invoiceById(old.id);if(!inv)return;
          if(old.officialTotal===undefined)delete inv.officialTotal;else inv.officialTotal=old.officialTotal;
          if(old.historicalOnly===undefined)delete inv.historicalOnly;else inv.historicalOnly=old.historicalOnly;
          if(old.historicalRepairMode===undefined)delete inv.historicalRepairMode;else inv.historicalRepairMode=old.historicalRepairMode;
          if(old.historicalRepairAt===undefined)delete inv.historicalRepairAt;else inv.historicalRepairAt=old.historicalRepairAt;
        });
        await save('Reverter correção de integridade por proteção de saldo');
        renderAll();
        showFeedback('A correção foi revertida porque o saldo de uma conta mudaria. Nenhum ajuste financeiro foi mantido.',{title:'Proteção de integridade',type:'error'});
        return false;
      }
      renderAll();
      return true;
    }

    window.repairHistoricalInvoice=async invoiceId=>{
      const inv=invoiceById(invoiceId),plan=historicalRepairPlan(inv);
      if(!inv||!plan)return toast('Esse registro não pode ser corrigido automaticamente com segurança.','warning');
      const partial=plan.mode==='partial-history';
      const ok=await sfpConfirm({
        title:partial?'Classificar fatura histórica':'Marcar pagamento histórico',
        message:partial
          ?`A fatura ${inv.month} está liquidada e o pagamento confere com o total oficial, mas faltam compras antigas na base. O SFP manterá o total oficial e o pagamento, marcará o ciclo como histórico e não alterará saldo. Continuar?`
          :'As compras desta fatura não estão na base. O SFP vai remover o total inferido pelo pagamento e manter o pagamento histórico, sem alterar saldo de conta. Continuar?',
        confirmText:'Corrigir registro',cancelText:'Cancelar'
      });
      if(!ok)return;
      if(await persistRepairs([{inv,plan}],'Corrigir fatura histórica com segurança')){
        showFeedback(partial?'Fatura histórica classificada sem alterar saldo, pagamento ou total oficial.':'Pagamento histórico preservado sem inventar o total da fatura.',{title:'Integridade corrigida',type:'success'});
      }
    };

    window.repairSafeHistoricalAudit=async()=>{
      const rows=safeRows();
      if(!rows.length){toast('Nenhuma inconsistência histórica pode ser corrigida automaticamente com segurança.','success');return false}
      const partial=rows.filter(row=>row.plan.mode==='partial-history').length;
      const placeholders=rows.length-partial;
      const details=[partial?`${partial} fatura(s) liquidada(s) com histórico parcial`:null,placeholders?`${placeholders} pagamento(s) histórico(s) sem compras locais`:null].filter(Boolean).join(' e ');
      const ok=await sfpConfirm({
        title:'Corrigir integridade histórica',
        message:`Foram encontrados ${details}. O SFP vai apenas classificar evidências históricas comprovadas, sem criar compras, sem apagar pagamentos e sem alterar saldos. Continuar?`,
        confirmText:`Corrigir ${rows.length} registro${rows.length===1?'':'s'}`,cancelText:'Cancelar'
      });
      if(!ok)return false;
      const done=await persistRepairs(rows,'Corrigir integridade histórica segura');
      if(done)showFeedback(`${rows.length} registro(s) histórico(s) corrigido(s) sem alterar saldos.`,{title:'Integridade corrigida',type:'success'});
      return done;
    };

    window.renderAudit=function(){
      const out=originalRenderAudit.apply(this,arguments);
      const rows=safeRows();
      const button=document.getElementById('repairSafeHistoricalAudit');
      if(button){
        button.disabled=!rows.length;
        button.textContent=rows.length?`Corrigir ${rows.length} inconsistência${rows.length===1?'':'s'} histórica${rows.length===1?'':'s'} segura${rows.length===1?'':'s'}`:'Nenhuma correção histórica segura';
      }
      document.querySelectorAll('[data-audit-repair]').forEach(btn=>btn.onclick=()=>window.repairHistoricalInvoice(+btn.dataset.auditRepair));
      return out;
    };

    const anchor=document.getElementById('repairOrphans');
    if(anchor&&!document.getElementById('repairSafeHistoricalAudit')){
      const button=document.createElement('button');
      button.type='button';button.className='btn2 wide';button.id='repairSafeHistoricalAudit';
      button.onclick=()=>window.repairSafeHistoricalAudit();
      anchor.parentElement?.insertBefore(button,anchor);
    }
    const run=document.getElementById('runAudit');
    if(run)run.onclick=window.renderAudit;
    window.renderAudit();
  }

'''
text = text.replace(marker, block + marker, 1)
install_marker = "    installInvoiceInstallmentProjection();\n  }"
if install_marker not in text:
    raise SystemExit('installInvoiceInstallmentProjection marker not found')
text = text.replace(install_marker, "    installInvoiceInstallmentProjection();\n    installAuditIntegrityRepair();\n  }", 1)
AUDIT.write_text(text, encoding='utf-8')

qa = QA.read_text(encoding='utf-8')
qa_marker = "                app/src/main/assets/www/ui-hardening.js|app/src/main/assets/www/ui-hardening.css)\n"
if qa_marker not in qa:
    raise SystemExit('qa selector marker not found')
qa_rule = "                app/src/main/assets/www/audit-hardening.js)\n                  static=true\n                  add_glob 'qa/audit*.spec.js'\n                  ;;\n\n"
if "app/src/main/assets/www/audit-hardening.js)" not in qa:
    qa = qa.replace(qa_marker, qa_rule + qa_marker, 1)
QA.write_text(qa, encoding='utf-8')

SPEC.write_text(r'''const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

async function boot(page, value) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(v => localStorage.setItem('sfp_final_fallback', JSON.stringify(v)), value);
  await page.reload();
  await page.waitForFunction(name => typeof state !== 'undefined' && state?.settings?.name === name, value.settings.name);
}

test('AUDIT-HIST-01: fatura liquidada com histórico parcial pode ser corrigida em lote sem alterar saldo', async ({ page }) => {
  const value = fixture('Histórico parcial seguro');
  value.purchases.push({
    id: 501, cardId: 1, desc: 'Compra preservada', total: 30, installments: 1,
    purchaseDate: '2026-01-05', firstMonth: '2026-01', category: 'Outros', status: 'active', refunds: []
  });
  value.invoices.push({
    id: 581, cardId: 1, month: '2026-01', status: 'paid', paidAmount: 100,
    officialTotal: 100, accountId: 1,
    payments: [{ date: '2026-02-01', amount: 100, balanceImpact: false, targetMonth: '2026-01', sourceDesc: 'Pagamento recebido' }]
  });
  await boot(page, value);

  const before = await page.evaluate(() => ({
    balance: accountBalance(1),
    issue: auditData().issues.find(i => i.invoiceId === 581)
  }));
  expect(before.issue).toMatchObject({ type: 'historical-invoice-partial', repairable: true });

  await page.evaluate(() => setPage('auditoria'));
  const batch = page.locator('#repairSafeHistoricalAudit');
  await expect(batch).toBeEnabled();
  await expect(batch).toContainText('1 inconsistência histórica segura');
  await batch.click();
  await page.getByRole('button', { name: 'Corrigir 1 registro' }).click();

  await expect.poll(() => page.evaluate(() => state.invoices.find(i => i.id === 581)?.historicalOnly)).toBe(true);
  const after = await page.evaluate(() => {
    const inv = state.invoices.find(i => i.id === 581);
    return {
      balance: accountBalance(1),
      officialTotal: inv.officialTotal,
      paidAmount: inv.paidAmount,
      paymentCount: inv.payments.length,
      paymentImpact: inv.payments[0].balanceImpact,
      purchaseStillExists: state.purchases.some(p => p.id === 501),
      remaining: auditData().issues.filter(i => i.invoiceId === 581).length,
      repairMode: inv.historicalRepairMode
    };
  });
  expect(after).toMatchObject({
    balance: before.balance,
    officialTotal: 100,
    paidAmount: 100,
    paymentCount: 1,
    paymentImpact: false,
    purchaseStillExists: true,
    remaining: 0,
    repairMode: 'partial-history'
  });

  const second = await page.evaluate(async () => {
    const before = JSON.stringify(state.invoices.find(i => i.id === 581));
    const result = await repairSafeHistoricalAudit();
    const after = JSON.stringify(state.invoices.find(i => i.id === 581));
    return { result, same: before === after };
  });
  expect(second).toEqual({ result: false, same: true });
});

test('AUDIT-HIST-02: fatura atual ou aberta continua exigindo revisão manual', async ({ page }) => {
  const value = fixture('Fatura atual ambígua');
  value.purchases.push({
    id: 502, cardId: 1, desc: 'Compra atual', total: 30, installments: 1,
    purchaseDate: '2026-09-05', firstMonth: '2026-09', category: 'Outros', status: 'active', refunds: []
  });
  value.invoices.push({
    id: 582, cardId: 1, month: '2026-09', status: 'open', paidAmount: 0,
    officialTotal: 100, accountId: 1, payments: []
  });
  await boot(page, value);

  const issue = await page.evaluate(() => auditData().issues.find(i => i.invoiceId === 582));
  expect(issue.type).toBe('invoice-total-mismatch');
  expect(issue.repairable).not.toBe(true);

  await page.evaluate(() => setPage('auditoria'));
  await expect(page.locator('#auditIssues [data-audit-invoice="1:2026-09"]')).toBeVisible();
  await expect(page.locator('#repairSafeHistoricalAudit')).toBeDisabled();
});

test('AUDIT-HIST-03: críticos não reparáveis explicam o próximo passo', async ({ page }) => {
  const value = fixture('Crítico explicado');
  value.transactions.push({
    id: 777, kind: 'expense', desc: 'Lançamento quebrado', amount: 0,
    date: '2026-01-08', category: 'Outros', accountId: 1, status: 'paid'
  });
  await boot(page, value);

  const issue = await page.evaluate(() => auditData().issues.find(i => i.level === 'critical' && /valor inválido/i.test(i.text)));
  expect(issue).toBeTruthy();
  expect(issue.solution).toMatch(/corrija o valor/i);

  await page.evaluate(() => setPage('auditoria'));
  await expect(page.locator('#auditIssues')).toContainText('Como resolver:');
  await expect(page.locator('#auditIssues')).toContainText('corrija o valor');
});
''', encoding='utf-8')

print('patched audit-hardening.js, qa.yml and audit-historical-integrity-repair.spec.js')
