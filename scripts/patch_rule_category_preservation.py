from pathlib import Path
p=Path('app/src/main/assets/www/index.html')
s=p.read_text(encoding='utf-8')
old="root.innerHTML=`<div class=\"modal sfp-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"ruleEditTitle\"><div class=\"head\"><div><h2 id=\"ruleEditTitle\">Editar regra de classificação</h2><p>A mudança vale para novas classificações. Lançamentos anteriores não são reescritos.</p></div><button class=\"btn2\" id=\"ruleEditClose\">Voltar</button></div><label>Padrão de descrição<input id=\"ruleEditPattern\" value=\"${sfpEsc(r.pattern||'')}\" placeholder=\"Ex.: MERCADO CENTRAL\"/></label><div class=\"two\"><label>Classificar como<select id=\"ruleEditAction\"><option value=\"expense\">Despesa</option><option value=\"income\">Receita</option><option value=\"transfer\">Transferência</option></select></label><label>Categoria<select id=\"ruleEditCategory\">${CATEGORIES.map(c=>`<option value=\"${sfpEsc(c)}\">${sfpEsc(c)}</option>`).join('')}</select></label></div>"
new="const ruleCategories=CATEGORIES.includes(r.category)?CATEGORIES:[...CATEGORIES,r.category].filter(Boolean);\n root.innerHTML=`<div class=\"modal sfp-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"ruleEditTitle\"><div class=\"head\"><div><h2 id=\"ruleEditTitle\">Editar regra de classificação</h2><p>A mudança vale para novas classificações. Lançamentos anteriores não são reescritos.</p></div><button class=\"btn2\" id=\"ruleEditClose\">Voltar</button></div><label>Padrão de descrição<input id=\"ruleEditPattern\" value=\"${sfpEsc(r.pattern||'')}\" placeholder=\"Ex.: MERCADO CENTRAL\"/></label><div class=\"two\"><label>Classificar como<select id=\"ruleEditAction\"><option value=\"expense\">Despesa</option><option value=\"income\">Receita</option><option value=\"transfer\">Transferência</option></select></label><label>Categoria<select id=\"ruleEditCategory\">${ruleCategories.map(c=>`<option value=\"${sfpEsc(c)}\">${sfpEsc(c)}</option>`).join('')}</select></label></div>"
if s.count(old)!=1: raise SystemExit(f'editor markup: expected 1, got {s.count(old)}')
s=s.replace(old,new,1)
old2="$('ruleEditCategory').value=CATEGORIES.includes(r.category)?r.category:'Outros';"
new2="$('ruleEditCategory').value=r.category||'Outros';"
if s.count(old2)!=1: raise SystemExit(f'category selection: expected 1, got {s.count(old2)}')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')
print('rule category preservation applied')
