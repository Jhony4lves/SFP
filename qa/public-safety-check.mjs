import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SELF = path.normalize('qa/public-safety-check.mjs');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'build', 'dist', '.gradle', 'playwright-report', 'test-results']);
const TEXT_EXTS = new Set(['.js','.mjs','.cjs','.ts','.html','.css','.java','.kt','.xml','.gradle','.md','.yml','.yaml','.json','.properties','.txt','.patch','.gitignore']);

const bannedFragments = [
  'Ana Carolina da Silva Diniz',
  'Paulo Roberto Muniz de Carvalho',
  'Crédito Consignado CLT',
  'ASSB Comércio Varejista',
  'Pablo Lanches',
  'Mercat Alimentação',
  'NUCEL',
  '1202.49',
  '681.90',
  '665.25',
  '4678.30',
  '3885.48',
  '85.48'
];

const secretPatterns = [
  { name: 'GitHub classic PAT', re: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Groq live-looking key', re: /\bgsk_[A-Za-z0-9_-]{24,}\b/g }
];

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const cpfFormatted = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const findings = [];
for (const full of walk(ROOT)) {
  const rel = path.normalize(path.relative(ROOT, full));
  if (rel === SELF) continue;
  const ext = path.extname(rel).toLowerCase();
  if (!TEXT_EXTS.has(ext) && !['Dockerfile','LICENSE'].includes(path.basename(rel))) continue;
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }

  for (const fragment of bannedFragments) {
    if (text.includes(fragment)) findings.push(`${rel}: fragmento privado conhecido detectado`);
  }
  for (const { name, re } of secretPatterns) {
    re.lastIndex = 0;
    if (re.test(text)) findings.push(`${rel}: padrão sensível detectado (${name})`);
  }
  cpfFormatted.lastIndex = 0;
  if (cpfFormatted.test(text)) findings.push(`${rel}: possível CPF formatado detectado`);

  emailPattern.lastIndex = 0;
  for (const match of text.matchAll(emailPattern)) {
    const email = match[0].toLowerCase();
    if (email.endsWith('.invalid') || email.endsWith('@example.com') || email.endsWith('@users.noreply.github.com')) continue;
    findings.push(`${rel}: endereço de e-mail potencialmente real detectado (${email})`);
  }
}

if (findings.length) {
  console.error('PUBLIC SAFETY CHECK FALHOU:');
  for (const f of findings) console.error(`- ${f}`);
  process.exit(1);
}

console.log('PUBLIC SAFETY CHECK OK — nenhum secret/PII conhecido encontrado.');
