import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const source = fs.readFileSync('app/src/main/assets/www/index.html', 'utf8');
const staticHtml = source.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const duplicates = (text, pattern) => {
  const counts = new Map();
  for (const match of text.matchAll(pattern)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  return [...counts].filter(([, count]) => count > 1);
};

const problems = [];

// 1. Sintaxe JavaScript rigorosa em todas as tags <script> do index.html
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let scriptIdx = 0;
let scriptMatch;
while ((scriptMatch = scriptRegex.exec(source)) !== null) {
  const code = scriptMatch[1];
  try {
    new vm.Script(code, { filename: `index.html#script-${scriptIdx}` });
  } catch (error) {
    problems.push(`Erro de sintaxe JavaScript em <script> tag ${scriptIdx}: ${error.message}`);
  }
  scriptIdx++;
}

// 2. IDs estáticos, conflitos e declarações
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

// 3. Contrato IndexedDB
if (!source.includes("DB_NAME='SFP_JHONY_STABLE', STORE='state', DB_KEY='main'")) problems.push('contrato de persistência IndexedDB foi alterado');

// 4. Integridade da logo master oficial
const logoMasterPath = '_input/sfp-logo-master.png';
if (fs.existsSync(logoMasterPath)) {
  const logoBuf = fs.readFileSync(logoMasterPath);
  const logoSha = crypto.createHash('sha256').update(logoBuf).digest('hex');
  const EXPECTED_LOGO_SHA = '79d98edae8bbecebca451ec8d37a838d926092621b4c20c55172c434ef71091d';
  if (logoSha !== EXPECTED_LOGO_SHA) {
    problems.push(`SHA-256 da logo master oficial divergente: ${logoSha}`);
  }
} else {
  problems.push('Arquivo master da logo oficial (_input/sfp-logo-master.png) não encontrado.');
}

// 5. Fonte única da versão de schema
if (!source.includes('SCHEMA_VERSION=15')) {
  problems.push('SCHEMA_VERSION única fonte de verdade divergente de 15');
}

// 6. UX-02 design system foundation
for (const contract of [
  'id="sfp-design-system-foundation"',
  '--color-surface:',
  '--color-text-secondary:',
  '--color-accent:',
  '--color-success:',
  '--color-warning:',
  '--color-error:',
  '--control-height:',
  '.form-section{',
  '.field-group{',
  '.section-actions{',
  ':focus-visible',
  '@media(prefers-reduced-motion:reduce)',
]) {
  if (!source.includes(contract)) problems.push(`contrato visual UX-02 ausente: ${contract}`);
}

// 7. Recursos e Contratos do Launcher Icon Oficial Android
const manifestPath = 'app/src/main/AndroidManifest.xml';
if (fs.existsSync(manifestPath)) {
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('android:icon="@mipmap/ic_launcher"')) problems.push('Manifest não aponta android:icon para @mipmap/ic_launcher');
  if (!manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"')) problems.push('Manifest não aponta android:roundIcon para @mipmap/ic_launcher_round');
} else {
  problems.push('AndroidManifest.xml não encontrado.');
}

const colorsPath = 'app/src/main/res/values/colors.xml';
if (!fs.existsSync(colorsPath) || !fs.readFileSync(colorsPath, 'utf8').includes('name="ic_launcher_background"')) {
  problems.push('Recurso de cor ic_launcher_background ausente em values/colors.xml');
}

for (const adaptiveFile of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const p = `app/src/main/res/mipmap-anydpi-v26/${adaptiveFile}`;
  if (!fs.existsSync(p)) {
    problems.push(`Adaptive icon XML ausente: ${p}`);
  } else {
    const c = fs.readFileSync(p, 'utf8');
    if (!c.includes('@mipmap/ic_launcher_foreground')) problems.push(`${p} não aponta para @mipmap/ic_launcher_foreground`);
    if (!c.includes('@color/ic_launcher_background')) problems.push(`${p} não aponta para @color/ic_launcher_background`);
  }
}

for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  for (const iconFile of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    const p = `app/src/main/res/mipmap-${density}/${iconFile}`;
    if (!fs.existsSync(p)) problems.push(`Launcher asset ausente: ${p}`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Static QA: Sintaxe JavaScript, IDs estáticos, logo oficial SHA-256, launcher icons, schema v15 e contratos verificados com sucesso.');
