const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function boot(page) {
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

async function go(page, id) {
  await page.evaluate(p => setPage(p), id);
  await expect(page.locator(`#${id}`)).toHaveClass(/active/);
}

async function back(page) {
  return page.evaluate(() => window.handleAndroidBack());
}

test.describe('Preservação de Estado e Navegação em Mudança de Orientação', () => {

  test('1. Rotação entre Portrait e Landscape via barra de navegação preserva a página ativa e dados do formulário', async ({ page }) => {
    const errors = monitor(page);
    await page.setViewportSize(PORTRAIT);
    await boot(page);

    // Na barra inferior mobile, o botão Lançamentos está visível
    await page.locator('.nav button[data-page="lancamentos"]').click();
    await expect(page.locator('#lancamentos')).toHaveClass(/active/);

    // Preenche campo no formulário
    await page.locator('#txDesc').fill('Compra de Teste Rotação');
    await page.locator('#txAmount').fill('150.00');

    // Rotaciona para Landscape
    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('#lancamentos')).toHaveClass(/active/);
    await expect(page.locator('#pageTitle')).toHaveText('Lançamentos');
    await expect(page.locator('#txDesc')).toHaveValue('Compra de Teste Rotação');
    await expect(page.locator('#txAmount')).toHaveValue('150.00');

    // Rotaciona de volta para Portrait
    await page.setViewportSize(PORTRAIT);
    await expect(page.locator('#lancamentos')).toHaveClass(/active/);
    await expect(page.locator('#txDesc')).toHaveValue('Compra de Teste Rotação');
    await expect(page.locator('#txAmount')).toHaveValue('150.00');

    expect(errors).toEqual([]);
  });

  test('2. Rotação preserva histórico de navegação linear e comportamento do botão Voltar', async ({ page }) => {
    const errors = monitor(page);
    await page.setViewportSize(PORTRAIT);
    await boot(page);

    await go(page, 'contas');
    await go(page, 'cartoes');
    await expect(page.locator('#cartoes')).toHaveClass(/active/);

    expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje', 'contas', 'cartoes']);

    // Rotaciona para Landscape
    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('#cartoes')).toHaveClass(/active/);
    expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje', 'contas', 'cartoes']);

    // Volta no Landscape -> deve ir para Contas
    expect(await back(page)).toBe(true);
    await expect(page.locator('#contas')).toHaveClass(/active/);
    expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje', 'contas']);

    // Rotaciona para Portrait
    await page.setViewportSize(PORTRAIT);
    await expect(page.locator('#contas')).toHaveClass(/active/);

    // Volta no Portrait -> deve ir para Hoje
    expect(await back(page)).toBe(true);
    await expect(page.locator('#hoje')).toHaveClass(/active/);
    expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje']);

    // Mais um voltar na raiz libera a saída (retorna false)
    expect(await back(page)).toBe(false);

    expect(errors).toEqual([]);
  });

  test('3. Rotação repetida e sucessiva (Portrait <-> Landscape) não causa perda de página nem erros', async ({ page }) => {
    const errors = monitor(page);
    await page.setViewportSize(PORTRAIT);
    await boot(page);

    await go(page, 'calendario');
    await expect(page.locator('#calendario')).toHaveClass(/active/);

    for (let i = 0; i < 5; i++) {
      await page.setViewportSize(i % 2 === 0 ? LANDSCAPE : PORTRAIT);
      await expect(page.locator('#calendario')).toHaveClass(/active/);
      expect(await page.evaluate(() => sfpNavigation.getStack())).toEqual(['hoje', 'calendario']);
    }

    expect(errors).toEqual([]);
  });

  test('4. Rotação com modal/painel aberto mantém modal e retorna à página correta ao fechar', async ({ page }) => {
    const errors = monitor(page);
    await page.setViewportSize(PORTRAIT);
    await boot(page);

    await go(page, 'contas');
    await page.locator('#contextFab').click(); // Abre Nova conta via progressive panel
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);

    // Rotaciona para Landscape
    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);

    // Executa voltar via Android back -> fecha o modal mantendo a página contas
    expect(await back(page)).toBe(true);
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
    await expect(page.locator('#contas')).toHaveClass(/active/);

    // Rotaciona de volta para Portrait
    await page.setViewportSize(PORTRAIT);
    await expect(page.locator('#contas')).toHaveClass(/active/);

    // Voltar leva para Hoje
    expect(await back(page)).toBe(true);
    await expect(page.locator('#hoje')).toHaveClass(/active/);

    expect(errors).toEqual([]);
  });

  test('5. Dados financeiros em memória e persistência permanecem intactos após rotações', async ({ page }) => {
    const fix = fixture('Rotação QA');
    fix.accounts.push({ id: 2, name: 'Investimentos', type: 'Investimento', initial: 5000, balanceMode: 'snapshot', balanceDate: '2026-01-01' });
    fix.transactions.push({ id: 10, kind: 'expense', desc: 'Mercado', amount: 250, date: '2026-01-15', category: 'Alimentação', accountId: 1, status: 'paid', balanceImpact: true, createdAt: Date.now() });

    await boot(page);
    await writeIndexedDB(page, fix);
    await page.reload();
    await expectBootComplete(page, expect, 'Rotação QA');

    const errors = monitor(page);

    await page.setViewportSize(PORTRAIT);
    await go(page, 'contas');
    await expect(page.locator('#contas')).toHaveClass(/active/);

    // Múltiplas rotações
    await page.setViewportSize(LANDSCAPE);
    await page.setViewportSize(PORTRAIT);
    await page.setViewportSize(LANDSCAPE);
    await page.setViewportSize(PORTRAIT);

    const currState = await page.evaluate(() => state);
    expect(currState.accounts.length).toBe(2);
    expect(currState.transactions.length).toBe(1);
    expect(currState.transactions[0].desc).toBe('Mercado');
    expect(currState.settings.name).toBe('Rotação QA');

    const idbState = await page.evaluate(async () => (await dbGet()).value);
    expect(idbState.accounts.length).toBe(2);
    expect(idbState.transactions.length).toBe(1);

    expect(errors).toEqual([]);
  });

  test('6. Contrato Android: AndroidManifest e MainActivity contêm diretivas de preservação de orientação e estado', async () => {
    const manifest = fs.readFileSync('app/src/main/AndroidManifest.xml', 'utf8');
    expect(manifest).toContain('android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|keyboardHidden|density"');

    const java = fs.readFileSync('app/src/main/java/com/jhony/sfp/MainActivity.java', 'utf8');
    expect(java).toContain('webView.saveState(outState)');
    expect(java).toContain('webView.restoreState(savedInstanceState)');
  });

});
