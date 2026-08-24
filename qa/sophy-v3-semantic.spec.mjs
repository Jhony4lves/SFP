import { createSophyHarness } from './sophy-semantic-harness.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runCycle1Tests() {
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

  console.log('-- Casos Primários --');
  for (const tc of primaryCases) {
    const res = harness.processOffline(tc.input);
    try {
      tc.check(res);
      console.log(`  ✓ PASS: "${tc.input}" -> "${res.text.slice(0, 55)}..."`);
      passed++;
    } catch (err) {
      console.log(`  ✗ FAIL: "${tc.input}" -> "${res.text}" [Error: ${err.message}]`);
      failed++;
    }
  }

  console.log('-- Casos Adversariais --');
  for (const tc of adversarialCases) {
    const res = harness.processOffline(tc.input);
    try {
      tc.check(res);
      console.log(`  ✓ PASS: "${tc.input}" -> "${res.text.slice(0, 55)}..."`);
      passed++;
    } catch (err) {
      console.log(`  ✗ FAIL: "${tc.input}" -> "${res.text}" [Error: ${err.message}]`);
      failed++;
    }
  }

  console.log(`Resultado Total: ${passed} passados, ${failed} falhas.`);
  if (failed > 0) throw new Error(`${failed} testes falharam no Ciclo 1.`);
  return { passed, failed };
}

runCycle1Tests();
