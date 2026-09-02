const fs=require('fs');
const path='app/src/main/assets/www/ui-hardening.css';
let s=fs.readFileSync(path,'utf8');
const needle='  .sfp-select-menu { transition: none !important; }\n';
if(!s.includes(needle))throw new Error('temporary transition override not found');
s=s.replace(needle,'');
fs.writeFileSync(path,s);
console.log('Removed redundant !important transition override');
