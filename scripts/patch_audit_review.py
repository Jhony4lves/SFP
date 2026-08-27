from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
s = path.read_text(encoding='utf-8')
old = "  if(/parcela\\s*\\d+\\s*\\/\\s*\\d+/.test(d))return 'purchase';"
new = "  if(/parcela\\s*\\d+\\s*\\/\\s*\\d+/.test(d)||/\\bpix no credito\\b/.test(d))return 'purchase';"
if s.count(old) != 1:
    raise SystemExit(f'expected 1 Pix anchor match, got {s.count(old)}')
s = s.replace(old, new, 1)
path.write_text(s, encoding='utf-8')
print('restored Pix no Crédito as structural card-debit anchor')
