const fs = require('fs');
const src = fs.readFileSync('app/src/main/assets/www/audit-hardening.js','utf8');
const eager = /\n\s*window\.renderAudit\(\);\s*\n\s*}\s*\n\s*\n\s*function install\(\)/;
if (eager.test(src)) throw new Error('audit-hardening must not eagerly render before persisted state is loaded');
const guarded = /typeof state!==['"]undefined['"]&&state&&Array\.isArray\(state\.accounts\)&&Array\.isArray\(state\.invoices\)\) window\.renderAudit\(\)/;
if (!guarded.test(src)) throw new Error('missing explicit loaded-state guard for initial audit render');
console.log('audit boot regression contract: ok');
