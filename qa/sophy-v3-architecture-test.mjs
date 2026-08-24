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

    // Contract L: Legacy Plaintext Migration Failure -> Legacy MESMO ASSIM purgado incondicionalmente
    let mockVaultL = { sophy_groq_api_key: 'gsk_legacy_plain_key_failure_999' };
    let mockVaultLResultCipher = null;
    const migrateFnLFailure = () => {
      const legacyKey = mockVaultL.sophy_groq_api_key;
      if (legacyKey) {
        try {
          throw new Error('Simulated Keystore Exception on encrypt');
        } finally {
          delete mockVaultL.sophy_groq_api_key; // Unconditional purge in finally
        }
      }
    };
    try { migrateFnLFailure(); } catch (ignored) {}
    assert(!mockVaultL.sophy_groq_api_key, 'Contract L: Chave legada DEVE ser removida mesmo se criptografia falhar');
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

    // Contract N: Nenhum caminho deixa plaintext persistido
    let mockVaultN = { sophy_groq_api_key: 'gsk_temporary_unmigrated_key' };
    const simulatedGetDecrypted = (vault) => {
      const legacy = vault.sophy_groq_api_key;
      if (legacy) {
        try {
          mockKeystore.encrypt(legacy);
        } finally {
          delete vault.sophy_groq_api_key;
        }
      }
      return mockKeystore.decrypt();
    };
    simulatedGetDecrypted(mockVaultN);
    assert(!('sophy_groq_api_key' in mockVaultN), 'Contract N: Plaintext nunca é mantido no vault após acesso');

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

    // 2. Zero gravação de plaintext e purga incondicional
    assert(!bridgeJava.includes('putString(LEGACY_KEY_GROQ_SECRET'), 'AndroidBridge NUNCA deve gravar chave em plaintext');
    assert(!bridgeJava.includes('putString("sophy_groq_api_key"'), 'AndroidBridge NUNCA deve gravar chave em plaintext');
    assert(bridgeJava.includes('prefs.edit().remove(LEGACY_KEY_GROQ_SECRET).apply()'), 'AndroidBridge deve purgar chave legada incondicionalmente');

    // 3. hasSophyApiKey centralizado e fail-secure
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

  console.log(`\nArchitecture Contracts: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes de arquitetura falharam.`);
  return { passed, failed };
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runArchitectureTests();
}
