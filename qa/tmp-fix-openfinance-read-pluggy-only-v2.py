from pathlib import Path
import runpy

runpy.run_path('qa/tmp-fix-openfinance-read-pluggy-only.py', run_name='__main__')

path = Path('qa/open-finance-unified-sync.spec.js')
text = path.read_text(encoding='utf-8')
old = "await expect(page.locator('#openFinanceSyncBtn')).toHaveText('Sincronizar contas e faturas');"
new = "await expect(page.locator('#openFinanceSyncBtn')).toHaveText('Atualizar dados agora');"
if text.count(old) != 1:
    raise SystemExit(f'expectativa antiga do botão encontrada {text.count(old)} vez(es)')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('patched', path)
