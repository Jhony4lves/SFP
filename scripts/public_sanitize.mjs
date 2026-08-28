import fs from 'node:fs';

const INDEX = 'app/src/main/assets/www/index.html';
const IMPORT_QA = 'qa/import-ai-validation.spec.js';
const AUDIT_QA = 'qa/audit-actionable-review.spec.js';
const DEBT_QA = 'qa/debt-integrity.spec.js';
const RESET_QA = 'qa/reset-system-integrity.spec.js';
const UX_DOC = 'docs/UX_02_VISUAL_AUDIT.md';

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório não encontrado: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function write(file, text) {
  fs.writeFileSync(file, text);
}

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Sanitização não encontrou: ${label}`);
  return text.replace(before, after);
}

/* ===== 1) Seed pública completamente fictícia ===== */
const index = read(INDEX);
const seedStart = index.indexOf('const seed={');
const seedEnd = index.indexOf('\nlet state=null', seedStart);
if (seedStart < 0 || seedEnd < 0) throw new Error('Bloco seed não encontrado');

const demoSeed = `const seed={
 version:VERSION,schemaVersion:SCHEMA_VERSION,mesAtual:'2026-08',baseDate:'2026-08-28',persistenceMeta:{revision:1,savedAt:'2026-08-28T00:00:00.000Z'},
 settings:{name:'SFP Demo',day1:1,day2:15,budgetPreset:'503020',needs:50,wants:30,save:20,privacy:false,onboardingDone:true,theme:'dark'},
 accounts:[
  {id:1,name:'Conta Principal',type:'Conta corrente',initial:1250,reconciled:null,balanceMode:'snapshot',balanceDate:'2026-08-28'},
  {id:2,name:'Conta Secundária',type:'Conta corrente',initial:420,reconciled:null,overdraftLimit:300,balanceMode:'snapshot',balanceDate:'2026-08-28'},
  {id:3,name:'Carteira Digital',type:'Conta corrente',initial:75.50,reconciled:null,balanceMode:'snapshot',balanceDate:'2026-08-28'}
 ],
 cards:[
  {id:1,name:'Cartão Principal',limit:2500,closeDay:8,dueDay:15,payAccountId:1,history:[]},
  {id:2,name:'Cartão Secundário',limit:4800,closeDay:3,dueDay:12,payAccountId:2,history:[]}
 ],
 transactions:[],
 transfers:[],
 purchases:[
  {id:301,cardId:1,desc:'Streaming Demo',total:29.90,installments:1,purchaseDate:'2026-08-09',firstMonth:'2026-09',category:'Assinaturas',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:302,cardId:1,desc:'Transporte App',total:42.75,installments:1,purchaseDate:'2026-08-11',firstMonth:'2026-09',category:'Transporte',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:303,cardId:1,desc:'Loja Exemplo',total:360,installments:3,purchaseDate:'2026-08-12',firstMonth:'2026-09',category:'Outros',status:'active',note:'3x de R$ 120,00. Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:304,cardId:1,desc:'Padaria Central',total:18.40,installments:1,purchaseDate:'2026-08-13',firstMonth:'2026-09',category:'Alimentação',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:305,cardId:1,desc:'Restaurante Exemplo',total:27.90,installments:1,purchaseDate:'2026-08-14',firstMonth:'2026-09',category:'Alimentação',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:306,cardId:1,desc:'Mercado Bairro',total:63.18,installments:1,purchaseDate:'2026-08-14',firstMonth:'2026-09',category:'Alimentação',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:307,cardId:1,desc:'Farmácia Exemplo',total:35.60,installments:1,purchaseDate:'2026-08-14',firstMonth:'2026-09',category:'Saúde',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:308,cardId:1,desc:'Café Exemplo',total:14.20,installments:1,purchaseDate:'2026-08-15',firstMonth:'2026-09',category:'Alimentação',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:309,cardId:1,desc:'Pix no Crédito - Destinatário Demo A',total:21.13,installments:1,purchaseDate:'2026-08-16',firstMonth:'2026-09',category:'Outros',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:310,cardId:1,desc:'Pix no Crédito - Destinatário Demo B',total:32.47,installments:1,purchaseDate:'2026-08-16',firstMonth:'2026-09',category:'Outros',status:'active',note:'Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:320,cardId:2,desc:'Loja Online Demo',total:799.90,installments:10,purchaseDate:'2026-07-06',firstMonth:'2026-08',category:'Outros',status:'active',note:'10x de R$ 79,99. Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:321,cardId:2,desc:'Marketplace Demo',total:249,installments:10,purchaseDate:'2026-07-28',firstMonth:'2026-08',category:'Outros',status:'active',note:'10 parcelas demonstrativas.',tags:['demo'],refunds:[]},
  {id:322,cardId:2,desc:'Shopping Demo',total:180,installments:3,purchaseDate:'2026-08-04',firstMonth:'2026-09',category:'Outros',status:'active',note:'3x de R$ 60,00. Dado demonstrativo.',tags:['demo'],refunds:[]},
  {id:323,cardId:2,desc:'Plano Celular Demo',total:360,installments:12,purchaseDate:'2026-08-10',firstMonth:'2026-09',category:'Assinaturas',status:'active',note:'12x de R$ 30,00. Dado demonstrativo.',tags:['demo'],refunds:[]}
 ],
 invoiceAdjustments:[],
 invoices:[
  {id:700,cardId:1,month:'2026-08',status:'paid',officialTotal:94.70,paidAmount:94.70,accountId:1,payments:[{date:'2026-08-15',amount:94.70,balanceImpact:false,targetMonth:'2026-08'}],closedAt:'2026-08-08T12:00:00'},
  {id:701,cardId:2,month:'2026-08',status:'paid',officialTotal:128.45,paidAmount:128.45,accountId:2,payments:[{date:'2026-08-12',amount:128.45,balanceImpact:false,targetMonth:'2026-08'}],closedAt:'2026-08-03T12:00:00'},
  {id:702,cardId:2,month:'2026-09',status:'open',officialTotal:219.99,paidAmount:0,accountId:2,payments:[],closedAt:null},
  {id:703,cardId:1,month:'2026-09',status:'open',officialTotal:287.63,paidAmount:0,accountId:1,payments:[],closedAt:null}
 ],
 recurring:[
  {id:401,desc:'Receita mensal A',type:'income',amount:2400,day:1,category:'Trabalho',accountId:1,start:'2026-09',end:'',active:true,skips:[]},
  {id:402,desc:'Receita mensal B',type:'income',amount:800,day:15,category:'Trabalho',accountId:1,start:'2026-09',end:'',active:true,skips:[]},
  {id:403,desc:'Curso Demo',type:'expense',amount:450,day:10,category:'Faculdade',accountId:1,start:'2026-09',end:'',active:true,skips:[]},
  {id:404,desc:'Streaming Demo',type:'expense',amount:29.90,day:5,category:'Assinaturas',accountId:1,start:'2026-09',end:'',active:true,skips:[]}
 ],
 debts:[
  {id:501,name:'Empréstimo demonstrativo',contractTotal:3540,balance:3540,principalReceived:3000,financedAmount:3060,iof:60,rate:2.10,cetMonthly:2.45,cetAnnual:33.80,payment:354,installments:10,paidInstallments:0,firstDue:'2026-09-25',lastDue:'2027-06-25',paymentMethod:'payroll',history:[],note:'Contrato totalmente fictício usado apenas para demonstração.'}
 ],
 goals:[{id:601,name:'Reserva Demo',accountId:3,target:5000,initialAllocated:75.50,history:[]}],
 assets:[{id:7010,name:'Bem demonstrativo',value:2500}],statements:[],transferEvidence:[],classificationRules:[],categoryBudgets:{},snapshots:[],trash:[],undo:[],closedMonths:[],csvTemplates:[],favorites:[],
 creditFacilities:[
  {id:801,institution:'Banco Demo A',name:'Limite emergencial',limit:300,used:0,type:'overdraft'},
  {id:802,institution:'Carteira Demo',name:'Linha de crédito',limit:1500,used:0,type:'credit_line'},
  {id:803,institution:'Carteira Demo',name:'Oferta demonstrativa',limit:900,used:0,type:'loan_offer'}
 ],
 ui:{invoiceMonthByCard:{1:'2026-09',2:'2026-09'}}
}`;

write(INDEX, index.slice(0, seedStart) + demoSeed + index.slice(seedEnd));

/* ===== 2) Importadores: fixture sintética e não correlacionável ===== */
let qa = read(IMPORT_QA);
qa = qa
  .replace(/\bnubankOfx\b/g, 'demoOfx')
  .replace(/Rei do Sabor/g, 'Loja Alpha')
  .replace(/<TRNAMT>-8\.00<FITID>NUB-1/g, '<TRNAMT>-17.35<FITID>DEMO-1')
  .replace(/<TRNAMT>-8\.96<FITID>NUB-2/g, '<TRNAMT>-26.40<FITID>DEMO-2')
  .replace(/<TRNAMT>-94\.36<FITID>NUB-3/g, '<TRNAMT>-73.25<FITID>DEMO-3')
  .replace(/<TRNAMT>59\.99<FITID>NUB-4/g, '<TRNAMT>91.10<FITID>DEMO-4')
  .replace(/Assb Compra - Parcela 1\/3/g, 'Loja Beta - Parcela 1/3')
  .replace(/fatura OFX realista do Nubank/g, 'fatura OFX de demonstração')
  .replace(/Nubank OFX real/g, 'OFX de demonstração')
  .replace(/nubank-fatura\.ofx/g, 'demo-fatura.ofx')
  .replace(/nubank\.ofx/g, 'demo.ofx')
  .replace(/\[8, 8\.96, 94\.36, 59\.99\]/g, '[17.35, 26.40, 73.25, 91.10]')
  .replace(/\[8, 8\.96, 283\.08\]/g, '[17.35, 26.40, 219.75]')
  .replace(/Pix no Crédito - Ana Carolina/g, 'Pix no Crédito - Destinatário Demo')
  .replace(/semanticClassify\('Pix no Crédito - Destinatário Demo', -8\.96\)/g, "semanticClassify('Pix no Crédito - Destinatário Demo', -26.40)")
  .replace(/12345678901 usuario@email\.com/g, '123456789012 usuario@example.invalid')
  .replace(/usuario@email\.com/g, 'usuario@example.invalid')
  .replace(/12345678901/g, '123456789012')
  .replace(/SECRET-FITID-1/g, 'DEMO-FITID-1')
  .replace(/SECRET-FITID-2/g, 'DEMO-FITID-2')
  .replace(/SECRET-FITID/g, 'DEMO-FITID');
write(IMPORT_QA, qa);

/* ===== 3) Nome de terceiro em auditoria ===== */
let auditQa = read(AUDIT_QA);
auditQa = replaceRequired(
  auditQa,
  "desc: 'Pix no Crédito - Ana Carolina'",
  "desc: 'Pix no Crédito - Destinatário Demo'",
  'destinatário de Pix no teste de auditoria'
);
write(AUDIT_QA, auditQa);

/* ===== 4) Dívida de QA: preservar sem reproduzir contrato privado ===== */
let debtQa = read(DEBT_QA);
const privateDebt = `    name: 'Crédito Consignado CLT',
    contractTotal: 4678.30,
    balance: 4678.30,
    principalReceived: 3800,
    financedAmount: 3885.48,
    iof: 85.48,
    rate: 2.74,
    cetMonthly: 3.08,
    cetAnnual: 43.90,
    payment: 467.83,
    installments: 10,
    paidInstallments: 0,
    firstDue: '2026-09-26',
    lastDue: '2027-06-26',`;
const demoDebt = `    name: 'Empréstimo demonstrativo',
    contractTotal: 3540,
    balance: 3540,
    principalReceived: 3000,
    financedAmount: 3060,
    iof: 60,
    rate: 2.10,
    cetMonthly: 2.45,
    cetAnnual: 33.80,
    payment: 354,
    installments: 10,
    paidInstallments: 0,
    firstDue: '2026-09-25',
    lastDue: '2027-06-25',`;
debtQa = replaceRequired(debtQa, privateDebt, demoDebt, 'contrato payroll privado em QA');
debtQa = debtQa
  .replace("note: 'Contrato original preservado.'", "note: 'Contrato fictício de QA.'")
  .replace("expect(beforeName).toBe('Crédito Consignado CLT');", "expect(beforeName).toBe('Empréstimo demonstrativo');");
write(DEBT_QA, debtQa);

/* ===== 5) Reset: anti-regressão usa somente nomes da seed pública ===== */
let resetQa = read(RESET_QA);
resetQa = replaceRequired(
  resetQa,
  "const seedDescList = ['NUCEL', 'Uber - NuPay', 'ASSB Comércio Varejista', 'Pablo Lanches', 'Amazon', 'Mercado Livre', 'Crédito Consignado CLT', 'Nubank', 'Itaú'];",
  "const seedDescList = ['Streaming Demo', 'Transporte App', 'Loja Exemplo', 'Padaria Central', 'Loja Online Demo', 'Marketplace Demo', 'Empréstimo demonstrativo', 'Conta Principal', 'Conta Secundária'];",
  'lista anti-reinjeção do reset'
);
resetQa = resetQa.replace("expect(freshState.settings.name).not.toBe('SFP Jhony');", "expect(freshState.settings.name).not.toBe('SFP Demo');");
write(RESET_QA, resetQa);

/* ===== 6) Documento de auditoria visual ===== */
if (fs.existsSync(UX_DOC)) {
  let doc = fs.readFileSync(UX_DOC, 'utf8');
  doc = doc.replace(/Galaxy S24/g, 'Android físico de referência');
  write(UX_DOC, doc);
}

/* ===== 7) Auto-verificação dos rastros conhecidos ===== */
const privateFragments = [
  'Ana Carolina da Silva Diniz',
  'Paulo Roberto Muniz de Carvalho',
  'Pix no Crédito - Ana Carolina',
  'Crédito Consignado CLT',
  'ASSB Comércio Varejista',
  'Pablo Lanches',
  'Mercat Alimentação',
  'NUCEL',
  '00037 SH Niterói Plaza',
  'Vivo Easy Anual',
  'SFP Jhony',
  '1202.49',
  '681.90',
  '665.25',
  '4678.30',
  '3885.48',
  '85.48'
];
const verifyFiles = [INDEX, IMPORT_QA, AUDIT_QA, DEBT_QA, RESET_QA, UX_DOC].filter(fs.existsSync);
const leftovers = [];
for (const file of verifyFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const fragment of privateFragments) {
    if (text.includes(fragment)) leftovers.push(`${file}: ${fragment}`);
  }
}
if (leftovers.length) throw new Error(`Rastros privados ainda presentes:\n${leftovers.join('\n')}`);

console.log('Sanitização pública aplicada e verificada nos arquivos-alvo.');
