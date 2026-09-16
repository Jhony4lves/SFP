from pathlib import Path

safe = Path('app/src/main/assets/www/safe-spend-ui.js')
safe_text = safe.read_text(encoding='utf-8')
marker = "\n(function(global){\n  'use strict';\n\n  const STYLE_ID='sfpMobilePriorityNavV1';"
if marker not in safe_text:
    raise SystemExit('Menu V1 não encontrado; abortando para não remover código errado.')
safe_text = safe_text.split(marker, 1)[0].rstrip() + '\n'
if 'sfpMobilePriorityNavV1' in safe_text:
    raise SystemExit('Menu V1 ainda presente após consolidação.')
safe.write_text(safe_text, encoding='utf-8')

menu = Path('app/src/main/assets/www/financial-insights-ui.js')
menu_text = menu.read_text(encoding='utf-8')
old = "{title:'Dados',items:[['lancamentos','Lançamentos','Histórico e edição'],['extratos','Extratos','Importação OFX e CSV'],['dados','Central de Dados','Backup, importação e exportação']]},"
new = "{title:'Dados',items:[['lancamentos','Lançamentos','Histórico e edição'],['extratos','Extratos','Importação OFX e CSV'],['dados','Central de Dados','Backup, importação e exportação'],['openfinance','Sincronização','Open Finance e atualização de dados']]},"
if old not in menu_text:
    raise SystemExit('Construtor V2 esperado não encontrado; abortando sem alteração cega.')
menu_text = menu_text.replace(old, new, 1)
if menu_text.count("['openfinance','Sincronização','Open Finance e atualização de dados']") != 1:
    raise SystemExit('O menu canônico não ficou com exatamente uma entrada de Sincronização.')
menu.write_text(menu_text, encoding='utf-8')

spec = Path('qa/open-finance-auto-sync-contract.spec.js')
spec_text = spec.read_text(encoding='utf-8')
guard = '''

test('menu Mais mobile tem um único dono e o V2 expõe Sincronização',()=>{
  const safeSpend=fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/www/safe-spend-ui.js'),'utf8');
  const insights=fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/www/financial-insights-ui.js'),'utf8');
  expect(safeSpend).not.toContain('sfpMobilePriorityNavV1');
  expect(insights).toContain("const STYLE_ID='sfpMobilePriorityNavV2';");
  expect((insights.match(/\\['openfinance','Sincronização','Open Finance e atualização de dados'\\]/g)||[]).length).toBe(1);
});
'''
if 'menu Mais mobile tem um único dono' not in spec_text:
    spec.write_text(spec_text.rstrip() + guard, encoding='utf-8')

gradle = Path('gradle.properties')
props = gradle.read_text(encoding='utf-8')
if 'SFP_VERSION_CODE=43' not in props or 'SFP_VERSION_NAME=2.2.0-openfinance.24' not in props:
    raise SystemExit('Versão base inesperada; abortando bump automático.')
props = props.replace('SFP_VERSION_CODE=43', 'SFP_VERSION_CODE=44', 1)
props = props.replace('SFP_VERSION_NAME=2.2.0-openfinance.24', 'SFP_VERSION_NAME=2.2.0-openfinance.25', 1)
gradle.write_text(props, encoding='utf-8')
