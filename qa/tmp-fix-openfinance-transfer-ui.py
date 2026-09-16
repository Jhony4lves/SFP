from pathlib import Path

ui = Path('app/src/main/assets/www/financial-insights-ui.js')
text = ui.read_text(encoding='utf-8')
old = '.sidebar .nav button{display:none!important}'
new = '.sidebar .nav button{display:none!important;min-width:0!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;padding:4px 1px!important;font-size:11px!important;gap:2px!important;text-align:center!important}'
if old not in text:
    raise SystemExit('CSS mobile V2 esperado não encontrado')
text = text.replace(old, new, 1)
needle = '.sidebar .nav button[data-page="hoje"]{order:1}'
insert = '.sidebar .nav button span{display:block!important;font-size:9.25px!important;line-height:1.15!important;margin-top:2px!important;overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;max-width:100%!important;text-align:center!important}' + needle
if needle not in text:
    raise SystemExit('Ponto de inserção dos rótulos mobile não encontrado')
text = text.replace(needle, insert, 1)
ui.write_text(text, encoding='utf-8')

spec = Path('qa/open-finance-mobile-navigation.spec.js')
spec_text = spec.read_text(encoding='utf-8')
anchor = "  expect(await visibleButtons.evaluateAll(list => list.map(el => el.dataset.page || el.id)))\n    .toEqual(['hoje','contas','cartoes','calendario','moreNavBtn']);\n"
extra = anchor + "\n  const clippedLabels = await visibleButtons.evaluateAll(list => list.map(button => {\n    const label = button.querySelector('span');\n    return label ? { text: label.textContent.trim(), clipped: label.scrollWidth > label.clientWidth + 1 } : null;\n  }));\n  expect(clippedLabels.filter(Boolean).every(item => !item.clipped)).toBe(true);\n"
if anchor not in spec_text:
    raise SystemExit('Contrato mobile esperado não encontrado')
if 'clippedLabels' not in spec_text:
    spec.write_text(spec_text.replace(anchor, extra, 1), encoding='utf-8')

gradle = Path('gradle.properties')
props = gradle.read_text(encoding='utf-8')
if 'SFP_VERSION_CODE=44' not in props or 'SFP_VERSION_NAME=2.2.0-openfinance.25' not in props:
    raise SystemExit('Versão base inesperada')
props = props.replace('SFP_VERSION_CODE=44', 'SFP_VERSION_CODE=45', 1)
props = props.replace('SFP_VERSION_NAME=2.2.0-openfinance.25', 'SFP_VERSION_NAME=2.2.0-openfinance.26', 1)
gradle.write_text(props, encoding='utf-8')
