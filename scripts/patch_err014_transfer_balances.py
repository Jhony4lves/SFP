from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
s = path.read_text(encoding='utf-8')
old = '''function renderSelects(){
 let acc=state.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join(''),cards=state.cards.map(c=>`<option value="${c.id}">${c.name}</option>`).join(''),cats=CATEGORIES.map(c=>`<option>${c}</option>`).join('');
 ['txAccount','txFrom','txTo','stmtAccount','cardPayAccount','recAccount','debtAccount','goalAccount'].forEach(id=>{if($(id))$(id).innerHTML=acc});
 ['txCard','invoiceCard','cardImportCard'].forEach(id=>{if($(id))$(id).innerHTML=cards});
 ['txCategory','recCategory','catBudgetCategory'].forEach(id=>{if($(id))$(id).innerHTML=cats});
}'''
new = '''function renderSelects(){
 let acc=state.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join(''),transferAcc=state.accounts.map(a=>`<option value="${a.id}">${a.name} • ${brl(accountBalance(a.id))}</option>`).join(''),cards=state.cards.map(c=>`<option value="${c.id}">${c.name}</option>`).join(''),cats=CATEGORIES.map(c=>`<option>${c}</option>`).join('');
 ['txAccount','stmtAccount','cardPayAccount','recAccount','debtAccount','goalAccount'].forEach(id=>{if($(id))$(id).innerHTML=acc});
 ['txFrom','txTo'].forEach(id=>{if($(id))$(id).innerHTML=transferAcc});
 ['txCard','invoiceCard','cardImportCard'].forEach(id=>{if($(id))$(id).innerHTML=cards});
 ['txCategory','recCategory','catBudgetCategory'].forEach(id=>{if($(id))$(id).innerHTML=cats});
}'''
count = s.count(old)
if count != 1:
    raise SystemExit(f'renderSelects: expected 1 match, got {count}')
path.write_text(s.replace(old, new, 1), encoding='utf-8')
print('ERR-014 transfer balance labels applied')
