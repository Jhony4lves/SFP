import assert from 'node:assert/strict';
import engine from '../app/src/main/assets/www/invoice-image-engine.js';

const itauCapture={width:1080,height:2200,lines:[
  {text:'Itaú',left:40,top:40,right:200,bottom:80},
  {text:'Fatura atual',left:40,top:120,right:300,bottom:160},
  {text:'R$ 74,25',left:40,top:175,right:250,bottom:225},
  {text:'Vencimento 10/08/2026',left:40,top:250,right:450,bottom:290},
  {text:'AMAZON BR 01/10',left:40,top:500,right:500,bottom:545},
  {text:'- R$ 54,90',left:730,top:500,right:1000,bottom:545},
  {text:'06/07/2026',left:40,top:555,right:260,bottom:590},
  {text:'MERCADO*MERCAD outros LIMEIRA',left:40,top:760,right:650,bottom:805},
  {text:'- R$ 19,35',left:730,top:760,right:1000,bottom:805},
  {text:'28/07/2026',left:40,top:815,right:260,bottom:850}
]};

const parsed=engine.parse(itauCapture,{month:'2026-08'});
assert.deepEqual(parsed.profile,{id:'itau-card-image-v1',label:'Captura Itaú',confidence:.97});
assert.deepEqual(parsed.meta,{source:'image-ocr',officialTotal:74.25,dueDate:'2026-08-10'});
assert.equal(parsed.integrity.status,'verified');
assert.equal(parsed.integrity.importAllowed,true);
assert.deepEqual(parsed.rows.map(row=>({date:row.date,desc:row.desc,amount:row.amount,installment:row.installment,installments:row.installments,currentChargeOnly:row.currentChargeOnly})),[
  {date:'2026-07-06',desc:'AMAZON BR',amount:54.9,installment:1,installments:10,currentChargeOnly:true},
  {date:'2026-07-28',desc:'MERCADO*MERCAD outros LIMEIRA',amount:19.35,installment:null,installments:null,currentChargeOnly:false}
]);

const incomplete=engine.parse({...itauCapture,lines:itauCapture.lines.filter(line=>!line.text.includes('MERCADO')&&!line.text.includes('19,35')&&!line.text.includes('28/07'))},{month:'2026-08'});
assert.equal(incomplete.integrity.status,'blocked');
assert.equal(incomplete.integrity.importAllowed,false);
assert.deepEqual(incomplete.integrity.checks.find(check=>check.id==='official_total'),{id:'official_total',label:'Total exibido na captura',status:'fail',actual:54.9,expected:74.25});

const overlap=engine.parse([
  {width:1080,height:2000,lines:[
    {text:'Itaú • Fatura atual R$ 30,00',left:40,top:60,right:700,bottom:105},
    {text:'CAFÉ R$ 10,00',left:40,top:1650,right:900,bottom:1700},
    {text:'31/08/2026',left:40,top:1710,right:260,bottom:1750}
  ]},
  {width:1080,height:2000,lines:[
    {text:'CAFÉ R$ 10,00',left:40,top:120,right:900,bottom:170},
    {text:'31/08/2026',left:40,top:180,right:260,bottom:220},
    {text:'PADARIA R$ 20,00',left:40,top:430,right:900,bottom:480},
    {text:'31/08/2026',left:40,top:490,right:260,bottom:530}
  ]}
],{month:'2026-09'});
assert.equal(overlap.integrity.status,'verified');
assert.deepEqual(overlap.rows.map(row=>[row.desc,row.amount]),[['CAFÉ',10],['PADARIA',20]]);
assert.equal(overlap.diagnostics.overlapDuplicates.length,1);

const paymentSeparated=engine.parse({width:1080,height:1800,lines:[
  {text:'Fatura em aberto',left:40,top:40,right:300,bottom:80},
  {text:'R$ 25,00',left:40,top:90,right:240,bottom:135},
  {text:'PAGAMENTO DA FATURA R$ 100,00',left:40,top:350,right:900,bottom:395},
  {text:'01/09/2026',left:40,top:405,right:260,bottom:445},
  {text:'LIVRARIA R$ 25,00',left:40,top:650,right:900,bottom:695},
  {text:'01/09/2026',left:40,top:705,right:260,bottom:745}
]},{month:'2026-09'});
assert.equal(paymentSeparated.integrity.status,'verified');
assert.deepEqual(paymentSeparated.rows.map(row=>[row.desc,row.amount]),[['LIVRARIA',25]]);
assert.equal(paymentSeparated.diagnostics.payments.length,1);

// Captura real do Itaú: o carrossel Ago/Set/Out é resumo mensal, não compra.
// A data funciona como cabeçalho para todos os lançamentos até a próxima data.
const itauOpenInvoiceCapture={width:478,height:1536,lines:[
  {text:'Itaú Click M ••••6442',left:54,top:43,right:276,bottom:69},
  {text:'Ago',left:55,top:111,right:91,bottom:135},
  {text:'Set',left:204,top:111,right:240,bottom:135},
  {text:'Out',left:329,top:111,right:365,bottom:135},
  {text:'R$ 74,25',left:38,top:139,right:111,bottom:162},
  {text:'R$ 194,81',left:183,top:139,right:263,bottom:162},
  {text:'R$ 180,82',left:309,top:139,right:389,bottom:162},
  {text:'Lançamentos',left:34,top:238,right:171,bottom:270},
  {text:'29 de agosto',left:34,top:323,right:160,bottom:349},
  {text:'Lady daymaricabra',left:34,top:381,right:205,bottom:407},
  {text:'R$ 13,98',left:329,top:392,right:405,bottom:419},
  {text:'Cartão físico',left:34,top:421,right:150,bottom:447},
  {text:'10 de agosto',left:34,top:493,right:154,bottom:519},
  {text:'Pagamento pix',left:34,top:550,right:168,bottom:577},
  {text:'-R$ 74,25',left:318,top:560,right:407,bottom:587},
  {text:'Cartão físico',left:34,top:590,right:150,bottom:616},
  {text:'Lite',left:34,top:678,right:72,bottom:704},
  {text:'*vivoeasyannualsao',left:34,top:716,right:214,bottom:742},
  {text:'R$ 40,00',left:334,top:717,right:406,bottom:744},
  {text:'paulobra',left:34,top:754,right:115,bottom:780},
  {text:'Parcela 1 de 12',left:320,top:754,right:432,bottom:780},
  {text:'Cartão virtual',left:34,top:792,right:159,bottom:818},
  {text:'4 de agosto',left:34,top:857,right:144,bottom:883},
  {text:'00037 sh niteroi',left:34,top:914,right:185,bottom:940},
  {text:'R$ 66,64',left:329,top:925,right:406,bottom:952},
  {text:'plazniteroibra',left:34,top:952,right:172,bottom:978},
  {text:'Parcela 1 de 3',left:322,top:962,right:426,bottom:988},
  {text:'Cartão físico',left:34,top:990,right:150,bottom:1016},
  {text:'28 de julho',left:34,top:1065,right:141,bottom:1091},
  {text:'Mercado*mercadolivr',left:34,top:1122,right:224,bottom:1148},
  {text:'R$ 19,29',left:329,top:1133,right:406,bottom:1160},
  {text:'elimeirabra',left:34,top:1160,right:140,bottom:1186},
  {text:'Parcela 2 de 10',left:318,top:1170,right:431,bottom:1196},
  {text:'Cartão virtual',left:34,top:1198,right:159,bottom:1224},
  {text:'6 de julho',left:34,top:1272,right:131,bottom:1298},
  {text:'Amazon br',left:34,top:1329,right:127,bottom:1355},
  {text:'sao',left:219,top:1329,right:252,bottom:1355},
  {text:'R$ 54,90',left:329,top:1340,right:406,bottom:1367},
  {text:'paulo bra',left:169,top:1367,right:256,bottom:1393},
  {text:'Parcela 2 de 10',left:318,top:1377,right:431,bottom:1403},
  {text:'Cartão físico',left:34,top:1405,right:150,bottom:1431}
]};
const itauOpenInvoice=engine.parse(itauOpenInvoiceCapture,{month:'2026-09'});
assert.equal(itauOpenInvoice.meta.officialTotal,194.81);
assert.equal(itauOpenInvoice.meta.invoiceMonth,'2026-09');
assert.equal(itauOpenInvoice.integrity.status,'verified');
assert.equal(itauOpenInvoice.integrity.currentNet,194.81);
assert.equal(itauOpenInvoice.integrity.payments,1);
assert.deepEqual(itauOpenInvoice.rows.map(row=>({date:row.date,desc:row.desc,amount:row.amount,installment:row.installment,installments:row.installments})),[
  {date:'2026-08-29',desc:'Lady daymaricabra',amount:13.98,installment:null,installments:null},
  {date:'2026-08-10',desc:'Lite *vivoeasyannualsao paulobra',amount:40,installment:1,installments:12},
  {date:'2026-08-04',desc:'00037 sh niteroi plazniteroibra',amount:66.64,installment:1,installments:3},
  {date:'2026-07-28',desc:'Mercado*mercadolivr elimeirabra',amount:19.29,installment:2,installments:10},
  {date:'2026-07-06',desc:'Amazon br sao paulo bra',amount:54.9,installment:2,installments:10}
]);
assert.equal(itauOpenInvoice.rows.some(row=>/ago set out/i.test(row.desc)),false);
const itauMonthRecovered=engine.parse(itauOpenInvoiceCapture,{month:'2026-08'});
assert.equal(itauMonthRecovered.meta.invoiceMonth,'2026-09');
assert.equal(itauMonthRecovered.meta.officialTotal,194.81);
assert.equal(itauMonthRecovered.integrity.status,'verified');

console.log('Invoice Image Engine QA: OCR estruturado, soma, sobreposição e escopo financeiro verificados.');
