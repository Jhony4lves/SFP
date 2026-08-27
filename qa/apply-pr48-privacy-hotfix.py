from pathlib import Path

path=Path('app/src/main/assets/www/index.html')
text=path.read_text(encoding='utf-8')
old="if($('privacyToggle'))$('privacyToggle').onclick=async()=>{state.settings.privacy=!state.settings.privacy;await dbSet(state);lastSavedState=clone(state);applyPrivacy()};"
new="if($('privacyToggle'))$('privacyToggle').onclick=async()=>{let from=$('txFrom')?.value||'',to=$('txTo')?.value||'';state.settings.privacy=!state.settings.privacy;await dbSet(state);lastSavedState=clone(state);renderSelects();if($('txFrom')&&from)$('txFrom').value=from;if($('txTo')&&to)$('txTo').value=to;applyPrivacy()};"
count=text.count(old)
if count!=1: raise SystemExit(f'privacy handler: esperado 1, encontrado {count}')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('PR48 privacy hotfix aplicado.')
