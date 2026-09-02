const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
function write(p,s){fs.writeFileSync(p,s)}
function replaceOnce(text,pattern,replacement,label){const next=text.replace(pattern,replacement);if(next===text)throw new Error('Pattern not found: '+label);return next}

const fiPath='app/src/main/assets/www/financial-intelligence.js';
let fi=read(fiPath);
if(!fi.includes('const moneyCents =')){
  fi=replaceOnce(fi,
    "  const cents = value => Math.round(Number(value) || 0);\n",
    "  const cents = value => Math.round(Number(value) || 0);\n  const moneyCents = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents(value)/100);\n  const civilDate = value => { const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/); return m ? m[3]+'/'+m[2]+'/'+m[1] : String(value||'—'); };\n",
    'financial intelligence helpers');
}
fi=fi.replace(
  'message:`A projeção determinística encontra saldo mínimo de ${(cents(risky.minBalanceCents)/100).toFixed(2)} antes do fim da janela.`',
  'message:`A projeção determinística encontra saldo mínimo de ${moneyCents(risky.minBalanceCents)} antes do fim da janela.`'
);
fi=fi.replace(
  'message:`Total conhecido de ${(totalCents/100).toFixed(2)} nessa janela.`',
  'message:`Total conhecido de ${moneyCents(totalCents)} nessa janela.`'
);
fi=fi.replace(
  'message:`Duas movimentações idênticas de ${(d.amountCents/100).toFixed(2)} foram encontradas em ${d.date}.`',
  'message:`Duas movimentações idênticas de ${moneyCents(d.amountCents)} foram encontradas em ${civilDate(d.date)}.`'
);
if(fi.includes('(totalCents/100).toFixed(2)'))throw new Error('money localization incomplete');
write(fiPath,fi);

const indexPath='app/src/main/assets/www/index.html';
let s=read(indexPath);
if(!s.includes('function sfpDatePt(value)')){
  s=replaceOnce(s,
    "const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});",
    "function sfpDatePt(value){\n const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);\n return m ? m[3]+'/'+m[2]+'/'+m[1] : String(value||'—')\n}\nconst brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});",
    'civil date helper');
}

const nativeSavePattern=/if\(window\.AndroidBridge && typeof AndroidBridge\.saveTextFile === 'function'\)\s*\{?\s*try\s*\{\s*AndroidBridge\.saveTextFile\(name,type \|\| 'text\/plain',String\(content\)\);\s*toast\('Arquivo salvo em Downloads\.'\);\s*return;\s*\}\s*catch\s*\(e\)\s*\{\s*\}\s*\}?/;
if(nativeSavePattern.test(s)){
  const replacement=[
"if(window.AndroidBridge && typeof AndroidBridge.saveTextFile === 'function') {",
'   try {',
"     const rawResult=AndroidBridge.saveTextFile(name,type || 'text/plain',String(content));",
"     const result=typeof rawResult==='string'?JSON.parse(rawResult):rawResult;",
"     if(!result||result.ok!==true)throw new Error(result?.error||'Falha ao salvar arquivo.');",
"     toast(result.publicDownloads===false ? 'Arquivo salvo no armazenamento privado do SFP: '+(result.location||name) : 'Arquivo salvo em '+(result.location||'Downloads/SFP')+'.');",
'     return;',
'   } catch(e) {',
"     toast('Falha ao salvar arquivo: '+(e?.message||'erro desconhecido'));",
'     return;',
'   }',
' }'
  ].join('\n');
  s=s.replace(nativeSavePattern,replacement);
}

s=s.replace(/\$\{sfpEsc\(r\.type\)\}\s*•\s*\$\{brl\(r\.amount\)\}/g,'${sfpEsc(kindLabel(r.type))} • ${brl(r.amount)}');
s=s.replace(/\$\{r\.type\}\s*•\s*\$\{brl\(r\.amount\)\}/g,'${kindLabel(r.type)} • ${brl(r.amount)}');
s=s.replace(/sub:`\$\{t\.date\} • \$\{brl\(t\.amount\)\} • \$\{t\.kind\}`/g,'sub:`${sfpDatePt(t.date)} • ${brl(t.amount)} • ${kindLabel(t.kind)}`');
s=s.replace(/Última conciliação em \$\{a\.reconciled\.date\}/g,'Última conciliação em ${sfpDatePt(a.reconciled.date)}');
s=s.replace(/<small>\$\{t\.date\} ·/g,'<small>${sfpDatePt(t.date)} ·');
s=s.replace(/\$\{d\.firstDue\|\|'—'\}/g,"${d.firstDue?sfpDatePt(d.firstDue):'—'}");
s=s.replace(/\$\{h\.date\|\|new Date\(h\.at\)\.toLocaleDateString\('pt-BR'\)\}/g,"${h.date?sfpDatePt(h.date):new Date(h.at).toLocaleDateString('pt-BR')}");
s=s.replace(/\$\{g\.targetDate\|\|'Sem prazo definido'\}/g,"${g.targetDate?sfpDatePt(g.targetDate):'Sem prazo definido'}");
s=s.replace(/<span>\$\{h\.date\}<\/span>/g,'<span>${sfpDatePt(h.date)}</span>');

if(!s.includes('audit-hardening.js')){
  s=replaceOnce(s,'</body>','<script src="audit-hardening.js"></script>\n</body>','audit hardening script include');
}

write(indexPath,s);
console.log('presentation audit fixes applied');
