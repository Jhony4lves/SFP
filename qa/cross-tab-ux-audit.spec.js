const { test, expect } = require('@playwright/test');
const { fixture, writeIndexedDB, expectBootComplete } = require('./helpers');

const PAGES = ['hoje','sophy','dashboard','visao','lancamentos','extratos','contas','cartoes','recorrencias','orcamento','dividas','metas','patrimonio','calendario','relatorios','simuladores','dados','auditoria','config'];

function auditFixture(){
  const value = fixture('Auditoria UX cruzada');
  value.mesAtual = '2026-08';
  value.settings.theme = 'dark';
  value.settings.privacy = false;
  value.accounts = [
    { id:1, name:'Conta principal com nome propositalmente muito comprido para teste mobile', type:'Conta corrente', initial:2350.42, balanceMode:'snapshot', balanceDate:'2026-08-01' },
    { id:2, name:'Reserva secundária de emergência e objetivos de longo prazo', type:'Reserva', initial:980.10, balanceMode:'snapshot', balanceDate:'2026-08-01' }
  ];
  value.cards = [
    { id:1, name:'Cartão principal com identificação longa para teste responsivo', limit:4500, closeDay:9, dueDay:16, payAccountId:1, history:[] },
    { id:2, name:'Cartão secundário', limit:1800, closeDay:2, dueDay:10, payAccountId:1, history:[] }
  ];
  value.transactions = [
    { id:101, kind:'income', desc:'Recebimento mensal com descrição longa para validar quebra de linha', amount:2200, date:'2026-08-01', category:'Trabalho', accountId:1, status:'paid', balanceImpact:true },
    { id:102, kind:'expense', desc:'Compra de supermercado com descrição excepcionalmente longa para estressar o layout', amount:356.79, date:'2026-08-12', category:'Alimentação', accountId:1, status:'paid', balanceImpact:true },
    { id:103, kind:'expense', desc:'Conta futura importante', amount:490, date:'2026-08-28', category:'Casa', accountId:1, status:'pending', balanceImpact:false }
  ];
  value.transfers = [{ id:201, desc:'Transferência entre contas próprias com nome longo', amount:300, date:'2026-08-14', fromId:1, toId:2, balanceImpact:true }];
  value.purchases = [{ id:301, cardId:1, desc:'Compra parcelada com descrição longa para testar cartões e faturas', total:899.70, installments:3, purchaseDate:'2026-08-05', firstMonth:'2026-08', category:'Outros', status:'active', refunds:[] }];
  value.invoices = [{ id:401, cardId:1, month:'2026-08', status:'open', officialTotal:299.90, paidAmount:0, accountId:1, payments:[] }];
  value.recurring = [
    { id:501, desc:'Salário principal', type:'income', amount:2200, day:1, category:'Trabalho', accountId:1, start:'2026-08', end:'', active:true, skips:[], dateRule:'business-day-before-anchor', payrollAnchor:1 },
    { id:502, desc:'Assinatura mensal com descrição longa', type:'expense', amount:39.90, day:15, category:'Assinaturas', accountId:1, start:'2026-08', end:'', active:true, skips:[] }
  ];
  value.debts = [{ id:601, name:'Empréstimo pessoal com nome longo', balance:3200, rate:2.1, ratePeriod:'monthly', payment:345.67, installments:12, paidInstallments:1, firstDue:'2026-08-20', dueDay:20, accountId:1, paymentMethod:'bank', history:[] }];
  value.goals = [{ id:701, name:'Reserva de emergência com objetivo de longo prazo', target:10000, accountId:2, plan:500, targetDate:'2027-12', initialAllocated:980.10, history:[] }];
  value.assets = [{ id:801, name:'Notebook e equipamento profissional com descrição longa', value:4200 }];
  value.categoryBudgets = { Alimentação:700, Casa:900 };
  value.snapshots = [
    { id:901, month:'2026-06', netWorth:3500, income:2200, expense:1700 },
    { id:902, month:'2026-07', netWorth:4100, income:2300, expense:1600 }
  ];
  value.classificationRules = [{ id:1001, pattern:'MERCADO EXTREMAMENTE LONGO PARA TESTE', action:'expense', category:'Alimentação', source:'manual', learnedAt:'2026-08-01T12:00:00.000Z', example:'Mercado exemplo' }];
  return value;
}

async function boot(page){
  await page.addInitScript(() => {
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options){
      try {
        if(this instanceof Element){
          const current = new Set((this.dataset.qaEvents || '').split(',').filter(Boolean));
          current.add(type);
          this.dataset.qaEvents = [...current].join(',');
        }
      } catch {}
      return original.call(this, type, listener, options);
    };
  });
  const value = auditFixture();
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, value);
  await page.evaluate(value => localStorage.setItem('sfp_final_fallback', JSON.stringify(value)), value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state?.settings?.name === 'Auditoria UX cruzada' && typeof lastSavedState !== 'undefined' && lastSavedState);
}

async function scanPage(page, pageId, theme){
  return page.evaluate(({pageId,theme}) => {
    state.settings.theme = theme;
    applyTheme(theme);
    setPage(pageId, {mode:'replace'});
    renderAll();
    const root = document.getElementById(pageId);
    const visible = el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const intentionalScroller = el => !!el.closest('.tablewrap,.sophy-chat-scroll,.nav,.searchresults,.modalback');
    const describe = el => {
      const id = el.id ? `#${el.id}` : '';
      const cls = [...el.classList].slice(0,3).map(x=>`.`+x).join('');
      const txt = (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim().slice(0,70);
      return `${el.tagName.toLowerCase()}${id}${cls}${txt?` "${txt}"`:''}`;
    };
    const overflow = [...root.querySelectorAll('*')].filter(visible).filter(el => {
      if(intentionalScroller(el)) return false;
      const r = el.getBoundingClientRect();
      if(r.right > innerWidth + 1 || r.left < -1) return true;
      const cs = getComputedStyle(el);
      return el.scrollWidth > el.clientWidth + 3 && !['auto','scroll'].includes(cs.overflowX) && !['hidden','clip'].includes(cs.overflowX);
    }).map(describe).slice(0,12);

    const buttons = [...root.querySelectorAll('button')].filter(visible);
    const unboundButtons = buttons.filter(btn => {
      if(btn.disabled) return false;
      if(typeof btn.onclick === 'function' || btn.hasAttribute('onclick')) return false;
      if((btn.dataset.qaEvents || '').split(',').includes('click')) return false;
      const type = (btn.getAttribute('type') || 'submit').toLowerCase();
      if(type === 'submit' && btn.form){
        if(typeof btn.form.onsubmit === 'function' || (btn.form.dataset.qaEvents || '').split(',').includes('submit')) return false;
      }
      if(Object.keys(btn.dataset).some(k => k !== 'qaEvents')) return false;
      return true;
    }).map(describe).slice(0,12);

    const genericLabels = [...root.querySelectorAll('label')].filter(visible).map(label => {
      const clone = label.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,small').forEach(n=>n.remove());
      const text = (clone.textContent || '').replace(/\s+/g,' ').trim();
      const hasHelp = !!label.querySelector('small,.field-help');
      return {text,hasHelp,desc:describe(label)};
    }).filter(x => /^(Dia|Valor|Conta|Status|Nome|Tipo|Prazo|Fatura|Saldo|Parcela)$/i.test(x.text) && !x.hasHelp).map(x=>x.desc).slice(0,12);

    const tinyTargets = [...root.querySelectorAll('button,input,select')].filter(visible).filter(el => {
      const r=el.getBoundingClientRect();
      return r.width < 40 || r.height < 40;
    }).map(describe).slice(0,12);

    return {pageId,theme,overflow,unboundButtons,genericLabels,tinyTargets};
  }, {pageId,theme});
}

async function progressiveSaveState(page, opener, fill, submitSelector){
  await page.evaluate(opener);
  await fill();
  await page.locator(submitSelector).click();
  await page.waitForTimeout(120);
  return page.evaluate(() => ({
    progressiveOpen: typeof progressiveRestore !== 'undefined' && !!progressiveRestore,
    modalVisible: !document.getElementById('modalRoot').classList.contains('hidden')
  }));
}

test('CROSS-TAB-AUDIT: repetições dos problemas de UX em todas as abas', async ({ page }) => {
  await boot(page);
  const findings = [];
  for(const theme of ['dark','light']){
    for(const pageId of PAGES){
      const row = await scanPage(page,pageId,theme);
      if(row.overflow.length || row.unboundButtons.length || row.genericLabels.length || row.tinyTargets.length) findings.push(row);
    }
  }

  // Verifica se o padrão antigo "salvou mas o painel continua aberto" reaparece em outros cadastros.
  const cardSave = await progressiveSaveState(page, () => openManagementAction('cartoes'), async () => {
    await page.locator('#cardName').fill('Cartão auditoria save flow');
    await page.locator('#cardLimit').fill('1200');
    await page.locator('#cardClose').fill('8');
    await page.locator('#cardDue').fill('15');
  }, '#cardSubmit');

  const goalSave = await progressiveSaveState(page, () => openManagementAction('metas'), async () => {
    await page.locator('#goalName').fill('Meta auditoria save flow');
    await page.locator('#goalTarget').fill('3000');
  }, '#goalSubmit');

  const assetSave = await progressiveSaveState(page, () => openAssetForm(), async () => {
    await page.locator('#assetName').fill('Ativo auditoria save flow');
    await page.locator('#assetValue').fill('1000');
  }, '#assetForm button[type="submit"], #assetForm button.btn');

  const semantic = await page.evaluate(() => ({
    payrollRuleHardcoded: typeof recurringDateForMonth === 'function' && typeof isPayrollRecurring === 'function',
    recurringHasDateRuleControl: !!document.querySelector('#recForm [name="dateRule"],#recDateRule,#recBusinessDayRule'),
    configLabels: [...document.querySelectorAll('#configForm label')].map(l => {
      const c=l.cloneNode(true);c.querySelectorAll('input,select,textarea').forEach(n=>n.remove());return c.textContent.replace(/\s+/g,' ').trim();
    }),
    pages: [...document.querySelectorAll('section.tab')].map(x=>x.id)
  }));

  console.log('=== CROSS_TAB_UX_AUDIT_BEGIN ===');
  console.log(JSON.stringify({findings,saveFlow:{cartoes:cardSave,metas:goalSave,patrimonio:assetSave},semantic},null,2));
  console.log('=== CROSS_TAB_UX_AUDIT_END ===');

  // Auditoria observacional: não derruba a suíte; o relatório é revisado manualmente.
  expect(semantic.pages.sort()).toEqual(PAGES.sort());
});
