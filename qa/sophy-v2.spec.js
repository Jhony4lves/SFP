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

test.describe('Sophy Foundation V2 — Conversação Natural, Hybrid AI Router & Resiliência', () => {

  test('SOPHY-V2-01: Primeira apresentação acontece apenas quando apropriado e não se repete', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophyChatList')).toBeVisible();

    // Primeira vez: exibe bolha inicial de apresentação curta
    await expect(page.locator('.sophy-msg-row.sophy .sophy-bubble').first()).toContainText('Sophy');

    // Envia uma mensagem para marcar introDone como true
    await page.locator('#sophyInput').fill('Oi, tudo bem?');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/Tô ótima|Tudo tranquilo|Olá|Oiee|boa/i);

    const isIntroDone = await page.evaluate(() => state.sophy.introDone);
    expect(isIntroDone).toBe(true);

    // Limpa o chat
    await page.locator('#sophyClearHistoryBtn').click();
    await expect(page.locator('#dialogConfirmBtn')).toBeVisible();
    await page.locator('#dialogConfirmBtn').click();
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    // Após limpeza com introDone=true, não repete "Oi! Eu sou a Sophy" de apresentação inicial
    const freshOpener = page.locator('.sophy-msg-row.sophy .sophy-bubble').first();
    await expect(freshOpener).not.toContainText('Eu sou a Sophy');
    await expect(freshOpener).toContainText(/Oiee|Tô por aqui|Tudo certinho/i);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-02: Usuário casual gera resposta casual e NÃO injeta saldo sem motivo', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await page.locator('#sophyInput').fill('Como você tá?');
    await page.locator('#sophySendBtn').click();
    const response = page.locator('.sophy-msg-row.sophy').last();
    await expect(response).toContainText(/Tô ótima|energia total|Tudo tranquilo|Focada|pronta/i);

    const text = await response.textContent();
    expect(text).not.toContain('livre projetado');
    expect(text).not.toContain('R$');

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-03: Pergunta geral não financeira não cai em fallback financeiro', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await page.locator('#sophyInput').fill('Qual é a capital da Mongólia?');
    await page.locator('#sophySendBtn').click();
    const response = page.locator('.sophy-msg-row.sophy').last();
    await expect(response).toContainText('modo local');

    const text = await response.textContent();
    expect(text).not.toContain('Seu saldo total em contas');
    expect(text).not.toContain('seu livre projetado tá em');

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-04: Pergunta matemática geral é roteada ao Online Core (quando mock provider ativo)', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.evaluate(() => {
      window.sophySetMockProvider({ active: true });
    });

    await page.locator('.nav button[data-page="sophy"]').click();
    await expect(page.locator('#sophyNetworkTag')).toContainText('Mock Core');

    await page.locator('#sophyInput').fill('Então me diz, qual é a raiz cúbica de 1987');
    await page.locator('#sophySendBtn').click();
    const response = page.locator('.sophy-msg-row.sophy').last();
    await expect(response).toContainText(/12[,.]57/);

    const text = await response.textContent();
    expect(text).not.toContain('No momento seu livre projetado');

    await page.locator('#sophyInput').fill('Qual é a raiz quadrada de 144');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText('12');

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-05: Sem provider online (modo local), pergunta geral produz fallback honesto', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.evaluate(() => {
      window.sophySetMockProvider({ active: false });
    });

    await page.locator('.nav button[data-page="sophy"]').click();
    await page.locator('#sophyInput').fill('Por que o céu é azul?');
    await page.locator('#sophySendBtn').click();
    const response = page.locator('.sophy-msg-row.sophy').last();
    await expect(response).toContainText('modo local');

    const text = await response.textContent();
    expect(text).not.toContain('Entendi! Adoro quando a gente troca uma ideia. No momento seu livre');

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-06: Pergunta financeira usa Local Core como fonte numérica determinística', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await page.locator('#sophyInput').fill('Quanto tenho de livre projetado hoje?');
    await page.locator('#sophySendBtn').click();
    const freeResponse = page.locator('.sophy-msg-row.sophy').last();
    await expect(freeResponse).toContainText(/livre projetado/i);

    const freeNum = await page.evaluate(() => allAccountBalance() - commitmentUntilNextIncome());
    await expect(freeResponse).toContainText(freeNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-07: Provider nunca pode sobrescrever números authoritative do Local Core', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.evaluate(() => {
      window.sophySetMockProvider({ active: true });
    });

    await page.locator('.nav button[data-page="sophy"]').click();
    await page.locator('#sophyInput').fill('Quanto sobra depois das contas?');
    await page.locator('#sophySendBtn').click();
    const response = page.locator('.sophy-msg-row.sophy').last();
    await expect(response).toContainText(/livre projetado/i);

    const calculatedFree = await page.evaluate(() => allAccountBalance() - commitmentUntilNextIncome());
    await expect(response).toContainText(calculatedFree.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-08: Follow-up contextual funciona com retenção de entidade anterior', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    // 1. Consulta cartões
    await page.locator('#sophyInput').fill('Como estão minhas faturas de cartão?');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/cart|fatura/i);

    // 2. Follow-up
    await page.locator('#sophyInput').fill('E se eu pagar metade?');
    await page.locator('#sophySendBtn').click();
    const followUp = page.locator('.sophy-msg-row.sophy').last();
    await expect(followUp).toContainText(/metade|fatura/i);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-09: "lembre que..." persiste memória no Local Core', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await page.locator('#sophyInput').fill('Lembre que prefiro pagar o aluguel no dia 5');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/Guardei isso na minha memória/i);

    const mems = await page.evaluate(() => state.sophy.memories);
    expect(mems.length).toBe(1);
    expect(mems[0].content).toContain('aluguel no dia 5');

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-10: Conversa casual NÃO vira memória permanente automaticamente', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await page.locator('#sophyInput').fill('Tô com sono');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/descansar/i);

    await page.locator('#sophyInput').fill('Obrigado pela ajuda');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.sophy').last()).toContainText(/prazer/i);

    const mems = await page.evaluate(() => state.sophy.memories);
    expect(mems.length).toBe(0);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-11: Provider timeout cai para fallback local graciosamente', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.evaluate(() => {
      window.sophySetMockProvider({ active: true, simulateTimeout: true });
    });

    await page.locator('.nav button[data-page="sophy"]').click();
    await page.locator('#sophyInput').fill('Quanto tenho nas contas?');
    await page.locator('#sophySendBtn').click();
    const response = page.locator('.sophy-msg-row.sophy').last();
    await expect(response).toContainText('saldo total em contas');

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-12: Provider auth error não revela segredo e responde com fallback seguro', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.evaluate(() => {
      window.sophySetMockProvider({ active: true, simulateAuthError: true });
    });

    await page.locator('.nav button[data-page="sophy"]').click();
    await page.locator('#sophyInput').fill('Qual meu livre projetado?');
    await page.locator('#sophySendBtn').click();
    const response = page.locator('.sophy-msg-row.sophy').last();
    await expect(response).toContainText('livre projetado');

    const text = await response.textContent();
    expect(text).not.toContain('Invalid API Key');
    expect(text).not.toContain('Bearer');

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-13: Estado visual Online/Offline/Mock/Local corresponde ao estado real', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await expect(page.locator('#sophyNetworkTag')).toContainText(/Local Core/i);

    await page.evaluate(() => window.sophySetMockProvider({ active: true }));
    await expect(page.locator('#sophyNetworkTag')).toContainText('Mock Core (QA)');

    await page.evaluate(() => window.sophySetMockProvider({ active: false }));
    await expect(page.locator('#sophyNetworkTag')).toContainText(/Local Core/i);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-14: Histórico de mensagens e memórias sobrevive a reload da página', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await page.evaluate(() => {
      window.sophyAddMemory('fact', 'Trabalho como desenvolvedor', 'chat');
    });

    await page.locator('#sophyInput').fill('Persistência V2 do SFP');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.user').last()).toContainText('Persistência V2 do SFP');
    await expect(page.locator('.sophy-msg-row.sophy').last()).toBeVisible();

    await page.reload();
    await page.locator('.nav button[data-page="sophy"]').click();

    await expect(page.locator('.sophy-msg-row.user').last()).toContainText('Persistência V2 do SFP');

    const mems = await page.evaluate(() => state.sophy.memories);
    expect(mems.length).toBe(1);
    expect(mems[0].content).toBe('Trabalho como desenvolvedor');

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-15: Composer e UI funcionam em viewport mobile (Portrait & Landscape)', async ({ page }) => {
    const errors = monitor(page);

    await boot(page, PORTRAIT);
    await page.locator('.nav button[data-page="sophy"]').click();

    const input = page.locator('#sophyInput');
    await expect(input).toBeVisible();
    expect(await input.getAttribute('placeholder')).toBe('Fala comigo...');

    await page.locator('#sophyInput').fill('Teste mobile portrait');
    await page.locator('#sophySendBtn').click();
    await expect(page.locator('.sophy-msg-row.user').last()).toContainText('Teste mobile portrait');

    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('#sophyChatList')).toBeVisible();
    await expect(page.locator('#sophySendBtn')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-16: Modal de configuração de provedor IA e diálogos não usam alerts nativos', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await page.locator('#sophySettingsBtn').click();
    await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await expect(page.locator('#modalRoot h2')).toContainText('Inteligência Artificial');

    await page.locator('#sophyProviderSelect').selectOption('gemini');
    await expect(page.locator('#sophyOnlineConfig')).toBeVisible();

    await page.locator('#closeSophySettings').click();
    await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-17: Sophy não começa todas as respostas com padrões repetitivos como "Entendi!"', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    const prompts = [
      'Oi Sophy',
      'Como você está?',
      'Qual meu próximo recebimento?',
      'Obrigado'
    ];

    for (const prompt of prompts) {
      await page.locator('#sophyInput').fill(prompt);
      await page.locator('#sophySendBtn').click();
      await expect(page.locator('.sophy-msg-row.user').last()).toContainText(prompt);
      const lastReply = await page.locator('.sophy-msg-row.sophy').last().textContent();
      expect(lastReply.startsWith('Entendi!')).toBe(false);
    }

    expect(errors).toEqual([]);
  });

  test('SOPHY-V2-18: Mensagem emocional recebe acolhimento antes de sugestão financeira', async ({ page }) => {
    const errors = monitor(page);
    await boot(page);

    await page.locator('.nav button[data-page="sophy"]').click();

    await page.locator('#sophyInput').fill('Sophy, fiz uma merda.');
    await page.locator('#sophySendBtn').click();
    const reply = page.locator('.sophy-msg-row.sophy').last();
    await expect(reply).toContainText(/Ih|Me conta|Respira fundo/i);

    const text = await reply.textContent();
    expect(text).not.toContain('Seu saldo total em contas hoje é');

    expect(errors).toEqual([]);
  });

});
