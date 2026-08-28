from pathlib import Path

path=Path('app/src/main/assets/www/index.html')
text=path.read_text(encoding='utf-8')

replacements=[
    (
        '<script src="financial-intelligence.js"></script>\n<script src="financial-insights-ui.js"></script>\n<script>',
        '<script src="financial-intelligence.js"></script>\n<script src="financial-insights-ui.js"></script>\n<script src="safe-spend.js"></script>\n<script src="safe-spend-ui.js"></script>\n<script>',
        'scripts safe-spend',
    ),
    (
        "renderToday();if(typeof renderFinancialInsights==='function')renderFinancialInsights();renderDashboard();",
        "renderToday();if(typeof renderFinancialInsights==='function')renderFinancialInsights();if(typeof renderSafeSpendProjection==='function')renderSafeSpendProjection();renderDashboard();",
        'render safe-spend',
    ),
]

for old,new,label in replacements:
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'Anchor inválido para {label}: esperado 1, encontrado {count}')
    text=text.replace(old,new,1)

path.write_text(text,encoding='utf-8')
print('Safe-to-spend projection integrado com sucesso.')
