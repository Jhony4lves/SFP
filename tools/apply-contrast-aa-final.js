const fs=require('fs');
const path='app/src/main/assets/www/ui-hardening.css';
let s=fs.readFileSync(path,'utf8');
const marker='/* Final AA semantic text hardening */';
if(s.includes(marker)) process.exit(0);
s+=`\n\n${marker}\n[data-theme="light"] #auditoria .positive,\n[data-theme="light"] #dashboard .positive { color:#166534 !important; }\n[data-theme="light"] #auditoria .warning,\n[data-theme="light"] #dashboard .warning { color:#854d0e !important; }\n[data-theme="light"] #auditoria .negative,\n[data-theme="light"] #dashboard .negative { color:#b91c1c !important; }\n`;
fs.writeFileSync(path,s);
console.log('Final AA semantic text rules applied');
