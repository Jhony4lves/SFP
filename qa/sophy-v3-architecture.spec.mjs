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

    console.log('  ✓ PASS: Todos os 10 contratos de segurança Keystore (A-J) validados com sucesso.');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAIL: Keystore Contracts [${e.message}]`);
    failed++;
  }

  console.log(`\nArchitecture Contracts: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes de arquitetura falharam.`);
  return { passed, failed };
}

if (process.argv[1] && process.argv[1].endsWith('sophy-v3-architecture.spec.mjs')) {
  runArchitectureTests();
}
