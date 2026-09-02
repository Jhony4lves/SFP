const fs=require('fs');
const path='app/src/main/assets/www/index.html';
let s=fs.readFileSync(path,'utf8');
function mustReplace(pattern,replacement,label){const before=s;s=s.replace(pattern,replacement);if(s===before)throw new Error('Pattern not found: '+label)}

mustReplace(
/function debtMonths\(d\)\{let b=d\.balance,r=debtMonthlyRate\(d\.rate,d\.ratePeriod\),p=d\.payment,m=0;if\(p<=b\*r\)return 999;while\(b>0&&m<999\)\{b=b\*\(1\+r\)-p;m\+\+\}return m\}/,
`function debtProjection(d,{horizon=600}={}){let balance=+d.balance||0,payment=+d.payment||0,rate=debtMonthlyRate(d.rate,d.ratePeriod);if(!(balance>0))return{status:'ok',months:0};if(!(payment>0))return{status:'not_converged',months:null};if(payment<=balance*rate+.000001)return{status:'not_converged',months:null};let months=0;while(balance>.005&&months<horizon){let interest=balance*rate;balance=balance+interest-payment;months++}return balance<=.005?{status:'ok',months}:{status:'beyond_horizon',months:null,horizon}}
function debtMonths(d){return debtProjection(d).months}
function debtMonthsLabel(d){let p=debtProjection(d);if(p.status==='ok')return p.months===1?'1 mês estimado':\`${p.months} meses estimados\`;if(p.status==='not_converged')return 'Parcela não amortiza a dívida';return 'Prazo fora do horizonte calculável'}
function debtPaymentBreakdown(d,previousBalance,payment=d.payment){let balance=Math.max(0,+previousBalance||0),requested=Math.max(0,+payment||0),method=d.amortizationMethod||'manual',interest=method==='price'?Math.round(balance*debtMonthlyRate(d.rate,d.ratePeriod)*100)/100:0,applied=Math.min(requested,Math.round((balance+interest)*100)/100);if(!(applied>0))return null;let principal=Math.max(0,Math.round((applied-interest)*100)/100);if(method==='price'&&principal<=0)return{nonAmortizing:true,interest,principal:0,payment:applied,newBalance:balance};if(method!=='price'){interest=0;principal=Math.min(balance,applied)}let newBalance=Math.max(0,Math.round((balance-principal)*100)/100);return{nonAmortizing:false,interest,principal,payment:applied,newBalance}}
async function debtCashAccount(d,amount,title='Pagamento de dívida'){let preferred=d.accountId&&account(d.accountId);if(preferred)return preferred;let candidates=state.accounts||[];if(!candidates.length){toast('Cadastre uma conta para registrar a saída de caixa desta dívida.','warning');return null}if(candidates.length===1){let ok=await sfpConfirm({title,message:\`A saída de \${brl(amount)} será registrada na conta “\${candidates[0].name}”.\`,confirmText:'Usar esta conta',cancelText:'Cancelar'});return ok?candidates[0]:null}let choices=candidates.map((a,i)=>\`\${i+1}. \${a.name} — saldo \${brl(accountBalance(a.id))}\`).join('\\n'),pick=await sfpPrompt({title,message:\`Escolha a conta que será debitada:\\n\\n\${choices}\`,placeholder:\`1 a \${candidates.length}\`});if(pick==null||pick==='')return null;let idx=Number(String(pick).trim())-1;if(!Number.isInteger(idx)||idx<0||idx>=candidates.length){toast('Escolha uma conta válida.','warning');return null}return candidates[idx]}`,
'debt projection and payment breakdown');

mustReplace(
/debtDueForMonth\(m\)\.forEach\(d=>out\.push\(\{date:d\.date,desc:`Consignado — \$\{d\.debt\.name\} \(\$\{d\.n\}\/\$\{d\.total\}\)`,amount:d\.amount,type:'expense',status:d\.status,source:'payroll',sourceId:`\$\{d\.debt\.id\}:\$\{d\.n\}`,debtId:d\.debt\.id\}\)\);/,
`debtDueForMonth(m).forEach(d=>{let payroll=d.paymentMethod==='payroll';out.push({date:d.date,desc:\`${payroll?'Consignado':'Dívida'} — \${d.debt.name} (\${d.n}/\${d.total})\`,amount:d.amount,type:'expense',status:d.status,source:payroll?'payroll':'debt',sourceId:\`\${d.debt.id}:\${d.n}\`,debtId:d.debt.id,accountId:payroll?null:d.debt.accountId})});`,
'debt event source');

mustReplace(
/let out=\[\];\[\.\.\.txInMonth\(m\),\.\.\.recurringOccurrences\(m\)\]\.forEach\(t=>out\.push\(\{date:t\.date,desc:t\.desc,amount:t\.amount,type:t\.kind,status:t\.status,source:t\.virtual\?'recurring':'tx',sourceId:t\.id,accountId:t\.accountId\}\)\);/,
`let out=[];[...txInMonth(m),...recurringOccurrences(m)].filter(t=>t.economicImpact!=='neutral').forEach(t=>out.push({date:t.date,desc:t.desc,amount:t.amount,type:t.kind,status:t.status,source:t.virtual?'recurring':'tx',sourceId:t.id,accountId:t.accountId}));`,
'hide neutral cash mirrors from due events');

mustReplace(
/let map=\{\};\[\.\.\.txInMonth\(m\),\.\.\.recurringOccurrences\(m\)\]\.filter\(t=>t\.kind==='expense'\)\.forEach\(t=>map\[t\.category\]=\(map\[t\.category\]\|\|0\)\+t\.amount\);/,
`let map={};[...txInMonth(m),...recurringOccurrences(m)].filter(t=>t.kind==='expense'&&t.economicImpact!=='neutral').forEach(t=>map[t.category]=(map[t.category]||0)+t.amount);`,
'avoid duplicate debt category spending');

mustReplace(
/window\.amortize=async id=>\{[\s\S]*?\}\nwindow\.payDebtInstallment=async id=>\{[\s\S]*?\n\}/,
`window.amortize=async id=>{let d=state.debts.find(x=>x.id===id);if(!d)return;let raw=await sfpPrompt({title:\`Amortizar \${d.name}\`,message:\`Saldo devedor atual: \${brl(d.balance)}\\nInforme o valor extra a amortizar:\`,placeholder:'0,00'});if(raw==null||raw==='')return;let requested=parseMoney(raw);if(!(requested>0))return toast('Informe um valor de amortização maior que zero.','warning');let v=Math.min(requested,+d.balance||0);if(!(v>0))return toast('Esta dívida já está quitada.','warning');let from=await debtCashAccount(d,v,'Conta para amortização');if(!from)return;if(accountBalance(from.id)<v&&!(await sfpConfirm({title:'Saldo Negativo',message:\`A amortização deixará “\${from.name}” com saldo negativo (\${brl(accountBalance(from.id)-v)}). Deseja continuar?\`,confirmText:'Continuar',cancelText:'Cancelar',danger:true})))return;let paymentId=uid(),date=localCivilDate();state.transactions.push({id:uid(),kind:'expense',desc:\`Amortização — \${d.name}\`,amount:v,date,category:'Dívida',accountId:from.id,status:'paid',dueDay:+date.slice(8,10),tags:['dívida','amortização'],note:'Saída de caixa vinculada à amortização de principal.',balanceImpact:true,economicImpact:'neutral',debtId:d.id,debtPaymentId:paymentId,createdAt:Date.now()});d.balance=Math.max(0,Math.round((d.balance-v)*100)/100);d.history??=[];d.history.push({id:paymentId,date,type:'extra',amount:v,principal:v,interest:0,accountId:from.id});await save('Amortizar dívida');toast(\`Amortização de \${brl(v)} registrada em \${from.name}.\`,'success')}
window.payDebtInstallment=async id=>{
 let d=state.debts.find(x=>x.id===id);if(!d)return;
 let due=debtDueForMonth(state.mesAtual).find(x=>x.debt.id===id);if(!due)return toast('Não há parcela prevista dessa dívida neste mês.');
 if(due.status==='paid')return toast('Essa parcela já está marcada como paga.');
 if((d.paidInstallments||0)>=d.installments)return toast('Todas as parcelas dessa dívida já foram pagas.');
 let previousBalance=+d.balance||0,breakdown=debtPaymentBreakdown(d,previousBalance,d.payment);if(!breakdown)return toast('A parcela desta dívida é inválida.','warning');if(breakdown.nonAmortizing)return toast('A parcela informada não cobre os juros do período e não amortiza a dívida. Revise o contrato.','warning');let from=null,cashTxId=null,date=localCivilDate(),paymentId=uid();if((d.paymentMethod||'bank')!=='payroll'){from=await debtCashAccount(d,breakdown.payment,'Conta para pagamento da dívida');if(!from)return;if(accountBalance(from.id)<breakdown.payment&&!(await sfpConfirm({title:'Saldo Negativo',message:\`O pagamento deixará “\${from.name}” com saldo negativo (\${brl(accountBalance(from.id)-breakdown.payment)}). Deseja continuar?\`,confirmText:'Continuar',cancelText:'Cancelar',danger:true})))return;cashTxId=uid();state.transactions.push({id:cashTxId,kind:'expense',desc:\`Pagamento — \${d.name}\`,amount:breakdown.payment,date,category:'Dívida',accountId:from.id,status:'paid',dueDay:+date.slice(8,10),tags:['dívida'],note:'Saída de caixa vinculada a pagamento de dívida; impacto econômico reconhecido pelo cronograma da dívida.',balanceImpact:true,economicImpact:'neutral',debtId:d.id,debtPaymentId:paymentId,createdAt:Date.now()})}
 d.history??=[];d.history.push({id:paymentId,date,type:'payment',installment:due.n,amount:breakdown.payment,principal:breakdown.principal,interest:breakdown.interest,method:d.paymentMethod||'bank',accountId:from?.id||null,cashTxId});
 let paymentCount=d.history.filter(h=>h.type==='payment').length;d.paidInstallments=Math.min(d.installments,Math.max((d.paidInstallments||0)+1,paymentCount));d.balance=breakdown.newBalance;
 await save('Registrar parcela da dívida');toast((d.paymentMethod==='payroll'?\`Parcela \${due.n}/\${due.total} registrada como descontada em folha.\`:\`Parcela \${due.n}/\${due.total} paga por \${from.name}: \${brl(breakdown.payment)} (principal \${brl(breakdown.principal)} + juros \${brl(breakdown.interest)}).\`),'success')
}`,
'debt cash and principal integrity');

mustReplace(
/\$\{debtMonths\(d\)\} meses estimados/,
`${'${debtMonthsLabel(d)}'}`,
'debt detail projection label');

mustReplace(
/\$\('simDebtBtn'\)\.onclick=\(\)=>\{[\s\S]*?\};\n \$\('simGoalBtn'\)\.onclick=\(\)=>\{[\s\S]*?\};/,
`$('simDebtBtn').onclick=()=>{let b=+$('simDebtBalance').value,r=+$('simDebtRate').value/100,p=+$('simDebtPayment').value,x=+$('simDebtExtra').value;if(!b||!p)return toast('Preencha saldo e parcela');let run=pay=>{let bal=b,m=0,int=0;if(pay<=bal*r)return{status:'not_converged',m:null,int:null};while(bal>0&&m<600){let j=bal*r;int+=j;bal=bal+j-pay;m++}return bal<=0?{status:'ok',m,int}:{status:'beyond_horizon',m:null,int:null}};let n=run(p),f=run(p+x);$('simDebtRes').classList.remove('hidden');if(n.status!=='ok'){$('simDebtRes').textContent=n.status==='not_converged'?'A parcela não cobre os juros iniciais; a dívida não converge com esses parâmetros.':'O prazo ficou fora do horizonte calculável.';return}let extra=f.status==='ok'?\`Com extra: <b>\${f.m}</b> meses.<br>Economia estimada de juros: <b>\${brl(Math.max(0,n.int-f.int))}</b>.\`:'Com o extra informado, o cenário ficou fora do horizonte calculável.';$('simDebtRes').innerHTML=\`Prazo normal: <b>\${n.m}</b> meses.<br>\${extra}\`};
 $('simGoalBtn').onclick=()=>{let target=+$('simGoalTarget').value,v=+$('simGoalInitial').value,m=+$('simGoalMonthly').value,r=+$('simGoalRate').value/100,n=0,paid=0;if(!target||!m)return toast('Preencha objetivo e aporte');while(v<target&&n<600){v=(v+m)*(1+r);paid+=m;n++}$('simGoalRes').classList.remove('hidden');if(v<target){$('simGoalRes').textContent='A meta ficou fora do horizonte calculável com estes parâmetros.';return}$('simGoalRes').innerHTML=\`Tempo estimado: <b>\${n}</b> meses.<br>Aportes: <b>\${brl(paid)}</b>.<br>Rendimentos estimados: <b>\${brl(Math.max(0,v-paid-(+$('simGoalInitial').value||0)))}</b>.\`};`,
'simulator explicit non-convergence');

fs.writeFileSync(path,s);
console.log('debt integrity fixes applied');
