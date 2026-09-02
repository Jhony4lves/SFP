const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers');

function richStressState() {
  const s = fixture('Nome de usuário extremamente comprido para estressar cabeçalhos e componentes do SFP');
  s.mesAtual = '2026-09';
  s.baseDate = '2026-09-02';
  s.settings = { ...s.settings, name: 'Nome de usuário extremamente comprido para estressar cabeçalhos e componentes do SFP', theme: 'dark', privacy: false, onboardingDone: true };
  s.accounts = [
    { id: 101, name: 'Conta Corrente Itaú Uniclass Agência Principal com Nome Muito Comprido', type: 'Conta corrente', initial: 123456.78, balanceMode: 'snapshot', balanceDate: '2026-09-02' },
    { id: 102, name: 'Reserva de Emergência e Investimentos de Longuíssimo Prazo', type: 'Investimento', initial: 987654.32, balanceMode: 'snapshot', balanceDate: '2026-09-02' }
  ];
  s.cards = [
    { id: 201, name: 'Itaú Click Mastercard Internacional Final 1234 com Nome Exageradamente Longo', limit: 99999.99, closeDay: 10, dueDay: 17, payAccountId: 101, history: [] },
    { id: 202, name: 'Cartão Secundário Nubank Ultravioleta Virtual Compras Online', limit: 88888.88, closeDay: 5, dueDay: 12, payAccountId: 101, history: [] }
  ];
  s.transactions = [
    { id: 301, kind: 'expense', desc: 'Descrição de despesa extremamente comprida para testar truncamento, alinhamento e quebra de linha em todos os componentes possíveis do aplicativo', amount: 123456.78, date: '2026-09-01', category: 'Alimentação e supermercado com nome comprido', accountId: 101, status: 'paid', note: 'Observação muito comprida para provocar quebra de linha e verificar se o layout continua legível em telas pequenas', tags: ['tag-com-nome-muito-comprido'], balanceImpact: true, createdAt: Date.now() },
    { id: 302, kind: 'income', desc: 'Salário líquido mensal com horas extras adicionais benefícios e outras verbas', amount: 98765.43, date: '2026-09-02', category: 'Receita do trabalho principal', accountId: 101, status: 'paid', note: '', tags: [], balanceImpact: true, createdAt: Date.now() },
    { id: 303, kind: 'expense', desc: 'Assinatura recorrente de serviço digital internacional', amount: 9999.99, date: '2026-09-03', category: 'Assinaturas e serviços digitais', accountId: 101, status: 'pending', note: '', tags: [], balanceImpact: false, createdAt: Date.now() }
  ];
  s.transfers = [{ id: 401, desc: 'Transferência para conta de investimentos com descrição longa', amount: 54321.09, date: '2026-09-02', fromId: 101, toId: 102, tags: ['investimento'], balanceImpact: true }];
  s.purchases = [
    { id: 501, cardId: 201, desc: 'Compra parcelada com uma descrição absurdamente longa para forçar o cartão de fatura a se adaptar corretamente', total: 65432.10, installments: 12, purchaseDate: '2026-08-29', firstMonth: '2026-09', category: 'Eletrônicos e tecnologia', status: 'active', note: 'Parcela longa', tags: [], refunds: [] },
    { id: 502, cardId: 201, desc: 'Mercado Livre produto com título muito muito muito comprido', total: 12345.67, installments: 10, purchaseDate: '2026-08-15', firstMonth: '2026-09', category: 'Compras', status: 'active', note: '', tags: [], refunds: [] }
  ];
  s.invoiceAdjustments = [{ id: 601, cardId: 201, month: '2026-09', desc: 'Ajuste promocional com descrição longa', amount: -123.45 }];
  s.invoices = [{ id: 701, cardId: 201, month: '2026-09', status: 'partial', officialTotal: 99999.99, paidAmount: 12345.67, accountId: 101, payments: [{ date: '2026-09-01', amount: 12345.67, balanceImpact: true, targetMonth: '2026-09' }] }];
  s.recurring = [{ id: 801, desc: 'Internet fibra óptica residencial plano premium com descrição longa', type: 'expense', amount: 1499.90, day: 15, category: 'Serviços essenciais', accountId: 101, start: '2026-01', end: '', active: true, skips: [] }];
  s.debts = [{ id: 901, name: 'Financiamento Imobiliário de Longo Prazo com Nome Contratual Muito Comprido', contractTotal: 1350000, balance: 987654.32, principalReceived: 900000, financedAmount: 1350000, iof: 0, rate: 0.85, cetMonthly: 0.9, cetAnnual: 11.2, payment: 12345.67, installments: 420, paidInstallments: 20, firstDue: '2025-01-10', lastDue: '2060-12-10', paymentMethod: 'debit', history: [], note: 'Instituição financeira com nome bastante comprido para teste' }];
  s.goals = [{ id: 1001, name: 'Reserva de Emergência para Doze Meses de Custo de Vida e Projetos Futuros', target: 999999.99, accountId: 102, plan: 12345.67, targetDate: '2030-12-31', history: [{ date: '2026-09-01', amount: 54321.09 }] }];
  s.assets = [{ id: 1101, name: 'Veículo próprio com descrição patrimonial extremamente longa', value: 1234567.89 }];
  s.statements = [{ id: 1201, account: 'Conta Corrente Itaú Uniclass Agência Principal com Nome Muito Comprido', file: 'extrato-financeiro-setembro-2026-com-nome-de-arquivo-muito-longo.ofx', months: ['2026-09'], count: 999 }];
  s.classificationRules = [{ pattern: 'estabelecimento-com-nome-muito-longo', action: 'expense', category: 'Categoria automática extremamente longa' }];
  s.categoryBudgets = { 'Alimentação e supermercado com nome comprido': 12345.67, 'Transporte por aplicativos e mobilidade': 9876.54 };
  s.snapshots = [{ id: 1301, month: '2026-08', income: 99999.99, expense: 88888.88, result: 11111.11, assets: 1234567.89, debts: 987654.32, netWorth: 246913.57, reserve: 54321.09, closedAt: '2026-08-31T23:59:59Z' }];
  s.closedMonths = ['2026-08'];
  s.csvTemplates = [{ id: 1501, name: 'Modelo bancário com nome muito comprido para importação', headersKey: 'data|descricao|valor', dateIndex: 0, descIndex: 1, valueIndex: 2, createdAt: '2026-09-01T00:00:00Z' }];
  s.favorites = [{ id: 'fav-long', label: 'Favorito de lançamento com nome muito comprido', kind: 'expense', desc: 'Descrição favorita muito comprida', category: 'Categoria favorita muito comprida' }];
  s.creditFacilities = [{ id: 1601, institution: 'Banco com nome institucional muito comprido', name: 'Limite de crédito emergencial e cheque especial', limit: 99999.99, used: 54321.09, type: 'overdraft' }];
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

function dedupe(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = [f.scenario, f.page, f.type, f.selector, f.text || ''].join('|');
    if (!map.has(key)) map.set(key, { ...f, contexts: [] });
    const entry = map.get(key);
    const ctx = `${f.viewport}/${f.theme}/${f.phase || 'top'}`;
    if (!entry.contexts.includes(ctx)) entry.contexts.push(ctx);
  }
  return [...map.values()].map(({ viewport, theme, phase, ...rest }) => rest);
}

async function bootWith(page, stateValue, theme) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof renderAll === 'function' && typeof setPage === 'function');
  await page.evaluate(({ value, theme }) => {
    try { if (typeof closeProgressive === 'function') closeProgressive(false); } catch {}
    const modal = document.getElementById('modalRoot'); if (modal) { modal.className = 'hidden'; modal.replaceChildren(); }
    state = value;
    if (!state.settings) state.settings = {};
    state.settings.theme = theme;
    if (typeof normalize === 'function') normalize();
    if (typeof applyTheme === 'function') applyTheme(theme);
    renderAll();
    setPage('hoje', { mode: 'replace' });
    window.scrollTo(0, 0);
  }, { value: stateValue, theme });
}

async function scan(page, context) {
  return page.evaluate((context) => {
    const findings = [];
    const vw = innerWidth;
    const vh = innerHeight;
    const active = document.querySelector('.page.active, main section.active, section.active') || document.getElementById(context.page) || document.body;
    const isVisible = el => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.width > 0.5 && r.height > 0.5;
    };
    const ownText = el => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return String(el.value || el.getAttribute('placeholder') || '').trim();
      return String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    };
    const shortText = el => ownText(el).slice(0, 100);
    const selector = el => {
      if (el.id) return `#${el.id}`;
      const cls = [...el.classList].filter(Boolean).slice(0, 3).join('.');
      const name = el.getAttribute('name');
      const role = el.getAttribute('role');
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${name ? `[name="${name}"]` : ''}${role ? `[role="${role}"]` : ''}`;
    };
    const add = (severity, type, el, extra = {}) => findings.push({ ...context, severity, type, selector: el ? selector(el) : extra.selector || '(document)', text: el ? shortText(el) : extra.text || '', ...extra });
    const hasScrollableXAncestor = el => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
        p = p.parentElement;
      }
      return false;
    };
    const interactive = el => el.matches('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])');
    const criticalText = el => el.matches('button,label,h1,h2,h3,h4,[role="button"],.title,.card-title,.management-title,.section-title,.nav-label');

    if (document.documentElement.scrollWidth > vw + 2) add('high', 'root-horizontal-overflow', null, { selector: 'html', text: `${document.documentElement.scrollWidth}px > viewport ${vw}px`, overflowPx: document.documentElement.scrollWidth - vw });
    if (document.body.scrollWidth > vw + 2) add('high', 'body-horizontal-overflow', document.body, { text: `${document.body.scrollWidth}px > viewport ${vw}px`, overflowPx: document.body.scrollWidth - vw });

    const roots = [active, document.querySelector('.topbar'), document.querySelector('.sidebar')].filter(Boolean);
    const elements = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))].filter(isVisible);

    for (const el of elements) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const text = ownText(el);
      if ((r.left < -2 || r.right > vw + 2) && !hasScrollableXAncestor(el)) {
        add(interactive(el) ? 'high' : 'medium', interactive(el) ? 'offscreen-interactive' : 'offscreen-content', el, { left: Math.round(r.left), right: Math.round(r.right), viewport: vw });
      }

      const textTag = /^(BUTTON|LABEL|P|SPAN|SMALL|STRONG|EM|H1|H2|H3|H4|H5|H6|A|TD|TH|LI|OPTION)$/.test(el.tagName) || criticalText(el);
      if (text && textTag) {
        const xClip = el.scrollWidth > el.clientWidth + 2;
        const yClip = el.scrollHeight > el.clientHeight + 2;
        const hidesX = ['hidden', 'clip'].includes(s.overflowX) || s.textOverflow === 'ellipsis';
        const hidesY = ['hidden', 'clip'].includes(s.overflowY) || String(s.webkitLineClamp || 'none') !== 'none';
        if ((xClip && hidesX) || (yClip && hidesY)) add(criticalText(el) ? 'high' : 'medium', criticalText(el) ? 'text-clipped-critical' : 'text-clipped', el, { client: `${el.clientWidth}x${el.clientHeight}`, scroll: `${el.scrollWidth}x${el.scrollHeight}`, whiteSpace: s.whiteSpace, overflow: `${s.overflowX}/${s.overflowY}` });
        if (s.whiteSpace === 'nowrap' && xClip && !hasScrollableXAncestor(el)) add(criticalText(el) ? 'high' : 'medium', 'nowrap-text-overflow', el, { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth });
        const font = parseFloat(s.fontSize || '0');
        if (font && font < 11 && context.viewport.startsWith('mobile')) add(interactive(el) ? 'medium' : 'low', 'tiny-text', el, { fontSize: font });
      }

      if (interactive(el) && context.viewport !== 'desktop-1366x768') {
        const w = r.width, h = r.height;
        if (w < 44 || h < 44) add((w < 32 || h < 32) ? 'medium' : 'low', 'small-touch-target', el, { size: `${Math.round(w)}x${Math.round(h)}` });
      }

      if (el.matches('input:not([type="hidden"]),select,textarea')) {
        const id = el.id;
        const named = !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)));
        if (!named) add('medium', 'unlabelled-control', el, { placeholder: el.getAttribute('placeholder') || '' });
      }
    }

    const badSentinels = [/\bundefined\b/i, /\bNaN\b/, /\[object Object\]/, /�/, /Ã[A-Za-zÀ-ÿ]/, /Â[A-Za-zÀ-ÿ]/];
    const visibleText = roots.map(root => ownText(root)).join(' ');
    for (const pattern of badSentinels) if (pattern.test(visibleText)) add('high', 'broken-visible-text', active, { text: `Matched ${pattern}` });

    const ints = elements.filter(interactive).filter(el => {
      const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    });
    for (let i = 0; i < ints.length; i++) {
      for (let j = i + 1; j < ints.length; j++) {
        const a = ints[i], b = ints[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const iw = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
        const ih = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
        const area = iw * ih;
        if (area > 36 && iw > 4 && ih > 4) add('high', 'interactive-overlap', a, { withSelector: selector(b), withText: shortText(b), overlap: `${Math.round(iw)}x${Math.round(ih)}` });
      }
    }

    return findings;
  }, context);
}

test('DEEP-UI-AUDIT: varredura visual/UX sem corrigir o app', async ({ page }, testInfo) => {
  test.setTimeout(300000);
  const raw = [];
  const scenarios = [
    { name: 'empty', state: fixture('Fixture QA') },
    { name: 'stress', state: richStressState() }
  ];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const theme of ['dark', 'light']) {
      for (const scenario of scenarios) {
        await bootWith(page, scenario.state, theme);
        const pageIds = await page.evaluate(() => [...new Set(['hoje', ...[...document.querySelectorAll('button[data-page]')].map(b => b.dataset.page).filter(Boolean)])].filter(id => document.getElementById(id)));
        for (const pageId of pageIds) {
          await page.evaluate(id => { try { setPage(id, { mode: 'replace' }); } catch {} window.scrollTo(0, 0); }, pageId);
          await page.waitForTimeout(15);
          raw.push(...await scan(page, { scenario: scenario.name, viewport: viewport.name, theme, page: pageId, phase: 'top' }));
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(5);
          raw.push(...await scan(page, { scenario: scenario.name, viewport: viewport.name, theme, page: pageId, phase: 'bottom' }));
          await page.evaluate(() => window.scrollTo(0, 0));
        }

        if (viewport.width <= 412 && typeof (await page.evaluate(() => typeof showMoreMenu)) === 'string') {
          await page.evaluate(() => { try { showMoreMenu(); } catch {} });
          await page.waitForTimeout(10);
          raw.push(...await scan(page, { scenario: scenario.name, viewport: viewport.name, theme, page: 'more-menu', phase: 'modal' }));
          await page.evaluate(() => { const m = document.getElementById('modalRoot'); if (m) { m.className = 'hidden'; m.replaceChildren(); } });
        }

        if (scenario.name === 'stress') {
          const detailCalls = [
            ['account-detail', 'openAccountDetail', 101],
            ['card-detail', 'openCardDetail', 201],
            ['debt-detail', 'openDebtDetail', 901],
            ['goal-detail', 'openGoalDetail', 1001]
          ];
          for (const [name, fn, id] of detailCalls) {
            const exists = await page.evaluate(fn => typeof window[fn] === 'function', fn);
            if (!exists) continue;
            await page.evaluate(({ fn, id }) => { try { window[fn](id); } catch {} }, { fn, id });
            await page.waitForTimeout(10);
            raw.push(...await scan(page, { scenario: scenario.name, viewport: viewport.name, theme, page: name, phase: 'modal' }));
            await page.evaluate(() => { const m = document.getElementById('modalRoot'); if (m) { m.className = 'hidden'; m.replaceChildren(); } });
          }
        }
      }
    }
  }

  const findings = dedupe(raw);
  const rank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => (rank[a.severity] - rank[b.severity]) || a.type.localeCompare(b.type) || a.page.localeCompare(b.page));
  const summary = {
    generatedAt: new Date().toISOString(),
    viewports: VIEWPORTS.map(v => v.name),
    themes: ['dark', 'light'],
    scenarios: scenarios.map(s => s.name),
    rawFindingCount: raw.length,
    uniqueFindingCount: findings.length,
    bySeverity: findings.reduce((acc, f) => (acc[f.severity] = (acc[f.severity] || 0) + 1, acc), {}),
    byType: findings.reduce((acc, f) => (acc[f.type] = (acc[f.type] || 0) + 1, acc), {}),
    findings
  };
  const out = path.join('build', 'reports', 'deep-ui-audit.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  await testInfo.attach('deep-ui-audit.json', { path: out, contentType: 'application/json' });

  console.log('DEEP_UI_AUDIT_SUMMARY ' + JSON.stringify({ rawFindingCount: summary.rawFindingCount, uniqueFindingCount: summary.uniqueFindingCount, bySeverity: summary.bySeverity, byType: summary.byType }));
  for (const f of findings.slice(0, 250)) console.log('DEEP_UI_FINDING ' + JSON.stringify(f));
  if (findings.length > 250) console.log(`DEEP_UI_FINDING_TRUNCATED ${findings.length - 250} findings remain in attached JSON`);

  const actionable = findings.filter(f => f.severity === 'high' || f.severity === 'medium');
  expect(actionable, `Deep UI audit encontrou ${actionable.length} achados high/medium; ver DEEP_UI_FINDING no log`).toEqual([]);
});
