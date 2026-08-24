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
    }
  ];

  const adversarialCases = [
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

  console.log('-- Casos Primários Ciclo 2 --');
  for (const tc of primaryCases) {
    const res = harness.processOffline(tc.input);
    try {
      tc.check(res);
      console.log(`  ✓ PASS: "${tc.input}" -> "${res.text.slice(0, 55)}..."`);
      passed++;
    } catch (err) {
      console.log(`  ✗ FAIL: "${tc.input}" (${tc.desc}) -> "${res.text}" [Error: ${err.message}]`);
      failed++;
    }
  }

  console.log('-- Casos Adversariais Ciclo 2 --');
  for (const tc of adversarialCases) {
    const res = harness.processOffline(tc.input);
    try {
      tc.check(res);
      console.log(`  ✓ PASS: "${tc.input}" -> "${res.text.slice(0, 55)}..."`);
      passed++;
    } catch (err) {
      console.log(`  ✗ FAIL: "${tc.input}" (${tc.desc}) -> "${res.text}" [Error: ${err.message}]`);
      failed++;
    }
  }

  console.log(`Resultado Ciclo 2 Total: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes falharam no Ciclo 2.`);
  return { passed, failed };
}

async function main() {
  await runCycle1Tests();
  await runCycle2Tests();
}

main();
