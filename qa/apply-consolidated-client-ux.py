from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 ocorrência, encontrado {count}')
    text = text.replace(old, new, 1)


def replace_between(start, end, new_block, label):
    global text
    i = text.find(start)
    if i < 0:
        raise SystemExit(f'{label}: marcador inicial não encontrado')
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(f'{label}: marcador final não encontrado')
    text = text[:i] + new_block + text[j:]

replace_once(
    '<article class="panel"><div class="head"><div><h2>Regras de classificação</h2><p>Aprendidas a partir dos extratos</p></div></div><div id="rulesList" class="list"></div></article>',
    '<article class="panel"><div class="head"><div><h2>Regras de classificação</h2><p id="rulesSummary">Aprendidas a partir dos extratos. Você pode revisar, editar ou excluir qualquer regra.</p></div></div><div class="note">Cada regra só vale quando a descrição contém o padrão mostrado abaixo. Editar uma regra não altera lançamentos já importados; a mudança vale para novas classificações.</div><div id="rulesList" class="list"></div></article>',
    'painel de regras'
)

replace_once(
    "function renderRules(){$('rulesList').innerHTML=state.classificationRules.map((r,i)=>`<div class=\"item\"><div><b>${r.pattern}</b><small>${r.action} • ${r.category}</small></div><button class=\"danger tiny\" onclick=\"removeRule(${i})\">Excluir</button></div>`).join('')||'<div class=\"item\"><span>Nenhuma regra aprendida.</span></div>'}",
    """function classificationRuleActionLabel(action){return action==='income'?'Receita':action==='transfer'?'Transferência':'Despesa'}
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
}""",
    'renderRules'
)

replace_once(
    "window.removeRule=async i=>{state.classificationRules.splice(i,1);await save('Excluir regra')}",
    """window.editRule=i=>{
 let r=state.classificationRules?.[i];if(!r)return;
 closeProgressive(false);
 const root=$('modalRoot');root.className='modalback';
 const ruleCategories=CATEGORIES.includes(r.category)?CATEGORIES:[...CATEGORIES,r.category].filter(Boolean);
 root.innerHTML=`<div class="modal sfp-dialog" role="dialog" aria-modal="true" aria-labelledby="ruleEditTitle"><div class="head"><div><h2 id="ruleEditTitle">Editar regra de classificação</h2><p>A mudança vale para novas classificações. Lançamentos anteriores não são reescritos.</p></div><button class="btn2" id="ruleEditClose">Voltar</button></div><label>Padrão de descrição<input id="ruleEditPattern" value="${sfpEsc(r.pattern||'')}" placeholder="Ex.: MERCADO CENTRAL"/></label><div class="two"><label>Classificar como<select id="ruleEditAction"><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência</option></select></label><label>Categoria<select id="ruleEditCategory">${ruleCategories.map(c=>`<option value="${sfpEsc(c)}">${sfpEsc(c)}</option>`).join('')}</select></label></div><div class="note">O padrão é comparado sem diferenciar maiúsculas e minúsculas. Ex.: “MERCADO” também reconhece “Mercado Central”. Transferências não entram como receita ou despesa econômica.</div><div class="section-actions"><button class="btn2" id="ruleEditCancel">Cancelar</button><button class="btn" id="ruleEditSave">Salvar regra</button></div></div>`;
 $('ruleEditAction').value=['expense','income','transfer'].includes(r.action)?r.action:'expense';
 $('ruleEditCategory').value=r.category||'Outros';
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
}""",
    'edição/exclusão de regras'
)

replace_once("economicImpact:'economic',\n      confidence:'high',\n      reason:`Regra aprendida: ${learned.pattern}`", "economicImpact:learned.action==='transfer'?'neutral':'economic',\n      confidence:'high',\n      reason:`Regra aprendida: ${learned.pattern}`", 'semântica de regra aprendida')

replace_once(
    "if(pattern.length>3&&!state.classificationRules.some(x=>x.pattern===pattern))state.classificationRules.push({pattern,action:r.action,category:r.category})",
    "if(pattern.length>3&&!state.classificationRules.some(x=>String(x.pattern||'').toLowerCase()===pattern.toLowerCase()))state.classificationRules.push({pattern,action:r.action,category:r.category,source:'learned',learnedAt:new Date().toISOString(),example:r.desc})",
    'metadados de regra aprendida'
)

new_proactivity = r"""function sophyCheckProactivity({force=false,baselineAt=null}={}){
  if(!state?.sophy)normalize();
  const sophy=state.sophy;
  if(!sophy.settings?.proactivityEnabled&&!force)return null;
  const now=Date.now(),baseline=Number(baselineAt);
  if(!sophy.lastProactiveAt&&!force&&!Number.isFinite(baseline))return null;
  if(!sophy.introDone&&!force)return null;
  const lastAt=sophy.lastProactiveAt?new Date(sophy.lastProactiveAt).getTime():(Number.isFinite(baseline)?baseline:now),hoursSince=(now-lastAt)/(1000*60*60);
  if(!force&&hoursSince<4)return null;

  const free=allAccountBalance()-commitmentUntilNextIncome();
  if(free<0){
    const text=`Oi! Passei pra te dar um toque importante: seu livre projetado está em **${brl(free)}**. Temos contas a vencer antes da sua próxima entrada. Vale a pena dar uma segurada nos gastos extras hoje!`;
    sophy.personaState='concerned';sophy.lastProactiveAt=new Date().toISOString();
    sophy.messages.push({id:uid(),sender:'sophy',text,at:new Date().toISOString(),emotion:'concerned'});
    sophy.messages=sophy.messages.slice(-50);
    return text
  }

  const completedGoal=(state.goals||[]).find(g=>g.target>0&&goalBalance(g)>=g.target);
  if(completedGoal&&!sophy.messages.some(m=>m.text?.includes(completedGoal.name))){
    const text=`🎉 Parabéns! Sua meta **${completedGoal.name}** atingiu 100% da reserva (${brl(goalBalance(completedGoal))})! Que orgulho da sua disciplina financeira!`;
    sophy.personaState='proud';sophy.lastProactiveAt=new Date().toISOString();
    sophy.messages.push({id:uid(),sender:'sophy',text,at:new Date().toISOString(),emotion:'proud'});
    sophy.messages=sophy.messages.slice(-50);
    return text
  }

  const nextInc=nextIncomeEvent(),today=localCivilDate(),tomorrowRef=new Date();
  tomorrowRef.setDate(tomorrowRef.getDate()+1);
  const tomorrow=localCivilDate(tomorrowRef);
  if(nextInc&&(nextInc.date===today||nextInc.date===tomorrow)){
    const isToday=nextInc.date===today,hour=new Date().getHours(),greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
    const text=isToday?`${greeting}! Hoje é dia de recebimento: **${nextInc.desc}** (${brl(nextInc.amount)})! 💰 Não esqueça de conferir a entrada na sua conta!`:`Oi! Amanhã tem previsão de recebimento de **${nextInc.desc}** (${brl(nextInc.amount)}). Seu planejamento tá no rumo certo!`;
    sophy.personaState='cheerful';sophy.lastProactiveAt=new Date().toISOString();
    sophy.messages.push({id:uid(),sender:'sophy',text,at:new Date().toISOString(),emotion:'cheerful'});
    sophy.messages=sophy.messages.slice(-50);
    return text
  }

  const localHour=new Date().getHours();
  if(force||(hoursSince>=12&&localHour>=8&&localHour<22)){
    const spontaneous=[
      `Oi! Passando por aqui só pra lembrar de tomar uma água e conferir se não ficou nenhum lançamento de hoje pra trás! 😉`,
      `Olá! O SFP tá todo em ordem por aqui. Se precisar tirar alguma dúvida ou simular uma meta, é só me chamar! ✨`,
      `Oi! Tá tudo calmo e planejado por aqui hoje. Como tá sendo seu dia? 💬`
    ];
    const text=spontaneous[Math.floor(Math.random()*spontaneous.length)];
    sophy.personaState='playful';sophy.lastProactiveAt=new Date().toISOString();
    sophy.messages.push({id:uid(),sender:'sophy',text,at:new Date().toISOString(),emotion:'playful'});
    sophy.messages=sophy.messages.slice(-50);
    return text
  }
  return null
}

"""
replace_between('function sophyCheckProactivity({force=false}={}){', 'function sfpFormatInline(str){', new_proactivity, 'proatividade Sophy')

heartbeat = r"""async function sophySendMessage(text){
  return sophyOrchestrator.sendMessage(text);
}

const SOPHY_HEARTBEAT_INTERVAL_MS=15*60*1000;
let sophyHeartbeatTimer=null,sophyHeartbeatVisibilityBound=false,sophyHeartbeatInFlight=false,sophyHeartbeatStartedAt=null;
async function sophyHeartbeatTick({force=false,notify=true}={}){
  if(sophyHeartbeatInFlight)return null;
  if(!force&&typeof document!=='undefined'&&document.visibilityState==='hidden')return null;
  sophyHeartbeatInFlight=true;
  const beforeSophy=clone(state?.sophy||{}),beforeStamp=state?.sophy?.lastProactiveAt||null;
  if(!beforeStamp&&!sophyHeartbeatStartedAt)sophyHeartbeatStartedAt=Date.now();
  try{
    const text=sophyCheckProactivity({force,baselineAt:sophyHeartbeatStartedAt});
    const afterStamp=state?.sophy?.lastProactiveAt||null,changed=beforeStamp!==afterStamp;
    if(!text&&!changed)return null;
    if(afterStamp)sophyHeartbeatStartedAt=new Date(afterStamp).getTime();
    normalize();await dbSet(state);lastSavedState=clone(state);
    if(text){
      renderSophy();
      if(notify&&typeof activePage==='function'&&activePage()!=='sophy')showFeedback('A Sophy deixou uma mensagem nova para você.',{title:'Sophy',type:'info'});
    }
    return text||null
  }catch(error){
    if(state)state.sophy=beforeSophy;
    console.error('Falha ao persistir heartbeat da Sophy:',error);
    return null
  }finally{sophyHeartbeatInFlight=false}
}
function startSophyHeartbeat(){
  if(typeof setInterval!=='function')return null;
  if(!sophyHeartbeatTimer){
    sophyHeartbeatTimer=setInterval(()=>{sophyHeartbeatTick().catch(error=>console.error('Heartbeat da Sophy:',error))},SOPHY_HEARTBEAT_INTERVAL_MS)
  }
  if(typeof document!=='undefined'&&!sophyHeartbeatVisibilityBound){
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sophyHeartbeatTick().catch(error=>console.error('Heartbeat da Sophy ao retornar:',error))});
    sophyHeartbeatVisibilityBound=true
  }
  return sophyHeartbeatTimer
}
window.sophyHeartbeatTick=sophyHeartbeatTick;
window.startSophyHeartbeat=startSophyHeartbeat;
window.SOPHY_HEARTBEAT_INTERVAL_MS=SOPHY_HEARTBEAT_INTERVAL_MS;
"""
replace_once("async function sophySendMessage(text){\n  return sophyOrchestrator.sendMessage(text);\n}\n", heartbeat, 'heartbeat Sophy')

replace_once('  sophyCheckProactivity();\n  setTimeout(showOnboarding,250);', '  await sophyHeartbeatTick({notify:false});\n  startSophyHeartbeat();\n  setTimeout(showOnboarding,250);', 'bootstrap heartbeat')

replace_once(
    "let acc=state.accounts.map(a=>`<option value=\"${a.id}\">${a.name}</option>`).join(''),cards=state.cards.map(c=>`<option value=\"${c.id}\">${c.name}</option>`).join(''),cats=CATEGORIES.map(c=>`<option>${c}</option>`).join('');\n ['txAccount','txFrom','txTo','stmtAccount','cardPayAccount','recAccount','debtAccount','goalAccount'].forEach(id=>{if($(id))$(id).innerHTML=acc});",
    "let acc=state.accounts.map(a=>`<option value=\"${a.id}\">${sfpEsc(a.name)}</option>`).join(''),transferAcc=state.accounts.map(a=>`<option value=\"${a.id}\">${sfpEsc(a.name)} • ${state.settings?.privacy?'••••':brl(accountBalance(a.id))}</option>`).join(''),cards=state.cards.map(c=>`<option value=\"${c.id}\">${sfpEsc(c.name)}</option>`).join(''),cats=CATEGORIES.map(c=>`<option>${sfpEsc(c)}</option>`).join('');\n ['txAccount','stmtAccount','cardPayAccount','recAccount','debtAccount','goalAccount'].forEach(id=>{if($(id))$(id).innerHTML=acc});\n ['txFrom','txTo'].forEach(id=>{if($(id))$(id).innerHTML=transferAcc});",
    'saldos de transferência com privacidade'
)

path.write_text(text, encoding='utf-8')
print('Patch consolidado aplicado com sucesso.')
