from pathlib import Path

p = Path('app/src/main/assets/www/index.html')
s = p.read_text()

anchor = "function normalize(){\n state.version=VERSION;state.schemaVersion=SCHEMA_VERSION;state.baseDate??='2026-08-18';"
helper = """function repairImportedHistoricalTransferBalanceImpact(){
 let repaired=0;
 (state.transfers||[]).forEach(t=>{
  const tags=Array.isArray(t.tags)?t.tags:[];
  const imported=!!t.statementKey&&tags.includes('extrato')&&tags.includes('transferência');
  const historical=!!t.date&&!!state.baseDate&&t.date<=state.baseDate;
  if(imported&&historical&&t.balanceImpact===true){
   t.balanceImpact=false;
   t.balanceImpactRepair='2.2-rc5-historical-import';
   repaired++
  }
 });
 return repaired
}
function normalize(){
 state.version=VERSION;state.schemaVersion=SCHEMA_VERSION;state.baseDate??='2026-08-18';"""
if anchor not in s:
    raise SystemExit('normalize anchor not found')
s = s.replace(anchor, helper, 1)

arrays = "for(const k of ['accounts','cards','transactions','transfers','purchases','invoiceAdjustments','invoices','recurring','debts','goals','assets','statements','transferEvidence','classificationRules','snapshots','trash','undo','closedMonths','csvTemplates','favorites','creditFacilities'])state[k]??=[];"
if arrays not in s:
    raise SystemExit('arrays anchor not found')
s = s.replace(arrays, arrays + "\n repairImportedHistoricalTransferBalanceImpact();", 1)

bad = "statementKey:r.key,balanceImpact:true,semanticClass:'user_transfer',classificationConfidence:1,classificationReason:'Confirmado como transferência interna pelo usuário durante a importação.'"
good = "statementKey:r.key,balanceImpact:r.date>state.baseDate,semanticClass:'user_transfer',classificationConfidence:1,classificationReason:'Confirmado como transferência interna pelo usuário durante a importação.'"
if bad not in s:
    raise SystemExit('explicit transfer balanceImpact anchor not found')
s = s.replace(bad, good, 1)
p.write_text(s)

gp = Path('gradle.properties')
g = gp.read_text()
if 'SFP_VERSION_CODE=13' not in g or 'SFP_VERSION_NAME=2.2.0-rc.4' not in g:
    raise SystemExit('RC4 version anchor not found')
g = g.replace('SFP_VERSION_CODE=13', 'SFP_VERSION_CODE=14', 1)
g = g.replace('SFP_VERSION_NAME=2.2.0-rc.4', 'SFP_VERSION_NAME=2.2.0-rc.5', 1)
g = g.replace('# RC4 do ciclo 2.2: parser Valor x Saldo e semântica de categorias por natureza.\n# Gate final após limpeza integral dos tokens monetários no PDF.', '# RC5 do ciclo 2.2: integridade de saldo em transferências históricas importadas.\n# Transferências de extrato anteriores à data-base não alteram o saldo atual e registros antigos são reparados no normalize().')
gp.write_text(g)
