const fs=require('node:fs');
const path='app/src/main/assets/www/index.html';
let src=fs.readFileSync(path,'utf8');
let changed=false;

function patch(from,to,label){
  if(src.includes(to)){console.log(`ok ${label}`);return;}
  if(!src.includes(from)) throw new Error(`missing source for ${label}`);
  src=src.replace(from,to);changed=true;console.log(`patched ${label}`);
}

// Stored-XSS fixes: persisted/imported/user-authored text must never be interpolated
// into HTML without contextual escaping.
patch('<b>${e.desc}</b><small>${dateObj(e.date).toLocaleDateString(\'pt-BR\')} • ${statusLabel(e.status)}</small>',
      '<b>${sfpEsc(e.desc)}</b><small>${dateObj(e.date).toLocaleDateString(\'pt-BR\')} • ${sfpEsc(statusLabel(e.status))}</small>',
      'today upcoming description');
patch("healthAlerts().map(a=>`<div class=\"alert ${a.c}\">${a.t}</div>`).join('')",
      "healthAlerts().map(a=>`<div class=\"alert ${a.c}\">${sfpEsc(a.t)}</div>`).join('')",
      'today health alerts');
patch('<div class="tile"><div class="tiletop"><b>${a.name}</b><strong>${brl(accountBalance(a.id))}</strong></div><small>${a.type} • ${accountBalanceDateLabel(a.balanceDate)}</small></div>',
      '<div class="tile"><div class="tiletop"><b>${sfpEsc(a.name)}</b><strong>${brl(accountBalance(a.id))}</strong></div><small>${sfpEsc(a.type)} • ${sfpEsc(accountBalanceDateLabel(a.balanceDate))}</small></div>',
      'today account tile');
patch('<div class="item" data-sr="${i}"><div><b>${r.title}</b><small>${r.sub}</small></div></div>',
      '<div class="item" data-sr="${i}"><div><b>${sfpEsc(r.title)}</b><small>${sfpEsc(r.sub)}</small></div></div>',
      'global search results');
patch('${x.item.desc||x.item.name||({transaction:\'Lançamento\',account:\'Conta\',card:\'Cartão\',recurring:\'Recorrência\',debt:\'Dívida\',goal:\'Meta\',asset:\'Ativo\'}[x.type]||x.type)}',
      '${sfpEsc(x.item.desc||x.item.name||({transaction:\'Lançamento\',account:\'Conta\',card:\'Cartão\',recurring:\'Recorrência\',debt:\'Dívida\',goal:\'Meta\',asset:\'Ativo\'}[x.type]||x.type))}',
      'trash item label');
patch('<small>${x.deletedAt}</small>', '<small>${sfpEsc(x.deletedAt)}</small>', 'trash deletion timestamp');

patch("accountText=transfer?`${account(t.fromId)?.name||'—'} → ${account(t.toId)?.name||'—'}`:(account(t.accountId)?.name||'—')",
      "accountText=transfer?`${sfpEsc(account(t.fromId)?.name||'—')} → ${sfpEsc(account(t.toId)?.name||'—')}`:sfpEsc(account(t.accountId)?.name||'—')",
      'transaction account names');
patch('<td data-label="Descrição"><b>${t.desc}</b>${originChip(t)}<br><small>${t.category||\'\'}</small></td>',
      '<td data-label="Descrição"><b>${sfpEsc(t.desc)}</b>${originChip(t)}<br><small>${sfpEsc(t.category||\'\')}</small></td>',
      'transaction description and category');
patch('<div class="item"><div><b>${x.institution} • ${x.name}</b><small>Disponível; não entra no saldo nem no patrimônio</small></div>',
      '<div class="item"><div><b>${sfpEsc(x.institution)} • ${sfpEsc(x.name)}</b><small>Disponível; não entra no saldo nem no patrimônio</small></div>',
      'credit facility names');
patch('<div class="item"><div><b>${r.desc}</b><small>${r.type} • ${brl(r.amount)} • dia ${r.day} • ${r.active?\'ativa\':\'pausada\'}</small></div>',
      '<div class="item"><div><b>${sfpEsc(r.desc)}</b><small>${sfpEsc(r.type)} • ${brl(r.amount)} • dia ${r.day} • ${r.active?\'ativa\':\'pausada\'}</small></div>',
      'recurring description');
patch('<div class="tile"><div class="tiletop"><b>${a.name}</b><strong>${brl(a.value)}</strong></div><div class="tileactions">',
      '<div class="tile"><div class="tiletop"><b>${sfpEsc(a.name)}</b><strong>${brl(a.value)}</strong></div><div class="tileactions">',
      'asset name');
patch('<div class="item"><div><b>${t.name}</b><small>Data: coluna ${t.dateIndex+1}',
      '<div class="item"><div><b>${sfpEsc(t.name)}</b><small>Data: coluna ${t.dateIndex+1}',
      'csv template name');
patch('<div class="issue"><div><b>${i.title}</b><small>${i.sub}</small></div>',
      '<div class="issue"><div><b>${sfpEsc(i.title)}</b><small>${sfpEsc(i.sub)}</small></div>',
      'reconciliation issue text');
patch('<div class="item"><div><b>${s.account}</b><small>${s.file} • ${s.months.map(monthName).join(\', \')}</small></div>',
      '<div class="item"><div><b>${sfpEsc(s.account)}</b><small>${sfpEsc(s.file)} • ${sfpEsc(s.months.map(monthName).join(\', \'))}</small></div>',
      'statement history metadata');

const oldBudget=`function renderBudget(){
 $('budgetPreset').value=state.settings.budgetPreset;$('budgetNeeds').value=state.settings.needs;$('budgetWants').value=state.settings.wants;$('budgetSave').value=state.settings.save;let map=categoriesSpent();$('categoryBudgets').innerHTML=Object.entries(state.categoryBudgets).map(([cat,lim])=>{let g=map[cat]||0,p=lim?g/lim*100:0;return \`<div class="item"><div style="flex:1"><div class="budgettop"><span>\${cat}</span><b>\${brl(g)} / \${brl(lim)}</b></div><div class="progress \${p>100?'red':''}"><div style="width:\${Math.min(p,100)}%"></div></div></div><button class="danger tiny" onclick="removeCatBudget('\${cat.replace(/'/g,"\\\\'")}')">Excluir</button></div>\`}).join('')||'<div class="item"><span>Nenhum limite por categoria.</span></div>'
}`;
const newBudget=`function renderBudget(){
 $('budgetPreset').value=state.settings.budgetPreset;$('budgetNeeds').value=state.settings.needs;$('budgetWants').value=state.settings.wants;$('budgetSave').value=state.settings.save;let map=categoriesSpent();$('categoryBudgets').innerHTML=Object.entries(state.categoryBudgets).map(([cat,lim])=>{let g=map[cat]||0,p=lim?g/lim*100:0;return \`<div class="item"><div style="flex:1"><div class="budgettop"><span>\${sfpEsc(cat)}</span><b>\${brl(g)} / \${brl(lim)}</b></div><div class="progress \${p>100?'red':''}"><div style="width:\${Math.min(p,100)}%"></div></div></div><button class="danger tiny" data-remove-budget="\${sfpEsc(cat)}">Excluir</button></div>\`}).join('')||'<div class="item"><span>Nenhum limite por categoria.</span></div>';
 document.querySelectorAll('[data-remove-budget]').forEach(btn=>btn.onclick=()=>removeCatBudget(btn.dataset.removeBudget));
}`;
if(src.includes(oldBudget)) patch(oldBudget,newBudget,'budget category text and action attribute');
else if(!src.includes("data-remove-budget=\"${sfpEsc(cat)}\"")) throw new Error('missing source for budget renderer');

if(changed){fs.writeFileSync(path,src);console.log('Security hardening applied.');}
else console.log('Security hardening already present.');
