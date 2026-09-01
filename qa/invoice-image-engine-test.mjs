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

console.log('Invoice Image Engine QA: OCR estruturado, soma, sobreposição e escopo financeiro verificados.');
