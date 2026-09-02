const { test } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers');

function stressState() {
  const s = fixture('Nome de usuário extremamente comprido para estressar o cabeçalho do SFP');
  s.mesAtual = '2026-09';
  s.baseDate = '2026-09-02';
  s.settings = { ...s.settings, name: 'Nome de usuário extremamente comprido para estressar o cabeçalho do SFP', onboardingDone: true };
  s.accounts = [
    { id: 101, name: 'Conta Corrente Itaú Uniclass Agência Principal com Nome Muito Comprido', type: 'Conta corrente', initial: 123456.78, balanceMode: 'snapshot', balanceDate: '2026-09-02' },
    { id: 102, name: 'Reserva de Emergência e Investimentos de Longuíssimo Prazo', type: 'Investimento', initial: 987654.32, balanceMode: 'snapshot', balanceDate: '2026-09-02' }
  ];
  s.cards = [
    { id: 201, name: 'Itaú Click Mastercard Internacional Final 1234 com Nome Exageradamente Longo', limit: 99999.99, closeDay: 10, dueDay: 17, payAccountId: 101, history: [] },
    { id: 202, name: 'Cartão Secundário Nubank Ultravioleta Virtual Compras Online', limit: 88888.88, closeDay: 5, dueDay: 12, payAccountId: 101, history: [] }
  ];
  s.transactions = [
    { id: 301, kind: 'expense', desc: 'Descrição de despesa extremamente comprida para testar truncamento alinhamento e quebra de linha em todos os componentes possíveis do aplicativo', amount: 123456.78, date: '2026-09-01', category: 'Alimentação e supermercado com nome comprido', accountId: 101, status: 'paid', note: 'Observação muito comprida para provocar quebra de linha em telas pequenas', tags: ['tag-com-nome-muito-comprido'], balanceImpact: true, createdAt: Date.now() },
    { id: 302, kind: 'income', desc: 'Salário líquido mensal com horas extras adicionais benefícios e outras verbas', amount: 98765.43, date: '2026-09-02', category: 'Receita do trabalho principal', accountId: 101, status: 'paid', note: '', tags: [], balanceImpact: true, createdAt: Date.now() }
  ];
  s.transfers = [{ id: 401, desc: 'Transferência para conta de investimentos com descrição bastante longa', amount: 54321.09, date: '2026-09-02', fromId: 101, toId: 102, tags: ['investimento'], balanceImpact: true }];
  s.purchases = [{ id: 501, cardId: 201, desc: 'Compra parcelada com uma descrição absurdamente longa para forçar o cartão de fatura a se adaptar corretamente', total: 65432.10, installments: 12, purchaseDate: '2026-08-29', firstMonth: '2026-09', category: 'Eletrônicos e tecnologia', status: 'active', note: 'Parcela longa', tags: [], refunds: [] }];
  s.invoiceAdjustments = [{ id: 601, cardId: 201, month: '2026-09', desc: 'Ajuste promocional com descrição longa', amount: -123.45 }];
  s.invoices = [{ id: 701, cardId: 201, month: '2026-09', status: 'partial', officialTotal: 99999.99, paidAmount: 12345.67, accountId: 101, payments: [{ date: '2026-09-01', amount: 12345.67, balanceImpact: true, targetMonth: '2026-09' }] }];
  s.recurring = [{ id: 801, desc: 'Internet fibra óptica residencial plano premium com descrição longa', type: 'expense', amount: 1499.90, day: 15, category: 'Serviços essenciais', accountId: 101, start: '2026-01', end: '', active: true, skips: [] }];
  s.debts = [{ id: 901, name: 'Financiamento Imobiliário de Longo Prazo com Nome Contratual Muito Comprido', contractTotal: 1350000, balance: 987654.32, principalReceived: 900000, financedAmount: 1350000, iof: 0, rate: 0.85, cetMonthly: 0.9, cetAnnual: 11.2, payment: 12345.67, installments: 420, paidInstallments: 20, firstDue: '2025-01-10', lastDue: '2060-12-10', paymentMethod: 'debit', history: [], note: 'Instituição financeira com nome bastante comprido para teste' }];
  s.goals = [{ id: 1001, name: 'Reserva de Emergência para Doze Meses de Custo de Vida e Projetos Futuros', target: 999999.99, accountId: 102, plan: 12345.67, targetDate: '2030-12-31', history: [{ date: '2026-09-01', amount: 54321.09 }] }];
  s.assets = [{ id: 1101, name: 'Veículo próprio com descrição patrimonial extremamente longa', value: 1234567.89 }];
  s.statements = [{ id: 1201, account: 'Conta Corrente Itaú Uniclass Agência Principal com Nome Muito Comprido', file: 'extrato-financeiro-setembro-2026-com-nome-de-arquivo-muito-longo.ofx', months: ['2026-09'], count: 999 }];
  s.categoryBudgets = { 'Alimentação e supermercado com nome comprido': 12345.67, 'Transporte por aplicativos e mobilidade': 9876.54 };
  s.ui = { invoiceMonthByCard: { 201: '2026-09', 202: '2026-09' } };
  return s;
}

const VIEWPORTS = [
  { name: 'tiny-320x568', width: 320, height: 568 },
  { name: 'mobile-360x800', width: 360, height: 800 },
  { name: 'mobile-384x854', width: 384, height: 854 },
  { name: 'mobile-412x915', width: 412, height: 915 },
  { name: 'landscape-854x384', width: 854, height: 384 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'desktop-1366x768', width: 1366, height: 768 }
];

async function boot(page, theme) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof renderAll === 'function' && typeof setPage === 'function');
  await page.evaluate(({ value, theme }) => {
    try { if (typeof closeProgressive === 'function') closeProgressive(false); } catch {}
    const modal = document.getElementById('modalRoot');
    if (modal) { modal.className = 'hidden'; modal.replaceChildren(); }
    state = value;
    state.settings = { ...(state.settings || {}), theme, onboardingDone: true };
    if (typeof normalize === 'function') normalize();
    if (typeof applyTheme === 'function') applyTheme(theme);
    renderAll();
    setPage('hoje', { mode: 'replace' });
    window.scrollTo(0, 0);
  }, { value: stressState(), theme });
}

async function scan(page, context) {
  return page.evaluate((context) => {
    const findings = [];
    const vw = innerWidth;
    const active = document.querySelector('.page.active') || document.getElementById(context.page) || document.body;
    const roots = [active, document.querySelector('.topbar'), document.querySelector('.sidebar'), document.querySelector('.bottom-nav')].filter(Boolean);
    const seen = new Set();
    const visible = el => {
      if (!(el instanceof HTMLElement)) return false;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > .5 && r.height > .5 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
    };
    const elements = [];
    for (const root of roots) for (const el of [root, ...root.querySelectorAll('*')]) if (!seen.has(el) && visible(el)) { seen.add(el); elements.push(el); }
    const textOf = el => String((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) ? (el.value || el.getAttribute('placeholder') || '') : (el.innerText || el.textContent || '')).replace(/\s+/g, ' ').trim();
    const selectorOf = el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${[...el.classList].slice(0, 3).map(c => '.' + c).join('')}`;
    const interactive = el => el.matches('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])');
    const critical = el => el.matches('button,label,h1,h2,h3,h4,[role="button"],.title,.card-title,.management-title,.section-title,.nav-label');
    const hasXScroller = el => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
      }
      return false;
    };
    const add = (severity, type, el, extra = {}) => findings.push({ ...context, severity, type, selector: el ? selectorOf(el) : extra.selector || '(document)', text: el ? textOf(el).slice(0, 120) : extra.text || '', ...extra });

    if (document.documentElement.scrollWidth > vw + 2) add('high', 'root-horizontal-overflow', null, { selector: 'html', overflowPx: document.documentElement.scrollWidth - vw });
    if (document.body.scrollWidth > vw + 2) add('high', 'body-horizontal-overflow', document.body, { overflowPx: document.body.scrollWidth - vw });

    for (const el of elements) {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el), text = textOf(el);
      if ((r.left < -2 || r.right > vw + 2) && !hasXScroller(el)) add(interactive(el) ? 'high' : 'medium', interactive(el) ? 'offscreen-interactive' : 'offscreen-content', el, { left: Math.round(r.left), right: Math.round(r.right), viewportWidth: vw });

      const textish = /^(BUTTON|LABEL|P|SPAN|SMALL|STRONG|EM|H1|H2|H3|H4|H5|H6|A|TD|TH|LI|OPTION)$/.test(el.tagName) || critical(el);
      if (text && textish) {
        const xClip = el.scrollWidth > el.clientWidth + 2, yClip = el.scrollHeight > el.clientHeight + 2;
        const hidesX = ['hidden', 'clip'].includes(s.overflowX) || s.textOverflow === 'ellipsis';
        const hidesY = ['hidden', 'clip'].includes(s.overflowY) || String(s.webkitLineClamp || 'none') !== 'none';
        if ((xClip && hidesX) || (yClip && hidesY)) add(critical(el) ? 'high' : 'medium', critical(el) ? 'text-clipped-critical' : 'text-clipped', el, { client: `${el.clientWidth}x${el.clientHeight}`, scroll: `${el.scrollWidth}x${el.scrollHeight}`, whiteSpace: s.whiteSpace });
        if (s.whiteSpace === 'nowrap' && xClip && !hasXScroller(el)) add(critical(el) ? 'high' : 'medium', 'nowrap-text-overflow', el, { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth });
        const font = parseFloat(s.fontSize || '0');
        if (font && font < 11 && context.viewport.startsWith('mobile')) add(interactive(el) ? 'medium' : 'low', 'tiny-text', el, { fontSize: font });
      }

      if (interactive(el) && context.viewport !== 'desktop-1366x768') {
        if (r.width < 44 || r.height < 44) add((r.width < 32 || r.height < 32) ? 'medium' : 'low', 'small-touch-target', el, { size: `${Math.round(r.width)}x${Math.round(r.height)}` });
      }

      if (el.matches('input:not([type="hidden"]),select,textarea')) {
        const id = el.id;
        const named = !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)));
        if (!named) add('medium', 'unlabelled-control', el, { placeholder: el.getAttribute('placeholder') || '' });
      }
    }

    const visibleText = roots.map(textOf).join(' ');
    for (const pattern of [/\bundefined\b/i, /\bNaN\b/, /\[object Object\]/, /�/, /Ã[A-Za-zÀ-ÿ]/, /Â[A-Za-zÀ-ÿ]/]) if (pattern.test(visibleText)) add('high', 'broken-visible-text', active, { matched: String(pattern) });
    return findings;
  }, context);
}

function dedupe(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = [f.theme, f.page, f.type, f.selector, f.text].join('|');
    if (!map.has(key)) map.set(key, { ...f, phases: [] });
    const item = map.get(key);
    if (!item.phases.includes(f.phase)) item.phases.push(f.phase);
  }
  return [...map.values()].map(({ phase, ...f }) => f);
}

for (const viewport of VIEWPORTS) {
  test(`DEEP-UI-AUDIT ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const all = [];
    for (const theme of ['dark', 'light']) {
      await boot(page, theme);
      const pageIds = await page.evaluate(() => [...new Set(['hoje', ...[...document.querySelectorAll('button[data-page]')].map(b => b.dataset.page).filter(Boolean)])].filter(id => document.getElementById(id)));
      for (const pageId of pageIds) {
        await page.evaluate(id => { try { setPage(id, { mode: 'replace' }); } catch {} window.scrollTo(0, 0); }, pageId);
        all.push(...await scan(page, { viewport: viewport.name, theme, page: pageId, phase: 'top' }));
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        all.push(...await scan(page, { viewport: viewport.name, theme, page: pageId, phase: 'bottom' }));
        if (viewport.name === 'mobile-360x800') {
          await page.evaluate(() => window.scrollTo(0, 0));
          const shot = testInfo.outputPath(`${theme}-${pageId}.png`);
          await page.screenshot({ path: shot, fullPage: false });
          await testInfo.attach(`${theme}-${pageId}.png`, { path: shot, contentType: 'image/png' });
        }
      }
    }
    const findings = dedupe(all);
    const summary = {
      viewport: viewport.name,
      uniqueFindingCount: findings.length,
      bySeverity: findings.reduce((a, f) => (a[f.severity] = (a[f.severity] || 0) + 1, a), {}),
      byType: findings.reduce((a, f) => (a[f.type] = (a[f.type] || 0) + 1, a), {}),
      findings
    };
    const out = testInfo.outputPath(`deep-ui-audit-${viewport.name}.json`);
    fs.writeFileSync(out, JSON.stringify(summary, null, 2));
    await testInfo.attach(`deep-ui-audit-${viewport.name}.json`, { path: out, contentType: 'application/json' });
    console.log('DEEP_UI_AUDIT_SUMMARY ' + JSON.stringify({ viewport: viewport.name, uniqueFindingCount: summary.uniqueFindingCount, bySeverity: summary.bySeverity, byType: summary.byType }));
  });
}
