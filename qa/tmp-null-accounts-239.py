from pathlib import Path

path = Path('app/src/main/assets/www/open-finance-bills.js')
text = path.read_text(encoding='utf-8')
replacements = {
    "for(const item of result.items||[])for(const account of item.accounts||[])": "for(const item of result.items||[])for(const account of (Array.isArray(item?.accounts)?item.accounts:[]))",
    "for(const item of lastPreview.items||[])for(const account of item.accounts||[])": "for(const item of lastPreview.items||[])for(const account of (Array.isArray(item?.accounts)?item.accounts:[]))",
}
for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match for {old!r}, found {count}')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Open Finance bills null-account guards applied')
