import { createSophyHarness } from './sophy-semantic-harness.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runCycle1Tests() {
  console.log('=== TEST MATRIX: CICLO 1 — Small Talk & Casual Informal BR ===');
  const harness = createSophyHarness();

  const primaryCases = [
    {
      input: 'só vim te ver',
      desc: 'Visita casual e afeto sem intenção financeira',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(!res.text.includes('R$'), 'Não deve injetar saldo');
        assert(/carinho|ver|ideia|dia|aqui|papo/i.test(res.text), 'Deve responder com afeto à visita');
      }
    },
    {
      input: 'só ver como você tá',
      desc: 'Pergunta de bem-estar da assistente',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/tô|tudo|ótima|tranquil|bem|cuidando|focada/i.test(res.text), 'Deve responder sobre seu estado');
      }
    },
    {
      input: 'beleza então',
      desc: 'Acordo / fechamento casual',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/beleza|combinado|fechado|qualquer coisa|chama|tô por aqui/i.test(res.text), 'Deve responder como acordo');
      }
    },
    {
      input: 'entendi',
      desc: 'Confirmação de compreensão',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/maravilha|ótimo|qualquer coisa|precisar|show|perfeito|feliz|claro/i.test(res.text), 'Deve responder confirmação');
      }
    },
    {
      input: 'kkkk você é ótima',
      desc: 'Risada composta com elogio',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/haha|kk|obrigad|gentileza|adoro|prazer|energia|humor/i.test(res.text), 'Deve acolher risada e elogio');
      }
    },
    {
      input: 'tô morto de cansado hoje',
      desc: 'Expressão coloquial de cansaço',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/descans|dormir|relax|sono|puxado|cansaço/i.test(res.text), 'Deve acolher o cansaço');
      }
    },
    {
      input: 'fala sophy eai sumida',
      desc: 'Saudação informal e gíria',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/oi|oiee|sumid|aqui|fala/i.test(res.text), 'Deve responder saudação informal');
      }
    },
    {
      input: 'como assim?',
      desc: 'Pedido de esclarecimento casual',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/explico|detalhe|dúvida|como|passo|calma|simples/i.test(res.text), 'Deve responder prontidão para explicar');
      }
    },
    {
      input: 'Tô bem, e você?',
      desc: 'PHYS-01: Follow-up social e reciprocidade pós-saudação',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(!res.text.includes('R$'), 'Não deve injetar saldo');
        assert(/ótima|bem|tranquil|cuidando|pront/i.test(res.text), 'Deve responder com afeto e reciprocidade');
      }
    },
    {
      input: 'e você?',
      desc: 'PHYS-01b: Pergunta recíproca curta sobre Sophy',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/ótima|bem|tranquil|cuidando|pront/i.test(res.text), 'Deve responder sobre estado');
      }
    },
    {
      input: 'como você tá?',
      desc: 'PHYS-01c: Pergunta direta de bem-estar da assistente',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/ótima|bem|tranquil|cuidando|pront/i.test(res.text), 'Deve responder sobre estado');
      }
    },
    {
      input: 'tô bem também',
      desc: 'PHYS-01d: Confirmação de bem-estar do usuário',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/feliz|ótimo|paz|ordem|bom/i.test(res.text), 'Deve acolher confirmação de bem-estar');
      }
    },
    {
      input: 'tudo certo por aqui',
      desc: 'PHYS-01e: Confirmação de harmonia local',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/feliz|ótimo|paz|ordem|bom/i.test(res.text), 'Deve acolher estado');
      }
    },
    {
      input: 'tá tranquilo, e contigo?',
      desc: 'PHYS-01f: Expressão composta de tranquilidade e pergunta recíproca',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/ótima|bem|tranquil|cuidando|pront/i.test(res.text), 'Deve responder reciprocidade');
      }
    }
  ];

  const adversarialCases = [
    {
      input: 'e tu?',
      desc: 'PHYS-01g: Adversarial: pergunta recíproca com pronome regional "tu"',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/ótima|bem|tranquil|cuidando|pront/i.test(res.text), 'Deve reconhecer pergunta recíproca');
      }
    },
    {
      input: 'e vc?',
      desc: 'PHYS-01h: Adversarial: abreviação "vc"',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/ótima|bem|tranquil|cuidando|pront/i.test(res.text), 'Deve reconhecer pergunta recíproca');
      }
    },
    {
      input: 'e ai, ta bem?',
      desc: 'PHYS-01i: Adversarial: saudação e pergunta informal sem acento',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/ótima|bem|tranquil|cuidando|pront/i.test(res.text), 'Deve reconhecer pergunta');
      }
    },
    {
      input: 'e como ce ta?',
      desc: 'PHYS-01j: Adversarial: contração informal "cê"',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/ótima|bem|tranquil|cuidando|pront/i.test(res.text), 'Deve reconhecer pergunta');
      }
    },
    {
      input: 'so vim te ve',
      desc: 'Adversarial: abreviação/gíria sem acento',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/carinho|ver|ideia|dia|aqui|papo/i.test(res.text), 'Deve reconhecer intenção');
      }
    },
    {
      input: 'passando pra dar um oi',
      desc: 'Adversarial: variação de visita casual',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/carinho|ver|ideia|dia|aqui|papo/i.test(res.text), 'Deve reconhecer visita');
      }
    },
    {
      input: 'blz entao',
      desc: 'Adversarial: gíria abreviada',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/beleza|combinado|cuidando/i.test(res.text), 'Deve reconhecer acordo');
      }
    },
    {
      input: 'showwww',
      desc: 'Adversarial: letras repetidas',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/beleza|cuidando|chamar/i.test(res.text), 'Deve reconhecer confirmação');
      }
    },
    {
      input: 'saquei tudo',
      desc: 'Adversarial: gíria de entendimento',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/show|feliz|claro|pronta/i.test(res.text), 'Deve reconhecer entendimento');
      }
    },
    {
      input: 'to so o po hj',
      desc: 'Adversarial: gíria brasileira de exaustão',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/descansar|dormir|sono/i.test(res.text), 'Deve reconhecer cansaço');
      }
    },
    {
      input: 'como assim sophy?',
      desc: 'Adversarial: dúvida com vocativo',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/explicar|calma|passo/i.test(res.text), 'Deve reconhecer pedido de explicação');
      }
    },
    {
      input: 'nao entendi nada',
      desc: 'Adversarial: incompreensão enfática',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/explicar|calma|passo/i.test(res.text), 'Deve reconhecer pedido de explicação');
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of [...primaryCases, ...adversarialCases]) {
    const res = harness.processOffline(tc.input);
    try {
      tc.check(res);
      passed++;
    } catch (err) {
      console.log(`  ✗ FAIL: "${tc.input}" (${tc.desc}) [${err.message}]`);
      failed++;
    }
  }

  console.log(`Ciclo 1: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes falharam no Ciclo 1.`);
  return { passed, failed };
}

export async function runCycle2Tests() {
  console.log('=== TEST MATRIX: CICLO 2 — Perguntas Financeiras Naturais e Coloquiais ===');
  const harness = createSophyHarness();

  const primaryCases = [
    {
      input: 'como que eu tô esse mês?',
      desc: 'Visão geral coloquial do mês',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/resumo|mês|caixa|competência|livre|resultado/i.test(res.text), 'Deve trazer o resumo do mês');
        assert(res.text.includes('R$'), 'Deve conter valores formatados');
      }
    },
    {
      input: 'minha situação tá feia?',
      desc: 'Avaliação da saúde financeira atual',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/situação|tranquil|livre|contas|caminho|fôlego|positivo|equilibrad/i.test(res.text), 'Deve avaliar com empatia e dados');
      }
    },
    {
      input: 'tá sobrando alguma coisa?',
      desc: 'Consulta coloquial de dinheiro livre',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/livre projetado|sobra|disponível/i.test(res.text), 'Deve responder sobre livre projetado');
        assert(res.text.includes('R$'), 'Deve conter valor');
      }
    },
    {
      input: 'eu consigo gastar mais esse mês?',
      desc: 'Margem para novos gastos',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/livre projetado|gastar|margem|compromissos/i.test(res.text), 'Deve orientar com base no livre projetado');
      }
    },
    {
      input: 'como anda meu dinheiro?',
      desc: 'Consulta geral de saldo/posicionamento',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/saldo|contas|livre|total/i.test(res.text), 'Deve responder sobre saldos e posicionamento');
      }
    },
    {
      input: 'me dá um parâmetro desse mês',
      desc: 'Pedido de parâmetro/resumo',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/resumo|mês|entradas|saídas|livre/i.test(res.text), 'Deve trazer resumo do mês');
      }
    },
    {
      input: 'qual cartão tá mais pesado?',
      desc: 'Cartão com maior fatura ou utilização',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/cartão|fatura|limite/i.test(res.text), 'Deve responder sobre o cartão mais pesado');
      }
    },
    {
      input: 'tô devendo muito?',
      desc: 'Consulta de endividamento coloquial',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/dívida|saldo devedor|parcelas|não tem nenhuma dívida/i.test(res.text), 'Deve responder sobre dívidas');
      }
    }
  ];

  const adversarialCases = [
    {
      input: 'como q eu to esse mes?',
      desc: 'Adversarial: abreviações "q" e "to" sem acento',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/resumo|mês|caixa|competência|livre/i.test(res.text), 'Deve trazer o resumo do mês');
      }
    },
    {
      input: 'minha situacao ta feia?',
      desc: 'Adversarial: sem acentuação em "situação" e "tá"',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/situação|livre|equilibrada|tranquil/i.test(res.text), 'Deve avaliar saúde financeira');
      }
    },
    {
      input: 'to apertado esse mes?',
      desc: 'Adversarial: gíria "apertado"',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/situação|livre|equilibrada|tranquil|atenção/i.test(res.text), 'Deve avaliar saúde financeira');
      }
    },
    {
      input: 'ta sobrando grana?',
      desc: 'Adversarial: gíria "grana" com "sobrando"',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/livre projetado/i.test(res.text), 'Deve responder sobre livre projetado');
      }
    },
    {
      input: 'onde ta minha grana?',
      desc: 'Adversarial: gíria "grana" com "onde tá"',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/saldo total em contas/i.test(res.text), 'Deve responder sobre saldos das contas');
      }
    },
    {
      input: 'qual cartao comeu mais limite?',
      desc: 'Adversarial: linguagem figurada para limite',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/cartão|fatura|limite/i.test(res.text), 'Deve responder sobre cartão mais pesado');
      }
    },
    {
      input: 'quanto devo no total?',
      desc: 'Adversarial: consulta total de dívidas',
      check: (res) => {
        assert(!res.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
        assert(/dívida|saldo devedor|não tem nenhuma dívida/i.test(res.text), 'Deve responder sobre dívidas');
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of [...primaryCases, ...adversarialCases]) {
    const res = harness.processOffline(tc.input);
    try {
      tc.check(res);
      passed++;
    } catch (err) {
      console.log(`  ✗ FAIL: "${tc.input}" (${tc.desc}) [${err.message}]`);
      failed++;
    }
  }

  console.log(`Ciclo 2: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes falharam no Ciclo 2.`);
  return { passed, failed };
}

export async function runCycle3Tests() {
  console.log('=== TEST MATRIX: CICLO 3 — Follow-ups Contextuais & Transição de Tópico ===');
  const harness = createSophyHarness();

  let passed = 0;
  let failed = 0;

  // Diálogo 1: Cartões -> "e mês que vem?"
  console.log('-- Diálogo 1: Cartões -> Follow-up "e mês que vem?" --');
  {
    const r1 = await harness.sendMessage('Como estão minhas faturas de cartão?');
    assert(/cart|fatura/i.test(r1.text), 'Turno 1 deve falar de cartões');
    
    const r2 = await harness.sendMessage('e mês que vem?');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/fatura|cart|mês que vem|próximo/i.test(r2.text), 'Deve reter contexto de fatura/cartão no mês seguinte');
      console.log(`  ✓ PASS: Follow-up temporal de cartão -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Follow-up temporal de cartão -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  // Diálogo 2: Resumo do mês -> "e no próximo mês?"
  console.log('-- Diálogo 2: Resumo do mês -> Follow-up "e no próximo mês?" --');
  {
    const r1 = await harness.sendMessage('Me dá um resumo do mês');
    assert(/resumo|mês/i.test(r1.text), 'Turno 1 deve trazer resumo');

    const r2 = await harness.sendMessage('e no próximo mês?');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/resumo|próximo|mês|projeção|fevereiro/i.test(r2.text), 'Deve trazer projeção/resumo do próximo mês');
      console.log(`  ✓ PASS: Follow-up temporal de resumo -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Follow-up temporal de resumo -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  // Diálogo 3: Simulação ativa -> "vale a pena?" / "quanto?"
  console.log('-- Diálogo 3: Simulação ativa -> Follow-up "vale a pena?" --');
  {
    const r1 = await harness.sendMessage('Se eu pegar um empréstimo de 5000 em 10 vezes de 600');
    assert(/simulação|parcelas/i.test(r1.text), 'Turno 1 deve simular empréstimo');

    const r2 = await harness.sendMessage('vale a pena?');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/juros|custo|parcela|impacto|caixa|cuidado|vale/i.test(r2.text), 'Deve avaliar a simulação ativa');
      console.log(`  ✓ PASS: Follow-up opinativo com contexto -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Follow-up opinativo com contexto -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  // Diálogo 4: Pergunta curta sem contexto prévio -> "e isso?" / "quanto?"
  console.log('-- Diálogo 4: Pergunta ambígua sem contexto --');
  {
    // Limpa contexto
    const st = harness.getState();
    st.sophy.context = {};
    harness.setState(st);

    const r1 = await harness.sendMessage('quanto?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/me conta|saldo|fatura|meta|detalhe|pista/i.test(r1.text), 'Deve pedir clarificação com acolhimento');
      console.log(`  ✓ PASS: Ambíguo sem contexto -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Ambíguo sem contexto -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Diálogo 5: Mudança de assunto -> "como tá meu dinheiro?" -> "kkkk esquece isso, como você tá?"
  console.log('-- Diálogo 5: Mudança de assunto --');
  {
    const r1 = await harness.sendMessage('Como tá meu dinheiro total?');
    assert(/saldo total/i.test(r1.text), 'Turno 1 deve responder saldo');

    const r2 = await harness.sendMessage('kkkk esquece isso, como você tá?');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(!r2.text.includes('R$'), 'Não deve injetar saldo');
      assert(/tô|ótima|tranquila|energia|tudo bem/i.test(r2.text), 'Deve responder status casual sem saldo');
      console.log(`  ✓ PASS: Mudança de assunto casual -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Mudança de assunto casual -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  // Diálogo 6 (Adversarial): Variação temporal coloquial "e no mes que vem?"
  console.log('-- Diálogo 6 (Adversarial): "e no mes que vem?" sem acento --');
  {
    await harness.sendMessage('quanto tá o cartão?');
    const r2 = await harness.sendMessage('e no mes que vem?');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/fatura|cart|mês|previsão/i.test(r2.text), 'Deve resolver fatura do mês seguinte');
      console.log(`  ✓ PASS: Variação temporal sem acento -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Variação temporal sem acento -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  // Diálogo 7 (Adversarial): Mudança expressa para piada "deixa pra lá, me conta uma piada"
  console.log('-- Diálogo 7 (Adversarial): Mudança expressa de tópico para piada --');
  {
    await harness.sendMessage('como tá meu dinheiro?');
    const r2 = await harness.sendMessage('deixa pra lá, me conta uma piada');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(!r2.text.includes('R$'), 'Não deve injetar saldo');
      assert(/psicólogo|café|cartão|dinheiro|😂|😆|😉/i.test(r2.text), 'Deve contar uma piada sem saldo');
      console.log(`  ✓ PASS: Mudança expressa de tópico -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Mudança expressa de tópico -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  // Diálogo 8 (Adversarial): Mudança expressa para pergunta financeira direta "mudando de assunto, qual meu saldo?"
  console.log('-- Diálogo 8 (Adversarial): Mudança de assunto para nova pergunta financeira --');
  {
    await harness.sendMessage('tô com sono hoje');
    const r2 = await harness.sendMessage('mudando de assunto, qual meu saldo?');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(r2.text.includes('R$'), 'Deve trazer o saldo financeiro');
      console.log(`  ✓ PASS: Mudança de assunto para financeiro -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Mudança de assunto para financeiro -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  console.log(`Ciclo 3: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes falharam no Ciclo 3.`);
  return { passed, failed };
}

export async function runCycle4Tests() {
  console.log('=== TEST MATRIX: CICLO 4 — Memória Dinâmica & Personalização ===');
  const harness = createSophyHarness();

  let passed = 0;
  let failed = 0;

  // Caso 1: Gravação e Recuperação Específica de Fato (Aniversário)
  console.log('-- Caso 1: Gravação e Recuperação Específica de Aniversário --');
  {
    const r1 = await harness.sendMessage('Lembre que meu aniversário é dia 15 de maio');
    assert(/guardei|memória/i.test(r1.text), 'Turno 1 deve confirmar que guardou');

    const r2 = await harness.sendMessage('quando é meu aniversário?');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/15 de maio/i.test(r2.text), 'Deve recuperar a data de aniversário da memória');
      console.log(`  ✓ PASS: Recuperação de aniversário -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Recuperação de aniversário -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 2: Gravação e Recuperação de Preferência
  console.log('-- Caso 2: Gravação e Recuperação de Preferência --');
  {
    await harness.sendMessage('Lembre que eu prefiro economizar em delivery');
    const r2 = await harness.sendMessage('o que eu prefiro economizar?');
    try {
      assert(!r2.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/delivery/i.test(r2.text), 'Deve recuperar a preferência de delivery');
      console.log(`  ✓ PASS: Recuperação de preferência -> "${r2.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Recuperação de preferência -> "${r2.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 3: Consulta sobre fato não memorizado
  console.log('-- Caso 3: Consulta sobre fato não memorizado --');
  {
    const r1 = await harness.sendMessage('o que você sabe sobre meu carro?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/ainda não|me conta|lembre que/i.test(r1.text), 'Deve acolher e convidar a registrar');
      console.log(`  ✓ PASS: Fato não memorizado -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Fato não memorizado -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 4: Personalização com Nome do Usuário
  console.log('-- Caso 4: Saudação personalizada com nome --');
  {
    const st = harness.getState();
    st.settings.name = 'Jhony';
    harness.setState(st);

    const r1 = await harness.sendMessage('Oi Sophy');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/jhony/i.test(r1.text), 'Deve incluir o nome Jhony na resposta');
      console.log(`  ✓ PASS: Saudação com nome -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Saudação com nome -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 5 (Adversarial): Pergunta sem acento sobre memória gravada
  console.log('-- Caso 5 (Adversarial): Pergunta sem acento sobre aniversário --');
  {
    const r1 = await harness.sendMessage('quando e meu aniversario?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/15 de maio/i.test(r1.text), 'Deve responder a data do aniversário');
      console.log(`  ✓ PASS: Pergunta sem acento -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Pergunta sem acento -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  console.log(`Ciclo 4: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes falharam no Ciclo 4.`);
  return { passed, failed };
}

export async function runCycle5Tests() {
  console.log('=== TEST MATRIX: CICLO 5 — Decisão de Compra & Categorias Específicas ===');
  const harness = createSophyHarness();

  let passed = 0;
  let failed = 0;

  // Caso 1: Decisão de compra que cabe no orçamento
  console.log('-- Caso 1: Decisão de compra que cabe no orçamento --');
  {
    const r1 = await harness.sendMessage('posso comprar um tênis de 300?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/t[eê]nis/i.test(r1.text), 'Deve citar o item');
      assert(/300/i.test(r1.text), 'Deve citar o valor');
      assert(/livre projetado|cabe|sobra/i.test(r1.text), 'Deve analisar impacto no livre');
      console.log(`  ✓ PASS: Compra que cabe -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Compra que cabe -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 2: Decisão de compra que excede o livre projetado
  console.log('-- Caso 2: Decisão de compra que excede o livre projetado --');
  {
    const r1 = await harness.sendMessage('posso comprar um celular de 1500?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/celular/i.test(r1.text), 'Deve citar o item');
      assert(/1\.500|1500/i.test(r1.text), 'Deve citar o valor');
      assert(/atenção|cuidado|negativo|vermelho|ultrapassa|adiar/i.test(r1.text), 'Deve alertar que estoura o livre');
      console.log(`  ✓ PASS: Compra que excede -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Compra que excede -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 3: Consulta de categoria específica com despesa existente
  console.log('-- Caso 3: Consulta de categoria específica (Lazer) --');
  {
    const r1 = await harness.sendMessage('quanto gastei com Lazer esse mês?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/lazer/i.test(r1.text), 'Deve focar na categoria Lazer');
      assert(/R\$/i.test(r1.text), 'Deve mostrar o valor gasto');
      console.log(`  ✓ PASS: Categoria específica -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Categoria específica -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 4: Consulta de categoria sem despesas registradas
  console.log('-- Caso 4: Consulta de categoria zerada (Educação) --');
  {
    const r1 = await harness.sendMessage('quanto gastei com Educação esse mês?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/educação|nenhum gasto|R\$\s*0/i.test(r1.text), 'Deve informar que não há gastos nessa categoria');
      console.log(`  ✓ PASS: Categoria zerada -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Categoria zerada -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 5 (Adversarial): Decisão de compra coloquial com abreviações
  console.log('-- Caso 5 (Adversarial): Decisão de compra coloquial --');
  {
    const r1 = await harness.sendMessage('da pra eu gasta 200 numa pizza hj?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/pizza/i.test(r1.text), 'Deve reconhecer pizza');
      assert(/200/i.test(r1.text), 'Deve reconhecer 200');
      assert(/livre projetado|cabe|sobra/i.test(r1.text), 'Deve calcular o livre');
      console.log(`  ✓ PASS: Decisão coloquial -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Decisão coloquial -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  console.log(`Ciclo 5: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes falharam no Ciclo 5.`);
  return { passed, failed };
}

export async function runCycle6Tests() {
  console.log('=== TEST MATRIX: CICLO 6 — Metas Específicas, Progresso & Conquistas ===');
  const harness = createSophyHarness();

  // Configura metas de teste
  const st = harness.getState();
  st.goals = [
    { id: 1, name: 'Reserva de Emergência', target: 10000, initialAllocated: 4000, accountId: 1 },
    { id: 2, name: 'Viagem dos Sonhos', target: 5000, initialAllocated: 4500, accountId: 1 },
    { id: 3, name: 'Curso de Especialização', target: 1000, initialAllocated: 1000, accountId: 1 }
  ];
  harness.setState(st);

  let passed = 0;
  let failed = 0;

  // Caso 1: Consulta de meta específica com progresso parcial
  console.log('-- Caso 1: Consulta de meta específica (Reserva de Emergência) --');
  {
    const r1 = await harness.sendMessage('quanto falta pra reserva de emergência?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/reserva de emergência/i.test(r1.text), 'Deve citar a meta');
      assert(/4\.000|4000/i.test(r1.text), 'Deve citar valor acumulado');
      assert(/6\.000|6000/i.test(r1.text), 'Deve citar valor restante');
      console.log(`  ✓ PASS: Meta específica parcial -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Meta específica parcial -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 2: Consulta de meta mais próxima de conclusão
  console.log('-- Caso 2: Qual meta está mais próxima de bater --');
  {
    const r1 = await harness.sendMessage('qual meta tá mais perto de bater?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/viagem dos sonhos/i.test(r1.text), 'Deve identificar a meta com maior progresso incompleto');
      assert(/90%|500/i.test(r1.text), 'Deve informar a porcentagem ou o valor restante');
      console.log(`  ✓ PASS: Meta mais próxima -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Meta mais próxima -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 3: Meta 100% atingida
  console.log('-- Caso 3: Consulta de meta 100% concluída --');
  {
    const r1 = await harness.sendMessage('como tá a meta do curso?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/curso/i.test(r1.text), 'Deve citar a meta do curso');
      assert(/100%|conquistou|atingiu|parabéns|sensacional/i.test(r1.text), 'Deve parabenizar pela conclusão');
      console.log(`  ✓ PASS: Meta concluída -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Meta concluída -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 4 (Adversarial): Pergunta sem acento e abreviada "falta quanto pra reserva?"
  console.log('-- Caso 4 (Adversarial): Pergunta sem acento e abreviada --');
  {
    const r1 = await harness.sendMessage('falta quanto pra reserva?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/reserva/i.test(r1.text), 'Deve resolver para a reserva');
      assert(/6\.000|6000|40%/i.test(r1.text), 'Deve informar quanto falta');
      console.log(`  ✓ PASS: Pergunta abreviada de meta -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Pergunta abreviada de meta -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 5: Consulta de total acumulado em metas
  console.log('-- Caso 5: Consulta de total alocado em metas --');
  {
    const r1 = await harness.sendMessage('quanto eu já guardei em metas no total?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/meta|guardado|R\$/i.test(r1.text), 'Deve informar progresso das metas');
      console.log(`  ✓ PASS: Total alocado em metas -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Total alocado em metas -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  // Caso 6: Consulta de meta específica de viagem
  console.log('-- Caso 6: Consulta de meta de viagem --');
  {
    const r1 = await harness.sendMessage('quanto já guardei pra viagem?');
    try {
      assert(!r1.text.includes('modo local (offline)'), 'Não deve dar fallback offline');
      assert(/viagem/i.test(r1.text), 'Deve identificar meta da viagem');
      assert(/4\.500|4500|90%/i.test(r1.text), 'Deve informar valor ou progresso');
      console.log(`  ✓ PASS: Meta de viagem -> "${r1.text.slice(0, 55)}..."`);
      passed++;
    } catch (e) {
      console.log(`  ✗ FAIL: Meta de viagem -> "${r1.text}" [${e.message}]`);
      failed++;
    }
  }

  console.log(`Ciclo 6: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes falharam no Ciclo 6.`);
  return { passed, failed };
}

async function main() {
  await runCycle1Tests();
  await runCycle2Tests();
  await runCycle3Tests();
  await runCycle4Tests();
  await runCycle5Tests();
  await runCycle6Tests();
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
