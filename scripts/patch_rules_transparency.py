from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
s = path.read_text(encoding='utf-8')

replacements = []

old_panel = '<article class="panel"><div class="head"><div><h2>Regras de classificação</h2><p>Aprendidas a partir dos extratos</p></div></div><div id="rulesList" class="list"></div></article>'
new_panel = '<article class="panel"><div class="head"><div><h2>Regras de classificação</h2><p id="rulesSummary">Aprendidas a partir dos extratos. Você pode revisar, editar ou excluir qualquer regra.</p></div></div><div class="note">Cada regra só vale quando a descrição contém o padrão mostrado abaixo. Editar uma regra não altera lançamentos já importados; a mudança vale para novas classificações.</div><div id="rulesList" class="list"></div></article>'
replacements.append((old_panel, new_panel, 'rules panel'))

old_render = "function renderRules(){$('rulesList').innerHTML=state.classificationRules.map((r,i)=>`<div class=\"item\"><div><b>${r.pattern}</b><small>${r.action} • ${r.category}</small></div><button class=\"danger tiny\" onclick=\"removeRule(${i})\">Excluir</button></div>`).join('')||'<div class=\"item\"><span>Nenhuma regra aprendida.</span></div>'}"
new_render = r'''function classificationRuleActionLabel(action){return action==='income'?'Receita':action==='transfer'?'Transferência':'Despesa'}
function renderRules(){
 const list=$('rulesList'),summary=$('rulesSummary');if(!list)return;
 const rules=Array.isArray(state.classificationRules)?state.classificationRules:[];
 if(summary)summary.textContent=rules.length?`${rules.length} ${rules.length===1?'regra ativa':'regras ativas'} • revisáveis, editáveis e removíveis`:'Nenhuma regra aprendida ainda. Elas surgem quando você confirma “aprender” durante uma importação.';
 list.innerHTML=rules.map((r,i)=>{
   const origin=r.editedByUser?'Editada por você':r.source==='manual'?'Criada por você':'Aprendida em importação';
   const when=r.updatedAt||r.learnedAt||r.createdAt;
   const date=when?` • ${new Date(when).toLocaleDateString('pt-BR')}`:'';
   const example=r.example?`<small>Exemplo que originou a regra: “${sfpEsc(r.example)}”</small>`:'';
   return `<div class="item" data-rule-index="${i}"><div><b>“${sfpEsc(r.pattern||'')}”</b><small>Quando a descrição contiver este padrão → ${classificationRuleActionLabel(r.action)}${r.action==='transfer'?'':` • Categoria: ${sfpEsc(r.category||'Outros')}`}</small><small>Origem: ${origin}${date}</small>${example}</div><div class="section-actions"><button class="btn2 tiny" onclick="editRule(${i})">Editar</button><button class="danger tiny" onclick="removeRule(${i})">Excluir</button></div></div>`
 }).join('')||'<div class="empty-state"><b>Nenhuma regra aprendida</b>Ao confirmar “aprender” numa importação, o SFP mostrará aqui exatamente o padrão e o efeito da regra.</div>'
}'''
replacements.append((old_render, new_render, 'renderRules'))

old_remove = "window.removeRule=async i=>{state.classificationRules.splice(i,1);await save('Excluir regra')}"
new_remove = r'''window.editRule=i=>{
 let r=state.classificationRules?.[i];if(!r)return;
 closeProgressive(false);
 const root=$('modalRoot');root.className='modalback';
 root.innerHTML=`<div class="modal sfp-dialog" role="dialog" aria-modal="true" aria-labelledby="ruleEditTitle"><div class="head"><div><h2 id="ruleEditTitle">Editar regra de classificação</h2><p>A mudança vale para novas classificações. Lançamentos anteriores não são reescritos.</p></div><button class="btn2" id="ruleEditClose">Voltar</button></div><label>Padrão de descrição<input id="ruleEditPattern" value="${sfpEsc(r.pattern||'')}" placeholder="Ex.: MERCADO CENTRAL"/></label><div class="two"><label>Classificar como<select id="ruleEditAction"><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência</option></select></label><label>Categoria<select id="ruleEditCategory">${CATEGORIES.map(c=>`<option value="${sfpEsc(c)}">${sfpEsc(c)}</option>`).join('')}</select></label></div><div class="note">O padrão é comparado sem diferenciar maiúsculas e minúsculas. Ex.: “MERCADO” também reconhece “Mercado Central”. Transferências não entram como receita ou despesa econômica.</div><div class="section-actions"><button class="btn2" id="ruleEditCancel">Cancelar</button><button class="btn" id="ruleEditSave">Salvar regra</button></div></div>`;
 $('ruleEditAction').value=['expense','income','transfer'].includes(r.action)?r.action:'expense';
 $('ruleEditCategory').value=CATEGORIES.includes(r.category)?r.category:'Outros';
 const close=()=>{root.className='hidden';root.replaceChildren()};
 $('ruleEditClose').onclick=close;$('ruleEditCancel').onclick=close;root.onclick=e=>{if(e.target===root)close()};
 $('ruleEditSave').onclick=async()=>{
   const pattern=$('ruleEditPattern').value.trim(),action=$('ruleEditAction').value,category=$('ruleEditCategory').value;
   if(pattern.length<2)return toast('Informe um padrão de classificação com pelo menos 2 caracteres.','warning');
   if(state.classificationRules.some((x,j)=>j!==i&&String(x.pattern||'').trim().toLowerCase()===pattern.toLowerCase()))return toast('Já existe uma regra com esse mesmo padrão.','warning');
   Object.assign(r,{pattern,action,category,editedByUser:true,updatedAt:new Date().toISOString()});
   await save('Editar regra de classificação');close();renderRules();toast('Regra de classificação atualizada.','success')
 };
 $('ruleEditPattern').focus()
};
window.removeRule=async i=>{
 let r=state.classificationRules?.[i];if(!r)return;
 if(!(await sfpConfirm({title:'Excluir regra de classificação',message:`Excluir a regra “${r.pattern}”?\n\nEla deixará de ser aplicada em novas importações. Lançamentos anteriores não serão alterados.`,confirmText:'Excluir regra',cancelText:'Cancelar',danger:true})))return;
 state.classificationRules.splice(i,1);await save('Excluir regra de classificação');toast('Regra removida.','success')
}'''
replacements.append((old_remove, new_remove, 'rule editor/removal'))

old_learning = "used.add(r.key);accepted.push(r);if(r.learn){let pattern=r.desc.split(/\\s+/).slice(0,3).join(' ');if(pattern.length>3&&!state.classificationRules.some(x=>x.pattern===pattern))state.classificationRules.push({pattern,action:r.action,category:r.category})}"
new_learning = "used.add(r.key);accepted.push(r);if(r.learn){let pattern=r.desc.split(/\\s+/).slice(0,3).join(' ');if(pattern.length>3&&!state.classificationRules.some(x=>String(x.pattern||'').toLowerCase()===pattern.toLowerCase()))state.classificationRules.push({pattern,action:r.action,category:r.category,source:'learned',learnedAt:new Date().toISOString(),example:r.desc})}"
replacements.append((old_learning, new_learning, 'learned rule metadata'))

old_semantics = "economicImpact:'economic',\n      confidence:'high',\n      reason:`Regra aprendida: ${learned.pattern}`"
new_semantics = "economicImpact:learned.action==='transfer'?'neutral':'economic',\n      confidence:'high',\n      reason:`Regra aprendida: ${learned.pattern}`"
replacements.append((old_semantics, new_semantics, 'learned transfer semantics'))

for old, new, label in replacements:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    s = s.replace(old, new, 1)

path.write_text(s, encoding='utf-8')
print('classification rules transparency patch applied')
