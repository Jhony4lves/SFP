import fs from 'node:fs';

const path = 'app/src/main/assets/www/index.html';
let source = fs.readFileSync(path, 'utf8');

function replaceBetween(startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Não encontrei início de ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Não encontrei fim de ${label}`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceBetween(
  "window.openAssetForm=()=>",
  "window.openManagementAction=page=>",
  `window.openAssetForm=()=>{setPage('patrimonio');const form=$('assetForm');form.reset();$('assetId').value='';const submit=form.querySelector('button[type="submit"],button:not([type])');if(submit)submit.textContent='Adicionar ativo';showProgressivePanel(form,'Adicionar ativo externo')};\n`,
  'openAssetForm'
);

replaceBetween(
  "window.editAsset=id=>",
  "window.removeAsset=async id=>",
  `window.editAsset=id=>{let a=state.assets.find(x=>x.id===id);if(!a)return;$('assetId').value=a.id;$('assetName').value=a.name;$('assetValue').value=a.value;const form=$('assetForm'),submit=form.querySelector('button[type="submit"],button:not([type])');if(submit)submit.textContent='Salvar alterações';setPage('patrimonio');showProgressivePanel(form,'Editar ativo')}\n`,
  'editAsset'
);

replaceBetween(
  " $('cardForm').onsubmit=async e=>",
  "\n $('recForm').onsubmit=async e=>",
  ` $('cardForm').onsubmit=async e=>{\n   e.preventDefault();\n   let panel=e.currentTarget.closest('.management-form-panel'),id=+$('cardId').value,old=id?card(id):null,patch={id:id||uid(),name:$('cardName').value.trim(),limit:+$('cardLimit').value,closeDay:+$('cardClose').value,dueDay:+$('cardDue').value,payAccountId:+$('cardPayAccount').value};\n   if(!patch.name)return toast('Informe o nome do cartão.','warning');\n   if(!requirePositiveAmount(patch.limit,'O limite do cartão'))return;\n   let obj=old?{...old,...patch}:{...patch,history:[]};\n   if(old&&old.limit!==obj.limit)obj.history.push({id:uid(),at:new Date().toISOString(),type:'limit',text:\`Limite alterado de \${brl(old.limit)} para \${brl(obj.limit)}\`,amount:obj.limit});\n   if(id)state.cards=state.cards.map(c=>c.id===id?obj:c);else state.cards.push(obj);\n   await save(id?'Editar cartão':'Novo cartão');\n   resetManagementForm('cardForm',{id:'cardId',titleId:'cardFormTitle',title:'Adicionar cartão',modeId:'cardFormMode',submitId:'cardSubmit',submitText:'Salvar cartão'});\n   if(progressiveRestore?.node===panel)closeProgressive(false);\n   toast(id?'Cartão atualizado com sucesso.':'Cartão salvo com sucesso.','success')\n };`,
  'cardForm'
);

replaceBetween(
  " $('goalForm').onsubmit=async e=>",
  "\n $('assetForm').onsubmit=async e=>",
  ` $('goalForm').onsubmit=async e=>{\n   e.preventDefault();\n   let panel=e.currentTarget.closest('.management-form-panel'),id=+$('goalId').value,old=id?state.goals.find(g=>g.id===id):null,patch={id:id||uid(),name:$('goalName').value.trim(),target:+$('goalTarget').value,accountId:+$('goalAccount').value,plan:+$('goalPlan').value,targetDate:$('goalDate').value};\n   if(!patch.name)return toast('Informe o nome da meta.','warning');\n   if(!requirePositiveAmount(patch.target,'O valor alvo da meta'))return;\n   let obj=old?{...old,...patch}:{...patch,initialAllocated:0,history:[]};\n   if(id)state.goals=state.goals.map(g=>g.id===id?obj:g);else state.goals.push(obj);\n   await save(id?'Editar meta':'Nova meta');\n   resetManagementForm('goalForm',{id:'goalId',titleId:'goalFormTitle',title:'Adicionar meta',modeId:'goalFormMode',submitId:'goalSubmit',submitText:'Criar meta',detailsId:'goalMoreDetails'});\n   if(progressiveRestore?.node===panel)closeProgressive(false);\n   toast(id?'Meta atualizada com sucesso.':'Meta criada com sucesso.','success')\n };`,
  'goalForm'
);

replaceBetween(
  " $('assetForm').onsubmit=async e=>",
  "\n $('configForm').onsubmit=async e=>",
  ` $('assetForm').onsubmit=async e=>{\n   e.preventDefault();\n   let panel=e.currentTarget,id=+$('assetId').value,obj={id:id||uid(),name:$('assetName').value.trim(),value:+$('assetValue').value};\n   if(!obj.name)return toast('Informe a descrição do ativo.','warning');\n   if(!requirePositiveAmount(obj.value,'O valor do ativo'))return;\n   if(id)state.assets=state.assets.map(a=>a.id===id?obj:a);else state.assets.push(obj);\n   await save(id?'Editar ativo':'Novo ativo');\n   e.target.reset();$('assetId').value='';const submit=e.target.querySelector('button[type="submit"],button:not([type])');if(submit)submit.textContent='Adicionar ativo';\n   if(progressiveRestore?.node===panel)closeProgressive(false);\n   toast(id?'Ativo atualizado com sucesso.':'Ativo adicionado com sucesso.','success')\n };`,
  'assetForm'
);

fs.writeFileSync(path, source);
console.log('Persistência/fechamento de Cartões, Metas e Patrimônio padronizados.');
