const fs=require('fs');
const cp=require('child_process');
const patcher='tools/apply-debt-integrity-fixes.js';
let source=fs.readFileSync(patcher,'utf8');
const fixes=[
 ["return p.months===1?'1 mês estimado':\\`${p.months} meses estimados\\`;","return p.months===1?'1 mês estimado':\\`\\${p.months} meses estimados\\`;"],
 ["desc:\\`${payroll?'Consignado':'Dívida'} — ","desc:\\`\\${payroll?'Consignado':'Dívida'} — "]
];
for(const [needle,replacement] of fixes){if(!source.includes(needle))throw new Error('Debt patcher escape pattern not found: '+needle);source=source.replace(needle,replacement)}
fs.writeFileSync(patcher,source);
cp.execFileSync(process.execPath,[patcher],{stdio:'inherit'});
