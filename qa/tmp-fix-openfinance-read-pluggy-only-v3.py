from pathlib import Path
import runpy

runpy.run_path('qa/tmp-fix-openfinance-read-pluggy-only-v2.py', run_name='__main__')

path = Path('qa/open-finance-unified-sync.spec.js')
text = path.read_text(encoding='utf-8')
old = "  await page.waitForFunction(() => window.SFPOpenFinanceUnifiedSync?.version === 1);\n  await expect(page.locator('#openFinanceSyncBtn')).toHaveText('Atualizar dados agora');"
new = "  await page.waitForFunction(() => window.SFPOpenFinanceUnifiedSync?.version === 1 && document.querySelector('.sidebar .nav button[data-page=\"openfinance\"]'));\n  await page.evaluate(() => window.setPage?.('openfinance'));\n  await expect(page.locator('#openFinanceSyncBtn')).toBeVisible();\n  await expect(page.locator('#openFinanceSyncBtn')).toHaveText('Atualizar dados agora');"
if text.count(old) != 1:
    raise SystemExit(f'setup antigo encontrado {text.count(old)} vez(es)')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('patched navigation setup', path)
