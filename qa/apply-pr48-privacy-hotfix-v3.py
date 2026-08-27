from pathlib import Path

path=Path('app/src/main/assets/www/index.html')
text=path.read_text(encoding='utf-8')
old="if($('privacyToggle'))$('privacyToggle').onclick=async()=>{let from=$('txFrom')?.value||'',to=$('txTo')?.value||'';state.settings.privacy=!state.settings.privacy;await dbSet(state);lastSavedState=clone(state);['txFrom','txTo'].forEach(id=>{let sel=$(id);if(!sel)return;[...sel.options].forEach(opt=>{let a=account(+opt.value);if(a)opt.textContent=`${a.name} • ${state.settings?.privacy?'••••':brl(accountBalance(a.id))}`})});if($('txFrom')&&from)$('txFrom').value=from;if($('txTo')&&to)$('txTo').value=to;applyPrivacy()};"
new="if($('privacyToggle'))$('privacyToggle').onclick=async()=>{let from=$('txFrom')?.value||'',to=$('txTo')?.value||'';state.settings.privacy=!state.settings.privacy;['txFrom','txTo'].forEach(id=>{let sel=$(id);if(!sel)return;[...sel.options].forEach(opt=>{let a=account(+opt.value);if(a)opt.textContent=`${a.name} • ${state.settings?.privacy?'••••':brl(accountBalance(a.id))}`})});if($('txFrom')&&from)$('txFrom').value=from;if($('txTo')&&to)$('txTo').value=to;applyPrivacy();await dbSet(state);lastSavedState=clone(state)};"
count=text.count(old)
if count!=1: raise SystemExit(f'privacy handler v3: esperado 1, encontrado {count}')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('PR48 privacy hotfix v3 aplicado: UI antes da persistencia.')
