const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { monitor } = require('./helpers');

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
const DESKTOP = { width: 1280, height: 720 };

async function boot(page, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

test.describe('Pacote Pré-IA de Acabamento Funcional e Integridade', () => {

  test('1. Nome público Smart Financial Planner no título, brand header e strings Android', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // Title no HTML
    await expect(page).toHaveTitle(/Smart Financial Planner/i);

    // Brand header na sidebar
    const brandText = await page.locator('.brand strong').textContent();
    expect(brandText.trim()).toBe('Smart Financial Planner');

    // strings.xml no Android
    const stringsPath = path.resolve('app/src/main/res/values/strings.xml');
    expect(fs.existsSync(stringsPath)).toBe(true);
    const stringsContent = fs.readFileSync(stringsPath, 'utf8');
    expect(stringsContent).toContain('<string name="app_name">Smart Financial Planner</string>');

    // AndroidManifest.xml
    const manifestPath = path.resolve('app/src/main/AndroidManifest.xml');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    expect(manifestContent).toContain('android:label="@string/app_name"');
    expect(manifestContent).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifestContent).toContain('android:roundIcon="@mipmap/ic_launcher_round"');

    expect(errors).toEqual([]);
  });

  test('2. Recursos de ícone oficial Android existem e possuem contratos válidos', async () => {
    const bgPath = path.resolve('app/src/main/res/drawable/ic_launcher_background.xml');
    const fgPath = path.resolve('app/src/main/res/drawable/ic_launcher_foreground.xml');
    const icLauncherPath = path.resolve('app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
    const icLauncherRoundPath = path.resolve('app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
    const drawableFallback = path.resolve('app/src/main/res/drawable/ic_launcher.xml');

    expect(fs.existsSync(bgPath)).toBe(true);
    expect(fs.existsSync(fgPath)).toBe(true);
    expect(fs.existsSync(icLauncherPath)).toBe(true);
    expect(fs.existsSync(icLauncherRoundPath)).toBe(true);
    expect(fs.existsSync(drawableFallback)).toBe(true);

    const fgContent = fs.readFileSync(fgPath, 'utf8');
    // Cores turquesa/ciano da identidade visual escolhida
    expect(fgContent).toContain('#2ED1A2');
    expect(fgContent).toContain('#4CC2FF');
  });

  test('3. Botão "Mais" é visível em portrait mobile e oculto em landscape e desktop', async ({ page }) => {
    const errors = monitor(page);

    // Desktop
    await boot(page, DESKTOP);
    await expect(page.locator('#moreNavBtn')).toBeHidden();

    // Landscape Mobile (ex: Samsung S24 landscape 844x390)
    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('#moreNavBtn')).toBeHidden();

    // Todos os 17 destinos da sidebar devem estar disponíveis diretamente em landscape
    const landscapeButtons = page.locator('.sidebar .nav button[data-page]');
    const count = await landscapeButtons.count();
    expect(count).toBeGreaterThanOrEqual(17);
    await expect(landscapeButtons.first()).toBeVisible();

    // Portrait Mobile (ex: 390x844)
    await page.setViewportSize(PORTRAIT);
    await expect(page.locator('#moreNavBtn')).toBeVisible();

    // Ao clicar em "Mais" em portrait, abre o modal com módulos adicionais
    await page.locator('#moreNavBtn').click();
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('#modalRoot h2')).toHaveText('Mais');

    // Fechar menu Mais
    await page.locator('#closeMore').click();
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('4. Diálogo de confirmação com tema SFP (sfpConfirm) responde a confirmação e cancelamento', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // Inicia diálogo confirmando
    const confirmPromise = page.evaluate(() => {
      return window.sfpConfirm({
        title: 'Confirmar ação importante',
        message: 'Deseja prosseguir com a operação?',
        confirmText: 'Prosseguir',
        cancelText: 'Voltar',
        danger: true
      });
    });

    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('#dialogTitle')).toHaveText('Confirmar ação importante');
    await expect(page.locator('#dialogConfirmBtn')).toHaveClass(/danger/);

    // Clica em confirmar
    await page.locator('#dialogConfirmBtn').click();
    const result = await confirmPromise;
    expect(result).toBe(true);
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    // Inicia diálogo cancelando
    const cancelPromise = page.evaluate(() => {
      return window.sfpConfirm({
        title: 'Outra confirmação',
        message: 'Cancelar esta ação?',
        confirmText: 'Sim',
        cancelText: 'Não'
      });
    });

    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await page.locator('#dialogCancelBtn').click();
    const cancelResult = await cancelPromise;
    expect(cancelResult).toBe(false);
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('5. Diálogo de alerta (sfpAlert) e entrada (sfpPrompt) funcionam de forma consistente', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // sfpAlert
    const alertPromise = page.evaluate(() => {
      return window.sfpAlert({
        title: 'Aviso de Segurança',
        message: 'Operação executada com sucesso.',
        buttonText: 'Entendido',
        type: 'success'
      });
    });

    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await page.locator('#dialogOkBtn').click();
    await alertPromise;
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    // sfpPrompt com preenchimento
    const promptPromise = page.evaluate(() => {
      return window.sfpPrompt({
        title: 'Senha de Proteção',
        message: 'Digite a nova chave:',
        defaultValue: 'MinhaSenhaSegura123'
      });
    });

    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('#dialogPromptInput')).toHaveValue('MinhaSenhaSegura123');
    await page.locator('#dialogConfirmBtn').click();
    const promptValue = await promptPromise;
    expect(promptValue).toBe('MinhaSenhaSegura123');
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('6. Sistema de feedback e avisos (sfpFeedback, toast) e bridge Android com sanitização', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // Mock bridge Android
    await page.evaluate(() => {
      window.lastAndroidNotification = null;
      window.AndroidBridge = {
        showNotification: (title, message) => {
          window.lastAndroidNotification = { title, message };
        }
      };
    });

    // Dispara showFeedback com notificação ativa
    await page.evaluate(() => {
      window.showFeedback('Operação de backup realizada com sucesso.', {
        title: 'Backup concluído',
        type: 'success',
        notify: true
      });
    });

    await expect(page.locator('#feedbackCard')).toHaveClass(/show/);
    await expect(page.locator('#feedbackCard')).toContainText('Backup concluído');

    const notification = await page.evaluate(() => window.lastAndroidNotification);
    expect(notification).toEqual({
      title: 'Backup concluído',
      message: 'Operação de backup realizada com sucesso.'
    });

    // Testa toast com variantes visuais
    await page.evaluate(() => {
      window.toast('Operação concluída.', 'success');
    });
    await expect(page.locator('#toast')).toHaveClass(/toast-success/);
    await expect(page.locator('#toast')).toHaveClass(/show/);

    expect(errors).toEqual([]);
  });

  test('7. Fechamento de diálogos sfp e modais pelo botão Voltar Android (handleAndroidBack)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // Abre um diálogo sfpConfirm
    page.evaluate(() => {
      window.sfpConfirm({ title: 'Diálogo Aberto', message: 'Pressione Voltar para fechar.' });
    });
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);

    // Simula tecla/gesto Voltar do Android
    const handled = await page.evaluate(() => window.handleAndroidBack());
    expect(handled).toBe(true);
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });
});
