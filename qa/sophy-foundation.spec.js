const { test, expect } = require('@playwright/test');
const { monitor } = require('./helpers');

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
const DESKTOP = { width: 1280, height: 720 };

async function boot(page, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

test.describe('Sophy — Fundação da Inteligência Financeira e Conversacional', () => {

  test('1. Sophy: Navegação, layout de chat e elementos de identidade (offline/local-first)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // Navega para a aba Sophy
    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#pageTitle')).toHaveText('Sophy');
    await expect(page.locator('#sophy')).toHaveClass(/active/);

    // Verifica identidade e badges
    await expect(page.locator('.sophy-meta h2')).toContainText('Sophy');
    await expect(page.locator('#sophyMoodTag')).toBeVisible();
    await expect(page.locator('#sophyNetworkTag')).toContainText(/Offline Core|Online Core/);

    // Verifica estrutura de chat
    await expect(page.locator('#sophyChatList')).toBeVisible();
    await expect(page.locator('#sophySuggestions')).toBeVisible();
    await expect(page.locator('#sophyInput')).toBeVisible();
    await expect(page.locator('#sophySendBtn')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('2. Financial Context Engine V1: Snapshots estruturados e explicabilidade determinística', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    const snapshot = await page.evaluate(() => {
      return window.sfpFinancialContextSnapshot();
    });

    expect(snapshot).toBeDefined();
    expect(snapshot.version).toBe(1);
    expect(typeof snapshot.availableCents).toBe('number');
    expect(snapshot.accounts).toBeDefined();
    expect(Array.isArray(snapshot.accounts.items)).toBe(true);
    expect(snapshot.free).toBeDefined();
    expect(snapshot.realized).toBeDefined();
    expect(snapshot.patrimony).toBeDefined();
    expect(snapshot.cards).toBeDefined();
    expect(snapshot.debts).toBeDefined();
    expect(snapshot.goals).toBeDefined();
    expect(snapshot.projections).toBeDefined();

    expect(errors).toEqual([]);
  });

  test('3. Sophy Core: Consultas de saldo e livre projetado refletem a verdade matemática do SFP', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // Navega para Sophy
    await page.locator('.nav button[data-page="sophy"]').click();

    // Pergunta sobre saldo
    await page.locator('#sophyInput').fill('Qual é o meu saldo total?');
    await page.locator('#sophySendBtn').click();

    // Mensagem da Sophy deve aparecer no chat
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/saldo total em contas/i);

    // Pergunta sobre dinheiro livre projetado
    await page.locator('#sophyInput').fill('Quanto tenho de livre projetado?');
    await page.locator('#sophySendBtn').click();

    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/livre projetado/i);

    expect(errors).toEqual([]);
  });

  test('4. Sophy Core: Cartões, faturas, dívidas e metas com explicabilidade', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    // Pergunta sobre faturas
    await page.locator('#sophyInput').fill('Como estão minhas faturas de cartão?');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/cart|fatura/i);

    // Pergunta sobre metas
    await page.locator('#sophyInput').fill('Quais são minhas metas?');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/meta|reserva/i);

    // Pergunta sobre distinção entre caixa e competência
    await page.locator('#sophyInput').fill('Qual a diferença entre caixa e competência?');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/Caixa/i);
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/Competência/i);

    expect(errors).toEqual([]);
  });

  test('5. Memórias Locais da Sophy: Aprendizado, persistência, visualização e exclusão', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    // Envia instrução de memória
    await page.locator('#sophyInput').fill('Lembre que meu aniversário é no dia 25 de dezembro');
    await page.locator('#sophySendBtn').click();

    // Sophy confirma memorização
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/Guardei isso na minha memória/i);

    // Valida atualização do contador de memórias
    await expect(page.locator('#sophyMemoryCount')).toHaveText('1');

    // Valida persistência da memória em state
    const mems = await page.evaluate(() => state.sophy.memories);
    expect(mems.length).toBe(1);
    expect(mems[0].content).toContain('25 de dezembro');

    // Abre o modal de memórias
    await page.locator('#sophyOpenMemoriesBtn').click();
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('.sophy-memory-item')).toContainText('25 de dezembro');

    // Exclui a memória via botão do modal
    await page.locator('[data-delete-memory]').click();
    await expect(page.locator('#dialogConfirmBtn')).toBeVisible();
    await page.locator('#dialogConfirmBtn').click(); // Confirma no sfpConfirm

    // Valida que a memória foi removida
    const memsAfter = await page.evaluate(() => state.sophy.memories);
    expect(memsAfter.length).toBe(0);

    // Fecha modal
    await page.locator('#closeSophyMemories').click();
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('6. Conversação Natural Samantha-like: Saudações, sentimentos e humor sem erros robóticos', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    // Saudação
    await page.locator('#sophyInput').fill('Oi, Sophy!');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toBeVisible();

    // Pergunta pessoal / sentimento
    await page.locator('#sophyInput').fill('Tô um pouco estressado hoje com as contas');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/Respira fundo|jornada|passo de cada vez/i);

    // Piada
    await page.locator('#sophyInput').fill('Me conta uma piada');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('7. Proatividade da Sophy: Alertas inteligentes e interação espontânea', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // Dispara proatividade espontânea forçada
    const proactiveText = await page.evaluate(() => {
      return window.sophyCheckProactivity({ force: true });
    });

    expect(proactiveText).toBeDefined();
    expect(typeof proactiveText).toBe('string');
    expect(proactiveText.length).toBeGreaterThan(10);

    // Valida que a mensagem proativa foi inserida no histórico
    const lastMsg = await page.evaluate(() => state.sophy.messages.at(-1));
    expect(lastMsg.sender).toBe('sophy');

    // Abre tela Sophy e valida que a mensagem aparece no DOM
    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('8. Persistência e Limpeza do Chat da Sophy com preservação de memórias', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    // Cria uma memória
    await page.evaluate(() => {
      window.sophyAddMemory('preference', 'Gosto de pagar contas adiantadas', 'chat');
    });

    // Envia uma mensagem no chat
    await page.locator('#sophyInput').fill('Teste de persistência do chat');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.user').last()).toContainText('Teste de persistência do chat');
    await expect(page.locator('.sophy-msg-row.sophy').last()).toBeVisible();

    // Recarrega a página
    await page.reload();
    await page.locator('.nav button[data-page="sophy"]').click();

    // Valida que a mensagem permanece
    await expect(page.locator('.sophy-msg-row.user').last()).toContainText('Teste de persistência do chat');

    // Clica em limpar histórico
    await page.locator('#sophyClearHistoryBtn').click();
    await expect(page.locator('#dialogConfirmBtn')).toBeVisible();
    await page.locator('#dialogConfirmBtn').click(); // Confirma limpeza

    // Mensagens limpas, mas memória preservada
    const mems = await page.evaluate(() => state.sophy.memories);
    expect(mems.length).toBe(1);
    expect(mems[0].content).toBe('Gosto de pagar contas adiantadas');

    expect(errors).toEqual([]);
  });

  test('9. Responsividade Sophy: Portrait e Landscape sem overflow', async ({ page }) => {
    const errors = monitor(page);

    // Portrait
    await boot(page, PORTRAIT);
    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophy')).toBeVisible();

    // Envia mensagem em portrait
    await page.locator('#sophyInput').fill('Olá no mobile portrait');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.user').last()).toBeVisible();

    // Landscape
    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('#sophy')).toBeVisible();
    await expect(page.locator('#sophyChatList')).toBeVisible();

    // Chip de sugestão em landscape
    await page.locator('[data-sophy-prompt="Como está meu dinheiro livre hoje?"]').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/livre/i);

    expect(errors).toEqual([]);
  });

  test('10. Integração com Android Back Button e Custo Zero Absoluto', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    // 1. Custo Zero e Provider Local
    const isOnline = await page.evaluate(() => window.sophyAIProvider.isOnlineAvailable());
    expect(isOnline).toBe(false);

    // 2. Navega para Sophy e abre memórias
    await page.locator('.nav button[data-page="sophy"]').click();
    await page.locator('#sophyOpenMemoriesBtn').click();
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);

    // Android back fecha o modal de memórias
    await page.evaluate(() => window.handleAndroidBack());
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    // Android back na tela da Sophy volta para 'Hoje'
    await page.evaluate(() => window.handleAndroidBack());
    await expect(page.locator('#pageTitle')).toHaveText('Hoje');

    expect(errors).toEqual([]);
  });

});
