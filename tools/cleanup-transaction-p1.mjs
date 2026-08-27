import fs from 'node:fs';
const path='app/src/main/assets/www/index.html';
let source=fs.readFileSync(path,'utf8');
const bad='window.editAccount=window.editAccount=';
if(!source.includes(bad))throw new Error('Resíduo de editAccount não encontrado.');
source=source.replace(bad,'window.editAccount=');
fs.writeFileSync(path,source);
console.log('Resíduo de patch removido.');
