from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
s = path.read_text(encoding='utf-8')
old = "function renderAll(){renderSelects();renderTop();renderToday();renderDashboard();renderAnalyticsDashboard();renderTx();renderAccounts();renderCreditFacilities();renderCards();renderRecurring();renderBudget();renderDebts();renderGoals();renderPatrimony();renderCalendar();renderReports();renderStatements();renderCsvTemplates();renderReconcileCenter();renderRules();renderAudit();renderDataCenter();renderConfig();renderFavorites();renderSophy();applyPrivacy();formatMoneyInputs()}"
new = "function renderAll(){renderSelects();renderTop();renderToday();renderDashboard();renderAnalyticsDashboard();renderTx();renderAccounts();renderCreditFacilities();renderCards();renderRecurring();renderBudget();renderDebts();renderGoals();renderPatrimony();renderCalendar();renderReports();renderStatements();renderCsvTemplates();renderReconcileCenter();renderRules();renderAudit();renderFinancialAudit();renderDataCenter();renderConfig();renderFavorites();renderSophy();applyPrivacy();formatMoneyInputs()}"
if s.count(old) != 1:
    raise SystemExit(f'expected 1 renderAll match, got {s.count(old)}')
s = s.replace(old, new, 1)
path.write_text(s, encoding='utf-8')
print('financial audit now refreshes in renderAll')
