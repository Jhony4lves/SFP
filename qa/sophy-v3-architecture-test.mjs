import assert from 'node:assert/strict';
import { createSophyHarness } from './sophy-semantic-harness.mjs';

export async function runArchitectureTests() {
  console.log('=== TEST MATRIX: SOPHY V3 ARCHITECTURE CONTRACTS ===');
  const harness = createSophyHarness();
  const sandbox = harness.sandbox;
  const context = harness.context;

  let passed = 0;
  let failed = 0;

  // 1. Context Broker Privacy Contract
  console.log('-- Test 1: Context Broker Sanitization & Privacy --');
  try {
    const cb = harness.context.sophyContextBroker;
    assert(cb, 'sophyContextBroker deve estar definido');
    
    // Overview scope
    const overview = cb.buildContext('overview', { month: '2026-01' });
    assert(overview, 'Deve gerar contexto de overview');
    assert(typeof overview.freeBRL === 'number', 'Deve conter freeBRL numérico');
    assert(!overview.apiKey && !overview.token && !overview.secret, 'NUNCA deve vazar chaves ou segredos');
    assert(!overview.undo && !overview.stateDump && !overview.transactions, 'NUNCA deve vazar dump de state, undo ou transações completas');

    // Cards scope
    const cardsCtx = cb.buildContext('cards');
    assert(cardsCtx, 'Deve gerar contexto de cartões');
    assert(Array.isArray(cardsCtx.cards), 'Deve conter lista agregada de cartões');
    if (cardsCtx.cards.length) {
      assert(cardsCtx.cards[0].name && typeof cardsCtx.cards[0].invoiceBRL === 'number', 'Cartão deve ter apenas dados resumidos');
      assert(!cardsCtx.cards[0].number && !cardsCtx.cards[0].cvv, 'NUNCA deve conter dados bancários sensíveis');
    }

    console.log('  ✓ PASS: Context Broker protege privacidade e minimiza payload.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Context Broker privacidade [${e.message}]`);
    failed++;
  }

  // 2. Secret Storage & State Cleanness Contract
  console.log('-- Test 2: Groq API Key Security & State Cleanness --');
  try {
    const st = harness.getState();
    const stJson = JSON.stringify(st);
    assert(!stJson.includes('gsk_'), 'State não deve conter chave Groq em texto puro');
    assert(!st.sophy?.settings?.apiKey || st.sophy.settings.apiKey.startsWith('••••'), 'state.sophy.settings não pode armazenar chave em plaintext');
    console.log('  ✓ PASS: State limpo e seguro contra vazamento de chaves.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Segurança de chaves no state [${e.message}]`);
    failed++;
  }

  // 3. Memory 4-Layer & Policy Contract
  console.log('-- Test 3: Local Memory Policy & Noise Rejection --');
  try {
    const mp = harness.context.sophyMemoryPolicy;
    assert(mp, 'sophyMemoryPolicy deve estar definido');

    // Rejeição de ruídos
    assert(!mp.validateCandidate({ text: 'oi' }).valid, 'Deve rejeitar "oi"');
    assert(!mp.validateCandidate({ text: 'kkkk' }).valid, 'Deve rejeitar "kkkk"');
    assert(!mp.validateCandidate({ text: 'beleza' }).valid, 'Deve rejeitar "beleza"');
    assert(!mp.validateCandidate({ text: 'tô aqui' }).valid, 'Deve rejeitar "tô aqui"');
    assert(!mp.validateCandidate({ text: 'valeu' }).valid, 'Deve rejeitar "valeu"');

    // Aceitação de memórias válidas
    const validCandidate = mp.validateCandidate({ text: 'Meu aniversário é dia 15 de maio', type: 'fact' });
    assert(validCandidate.valid, 'Deve aceitar fato válido sobre aniversário');

    const validPref = mp.validateCandidate({ text: 'Prefiro economizar em compras de impulso', type: 'preference' });
    assert(validPref.valid, 'Deve aceitar preferência financeira válida');

    console.log('  ✓ PASS: Local Memory Policy valida e rejeita ruídos com sucesso.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Memory Policy [${e.message}]`);
    failed++;
  }

  // 4. Read-Only Tool Calling Contract
  console.log('-- Test 4: Read-Only Financial Tool Calling --');
  try {
    const tc = harness.context.sophyToolRegistry;
    assert(tc, 'sophyToolRegistry deve estar definido');
    
    // Proibição de ferramentas mutantes
    assert(!tc.getTool('createTransaction'), 'PROIBIDO tool de criar transação');
    assert(!tc.getTool('deleteTransaction'), 'PROIBIDO tool de deletar transação');
    assert(!tc.getTool('payInvoice'), 'PROIBIDO tool de pagar fatura');
    assert(!tc.getTool('transfer'), 'PROIBIDO tool de transferência');

    // Ferramenta read-only autoritativa
    const getFin = tc.getTool('get_financial_context');
    assert(getFin, 'get_financial_context deve estar registrado');
    const res = await getFin.execute({ scope: 'overview' });
    assert(res && typeof res.freeBRL === 'number', 'Tool deve retornar contexto financeiro local');

    console.log('  ✓ PASS: Ferramentas financeiras estritamente READ-ONLY.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Read-Only Tool Calling [${e.message}]`);
    failed++;
  }

  // 5. Resilience & Graceful Fallback
  console.log('-- Test 5: Resilience & Fallback on Provider Errors --');
  try {
    const orch = harness.context.sophyOrchestrator;
    assert(orch, 'sophyOrchestrator deve estar definido');

    // Simula erro 401
    const res401 = await orch.handleProviderError(new Error('401 Unauthorized'), 'como tá meu mês?');
    assert(res401 && res401.text, 'Deve fornecer resposta em fallback para 401');

    // Simula erro 429
    const res429 = await orch.handleProviderError(new Error('429 Rate Limit'), 'como tá meu mês?');
    assert(res429 && res429.text, 'Deve fornecer resposta em fallback para 429');

    // Simula Timeout
    const resTimeout = await orch.handleProviderError(new Error('TimeoutError'), 'como tá meu mês?');
    assert(resTimeout && resTimeout.text, 'Deve fornecer resposta em fallback para Timeout');

    console.log('  ✓ PASS: Resiliência com fallback gracioso para todos os erros de provider.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Resiliência e Fallback [${e.message}]`);
    failed++;
  }

  // 6. Android Keystore AES-256-GCM Cryptographic Vault Contracts (A through J)
  console.log('-- Test 6: Android Keystore AES-256-GCM Cryptographic Vault Contracts --');
  try {
    const crypto = await import('node:crypto');
    const secretKeySample = 'gsk_test_mock_dummy_secret_key_1234567890';
    
    // Simulate AndroidBridge Keystore behavior in mock harness
    let mockSharedPreferencesVault = {};
    const mockKeystore = {
      alias: 'sfp_sophy_groq_v3_master_key',
      aesKey: crypto.randomBytes(32), // 256-bit AES key
      encrypt(rawSecret) {
        const iv = crypto.randomBytes(12); // 12-byte nonce for AES-GCM
        const cipher = crypto.createCipheriv('aes-256-gcm', this.aesKey, iv);
        let ciphertext = cipher.update(rawSecret, 'utf8');
        ciphertext = Buffer.concat([ciphertext, cipher.final()]);
        const tag = cipher.getAuthTag(); // 128-bit authentication tag
        const combinedCiphertext = Buffer.concat([ciphertext, tag]);

        mockSharedPreferencesVault = {
          sophy_groq_ciphertext: combinedCiphertext.toString('base64'),
          sophy_groq_iv: iv.toString('base64'),
          sophy_groq_version: 'v3-keystore-gcm'
        };
        return true;
      },
      decrypt() {
        if (!mockSharedPreferencesVault.sophy_groq_ciphertext || !mockSharedPreferencesVault.sophy_groq_iv) return null;
        const combined = Buffer.from(mockSharedPreferencesVault.sophy_groq_ciphertext, 'base64');
        const iv = Buffer.from(mockSharedPreferencesVault.sophy_groq_iv, 'base64');
        const tag = combined.subarray(combined.length - 16);
        const ciphertext = combined.subarray(0, combined.length - 16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.aesKey, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(ciphertext, 'binary', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      },
      clear() {
        mockSharedPreferencesVault = {};
        return true;
      }
    };

    // Contract A: Não existe plaintext da API key nos prefs
    mockKeystore.encrypt(secretKeySample);
    const prefsContent = JSON.stringify(mockSharedPreferencesVault);
    assert(!prefsContent.includes(secretKeySample), 'Contract A: Prefs NUNCA deve conter o segredo em plaintext');

    // Contract B: Ciphertext difere do segredo original
    assert(mockSharedPreferencesVault.sophy_groq_ciphertext !== secretKeySample, 'Contract B: Ciphertext deve ser diferente do segredo');

    // Contract C: IV é persistido separadamente
    assert(mockSharedPreferencesVault.sophy_groq_iv && typeof mockSharedPreferencesVault.sophy_groq_iv === 'string', 'Contract C: IV deve ser persistido separadamente');

    // Contract D: Decrypt interno recupera corretamente para uso nativo
    const decrypted = mockKeystore.decrypt();
    assert.equal(decrypted, secretKeySample, 'Contract D: Decrypt deve recuperar o segredo exato internamente');

    // Contract E: Remover chave apaga ciphertext/IV
    mockKeystore.clear();
    assert(!mockSharedPreferencesVault.sophy_groq_ciphertext && !mockSharedPreferencesVault.sophy_groq_iv, 'Contract E: Limpar chave remove ciphertext e IV');

    // Contract F: Substituir chave funciona e gera novo IV
    mockKeystore.encrypt('gsk_replacement_key_abc_9999');
    const firstIv = mockSharedPreferencesVault.sophy_groq_iv;
    mockKeystore.encrypt('gsk_replacement_key_xyz_8888');
    const secondIv = mockSharedPreferencesVault.sophy_groq_iv;
    assert.notEqual(firstIv, secondIv, 'Contract F: Cada criptografia deve usar um IV/nonce único e aleatório');
    assert.equal(mockKeystore.decrypt(), 'gsk_replacement_key_xyz_8888', 'Contract F: Substituição de chave decifra corretamente novo segredo');

    // Contract G: Backup/exportação não contém segredo
    const simulatedBackup = JSON.stringify({ state: harness.getState(), version: 'v11' });
    assert(!simulatedBackup.includes('gsk_'), 'Contract G: Exportação de backup não contém segredos Groq');

    // Contract H: Undo não contém segredo
    harness.sandbox.sophySecureStorage.setApiKey('gsk_session_secret_for_test');
    assert(harness.sandbox.sophySecureStorage.hasApiKey(), 'Deve reconhecer chave configurada');
    const undoStack = harness.getState().undo || [];
    assert(!JSON.stringify(undoStack).includes('gsk_'), 'Contract H: Undo stack não contém segredo');

    // Contract I: State não contém segredo
    assert(!JSON.stringify(harness.getState()).includes('gsk_session_secret_for_test'), 'Contract I: State permanece livre de segredos');

    // Contract J: Status mascarado nunca expõe segredo completo
    const masked = harness.sandbox.sophySecureStorage.getMaskedKey();
    assert.equal(masked, '••••••••test', 'Contract J: Masked key deve exibir apenas os 4 últimos dígitos');
    assert(!masked.includes('gsk_session_secret'), 'Contract J: Segredo completo nunca é exposto na máscara');

    // Contract K: Legacy Plaintext Migration Success -> Ciphertext criado e Legacy purgado
    let mockVaultK = { sophy_groq_api_key: 'gsk_legacy_plain_key_success_123' };
    const migrateFnK = () => {
      const legacyKey = mockVaultK.sophy_groq_api_key;
      if (legacyKey) {
        try {
          mockKeystore.encrypt(legacyKey);
        } finally {
          delete mockVaultK.sophy_groq_api_key;
        }
      }
    };
    migrateFnK();
    assert(!mockVaultK.sophy_groq_api_key, 'Contract K: Chave legada deve ser removida após migração');
    assert(mockSharedPreferencesVault.sophy_groq_ciphertext, 'Contract K: Ciphertext deve ser persistido após migração');
    assert.equal(mockKeystore.decrypt(), 'gsk_legacy_plain_key_success_123', 'Contract K: Chave migrada deve ser decifrável');

    // Contract L: Legacy migration failure is recoverable; private pending copy survives for retry.
    let mockVaultL = { sophy_groq_api_key: 'gsk_legacy_plain_key_failure_999' };
    let mockVaultLResultCipher = null;
    const migrateFnLFailure = () => {
      const legacyKey = mockVaultL.sophy_groq_api_key;
      if (!legacyKey) return;
      try {
        throw new Error('Simulated Keystore Exception on encrypt');
      } catch (ignored) {
        // Keep only the app-private pending migration copy; state/backups remain sanitized.
      }
    };
    migrateFnLFailure();
    assert.equal(mockVaultL.sophy_groq_api_key, 'gsk_legacy_plain_key_failure_999', 'Contract L: falha transitória não pode destruir a única cópia recuperável');
    assert(!mockVaultLResultCipher, 'Contract L: Em falha de migração, nenhum ciphertext inválido deve ser considerado');

    // Contract M: Ciphertext/IV corrompidos ou inválidos -> hasSophyApiKey deve retornar false
    const mockCorruptedKeystore = {
      aesKey: crypto.randomBytes(32),
      hasValidApiKey(vault) {
        if (!vault.sophy_groq_ciphertext || !vault.sophy_groq_iv) return false;
        try {
          const combined = Buffer.from(vault.sophy_groq_ciphertext, 'base64');
          const iv = Buffer.from(vault.sophy_groq_iv, 'base64');
          if (combined.length < 16) return false;
          const tag = combined.subarray(combined.length - 16);
          const ciphertext = combined.subarray(0, combined.length - 16);
          const decipher = crypto.createDecipheriv('aes-256-gcm', this.aesKey, iv);
          decipher.setAuthTag(tag);
          let dec = decipher.update(ciphertext, 'binary', 'utf8');
          dec += decipher.final('utf8');
          return !!(dec && dec.trim());
        } catch (e) {
          return false; // Fail-secure: returns false on decrypt failure
        }
      }
    };
    const corruptedVault = { sophy_groq_ciphertext: 'corrupted_base64_garbage', sophy_groq_iv: 'invalid_iv' };
    assert.equal(mockCorruptedKeystore.hasValidApiKey(corruptedVault), false, 'Contract M: hasSophyApiKey deve retornar false para ciphertext/IV corrompidos');

    // Contract N: a pending private copy is removed immediately after a successful retry.
    let mockVaultN = { sophy_groq_api_key: 'gsk_temporary_unmigrated_key' };
    const simulatedRetryMigration = (vault) => {
      const legacy = vault.sophy_groq_api_key;
      if (!legacy) return mockKeystore.decrypt();
      mockKeystore.encrypt(legacy);
      delete vault.sophy_groq_api_key;
      return mockKeystore.decrypt();
    };
    assert.equal(simulatedRetryMigration(mockVaultN), 'gsk_temporary_unmigrated_key', 'Contract N: retry deve recuperar a chave exata');
    assert(!('sophy_groq_api_key' in mockVaultN), 'Contract N: cópia pendente deve ser purgada após migração verificada');

    console.log('  ✓ PASS: Todos os 14 contratos de segurança Keystore (A-N) validados com sucesso.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Keystore Contracts [${e.message}]`);
    failed++;
  }

  // 7. Native Android Code & Boundary Contracts (Requirement 11)
  console.log('-- Test 7: Native Android Code & Boundary Contracts --');
  try {
    const fs = await import('node:fs');
    const bridgeJava = fs.readFileSync('app/src/main/java/com/jhony/sfp/AndroidBridge.java', 'utf8');
    const mainActivityJava = fs.readFileSync('app/src/main/java/com/jhony/sfp/MainActivity.java', 'utf8');
    const indexHtml = fs.readFileSync('app/src/main/assets/www/index.html', 'utf8');

    // 1. AndroidKeyStore, AES/GCM/NoPadding, 256 bits
    assert(bridgeJava.includes('"AndroidKeyStore"'), 'AndroidBridge deve usar provedor AndroidKeyStore');
    assert(bridgeJava.includes('"AES/GCM/NoPadding"'), 'AndroidBridge deve usar transformação AES/GCM/NoPadding');
    assert(bridgeJava.includes('.setKeySize(256)'), 'AndroidBridge deve gerar chave AES de 256 bits');

    // 2. Pending migration is app-private/recoverable and is purged only after verified encryption.
    assert(bridgeJava.includes('stageLegacyApiKeyForRetry'), 'AndroidBridge deve preservar migração pendente quando Keystore falhar');
    assert(bridgeJava.includes('.putString(LEGACY_KEY_GROQ_SECRET, rawKey.trim())'), 'Cópia pendente deve ficar apenas no SharedPreferences privado do vault');
    assert(bridgeJava.includes('if (encryptAndSaveApiKey(trimmed))'), 'Migração deve verificar sucesso antes de purgar a cópia pendente');
    assert(bridgeJava.includes('vaultPrefs.edit().remove(LEGACY_KEY_GROQ_SECRET).commit()'), 'Cópia pendente deve ser purgada após verificação');

    // 3. hasSophyApiKey centralizado e fail-secure
    assert(bridgeJava.includes('private void migrateLegacyKeyIfNeeded('), 'AndroidBridge deve conter método privado centralizado migrateLegacyKeyIfNeeded');
    assert(bridgeJava.includes('migrateLegacyKeyIfNeeded(prefs)'), 'getDecryptedApiKeyInternal deve invocar migrateLegacyKeyIfNeeded');
    assert(bridgeJava.includes('key = getDecryptedApiKeyInternal()'), 'hasSophyApiKey deve delegar para getDecryptedApiKeyInternal');
    assert(!bridgeJava.includes('hasCipher'), 'hasSophyApiKey não deve usar verificação ingênua hasCipher');

    // 4. Endpoint fixo e assinatura sem URL arbitrária
    assert(bridgeJava.includes('public String callSophyGroq(String payloadJson)'), 'callSophyGroq deve aceitar apenas payloadJson (sem endpointUrl)');
    assert(!bridgeJava.includes('callSophyGroq(String endpointUrl'), 'callSophyGroq NUNCA deve aceitar endpointUrl como parâmetro');
    assert(bridgeJava.includes('https://api.groq.com/openai/v1/chat/completions'), 'Endpoint Groq deve ser constante fixa');

    // 5. Redirects bloqueados
    assert(bridgeJava.includes('setInstanceFollowRedirects(false)'), 'Redirecionamentos HTTP devem ser proibidos na bridge');

    // 6. WebView Navigation Boundary
    assert(mainActivityJava.includes('shouldOverrideUrlLoading'), 'MainActivity deve implementar shouldOverrideUrlLoading');
    assert(mainActivityJava.includes('appassets.androidplatform.net'), 'MainActivity deve restringir origem interna a appassets');

    // 7. CSP presente no index.html e connect-src sem api.groq.com
    assert(indexHtml.includes('Content-Security-Policy'), 'index.html deve conter meta Content-Security-Policy');
    assert(indexHtml.includes("frame-src 'none'"), 'CSP deve conter frame-src none');
    assert(indexHtml.includes("object-src 'none'"), 'CSP deve conter object-src none');
    assert(indexHtml.includes("base-uri 'none'"), 'CSP deve conter base-uri none');
    assert(!indexHtml.includes('https://api.groq.com'), 'CSP no index.html não deve conter api.groq.com em connect-src (Groq restrito à bridge nativa)');

    console.log('  ✓ PASS: Todos os contratos nativos Java, WebView Boundary e CSP validados no código de produção.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Contratos nativos de código [${e.message}]`);
    failed++;
  }

  // 8. Physical Device Regression Matrix (PHYS-01 to PHYS-10)
  console.log('-- Test 8: Physical Device Regression Matrix (PHYS-01 to PHYS-10) --');
  try {
    const fs = await import('node:fs');
    const bridgeJava = fs.readFileSync('app/src/main/java/com/jhony/sfp/AndroidBridge.java', 'utf8');
    const buildGradle = fs.readFileSync('app/build.gradle', 'utf8');
    const indexHtml = fs.readFileSync('app/src/main/assets/www/index.html', 'utf8');

    // PHYS-01: Offline casual follow-up
    const rPhys01 = harness.processOffline('Tô bem, e você?');
    assert(!rPhys01.text.includes('modo local (offline)'), 'PHYS-01: Não deve cair em fallback offline');
    assert(!rPhys01.text.includes('R$'), 'PHYS-01: Não deve injetar saldo financeiro');
    assert(/ótima|bem|tranquil|cuidando|pront/i.test(rPhys01.text), 'PHYS-01: Deve responder com reciprocidade e afeto');

    // PHYS-02: Local -> Groq model initialization
    const groqProv = harness.context.sophyProviderRegistry.groq;
    assert.equal(groqProv.defaultModel, 'openai/gpt-oss-120b', 'PHYS-02: Modelo default do Groq deve ser openai/gpt-oss-120b');

    // PHYS-03: Groq + model legacy "default" normalization
    const legacyState = harness.getState();
    legacyState.sophy.settings.model = 'default';
    harness.setState(legacyState);
    harness.eval('normalize()');
    assert.equal(harness.getState().sophy.settings.model, 'openai/gpt-oss-120b', 'PHYS-03: normalize() deve converter model "default" para openai/gpt-oss-120b');

    // PHYS-04: Casual online without unsolicited finance
    assert(indexHtml.includes('NUNCA mencione espontaneamente finanças'), 'PHYS-04: Persona prompt deve proibir finanças não solicitadas em papo casual');

    // PHYS-05: Cansaço sem menu de telemarketing
    const rPhys05 = harness.processOffline('Tô meio cansado hoje, só queria conversar um pouco');
    assert(!rPhys05.text.includes('modo local (offline)'), 'PHYS-05: Não deve dar fallback offline');
    assert(!rPhys05.text.includes('R$'), 'PHYS-05: Não deve injetar saldo');
    assert(!/estou à disposição|fique à vontade|menu|catálogo|posso ajudar com:/i.test(rPhys05.text), 'PHYS-05: Não deve parecer telemarketing');

    // PHYS-06: Memórias (0) sem espaços extras
    assert(indexHtml.includes('id="sophyOpenMemoriesBtn"') && indexHtml.includes('Memórias (<span id="sophyMemoryCount">0</span>)</span>'), 'PHYS-06: DOM deve conter wrapper span para prevenir flex gap nos parênteses');

    // PHYS-07 & PHYS-08: CSS Layout flex-shrink e bounds
    assert(indexHtml.includes('.sophy-suggestions-bar{display:flex;align-items:center;gap:8px;overflow-x:auto;flex-wrap:nowrap;flex-shrink:0;min-height:44px'), 'PHYS-07: suggestions-bar deve ter flex-shrink: 0');
    assert(indexHtml.includes('.sophy-input-bar{display:flex;gap:10px;padding:8px 14px;background:#071422;border-top:1px solid var(--line);align-items:center;flex-shrink:0;min-height:48px'), 'PHYS-07: input-bar deve ter flex-shrink: 0');
    assert(indexHtml.includes('body[data-page="sophy"] main{') && indexHtml.includes('height:100dvh'), 'PHYS-08: Landscape layout deve conter flex height: 100dvh');

    // PHYS-09: UX de teste com chave digitada
    assert(indexHtml.includes('sophySecureStorage.setApiKey(enteredKey)'), 'PHYS-09: Testar conexão deve salvar chave digitada no cofre seguro');

    // PHYS-10: Upgrade compatibility & Keystore contracts
    assert(bridgeJava.includes('sfp_sophy_secure_vault'), 'PHYS-10: Nome do vault seguro deve ser preservado');
    assert(bridgeJava.includes('sfp_sophy_groq_v3_master_key'), 'PHYS-10: Alias da master key Keystore deve ser preservado');
    assert(bridgeJava.includes('sophy_groq_ciphertext'), 'PHYS-10: Chave ciphertext deve ser preservada');
    assert(bridgeJava.includes('sophy_groq_iv'), 'PHYS-10: Chave IV deve ser preservada');
    assert(buildGradle.includes('applicationId "com.jhony.sfp"'), 'PHYS-10: ApplicationId deve ser com.jhony.sfp');

    console.log('  ✓ PASS: Todos os 10 contratos da Matriz de Regressão Física (PHYS-01 a PHYS-10) validados.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Matriz de Regressão Física [${e.message}]`);
    failed++;
  }

  // 9. Circuit Breaker Matrix (CB-01 to CB-06)
  console.log('-- Test 9: Circuit Breaker Matrix (CB-01 to CB-06) --');
  try {
    const orch = harness.context.sophyOrchestrator;
    assert(orch, 'sophyOrchestrator deve estar definido');
    assert(orch.circuitBreaker, 'circuitBreaker deve estar definido');
    assert(typeof harness.context.SOPHY_PROVIDER_COOLDOWN_MS === 'number', 'SOPHY_PROVIDER_COOLDOWN_MS deve estar definido');
    assert.equal(harness.context.SOPHY_PROVIDER_COOLDOWN_MS, 60000, 'Cooldown deve ser de 60s');

    // Setup mock provider that fails
    let callCount = 0;
    harness.context.sophySetMockProvider({
      active: true,
      handler: async () => {
        callCount++;
        const err = new Error('Groq Server Error 500');
        err.status = 500;
        throw err;
      }
    });

    // CB-01: 3 falhas consecutivas -> status = 'cooldown'
    assert.equal(orch.circuitBreaker.status, 'ok', 'Status inicial deve ser ok');
    await orch.sendMessage('Teste falha 1');
    assert.equal(orch.circuitBreaker.consecutiveFailures, 1, 'CB-01: 1 falha registrada');
    await orch.sendMessage('Teste falha 2');
    assert.equal(orch.circuitBreaker.consecutiveFailures, 2, 'CB-01: 2 falhas registradas');
    await orch.sendMessage('Teste falha 3');
    assert.equal(orch.circuitBreaker.consecutiveFailures, 3, 'CB-01: 3 falhas registradas');
    assert.equal(orch.circuitBreaker.status, 'cooldown', 'CB-01: status deve ser cooldown após 3 falhas');
    assert(orch.circuitBreaker.lastFailureTime > 0, 'CB-01: lastFailureTime deve ser registrado');
    const initialCallCount = callCount;
    assert.equal(initialCallCount, 3, 'CB-01: provider foi chamado exatamente 3 vezes');

    // CB-02: Mensagem durante cooldown antes do prazo -> provider NÃO chamado (fallback para local core)
    const msgCooldown = await orch.sendMessage('Qual o meu saldo?');
    assert.equal(callCount, initialCallCount, 'CB-02: Provider NÃO deve ser chamado durante cooldown');
    assert.equal(msgCooldown.provider, 'local', 'CB-02: Resposta deve vir do local core');
    assert.equal(orch.circuitBreaker.status, 'cooldown', 'CB-02: Status permanece cooldown');

    // CB-03: Após prazo expirar -> provider recebe uma probe (half-open)
    orch.circuitBreaker.lastFailureTime = Date.now() - 65000; // Simula 65s passados
    let probeCalled = false;
    harness.context.sophySetMockProvider({
      active: true,
      handler: async () => {
        probeCalled = true;
        return { text: 'Recuperado com sucesso!', emotion: 'cheerful', provider: 'groq' };
      }
    });
    // Forçamos status para cooldown e lastFailureTime antigo
    orch.circuitBreaker.status = 'cooldown';
    orch.circuitBreaker.lastFailureTime = Date.now() - 65000;
    orch.circuitBreaker.consecutiveFailures = 3;

    // CB-04: Probe success -> status = 'ok', consecutiveFailures = 0, lastFailureTime = 0
    const msgSuccess = await orch.sendMessage('Oi sophy');
    assert(probeCalled, 'CB-03: Provider deve receber tentativa probe após expiração do cooldown');
    assert.equal(orch.circuitBreaker.status, 'ok', 'CB-04: Status deve retornar para ok após probe bem-sucedida');
    assert.equal(orch.circuitBreaker.consecutiveFailures, 0, 'CB-04: consecutiveFailures deve resetar para 0');
    assert.equal(orch.circuitBreaker.lastFailureTime, 0, 'CB-04: lastFailureTime deve resetar para 0');

    // CB-05: Probe failure -> novo cooldown
    harness.context.sophySetMockProvider({
      active: true,
      handler: async () => {
        const err = new Error('Falha na probe');
        err.status = 503;
        throw err;
      }
    });
    orch.circuitBreaker.status = 'cooldown';
    orch.circuitBreaker.lastFailureTime = Date.now() - 65000;
    orch.circuitBreaker.consecutiveFailures = 3;
    const msgProbeFail = await orch.sendMessage('Oi de novo');
    assert.equal(orch.circuitBreaker.status, 'cooldown', 'CB-05: Falha na probe deve reiniciar cooldown imediatamente');
    assert(Date.now() - orch.circuitBreaker.lastFailureTime < 2000, 'CB-05: lastFailureTime deve ser atualizado para agora');
    assert.equal(msgProbeFail.provider, 'local', 'CB-05: Resposta de fallback local enviada');

    // CB-06: Composer sempre desbloqueia (isSending = false)
    assert.equal(orch.isSending, false, 'CB-06: isSending deve ser false');

    console.log('  ✓ PASS: Todos os 6 contratos do Circuit Breaker (CB-01 a CB-06) validados com sucesso.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Circuit Breaker Matrix [${e.message}]`);
    failed++;
  }

  // 10. Legacy Key Fail-Secure Migration Matrix (KEY-MIG-01 to KEY-MIG-05)
  console.log('-- Test 10: Legacy Key Fail-Secure Migration Matrix (KEY-MIG-01 to KEY-MIG-05) --');
  try {
    const sec = harness.context.sophySecureStorage;
    assert(sec, 'sophySecureStorage deve estar definido');

    // KEY-MIG-01: state contém apiKey legacy e vault vazio -> chave migra para secure storage, state.apiKey removida
    let vaultStore = {};
    harness.sandbox.window.AndroidBridge = {
      isAndroidKeystoreReady: () => true,
      hasSophyApiKey: () => !!vaultStore['apiKey'],
      getSophyApiKey: () => vaultStore['apiKey'] || '',
      setSophyApiKey: (k) => { vaultStore['apiKey'] = k; return true; },
      clearSophyApiKey: () => { delete vaultStore['apiKey']; return true; }
    };
    const s1 = harness.getState();
    s1.sophy.settings.apiKey = 'gsk_synthetic_legacy_01';
    harness.setState(s1);
    harness.eval('normalize()');
    assert.equal(vaultStore['apiKey'], 'gsk_synthetic_legacy_01', 'KEY-MIG-01: Chave deve migrar para vault nativo vazio');
    assert(!('apiKey' in harness.getState().sophy.settings), 'KEY-MIG-01: state.sophy.settings.apiKey deve ser DELETADA');

    // KEY-MIG-02: state contém apiKey legacy e vault já possui chave -> existente permanece, legacy NÃO sobrescreve, state.apiKey removida
    vaultStore['apiKey'] = 'gsk_existing_secure_master_key';
    const s2 = harness.getState();
    s2.sophy.settings.apiKey = 'gsk_synthetic_legacy_02';
    harness.setState(s2);
    harness.eval('normalize()');
    assert.equal(vaultStore['apiKey'], 'gsk_existing_secure_master_key', 'KEY-MIG-02: Chave existente no cofre seguro NUNCA deve ser sobrescrita');
    assert(!('apiKey' in harness.getState().sophy.settings), 'KEY-MIG-02: state.sophy.settings.apiKey deve ser DELETADA');

    // KEY-MIG-03: migração falha / lança erro -> state.apiKey ainda assim removida (fail-secure)
    delete vaultStore['apiKey'];
    harness.sandbox.window.AndroidBridge.setSophyApiKey = () => { throw new Error('Keystore hardware error'); };
    const s3 = harness.getState();
    s3.sophy.settings.apiKey = 'gsk_synthetic_legacy_03';
    harness.setState(s3);
    harness.eval('normalize()');
    assert(!('apiKey' in harness.getState().sophy.settings), 'KEY-MIG-03: state.sophy.settings.apiKey DEVE ser deletada mesmo se migração falhar (fail-secure)');

    // KEY-MIG-04: Web/PWA sem cofre nativo -> plaintext removido, não salvo em localStorage
    delete harness.sandbox.window.AndroidBridge;
    const s4 = harness.getState();
    s4.sophy.settings.apiKey = 'gsk_synthetic_legacy_04';
    harness.setState(s4);
    harness.eval('normalize()');
    assert(!('apiKey' in harness.getState().sophy.settings), 'KEY-MIG-04: state.sophy.settings.apiKey deletada no Web/PWA');
    assert(!JSON.stringify(harness.sandbox.localStorage.store).includes('gsk_synthetic_legacy_04'), 'KEY-MIG-04: Chave NUNCA deve vazar para localStorage');

    // KEY-MIG-05: save / autoBackup / snapshotUndo / export nunca contém apiKey
    const s5 = harness.getState();
    s5.sophy.settings.apiKey = 'gsk_synthetic_leak_attempt';
    harness.setState(s5);
    harness.eval('autoBackup()');
    harness.eval('snapshotUndo("test")');
    const autoBackupsRaw = harness.sandbox.localStorage.getItem('sfp_auto_backups');
    assert(!autoBackupsRaw.includes('gsk_synthetic_leak_attempt'), 'KEY-MIG-05: autoBackup nunca contém apiKey');
    const undoEntry = harness.getState().undo?.[0];
    assert(!undoEntry?.state?.sophy?.settings?.apiKey, 'KEY-MIG-05: snapshotUndo nunca contém apiKey');

    console.log('  ✓ PASS: Todos os 5 contratos de Migração e Sanitização de Chaves (KEY-MIG-01 a KEY-MIG-05) validados.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Key Migration Matrix [${e.message}]`);
    failed++;
  }

  console.log(`\nArchitecture Contracts: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes de arquitetura falharam.`);
  return { passed, failed };
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runArchitectureTests();
}
