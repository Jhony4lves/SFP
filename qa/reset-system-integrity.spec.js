const { test, expect } = require('@playwright/test');
const { DB_NAME, STORE, DB_KEY, FALLBACK_KEY, fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

function richCustomState() {
  return {
    version: 202,
    schemaVersion: 11,
    mesAtual: '2026-08',
    baseDate: '2026-08-18',
    settings: { name: 'Empresa do Usuário', day1: 5, day2: 20, budgetPreset: '601020', needs: 60, wants: 10, save: 20, privacy: true, onboardingDone: true },
    accounts: [
      { id: 101, name: 'Banco Inter Personal', type: 'Conta corrente', initial: 5500.50, reconciled: { balance: 5500.50, date: '2026-08-18', difference: 0 }, balanceMode: 'snapshot', balanceDate: '2026-08-18' },
      { id: 102, name: 'XP Investimentos', type: 'Investimento', initial: 120000, reconciled: null, balanceMode: 'snapshot', balanceDate: '2026-08-18' }
    ],
    cards: [
      { id: 201, name: 'Cartão Black Inter', limit: 15000, closeDay: 15, dueDay: 22, payAccountId: 101, history: [{ id: 1, at: '2026-08-18T10:00:00Z', type: 'limit', text: 'Limite 15k', amount: 15000 }] }
    ],
    transactions: [
      { id: 301, kind: 'expense', desc: 'Supermercado Mensal', amount: 850.75, date: '2026-08-10', category: 'Alimentação', accountId: 101, status: 'paid', dueDay: 10, note: 'Compra no atacado', tags: ['mercado'], balanceImpact: true, createdAt: Date.now() },
      { id: 302, kind: 'income', desc: 'Consultoria TI', amount: 9500, date: '2026-08-05', category: 'Trabalho', accountId: 101, status: 'paid', dueDay: 5, note: 'NF 1042', tags: ['pj'], balanceImpact: true, createdAt: Date.now() }
    ],
    transfers: [
      { id: 401, desc: 'Aporte XP', amount: 2000, date: '2026-08-12', fromId: 101, toId: 102, tags: ['investimento'], balanceImpact: true }
    ],
    purchases: [
      { id: 501, cardId: 201, desc: 'Notebook Dell', total: 6000, installments: 10, purchaseDate: '2026-08-01', firstMonth: '2026-08', category: 'Trabalho', status: 'active', note: '10x sem juros', tags: ['hardware'], refunds: [] }
    ],
    invoiceAdjustments: [
      { id: 601, cardId: 201, month: '2026-08', desc: 'Desconto anuidade', amount: -50 }
    ],
    invoices: [
      { id: 701, cardId: 201, month: '2026-08', status: 'open', officialTotal: 550, paidAmount: 0, accountId: 101, payments: [{ date: '2026-08-15', amount: 100, balanceImpact: true, targetMonth: '2026-08' }], closedAt: null }
    ],
    recurring: [
      { id: 801, desc: 'Internet Fibra', type: 'expense', amount: 149.90, day: 15, category: 'Essencial', accountId: 101, start: '2026-01', end: '', active: true, skips: [] }
    ],
    debts: [
      { id: 901, name: 'Financiamento Imóvel', contractTotal: 350000, balance: 320000, principalReceived: 300000, financedAmount: 350000, iof: 0, rate: 0.85, cetMonthly: 0.9, cetAnnual: 11.2, payment: 3200, installments: 240, paidInstallments: 20, firstDue: '2025-01-10', lastDue: '2044-12-10', paymentMethod: 'debit', history: [], note: 'Caixa' }
    ],
    goals: [
      { id: 1001, name: 'Reserva Emergência', target: 50000, accountId: 102, plan: 1500, targetDate: '2027-12-31', history: [{ date: '2026-08-12', amount: 2000 }] }
    ],
    assets: [
      { id: 1101, name: 'Carro Próprio', value: 48000 }
    ],
    statements: [
      { id: 1201, account: 'Banco Inter', file: 'extrato-08-2026.ofx', months: ['2026-08'], count: 15 }
    ],
    classificationRules: [
      { pattern: 'uber', action: 'expense', category: 'Transporte' }
    ],
    categoryBudgets: { 'Alimentação': 1500, 'Transporte': 600 },
    snapshots: [
      { id: 1301, month: '2026-07', income: 9500, expense: 3200, result: 6300, assets: 168000, debts: 323200, netWorth: -155200, reserve: 40000, closedAt: '2026-07-31T23:59:59Z' }
    ],
    trash: [
      { type: 'transaction', item: { id: 999, desc: 'Lançamento deletado antigo', amount: 100 }, deletedAt: '2026-08-15T12:00:00Z' }
    ],
    undo: [
      { id: 1401, label: 'Excluir lançamento antigo', at: '2026-08-15T12:00:00Z', state: { accounts: [{ id: 101, name: 'Banco Inter Personal' }] } }
    ],
    closedMonths: ['2026-07'],
    csvTemplates: [
      { id: 1501, name: 'Modelo Inter', headersKey: 'data|descricao|valor', dateIndex: 0, descIndex: 1, valueIndex: 2, createdAt: '2026-08-01T00:00:00Z' }
    ],
    favorites: [
      { id: 'fav-custom', label: 'Almoço PJ', kind: 'expense', desc: 'Almoço PJ', category: 'Alimentação' }
    ],
    creditFacilities: [
      { id: 1601, institution: 'Banco Inter', name: 'Cheque Especial', limit: 5000, used: 0, type: 'overdraft' }
    ],
    ui: { invoiceMonthByCard: { 201: '2026-08' } }
  };
}

async function setupAndBoot(page, customState) {
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await writeIndexedDB(page, customState);
  await page.evaluate(state => {
    localStorage.clear();
    localStorage.setItem('sfp_auto_backups', JSON.stringify([{ at: new Date().toISOString(), state }]));
  }, customState);
  await page.reload();
  await expectBootComplete(page, expect, customState.settings.name);
}

test.describe('Integridade do Reset do Sistema (Zerar Sistema)', () => {

  test('1 a 13 e 23: Zerar sistema limpa dados financeiros pessoais, lixo, backups, restaura base legítima e não reinjeta seed', async ({ page }) => {
    const custom = richCustomState();
    await setupAndBoot(page, custom);
    const errors = monitor(page);

    await page.evaluate(() => setPage('config'));
    await page.locator('#resetBtn').click();
    await page.locator('#dialogConfirmBtn').click();
    await expect(page.locator('#toast')).toHaveText('Sistema restaurado');

    const freshState = await page.evaluate(() => state);

    // 1 e 2. Transactions & transfers removidos
    expect(freshState.transactions).toEqual([]);
    expect(freshState.transfers).toEqual([]);

    // 3. Contas customizadas removidas
    expect(freshState.accounts).toEqual([]);

    // 4. Cartões removidos
    expect(freshState.cards).toEqual([]);

    // 5 e 6. Faturas e ajustes removidos
    expect(freshState.invoices).toEqual([]);
    expect(freshState.invoiceAdjustments).toEqual([]);

    // 7. Compras no cartão removidas
    expect(freshState.purchases).toEqual([]);

    // 8. Dívidas removidas
    expect(freshState.debts).toEqual([]);

    // 9. Recorrências removidas
    expect(freshState.recurring).toEqual([]);

    // 10. Metas, ativos, orçamentos e regras aprendidas removidos
    expect(freshState.goals).toEqual([]);
    expect(freshState.assets).toEqual([]);
    expect(freshState.categoryBudgets).toEqual({});
    expect(freshState.classificationRules).toEqual([]);

    // 11. Snapshots e fechamentos removidos
    expect(freshState.snapshots).toEqual([]);
    expect(freshState.closedMonths).toEqual([]);

    // 12. Undo e lixo removidos
    expect(freshState.undo).toEqual([]);
    expect(freshState.trash).toEqual([]);

    // 13. Backups automáticos antigos removidos do localStorage
    const autoBackups = await page.evaluate(() => localStorage.getItem('sfp_auto_backups'));
    expect(autoBackups).toBeNull();

    // 23. Anti-regressão do bug original: nenhum dado pessoal ou de demonstração do seed foi reinjetado
    const seedDescList = ['NUCEL', 'Uber - NuPay', 'ASSB Comércio Varejista', 'Pablo Lanches', 'Amazon', 'Mercado Livre', 'Crédito Consignado CLT', 'Nubank', 'Itaú'];
    const allText = JSON.stringify(freshState);
    for (const seedItem of seedDescList) {
      expect(allText).not.toContain(seedItem);
    }
    expect(freshState.settings.name).not.toBe('SFP Jhony');
    expect(freshState.settings.name).toBe('SFP');
    expect(freshState.settings.onboardingDone).toBe(false);

    expect(errors).toEqual([]);
  });

  test('14, 15, 16 e 17: IndexedDB, fallback e lastSavedState contêm base limpa; reload não restaura dados antigos', async ({ page }) => {
    const custom = richCustomState();
    await setupAndBoot(page, custom);

    await page.evaluate(() => setPage('config'));
    await page.locator('#resetBtn').click();
    await page.locator('#dialogConfirmBtn').click();
    await expect(page.locator('#toast')).toHaveText('Sistema restaurado');

    // 14. IndexedDB contém estado limpo
    const idbState = await page.evaluate(async () => (await dbGet()).value);
    expect(idbState.accounts).toEqual([]);
    expect(idbState.cards).toEqual([]);
    expect(idbState.transactions).toEqual([]);
    expect(idbState.debts).toEqual([]);
    expect(idbState.settings.name).toBe('SFP');

    // 15. FALLBACK_KEY corresponde ao estado limpo
    const fallback = await page.evaluate(() => JSON.parse(localStorage.getItem('sfp_final_fallback')));
    expect(fallback.accounts).toEqual([]);
    expect(fallback.cards).toEqual([]);
    expect(fallback.transactions).toEqual([]);
    expect(fallback.debts).toEqual([]);

    // 16. lastSavedState corresponde ao estado limpo
    const savedState = await page.evaluate(() => lastSavedState);
    expect(savedState.accounts).toEqual([]);
    expect(savedState.cards).toEqual([]);
    expect(savedState.transactions).toEqual([]);

    // 17. Reload pós-reset preserva base limpa
    const errors = monitor(page);
    await page.reload();
    await expectBootComplete(page, expect, 'SFP');

    const reloadedState = await page.evaluate(() => state);
    expect(reloadedState.accounts).toEqual([]);
    expect(reloadedState.cards).toEqual([]);
    expect(reloadedState.transactions).toEqual([]);
    expect(reloadedState.debts).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('18: Reset repetido é idempotente e preserva schema válido', async ({ page }) => {
    const custom = richCustomState();
    await setupAndBoot(page, custom);
    const errors = monitor(page);

    await page.addLocatorHandler(
      page.locator('#skipOnboard'),
      async (skipBtn) => {
        if (await skipBtn.isVisible()) {
          await skipBtn.click();
        }
      }
    );

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        closeProgressive();
        setPage('config');
      });
      await page.locator('#resetBtn').click();
      await page.locator('#dialogConfirmBtn').click();
      await expect(page.locator('#toast')).toHaveText('Sistema restaurado');
    }

    const finalState = await page.evaluate(() => state);
    expect(finalState.accounts).toEqual([]);
    expect(finalState.cards).toEqual([]);
    expect(finalState.transactions).toEqual([]);
    expect(finalState.version).toBe(202);
    expect(finalState.schemaVersion).toBe(14);
    expect(await page.evaluate(() => validPersistedState(state))).toBe(true);

    expect(errors).toEqual([]);
  });

  test('19: Cancelamento da confirmação não altera estado nem persistência', async ({ page }) => {
    const custom = richCustomState();
    await setupAndBoot(page, custom);
    const errors = monitor(page);

    await page.evaluate(() => setPage('config'));
    await page.locator('#resetBtn').click();
    await page.locator('#dialogCancelBtn').click();

    // Estado em memória inalterado
    const currState = await page.evaluate(() => state);
    expect(currState.settings.name).toBe(custom.settings.name);
    expect(currState.accounts.length).toBe(custom.accounts.length);
    expect(currState.transactions.length).toBe(custom.transactions.length);

    // Persistência inalterada
    const idbState = await page.evaluate(async () => (await dbGet()).value);
    expect(idbState.settings.name).toBe(custom.settings.name);
    expect(idbState.accounts.length).toBe(custom.accounts.length);

    expect(errors).toEqual([]);
  });

  test('20 e 21: Falha de persistência não gera toast de sucesso e restaura/mantém consistentemente estado anterior em memória e persistência', async ({ page }) => {
    const custom = richCustomState();
    await setupAndBoot(page, custom);
    const errors = monitor(page);

    // Simula falha total de persistência
    await page.evaluate(() => {
      dbSet = async () => { throw Error('Simulated storage write error'); };
    });

    await page.evaluate(() => setPage('config'));
    await page.locator('#resetBtn').click();
    await page.locator('#dialogConfirmBtn').click();

    // 20. Toast de erro (NÃO sucesso)
    await expect(page.locator('#toast')).toHaveText('Não foi possível zerar o sistema. Nenhuma alteração foi aplicada.');

    // 21. Memória e persistência preservadas
    const currState = await page.evaluate(() => state);
    expect(currState.settings.name).toBe(custom.settings.name);
    expect(currState.accounts.length).toBe(custom.accounts.length);
    expect(currState.transactions.length).toBe(custom.transactions.length);

    const savedState = await page.evaluate(() => lastSavedState);
    expect(savedState.settings.name).toBe(custom.settings.name);
  });

  test('22: Renderização de todas as telas com arrays financeiros vazios não lança exceptions', async ({ page }) => {
    const custom = richCustomState();
    await setupAndBoot(page, custom);

    await page.evaluate(() => setPage('config'));
    await page.locator('#resetBtn').click();
    await page.locator('#dialogConfirmBtn').click();
    await expect(page.locator('#toast')).toHaveText('Sistema restaurado');

    const errors = monitor(page);

    // Navega por todas as telas do aplicativo com estado vazio
    const pages = ['hoje', 'dashboard', 'visao', 'lancamentos', 'extratos', 'contas', 'cartoes', 'recorrencias', 'orcamento', 'dividas', 'metas', 'patrimonio', 'calendario', 'relatorios', 'simuladores', 'dados', 'auditoria', 'config'];
    for (const pageName of pages) {
      await page.evaluate(p => setPage(p), pageName);
    }

    expect(errors).toEqual([]);
  });

});
