from pathlib import Path

path = Path('tools/patch_transfer_matching.py')
text = path.read_text(encoding='utf-8')

replacements = [
    (r"replace(/[\\u0300-\\u036f]/g", r"replace(/[\u0300-\u036f]/g"),
    (r"replace(/\\s+/g", r"replace(/\s+/g"),
    (r"return /\\b(pix|ted|doc|transfer|transferencia|transf|entre contas|conta propria|mesma titularidade)\\b/.test", r"return /\b(pix|ted|doc|transfer|transferencia|transf|entre contas|conta propria|mesma titularidade)\b/.test"),
    (r"split(/\\\\s+/)", r"split(/\\s+/)"),
]

for old, new in replacements:
    count = text.count(old)
    if count == 0:
        print(f'already corrected or not present: {old}')
        continue
    text = text.replace(old, new)
    print(f'corrected {count} occurrence(s): {old}')

# A estrutura curta do estado-base aparece duas vezes no HTML. Esse é o único
# replacement que deve aceitar duas ocorrências; os demais continuam fail-fast.
old_helper = """def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 occurrence, found {count}')
    text = text.replace(old, new, 1)
    print(f'patched: {label}')
"""
new_helper = """def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    expected = 2 if label == 'seed transferEvidence' else 1
    if count != expected:
        raise RuntimeError(f'{label}: expected exactly {expected} occurrence(s), found {count}')
    text = text.replace(old, new, expected)
    print(f'patched: {label} ({expected} occurrence(s))')
"""
if old_helper in text:
    text = text.replace(old_helper, new_helper, 1)
elif new_helper not in text:
    raise RuntimeError('replace_once helper shape changed unexpectedly')

# Fail fast: the raw JS engine must not emit double-escaped regex tokens.
engine_start = text.find("engine = r'''")
engine_end = text.find("'''\nreplace_once(anchor, engine", engine_start)
if engine_start < 0 or engine_end < 0:
    raise RuntimeError('Transfer matching engine block not found')
engine = text[engine_start:engine_end]
for bad in (r'/\\b', r'\\b/', r'/\\s', r'\\u0300'):
    if bad in engine:
        raise RuntimeError(f'over-escaped token remains in engine source: {bad}')

path.write_text(text, encoding='utf-8')
print('Patch escaping and occurrence contracts validated.')
