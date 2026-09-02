const { test } = require('@playwright/test');
const fs = require('node:fs');
const { fixture } = require('./helpers');

function auditState() {
  const s = fixture('Nome extremamente comprido para testar cabeçalhos e acessibilidade');
  s.mesAtual = '2026-09';
  s.baseDate = '2026-09-02';
  s.settings = { ...(s.settings || {}), name: 'Nome extremamente comprido para testar cabeçalhos e acessibilidade', onboardingDone: true };
  s.accounts = [
    { id: 101, name: 'Conta Corrente Itaú Uniclass Agência Principal com Nome Muito Comprido', type: 'Conta corrente', initial: 123456.78, balanceMode: 'snapshot', balanceDate: '2026-09-02' },
    { id: 102, name: 'Reserva de Emergência e Investimentos de Longuíssimo Prazo', type: 'Investimento', initial: 987654.32, balanceMode: 'snapshot', balanceDate: '2026-09-02' }
  ];
  s.cards = [
    { id: 201, name: 'Itaú Click Mastercard Internacional Final 1234 com Nome Exageradamente Longo', limit: 99999.99, closeDay: 10, dueDay: 17, payAccountId: 101, history: [] },
    { id: 202, name: 'Cartão Secundário Nubank Ultravioleta Virtual Compras Online', limit: 88888.88, closeDay: 5, dueDay: 12, payAccountId: 101, history: [] }
  ];
  s.transactions = [
    { id: 301, kind: 'expense', desc: 'Descrição de despesa extremamente comprida para testar a interface completa', amount: 123456.78, date: '2026-09-01', category: 'Alimentação e supermercado com nome comprido', accountId: 101, status: 'paid', note: 'Observação longa', tags: ['tag-longa'], balanceImpact: true, createdAt: Date.now() },
    { id: 302, kind: 'income', desc: 'Salário líquido mensal com horas extras adicionais', amount: 98765.43, date: '2026-09-02', category: 'Receita do trabalho principal', accountId: 101, status: 'paid', note: '', tags: [], balanceImpact: true, createdAt: Date.now() }
  ];
  s.purchases = [{ id: 501, cardId: 201, desc: 'Compra parcelada com uma descrição absurdamente longa para estressar a fatura', total: 65432.10, installments: 12, purchaseDate: '2026-08-29', firstMonth: '2026-09', category: 'Eletrônicos e tecnologia', status: 'active', note: '', tags: [], refunds: [] }];
  s.invoices = [{ id: 701, cardId: 201, month: '2026-09', status: 'partial', officialTotal: 99999.99, paidAmount: 12345.67, accountId: 101, payments: [{ date: '2026-09-01', amount: 12345.67, balanceImpact: true, targetMonth: '2026-09' }] }];
  s.recurring = [{ id: 801, desc: 'Internet fibra óptica residencial plano premium com descrição longa', type: 'expense', amount: 1499.90, day: 15, category: 'Serviços essenciais', accountId: 101, start: '2026-01', end: '', active: true, skips: [] }];
  s.debts = [{ id: 901, name: 'Financiamento Imobiliário de Longo Prazo com Nome Contratual Muito Comprido', contractTotal: 1350000, balance: 987654.32, principalReceived: 900000, financedAmount: 1350000, iof: 0, rate: 0.85, cetMonthly: 0.9, cetAnnual: 11.2, payment: 12345.67, installments: 420, paidInstallments: 20, firstDue: '2025-01-10', lastDue: '2060-12-10', paymentMethod: 'debit', history: [], note: '' }];
  s.goals = [{ id: 1001, name: 'Reserva de Emergência para Doze Meses de Custo de Vida e Projetos Futuros', target: 999999.99, accountId: 102, plan: 12345.67, targetDate: '2030-12-31', history: [{ date: '2026-09-01', amount: 54321.09 }] }];
  s.assets = [{ id: 1101, name: 'Veículo próprio com descrição patrimonial extremamente longa', value: 1234567.89 }];
  s.categoryBudgets = { 'Alimentação e supermercado com nome comprido': 12345.67 };
  s.ui = { invoiceMonthByCard: { 201: '2026-09', 202: '2026-09' } };
  return s;
}

async function boot(page, theme, width, height) {
  await page.setViewportSize({ width, height });
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
  }, { value: auditState(), theme });
}

async function advancedScan(page, context) {
  return page.evaluate((context) => {
    const findings = [];
    const active = document.querySelector('.page.active') || document.getElementById(context.page) || document.body;
    const roots = [active, document.querySelector('.topbar'), document.querySelector('.bottom-nav')].filter(Boolean);
    const interactiveSelector = 'button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])';

    const visible = el => {
      if (!(el instanceof HTMLElement)) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0.02;
    };
    const selectorOf = el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${[...el.classList].slice(0, 4).map(c => '.' + c).join('')}`;
    const textOf = el => String(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    const add = (severity, type, el, extra = {}) => findings.push({ ...context, severity, type, selector: selectorOf(el), text: textOf(el).slice(0, 160), ...extra });

    function parseColor(v) {
      const m = String(v).match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:[, /]+(\d*(?:\.\d+)?))?\)/i);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined || m[4] === '' ? 1 : +m[4] };
    }
    function lum(c) {
      const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); };
      return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b);
    }
    function ratio(a, b) {
      const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05);
    }
    function opaqueBackground(el) {
      for (let p = el; p && p instanceof HTMLElement; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.backgroundImage && s.backgroundImage !== 'none') return null;
        const c = parseColor(s.backgroundColor);
        if (c && c.a >= .98) return c;
      }
      return null;
    }
    function hasDirectText(el) {
      return [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && String(n.textContent).trim()) || ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(el.tagName);
    }
    function accessibleName(el) {
      const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
      if (aria) return aria;
      if (textOf(el)) return textOf(el);
      const img = el.querySelector('img[alt]');
      if (img && img.alt) return img.alt;
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab && textOf(lab)) return textOf(lab);
      }
      return '';
    }

    const elements = [];
    const seen = new Set();
    for (const root of roots) for (const el of [root, ...root.querySelectorAll('*')]) if (!seen.has(el) && visible(el)) { seen.add(el); elements.push(el); }

    for (const el of elements) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();

      if (el.matches(interactiveSelector)) {
        if (!accessibleName(el)) add('high', 'interactive-without-accessible-name', el, { tag: el.tagName });

        const cx = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
        const cy = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
        if (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) {
          const hit = document.elementFromPoint(cx, cy);
          if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
            const hs = getComputedStyle(hit);
            if (hs.pointerEvents !== 'none') add('high', 'interactive-center-obscured', el, { covering: selectorOf(hit), center: `${Math.round(cx)},${Math.round(cy)}` });
          }
        }
      }

      const txt = textOf(el);
      if (txt && hasDirectText(el) && !el.matches('script,style,svg,path')) {
        const fg = parseColor(s.color);
        const bg = opaqueBackground(el.parentElement || el);
        if (fg && fg.a >= .9 && bg) {
          const cr = ratio(fg, bg);
          const fs = parseFloat(s.fontSize || '16');
          const weight = parseInt(s.fontWeight || '400', 10) || 400;
          const large = fs >= 24 || (fs >= 18.66 && weight >= 700);
          const threshold = large ? 3 : 4.5;
          if (cr < threshold) add(cr < 2.2 ? 'high' : 'medium', 'low-text-contrast', el, { ratio: +cr.toFixed(2), threshold, color: s.color, background: `rgb(${bg.r}, ${bg.g}, ${bg.b})`, fontSize: fs, fontWeight: weight });
        }
      }
    }

    return findings;
  }, context);
}

const VIEWPORTS = [
  { name: 'tiny-320x568', width: 320, height: 568 },
  { name: 'mobile-360x800', width: 360, height: 800 },
  { name: 'tablet-768x1024', width: 768, height: 1024 }
];

for (const vp of VIEWPORTS) {
  test(`DEEP-UI-ADVANCED ${vp.name}`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const raw = [];
    for (const theme of ['dark', 'light']) {
      await boot(page, theme, vp.width, vp.height);
      const pageIds = await page.evaluate(() => [...new Set(['hoje', ...[...document.querySelectorAll('button[data-page]')].map(b => b.dataset.page).filter(Boolean)])].filter(id => document.getElementById(id)));
      for (const pageId of pageIds) {
        await page.evaluate(id => { try { setPage(id, { mode: 'replace' }); } catch {} window.scrollTo(0, 0); }, pageId);
        raw.push(...await advancedScan(page, { viewport: vp.name, theme, page: pageId, phase: 'top' }));
        await page.evaluate(() => window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - innerHeight)));
        raw.push(...await advancedScan(page, { viewport: vp.name, theme, page: pageId, phase: 'bottom' }));
      }
    }
    const byKey = new Map();
    for (const f of raw) {
      const key = [f.viewport, f.theme, f.page, f.type, f.selector, f.covering || '', f.ratio || ''].join('|');
      if (!byKey.has(key)) byKey.set(key, { ...f, phases: [] });
      const x = byKey.get(key); if (!x.phases.includes(f.phase)) x.phases.push(f.phase);
    }
    const findings = [...byKey.values()].map(({ phase, ...f }) => f);
    const summary = {
      viewport: vp.name,
      count: findings.length,
      byType: findings.reduce((a, f) => (a[f.type] = (a[f.type] || 0) + 1, a), {}),
      bySeverity: findings.reduce((a, f) => (a[f.severity] = (a[f.severity] || 0) + 1, a), {}),
      findings
    };
    const out = testInfo.outputPath(`deep-ui-advanced-${vp.name}.json`);
    fs.writeFileSync(out, JSON.stringify(summary, null, 2));
    await testInfo.attach(`deep-ui-advanced-${vp.name}.json`, { path: out, contentType: 'application/json' });
  });
}
