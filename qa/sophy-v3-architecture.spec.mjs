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

  console.log(`\nArchitecture Contracts: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes de arquitetura falharam.`);
  return { passed, failed };
}

if (process.argv[1] && process.argv[1].endsWith('sophy-v3-architecture.spec.mjs')) {
  runArchitectureTests();
}
