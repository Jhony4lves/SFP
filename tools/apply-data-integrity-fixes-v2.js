const fs=require('fs');
const cp=require('child_process');
const patcher='tools/apply-data-integrity-fixes.js';
let source=fs.readFileSync(patcher,'utf8');
source=source.replaceAll('\\\\\\"','\\"');
fs.writeFileSync(patcher,source);
cp.execFileSync(process.execPath,[patcher],{stdio:'inherit'});
