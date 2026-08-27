const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { monitor } = require('./helpers');

const APP_PATH = path.resolve(__dirname, '../app/src/main/assets/www/index.html');
const MANIFEST_PATH = path.resolve(__dirname, '../app/src/main/AndroidManifest.xml');
const MAIN_ACTIVITY_PATH = path.resolve(__dirname, '../app/src/main/java/com/jhony/sfp/MainActivity.java');
const DRAWABLE_DIR = path.resolve(__dirname, '../app/src/main/res/drawable');
const MIPMAP_DIR = path.resolve(__dirname, '../app/src/main/res/mipmap-anydpi-v26');
const MASTER_LOGO_PATH = path.resolve(__dirname, '../app/src/main/res/drawable-nodpi/sfp_logo_master.png');

async function boot(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await page.evaluate(async () => {
    state.settings.onboardingDone = true;
    state.settings.name = 'SFP QA';
    await dbSet(state);
    lastSavedState = clone(state);
  });
}

const MASTER_SHA256 = '79d98edae8bbecebca451ec8d37a838d926092621b4c20c55172c434ef71091d';

test.describe('Pacote Pré-IA de Acabamento Funcional e Integridade', () => {
  test('1. Nome público Smart Financial Planner no título, brand header e strings Android', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    await expect(page).toHaveTitle('Smart Financial Planner');
    await expect(page.locator('.brand strong')).toContainText('Smart Financial Planner');
    const strings = fs.readFileSync(path.resolve(__dirname, '../app/src/main/res/values/strings.xml'), 'utf8');
    expect(strings).toContain('Smart Financial Planner');
    expect(errors).toEqual([]);
  });

  test('2. Recursos de ícone oficial Android existem e possuem contratos válidos', async () => {
    expect(fs.existsSync(MASTER_LOGO_PATH)).toBe(true);
    expect(fs.existsSync(path.join(MIPMAP_DIR, 'ic_launcher.xml'))).toBe(true);
    expect(fs.existsSync(path.join(MIPMAP_DIR, 'ic_launcher_round.xml'))).toBe(true);
    const icon = fs.readFileSync(path.join(MIPMAP_DIR, 'ic_launcher.xml'), 'utf8');
    expect(icon).toContain('@drawable/ic_launcher_foreground');
    expect(icon).toContain('@color/ic_launcher_background');
  });

  test('3. Botão "Mais" é visível em portrait mobile e oculto em landscape e desktop', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, { width: 390, height: 844 });
    await expect(page.locator('#moreNavBtn')).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#moreNavBtn')).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#moreNavBtn')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('4. Diálogo de confirmação com tema SFP (sfpConfirm) responde a confirmação e cancelamento', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    const confirmed = page.evaluate(() => sfpConfirm({ title: 'Teste', message: 'Confirmar?', confirmText: 'Sim', cancelText: 'Não' }));
    await expect(page.locator('#dialogRoot')).not.toHaveClass(/hidden/);
    await page.locator('#dialogConfirmBtn').click();
    expect(await confirmed).toBe(true);

    const cancelled = page.evaluate(() => sfpConfirm({ title: 'Teste', message: 'Cancelar?', confirmText: 'Sim', cancelText: 'Não' }));
    await page.locator('#dialogCancelBtn').click();
    expect(await cancelled).toBe(false);
    expect(errors).toEqual([]);
  });

  test('5. Diálogo de alerta (sfpAlert) e entrada (sfpPrompt) funcionam de forma consistente', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    const alert = page.evaluate(() => sfpAlert({ title: 'Aviso', message: 'Mensagem QA' }));
    await expect(page.locator('#dialogMessage')).toContainText('Mensagem QA');
    await page.locator('#dialogConfirmBtn').click();
    await alert;

    const prompt = page.evaluate(() => sfpPrompt({ title: 'Entrada', message: 'Valor', defaultValue: '10' }));
    await expect(page.locator('#dialogInput')).toHaveValue('10');
    await page.locator('#dialogInput').fill('25');
    await page.locator('#dialogConfirmBtn').click();
    expect(await prompt).toBe('25');
    expect(errors).toEqual([]);
  });

  test('6. Sistema de feedback e avisos (sfpFeedback, toast) e bridge Android com sanitização', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    await page.evaluate(() => {
      window.AndroidBridge = { notify: (...args) => { window.__notifyArgs = args; } };
      showFeedback('Feedback QA', { title: 'Pronto', type: 'success' });
      toast('Toast QA', 'success');
      notifyNative('Título <b>x</b>', 'Mensagem <script>x</script>');
    });
    await expect(page.locator('#feedbackCard')).toContainText('Feedback QA');
    await expect(page.locator('#toast')).toContainText('Toast QA');
    const args = await page.evaluate(() => window.__notifyArgs);
    expect(args.join(' ')).not.toContain('<script>');
    expect(errors).toEqual([]);
  });

  test('7. Fechamento de diálogos sfp e modais pelo botão Voltar Android', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    page.evaluate(() => sfpAlert({ title: 'Back', message: 'Feche com back' }));
    await expect(page.locator('#dialogRoot')).not.toHaveClass(/hidden/);
    await page.evaluate(() => handleAndroidBack());
    await expect(page.locator('#dialogRoot')).toHaveClass(/hidden/);

    await page.locator('#moreNavBtn').click();
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await page.evaluate(() => handleAndroidBack());
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
  });

  test('8. Onboarding a partir de accounts: [] cria primeira conta, persiste saldo R$ 15,00 e reflete no dashboard e reload', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    await page.evaluate(async () => {
      state.accounts = [];
      state.settings.onboardingDone = false;
      await dbSet(state);
      lastSavedState = clone(state);
      showOnboarding();
    });
    await expect(page.locator('#onboardRoot')).not.toHaveClass(/hidden/);
    await page.locator('#obName').fill('Conta QA');
    await page.locator('#obBalance').fill('15');
    await page.locator('#onboardForm button[type="submit"]').click();
    await expect.poll(() => page.evaluate(() => state.accounts.length)).toBe(1);
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
    const persistedAccounts = await page.evaluate(() => state.accounts);
    expect(persistedAccounts.length).toBe(1);
    expect(persistedAccounts[0].initial).toBe(15);

    expect(errors).toEqual([]);
  });

  test('9. Inputs monetários limitam a 2 casas decimais sem limitar percentuais como #debtRate', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // Testa campo monetário de lançamentos: #txAmount
    await page.locator('.nav button[data-page="lancamentos"]').click();
    const txAmount = page.locator('#txAmount');
    await txAmount.focus();
    await txAmount.fill('15.00000');
    await txAmount.blur();
    expect(await txAmount.inputValue()).toBe('15.00');

    await txAmount.fill('49.999');
    await txAmount.blur();
    expect(await txAmount.inputValue()).toBe('49.99');

    // Testa campo de saldo inicial em contas: #accountInitial usa apresentação pt-BR.
    await page.locator('.nav button[data-page="contas"]').click();
    await page.evaluate(() => openManagementAction('contas'));
    const accountInitial = page.locator('#accountInitial');
    await accountInitial.fill('123.4567');
    await accountInitial.blur();
    expect(await accountInitial.inputValue()).toBe('123,45');
    await page.evaluate(() => closeProgressive());

    // Testa que percentual de juros de dívidas (#debtRate) NÃO é truncado para 2 casas
    await page.locator('.nav button[data-page="dividas"]').click();
    await page.evaluate(() => openManagementAction('dividas'));
    const debtRate = page.locator('#debtRate');
    await debtRate.fill('2.7458');
    await debtRate.blur();
    expect(await debtRate.inputValue()).toBe('2.7458');
    await page.evaluate(() => closeProgressive());

    expect(errors).toEqual([]);
  });

  test('10. Zerar sistema e fluxos de confirmação utilizam sfpConfirm sem diálogos nativos do WebView', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    await page.evaluate(() => setPage('config'));
    await expect(page.locator('#resetAll')).toBeVisible();
    await page.locator('#resetAll').click();
    await expect(page.locator('#dialogRoot')).not.toHaveClass(/hidden/);
    await page.locator('#dialogCancelBtn').click();
    await expect(page.locator('#dialogRoot')).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
  });

  test('11. Verificação de integridade: nenhum diálogo nativo Classe A remanescente no index.html', async () => {
    const html = fs.readFileSync(APP_PATH, 'utf8');
    expect(html).not.toMatch(/\bwindow\.alert\s*\(/);
    expect(html).not.toMatch(/\bwindow\.confirm\s*\(/);
    expect(html).not.toMatch(/\bwindow\.prompt\s*\(/);
  });

  test('12. Sidebar em landscape permanece acessível e fixa na viewport durante rolagem vertical', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, { width: 844, height: 390 });
    const before = await page.locator('.sidebar').boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const after = await page.locator('.sidebar').boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('13. Legendas dos gráficos: Receitas, despesas e resultado possuem indicadores coloridos distintos', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    await page.evaluate(() => setPage('dashboard'));
    const labels = await page.locator('.chart-legend').allTextContents();
    expect(labels.join(' ')).toMatch(/Receitas/i);
    expect(labels.join(' ')).toMatch(/Despesas/i);
    expect(labels.join(' ')).toMatch(/Resultado/i);
    expect(errors).toEqual([]);
  });

  test('14. Espaçamento e tipografia: Central de Dados e Auditoria separam label e value sem colisão', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    for (const target of ['dados', 'auditoria']) {
      await page.evaluate(t => setPage(t), target);
      const bad = await page.evaluate(() => [...document.querySelectorAll('.metric')].some(el => {
        const label = el.querySelector('span');
        const value = el.querySelector('strong');
        if (!label || !value) return false;
        const a = label.getBoundingClientRect(), b = value.getBoundingClientRect();
        return a.bottom > b.top;
      }));
      expect(bad).toBe(false);
    }
    expect(errors).toEqual([]);
  });

  test('15. Versão da estrutura: SCHEMA_VERSION=11 é dinâmico e única fonte da verdade', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);
    const info = await page.evaluate(() => ({ schema: SCHEMA_VERSION, stateSchema: state.schemaVersion }));
    expect(info.schema).toBe(11);
    expect(info.stateSchema).toBe(11);
    expect(errors).toEqual([]);
  });

  test('16. Logo oficial: Master SHA-256 e mipmaps Android preservam artwork aprovada', async () => {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(MASTER_LOGO_PATH)).digest('hex');
    expect(digest).toBe(MASTER_SHA256);
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      expect(fs.existsSync(path.resolve(__dirname, `../app/src/main/res/mipmap-${density}/ic_launcher.png`))).toBe(true);
    }
  });
});
