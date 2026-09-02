const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, writeIndexedDB } = require('./helpers');

async function boot(page, value = fixture('Audit wave 1')) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await writeIndexedDB(page, value);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state && lastSavedState);
  return value;
}

test('AUDIT-W1-01 Financial Intelligence usa BRL pt-BR e data civil pt-BR', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(() => SFPFinancialIntelligence.analyze({
    referenceDate: '2026-09-02',
    currentMonth: '2026-09',
    snapshot: {
      referenceDate: '2026-09-02',
      projections: [{ days: 7, negativeRisk: true, minBalanceCents: -123456, availableCents: 10000, projectedCents: -123456, minDate: '2026-09-08', events: [] }],
      commitments: { events: [{ type: 'expense', date: '2026-09-03', amountCents: 149990, desc: 'Conta' }] },
      realized: { incomeCents: 100000, resultCents: 50000 }
    },
    transactions: [
      { id: 1, accountId: 1, kind: 'expense', amountCents: 5000, date: '2026-09-02', desc: 'Duplicado' },
      { id: 2, accountId: 1, kind: 'expense', amountCents: 5000, date: '2026-09-02', desc: 'Duplicado' }
    ]
  }));
  const messages = result.insights.map(i => i.message).join('\n');
  expect(messages).toMatch(/R\$\s*1\.234,56/);
  expect(messages).toMatch(/R\$\s*1\.499,90/);
  expect(messages).toMatch(/R\$\s*50,00/);
  expect(messages).toContain('02/09/2026');
  expect(messages).not.toMatch(/\b(?:1234\.56|1499\.90|50\.00)\b/);
});

test('AUDIT-W1-02 Busca Global é combobox/listbox utilizável sem mouse e localiza enum/data', async ({ page }) => {
  const value = fixture('Busca global acessível');
  value.transactions = [{ id: 9001, kind: 'expense', desc: 'Mercado Auditável', amount: 123.45, date: '2026-09-02', category: 'Casa', accountId: 1, status: 'paid', balanceImpact: true }];
  await boot(page, value);
  const search = page.locator('#globalSearch');
  await expect(search).toHaveAttribute('role', 'combobox');
  await expect(search).toHaveAttribute('aria-controls', 'globalResults');
  await search.fill('Mercado Auditável');
  await expect(page.locator('#globalResults')).not.toHaveClass(/hidden/);
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  const option = page.locator('#globalResults [role="option"]').first();
  await expect(option).toContainText('02/09/2026');
  await expect(option).toContainText('Despesa');
  await expect(option).not.toContainText(/\bexpense\b/);
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /globalSearchOption-/);
  await search.press('Enter');
  await expect(page.locator('#lancamentos')).toHaveClass(/active/);
});

test('AUDIT-W1-03 privacidade cobre valores monetários dinâmicos e expõe estado do toggle', async ({ page }) => {
  const value = fixture('Privacidade ampla');
  value.accounts = [{ id: 1, name: 'Conta Grande', type: 'Conta corrente', initial: 233333.21 }];
  value.transactions = [
    { id: 10, kind: 'income', desc: 'Receita grande', amount: 98765.43, date: '2026-09-02', category: 'Trabalho', accountId: 1, status: 'paid', balanceImpact: true },
    { id: 11, kind: 'expense', desc: 'Despesa grande', amount: 43210.98, date: '2026-09-02', category: 'Casa', accountId: 1, status: 'paid', balanceImpact: true }
  ];
  value.recurring = [{ id: 20, desc: 'Mensalidade', type: 'expense', amount: 1234.56, day: 10, category: 'Casa', accountId: 1, start: '2026-01', end: '', active: true, skips: [] }];
  value.settings = { ...(value.settings || {}), privacy: true };
  await boot(page, value);
  await page.evaluate(() => { state.settings.privacy = true; applyPrivacy(); renderAll(); });
  await page.waitForTimeout(100);
  const toggle = page.locator('#privacyToggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-label', /Mostrar valores/);
  const pages = ['hoje','dashboard','visao','lancamentos','contas','cartoes','recorrencias','orcamento','dividas','metas','calendario','relatorios','simuladores'];
  for (const pageName of pages) {
    await page.evaluate(name => setPage(name), pageName);
    await page.waitForTimeout(30);
    const leaks = await page.evaluate(() => {
      const money=/(?:[-−+]\s*)?R\$[\s\u00a0]*(?:(?:\d{1,3}(?:\.\d{3})+)|\d+)(?:,\d{2})?/;
      return Array.from(document.querySelectorAll('.tab.active *')).filter(el => {
        if(el.matches('script,style,svg,path,option')) return false;
        if(el.getClientRects().length === 0) return false;
        const own=Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.nodeValue||'').join(' ');
        return money.test(own) && !el.closest('.private-value');
      }).map(el => ({ tag: el.tagName, cls: el.className, text: el.textContent.trim().slice(0,120) }));
    });
    expect(leaks, `privacy leaks on ${pageName}`).toEqual([]);
  }
});

test('AUDIT-W1-04 toast e feedback temporário são live regions e erros ficam assertivos', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#toast')).toHaveAttribute('aria-live', 'polite');
  const feedback = page.locator('#feedbackCard');
  await expect(feedback).toHaveAttribute('aria-live', 'polite');
  await page.evaluate(() => {
    const el = document.getElementById('feedbackCard');
    el.className = 'feedback-card error';
    el.textContent = 'Falha de teste';
  });
  await expect(feedback).toHaveAttribute('role', 'alert');
  await expect(feedback).toHaveAttribute('aria-live', 'assertive');
});

test('AUDIT-W1-05 modal secundário recebe foco, trap básico, Escape e restaura chamador', async ({ page }) => {
  await boot(page);
  await page.locator('#privacyToggle').focus();
  await page.evaluate(() => showTrash());
  const dialog = page.locator('#modalRoot .modal').first();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => page.evaluate(() => !!document.querySelector('#modalRoot .modal')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('privacyToggle');
});

test('AUDIT-W1-06 Android: notificações, redaction, backup e file chooser seguem contratos novos', async () => {
  const manifest = fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');
  const bridge = fs.readFileSync('app/src/main/java/com/jhony/sfp/AndroidBridge.java','utf8');
  const activity = fs.readFileSync('app/src/main/java/com/jhony/sfp/MainActivity.java','utf8');
  const index = fs.readFileSync('app/src/main/assets/www/index.html','utf8');
  expect(manifest).toContain('android.permission.POST_NOTIFICATIONS');
  expect(manifest).toContain('android:allowBackup="false"');
  expect(manifest).toContain('android:fullBackupContent="false"');
  expect(bridge).toContain('static String redactFinancialValues');
  expect(bridge).toContain('R.drawable.ic_notification_small');
  expect(bridge).toContain('public String saveTextFile');
  expect(bridge).toContain('ensureNotificationPermissionForContextualAlert');
  expect(activity).toContain('mapAcceptExtension');
  expect(activity).toContain('case "ofx"');
  expect(activity).toContain('case "qfx"');
  expect(index).toContain('const rawResult=AndroidBridge.saveTextFile');
  expect(index).not.toContain("toast('Arquivo salvo em Downloads.');");
  expect(fs.existsSync('app/src/main/res/drawable/ic_notification_small.xml')).toBe(true);
});
