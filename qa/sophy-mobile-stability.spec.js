const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

const DESKTOP = { width: 1280, height: 720 };
const MOBILE_S24 = { width: 360, height: 780 };

async function boot(page, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

async function sendSophy(page, text) {
  const userCount = await page.locator('.sophy-msg-row.user').count();
  await page.locator('#sophyInput').fill(text);
  await page.locator('#sophySendBtn').click();
  await expect(page.locator('.sophy-msg-row.user')).toHaveCount(userCount + 1);
  await expect(page.locator('#sophySendBtn')).toBeEnabled();
  await page.waitForFunction((count) => {
    return (state?.sophy?.messages || []).filter(m => m.sender === 'sophy').length >= count;
  }, userCount + 1);
  return page.locator('.sophy-msg-row.sophy').last();
}

test.describe('SFP Hotfix — Estabilidade Mobile & Sophy', () => {

  test('STAB-01: Small talk ("Oiiii", "kkkk", "tô cansado", "valeu") responde com naturalidade sem alerta offline', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophyChatList')).toBeVisible();

    // 1. Saudação com caracteres repetidos ("Oiiii")
    const resp1 = await sendSophy(page, 'Oiiii');
    await expect(resp1).toContainText(/oi|ol[aá]|t[oô]\s+por\s+aqui/i);
    await expect(resp1).not.toContainText(/modo local \(offline\)/i);

    // 2. Risada / Humor ("kkkkkk")
    const resp2 = await sendSophy(page, 'kkkkkk');
    await expect(resp2).toContainText(/haha|rir|humor/i);
    await expect(resp2).not.toContainText(/modo local \(offline\)/i);

    // 3. Sentimento / Cansaço ("tô cansado")
    const resp3 = await sendSophy(page, 'tô cansado');
    await expect(resp3).toContainText(/descansar|dormir|sono/i);
    await expect(resp3).not.toContainText(/modo local \(offline\)/i);

    // 4. Agradecimento ("valeu")
    const resp4 = await sendSophy(page, 'valeu');
    await expect(resp4).toContainText(/de nada|prazer|sempre/i);
    await expect(resp4).not.toContainText(/modo local \(offline\)/i);

    expect(errors).toEqual([]);
  });

  test('STAB-02: Simulação hipotética de empréstimo calcula juros e impacto sem cadastrar dívida real', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    const initialDebtsCount = await page.evaluate(() => (state.debts || []).length);

    await page.locator('.nav button[data-page="sophy"]').click();

    // Pergunta hipotética exata relatada no Galaxy S24
    const response = await sendSophy(page, 'E se eu pegar um empréstimo de 15.000 pra pagar em 12 parcelas de 2 mil?');

    await expect(response).toBeVisible();
    await expect(response).toContainText('Simulação');
    // Total a pagar: 24.000,00
    await expect(response).toContainText('24.000,00');
    // Custo dos juros: 9.000,00
    await expect(response).toContainText('9.000,00');
    // Parcela: 2.000,00
    await expect(response).toContainText('2.000,00');
    // Nota de simulação
    await expect(response).toContainText('não altera seus dados');

    // Assegura que nenhuma dívida real foi inserida no state
    const afterDebtsCount = await page.evaluate(() => (state.debts || []).length);
    expect(afterDebtsCount).toBe(initialDebtsCount);

    expect(errors).toEqual([]);
  });

  test('STAB-03: Double-submit guard e resiliência no envio de mensagem da Sophy', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    // Preenche e clica rapidamente duas vezes simultaneamente
    await page.locator('#sophyInput').fill('Como está meu saldo?');
    await page.evaluate(() => {
      sophySendMessage('Como está meu saldo?');
      sophySendMessage('Como está meu saldo?');
    });

    await page.waitForTimeout(600);

    const userMsgs = await page.evaluate(() =>
      (state.sophy?.messages || []).filter(m => m.sender === 'user')
    );

    // Guard deve impedir disparo duplicado do mesmo clique simultâneo
    expect(userMsgs.length).toBe(1);

    const sophyResponse = page.locator('.sophy-msg-row.sophy').last();
    await expect(sophyResponse).toBeVisible();
    await expect(sophyResponse).toContainText(/saldo total em contas/i);

    // Botão e input devem estar reabilitados
    await expect(page.locator('#sophySendBtn')).toBeEnabled();
    await expect(page.locator('#sophyInput')).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test('STAB-04: Bottom Navigation mobile fica estritamente em UMA ÚNICA LINHA em 360px, 384px e 412px', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, { width: 360, height: 780 });

    const viewports = [
      { width: 360, height: 780 }, // Galaxy S24
      { width: 384, height: 854 }, // Médio
      { width: 412, height: 915 }  // Pixel / Grande
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);

      // Obter os botões visíveis na barra inferior
      const visibleButtons = page.locator('.sidebar .nav button:visible');
      const count = await visibleButtons.count();
      expect(count).toBe(5);

      // Verificar que todos os 5 botões estão na mesma linha horizontal (mesmo top/Y)
      const boxes = [];
      for (let i = 0; i < count; i++) {
        const box = await visibleButtons.nth(i).boundingBox();
        expect(box).not.toBeNull();
        boxes.push(box);
      }

      const firstTop = boxes[0].y;
      for (let i = 1; i < boxes.length; i++) {
        // Tolerância de 2px para subpixel rendering
        expect(Math.abs(boxes[i].y - firstTop)).toBeLessThanOrEqual(2);
      }
    }

    // Testar clique no botão 'Mais'
    const moreBtn = page.locator('#moreNavBtn');
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();

    // Modal de 'Mais' deve abrir com Dashboard e outros módulos
    const modal = page.locator('#modalRoot .modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('button[data-more="dashboard"]')).toBeVisible();

    // Clicar em Dashboard e verificar navegação
    await modal.locator('button[data-more="dashboard"]').click();
    await expect(page.locator('#dashboard')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('STAB-05: Botão Flutuante (+) fica acima da bottom-nav e é ocultado na Sophy', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, MOBILE_S24);

    const fab = page.locator('#contextFab');
    const bottomNav = page.locator('.sidebar');

    // Na página 'Hoje': FAB deve estar visível e ACIMA da bottom nav
    await expect(fab).toBeVisible();
    const fabBox = await fab.boundingBox();
    const navBox = await bottomNav.boundingBox();

    expect(fabBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    // A borda inferior do FAB deve estar acima ou no topo da bottom bar
    expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(navBox.y + 4);

    // Navegar para a Sophy: FAB deve ser ocultado para não cobrir o composer
    await page.locator('.sidebar .nav button[data-page="sophy"]').click();
    await expect(fab).toBeHidden();

    // Em 'Lançamentos' o FAB permanece oculto para não duplicar
    // a própria ação principal de novo lançamento.
    await page.locator('.sidebar .nav button[data-page="lancamentos"]').click();
    await expect(fab).toBeHidden();

    expect(errors).toEqual([]);
  });

  test('STAB-06: Chat da Sophy é responsivo e não causa quebra ou overflow no mobile', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, MOBILE_S24);

    await page.locator('.sidebar .nav button[data-page="sophy"]').click();

    const card = page.locator('.sophy-chat-card');
    await expect(card).toBeVisible();

    // Enviar mensagem longa
    const response = await sendSophy(page, 'Explica a diferença entre caixa, competência e compromisso por favor');
    await expect(response).toContainText(/caixa/i);
    await expect(response).toContainText(/compet[eê]ncia/i);
    await expect(response).toContainText(/compromisso/i);

    // Verificar se não há overflow horizontal na página
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    expect(errors).toEqual([]);
  });

  test('STAB-07: Múltiplas mensagens consecutivas não provocam salto no layout e persistem no storage', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, MOBILE_S24);

    await page.locator('.sidebar .nav button[data-page="sophy"]').click();

    // Envia 4 mensagens em sequência
    await sendSophy(page, 'Oi!');
    await sendSophy(page, 'Quanto tenho de livre projetado hoje?');
    await sendSophy(page, 'Quais são as minhas metas?');
    await sendSophy(page, 'Valeu!');

    // O histórico dentro da Sophy deve ter pelo menos 4 mensagens do usuário e 4 da Sophy
    const userMsgs = await page.locator('.sophy-msg-row.user').count();
    const sophyMsgs = await page.locator('.sophy-msg-row.sophy').count();
    expect(userMsgs).toBeGreaterThanOrEqual(4);
    expect(sophyMsgs).toBeGreaterThanOrEqual(4);

    // O composer continua visível e clicável
    const input = page.locator('#sophyInput');
    const sendBtn = page.locator('#sophySendBtn');
    await expect(input).toBeVisible();
    await expect(sendBtn).toBeEnabled();

    // Recarregar a página e confirmar que o histórico persistiu
    await page.reload();
    await expect(page.locator('#pageTitle')).toHaveText('Hoje');
    await page.locator('.sidebar .nav button[data-page="sophy"]').click();
    await expect(page.locator('.sophy-msg-row.user')).toHaveCount(userMsgs);

    expect(errors).toEqual([]);
  });

  test('STAB-08: Falha simulada no processamento de mensagem não trava a UI e recupera com fallback gracioso', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, MOBILE_S24);

    await page.locator('.sidebar .nav button[data-page="sophy"]').click();

    // Simula falha catastrófica no router
    await page.evaluate(() => {
      window.sophyRouter.route = async () => {
        throw new Error('Falha simulada de rede / provider em teste');
      };
    });

    await page.locator('#sophyInput').fill('Pergunta que vai falhar propositalmente');
    await page.locator('#sophySendBtn').click();

    // Sophy deve responder com mensagem amigável de recuperação em vez de ficar muda
    const fallbackResponse = page.locator('.sophy-msg-row.sophy').last();
    await expect(fallbackResponse).toContainText(/tropeço|tenta de novo|já tô de volta/i);

    // O botão de envio e input DEVEM ser destravados
    await expect(page.locator('#sophySendBtn')).toBeEnabled();
    await expect(page.locator('#sophyInput')).toBeEnabled();

    // UI deve aceitar novo envio após recuperação
    await page.evaluate(() => {
      // Restaura router original
      window.sophyRouter.route = async (prompt) => {
        const snap = financialContextSnapshot();
        return sophyOfflineCore.process(prompt, snap);
      };
    });

    const recoverMsg = await sendSophy(page, 'Oi de novo!');
    await expect(recoverMsg).toContainText(/oi|ol[aá]|t[oô]\s+por\s+aqui/i);
  });

  test('STAB-09: Layout responsivo em Landscape (Galaxy S24 em modo horizontal 780x360)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page, { width: 780, height: 360 });

    await page.locator('.sidebar .nav button[data-page="sophy"]').click();

    // Em landscape: a barra lateral fica à esquerda e visível
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    const sideBox = await sidebar.boundingBox();
    expect(sideBox.x).toBe(0);

    // O composer e o chat da Sophy estão visíveis e utilizáveis
    const chatCard = page.locator('.sophy-chat-card');
    await expect(chatCard).toBeVisible();

    const response = await sendSophy(page, 'Tô testando a Sophy de lado!');
    await expect(response).toBeVisible();

    expect(errors).toEqual([]);
  });

});
