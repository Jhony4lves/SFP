const fs=require('fs');
const path='app/src/main/assets/www/index.html';
let s=fs.readFileSync(path,'utf8');
function mustReplace(pattern,replacement,label){const before=s;s=s.replace(pattern,replacement);if(s===before)throw new Error('Pattern not found: '+label)}

mustReplace(
/function goalBalance\(g\)\{return Math\.max\(0,\(\+g\.initialAllocated\|\|0\)\+\(g\.history\|\|\[\]\)\.reduce\(\(s,h\)=>s\+\(h\.amount\|\|0\),0\)\)\}/,
`function goalContributionEntries(g){
 const linked=(state.transfers||[]).filter(t=>t.goalId===g.id&&t.toId===g.accountId).map(t=>({id:t.goalContributionId||\`transfer:\${t.id}\`,transferId:t.id,date:t.date,amount:+t.amount||0,fromId:t.fromId,source:'transfer'}));
 const remaining=linked.map(x=>({...x,matched:false})),legacy=[];
 (g.history||[]).forEach((h,index)=>{let match=remaining.find(x=>!x.matched&&x.date===h.date&&Math.abs(x.amount-(+h.amount||0))<.01);if(match)match.matched=true;else legacy.push({id:\`legacy:\${g.id}:\${index}\`,date:h.date,amount:+h.amount||0,source:'legacy'})});
 return [...linked,...legacy].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
}
function goalBalance(g){return Math.max(0,(+g.initialAllocated||0)+goalContributionEntries(g).reduce((sum,h)=>sum+(+h.amount||0),0))}`,
'goal contribution source of truth');

mustReplace(
/window\.trashTransfer=async id=>\{let i=state\.transfers\.findIndex\(x=>x\.id===id\);if\(i>=0\)\{moveToTrash\('transfer',state\.transfers\[i\]\);state\.transfers\.splice\(i,1\);await save\('Excluir transferência'\);toast\('Transferência movida para a lixeira'\)\}\}/,
`window.trashTransfer=async id=>{let i=state.transfers.findIndex(x=>x.id===id);if(i>=0){let t=state.transfers[i];if(t.goalId){let g=state.goals.find(x=>x.id===t.goalId);if(g&&Array.isArray(g.history)){let hi=g.history.findIndex(h=>h.date===t.date&&Math.abs((+h.amount||0)-(+t.amount||0))<.01);if(hi>=0)g.history.splice(hi,1)}}moveToTrash('transfer',t);state.transfers.splice(i,1);await save('Excluir transferência');toast('Transferência movida para a lixeira')}}`,
'trash goal transfer coherence');

mustReplace(
/window\.goalTransfer=async id=>\{[\s\S]*?\};\nwindow\.editGoal=/,
`window.goalTransfer=async id=>{let g=state.goals.find(x=>x.id===id);if(!g)return;let target=g.accountId&&account(g.accountId);if(!target)return toast('A meta precisa estar vinculada a uma conta válida para receber aportes.','warning');let raw=await sfpPrompt({title:\`Aporte em \${g.name}\`,message:\`Meta alvo: \${brl(g.target)} (Acumulado: \${brl(goalBalance(g))})\\nInforme o valor do aporte:\`,defaultValue:(g.plan||0)>0?(g.plan).toFixed(2):'',placeholder:'0,00'});if(raw==null||raw==='')return;let v=parseMoney(raw);if(!(v>0))return toast('Informe um valor de aporte maior que zero.','warning');let candidates=state.accounts.filter(a=>a.id!=g.accountId);if(!candidates.length)return toast('É necessário ter outra conta disponível para financiar esta meta.','warning');let from=null;if(candidates.length===1){from=candidates[0];let ok=await sfpConfirm({title:'Confirmar conta de origem',message:\`O aporte de \${brl(v)} sairá de “\${from.name}” (saldo atual: \${brl(accountBalance(from.id))}) e irá para “\${target.name}”.\`,confirmText:'Usar esta conta',cancelText:'Cancelar'});if(!ok)return}else{let choices=candidates.map((a,i)=>\`\${i+1}. \${a.name} — saldo \${brl(accountBalance(a.id))}\`).join('\\n');let pick=await sfpPrompt({title:'Conta de origem do aporte',message:\`Escolha explicitamente a conta que será debitada:\\n\\n\${choices}\`,placeholder:\`1 a \${candidates.length}\`});if(pick==null||pick==='')return;let idx=Number(String(pick).trim())-1;if(!Number.isInteger(idx)||idx<0||idx>=candidates.length)return toast('Escolha uma conta de origem válida.','warning');from=candidates[idx]}let err=validateMoneyAction({amount:v,accountId:from.id,allowNegative:true,label:'aporte'});if(err)return toast(err,'warning');if(accountBalance(from.id)<v&&!(await sfpConfirm({title:'Saldo Negativo',message:\`Este aporte deixará a conta “\${from.name||'de origem'}” com saldo negativo (\${brl(accountBalance(from.id)-v)}).\\n\\nDeseja continuar?\`,confirmText:'Continuar',cancelText:'Cancelar',danger:true})))return;let transferId=uid(),contributionId=\`goal:\${g.id}:\${transferId}\`;state.transfers.push({id:transferId,goalContributionId:contributionId,desc:\`Aporte — \${g.name}\`,amount:v,date:localCivilDate(),fromId:from.id,toId:g.accountId,tags:['aporte'],goalId:g.id,balanceImpact:true});await save('Aportar em meta');toast(\`Aporte registrado: \${brl(v)} saiu de \${from.name}.\`,'success')};
window.editGoal=`,
'explicit goal contribution source');

mustReplace(
/const v=goalBalance\(g\),rest=Math\.max\(0,g\.target-v\),hist=\(g\.history\|\|\[\]\)\.slice\(\)\.reverse\(\);showDetail/,
`const v=goalBalance(g),rest=Math.max(0,g.target-v),hist=goalContributionEntries(g).slice().reverse();showDetail`,
'goal detail canonical history');

mustReplace(
/let obj=\{\.\.\.\(old\|\|\{\}\),id:id\|\|uid\(\),desc,amount,date,fromId:from,toId:to,tags,note,balanceImpact:true\};if\(old\)state\.transfers=state\.transfers\.map\(t=>t\.id===id\?obj:t\);else state\.transfers\.push\(obj\);await save\(old\?'Editar transferência':'Nova transferência'\)/,
`let obj={...(old||{}),id:id||uid(),desc,amount,date,fromId:from,toId:to,tags,note,balanceImpact:true};if(old?.goalId){let g=state.goals.find(x=>x.id===old.goalId);if(g&&to!==g.accountId){let unlink=await sfpConfirm({title:'Desvincular aporte da meta',message:\`Esta transferência é um aporte da meta “\${g.name}”. Alterar o destino fará o movimento deixar de contar no progresso da meta.\`,confirmText:'Desvincular e salvar',cancelText:'Cancelar',danger:true});if(!unlink)return;delete obj.goalId;delete obj.goalContributionId}else if(g){obj.goalId=g.id;obj.goalContributionId=old.goalContributionId||\`goal:\${g.id}:\${obj.id}\`}}if(old)state.transfers=state.transfers.map(t=>t.id===id?obj:t);else state.transfers.push(obj);await save(old?'Editar transferência':'Nova transferência')`,
'edit goal contribution link');

mustReplace(
/let map=\{transaction:'transactions',account:'accounts',card:'cards',recurring:'recurring',debt:'debts',goal:'goals',asset:'assets'\}/,
`let map={transaction:'transactions',transfer:'transfers',account:'accounts',card:'cards',recurring:'recurring',debt:'debts',goal:'goals',asset:'assets'}`,
'restore transfer from trash');

fs.writeFileSync(path,s);
console.log('goal integrity fixes applied');
