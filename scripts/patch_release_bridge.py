from pathlib import Path

path = Path('app/src/main/java/com/jhony/sfp/AndroidBridge.java')
text = path.read_text(encoding='utf-8')

replacements = {
    '        return "2.0.2";': '        return BuildConfig.VERSION_NAME;',
    '            conn.setRequestProperty("User-Agent", "SmartFinancialPlanner/2.0 Sophy/3.0");': '            conn.setRequestProperty("User-Agent", "SmartFinancialPlanner/" + BuildConfig.VERSION_NAME + " Sophy/3.0");',
}

for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Esperado exatamente 1 marcador, encontrado {count}: {old}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('AndroidBridge versioning patch applied successfully.')
