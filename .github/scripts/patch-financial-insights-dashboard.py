from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        '<script src="financial-intelligence.js"></script>\n<script>',
        '<script src="financial-intelligence.js"></script>\n<script src="financial-insights-ui.js"></script>\n<script>',
        'script do painel de insights',
    ),
    (
        'function renderAll(){renderSelects();renderTop();renderToday();renderDashboard();',
        "function renderAll(){renderSelects();renderTop();renderToday();if(typeof renderFinancialInsights==='function')renderFinancialInsights();renderDashboard();",
        'render do painel de insights',
    ),
]

for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Anchor inválido para {label}: esperado 1, encontrado {count}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Financial Insights Dashboard patch aplicado com sucesso.')
