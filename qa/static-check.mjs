import fs from 'node:fs';

const source = fs.readFileSync('app/src/main/assets/www/index.html', 'utf8');
const staticHtml = source.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const duplicates = (text, pattern) => {
  const counts = new Map();
  for (const match of text.matchAll(pattern)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  return [...counts].filter(([, count]) => count > 1);
};

const problems = [];
for (const [name, count] of duplicates(staticHtml, /\bid=["']([^"']+)["']/g)) problems.push(`DOM id estático duplicado: ${name} (${count}x)`);
for (const [name, count] of duplicates(source, /\bfunction\s+([\w$]+)\s*\(/g)) problems.push(`função duplicada: ${name} (${count}x)`);
for (const keyword of ['const', 'let']) {
  for (const [name, count] of duplicates(source, new RegExp(`^${keyword}\\s+([\\w$]+)\\s*=`, 'gm'))) problems.push(`${keyword} de topo duplicado: ${name} (${count}x)`);
}
for (const [name, count] of duplicates(source, /\bwindow\.([\w$]+)\s*=/g)) problems.push(`atribuição window duplicada: ${name} (${count}x)`);
for (const marker of ['<<<<<<<', '>>>>>>>']) {
  const count = source.split(marker).length - 1;
  if (count) problems.push(`marcador de patch/conflito encontrado: ${marker} (${count}x)`);
}
if (!source.includes("DB_NAME='SFP_JHONY_STABLE', STORE='state', DB_KEY='main'")) problems.push('contrato de persistência IndexedDB foi alterado');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Static QA: IDs estáticos, declarações, window, conflitos e contrato IndexedDB verificados.');
