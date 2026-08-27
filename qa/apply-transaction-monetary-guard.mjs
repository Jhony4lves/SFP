import fs from 'node:fs';

const path = 'app/src/main/assets/www/index.html';
let source = fs.readFileSync(path, 'utf8');

const before = ` if(MONETARY_INPUT_IDS.has(el.id))return true;\n if(el.classList.contains('money-input')||el.dataset.moneyInput==='true')return true;\n if(el.closest('.money-field'))return true;\n let labelTxt=(el.closest('label')?.textContent||'').toLowerCase();`;
const after = ` if(MONETARY_INPUT_IDS.has(el.id))return true;\n if(el.classList.contains('money-input')||el.dataset.moneyInput==='true')return true;\n if(el.closest('.money-field'))return true;\n // Copy contextual não pode transformar campos de texto comuns em dinheiro.\n // O fallback por label só vale para inputs com semântica numérica explícita.\n if(el.type!=='number'&&el.inputMode!=='decimal')return false;\n let labelTxt=(el.closest('label')?.textContent||'').toLowerCase();`;

if (!source.includes(before)) {
  throw new Error('Trecho alvo de isMonetaryInput não encontrado; patch abortado.');
}

source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log('Guard monetário contextual corrigido.');
