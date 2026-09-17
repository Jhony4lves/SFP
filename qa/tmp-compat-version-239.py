from pathlib import Path

path = Path('app/src/main/assets/www/open-finance-sync-accounts.js')
text = path.read_text(encoding='utf-8')
if 'const VERSION=3;' not in text:
    raise SystemExit('Expected patched VERSION=3 marker was not found')
path.write_text(text.replace('const VERSION=3;', 'const VERSION=2;', 1), encoding='utf-8')
print('Open Finance unified sync API stays on version 2')
