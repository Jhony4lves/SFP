from pathlib import Path
import re

path=Path('app/src/main/assets/www/index.html')
text=path.read_text(encoding='utf-8')

script_old='''<script src="safe-spend.js"></script>\n<script src="safe-spend-ui.js"></script>\n<script>'''
script_new='''<script src="safe-spend.js"></script>\n<script src="safe-spend-ui.js"></script>\n<script src="sophy-proactive-brief.js"></script>\n<script>'''
if text.count(script_old)!=1:
    raise SystemExit(f'Anchor scripts inválido: {text.count(script_old)}')
text=text.replace(script_old,script_new,1)

new_function=r'''function sophyCheckProactivity({force=false,baselineAt=null}={}){
  if(!state?.sophy)normalize();
  const sophy=state.sophy;
  if(!sophy.settings?.proactivityEnabled&&!force)return null;
  const now=Date.now(),baseline=Number(baselineAt);
  if(!sophy.lastProactiveAt&&!force&&!Number.isFinite(baseline))return null;
  if(!sophy.introDone&&!force)return null;
  const lastAt=sophy.lastProactiveAt?new Date(sophy.lastProactiveAt).getTime():(Number.isFinite(baseline)?baseline:now),hoursSince=(now-lastAt)/(1000*60*60);
  if(!force&&hoursSince<4)return null;

  const recentFingerprint=(fingerprint,hours=24)=>{
    if(!fingerprint)return false;
    const match=[...(sophy.messages||[])].reverse().find(m=>m?.proactiveFingerprint===fingerprint&&m?.at);
    if(!match)return false;
    const at=new Date(match.at).getTime();
    return Number.isFinite(at)&&(now-at)<hours*60*60*1000;
  };
  const pushProactive=(text,{mood='cheerful',fingerprint=null,source='deterministic',priority='info',evidence=[],briefVersion=null}={})=>{
    if(!text)return null;
    const at=new Date().toISOString();
    sophy.personaState=SOPHY_PERSONAS[mood]?mood:'cheerful';
    sophy.lastProactiveAt=at;
    sophy.messages=sophy.messages||[];
    sophy.messages.push({id:uid(),sender:'sophy',text,at,emotion:sophy.personaState,proactive:true,proactiveFingerprint:fingerprint,proactiveSource:source,proactivePriority:priority,proactiveEvidence:clone(evidence||[]),proactiveBriefVersion:briefVersion});
    sophy.messages=sophy.messages.slice(-50);
    return text;
  };

  let brief=null;
  try{
    if(typeof window.sophyProactiveBriefSnapshot==='function')brief=window.sophyProactiveBriefSnapshot({force});
  }catch(error){
    console.warn('Brief proativo da Sophy indisponível:',error);
  }

  if(brief&&(force||brief.shouldNotify)){
    if(force||!recentFingerprint(brief.fingerprint,24)){
      return pushProactive(brief.message,{mood:brief.mood,fingerprint:brief.fingerprint,source:brief.source,priority:brief.priority,evidence:brief.evidence,briefVersion:brief.version});
    }
  }

  const completedGoal=(state.goals||[]).find(g=>g.target>0&&goalBalance(g)>=g.target);
  if(completedGoal){
    const balance=goalBalance(completedGoal),fingerprint=`goal-complete:${completedGoal.id||completedGoal.name}:${Math.round(balance*100)}`;
    if(!recentFingerprint(fingerprint,24)){
      const text=`🎉 Parabéns! Sua meta **${completedGoal.name}** atingiu 100% da reserva (${brl(balance)})!`;
      return pushProactive(text,{mood:'proud',fingerprint,source:'goal_completed',priority:'info',evidence:[{label:'Meta',value:completedGoal.name},{label:'Reserva',value:brl(balance)}]});
    }
  }

  let nextInc=null;
  try{nextInc=typeof financialContextSnapshot==='function'?financialContextSnapshot({months:3}).nextIncome:null}catch(error){}
  const today=localCivilDate(new Date()),tomorrowRef=new Date();tomorrowRef.setDate(tomorrowRef.getDate()+1);const tomorrow=localCivilDate(tomorrowRef);
  if(nextInc&&(nextInc.date===today||nextInc.date===tomorrow)){
    const amount=(Number(nextInc.amountCents)||0)/100,fingerprint=`next-income:${nextInc.date}:${Math.round((Number(nextInc.amountCents)||0))}:${nextInc.id||nextInc.desc||''}`;
    if(!recentFingerprint(fingerprint,24)){
      const isToday=nextInc.date===today,hour=new Date().getHours(),greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
      const text=isToday?`${greeting}! Hoje há uma entrada conhecida: **${nextInc.desc||'Recebimento'}** (${brl(amount)}). Vale conferir quando cair na conta.`:`Amanhã há uma entrada conhecida de **${nextInc.desc||'Recebimento'}** (${brl(amount)}). Ela já está considerada pelo Local Financial Core.`;
      return pushProactive(text,{mood:'cheerful',fingerprint,source:'next_income',priority:'info',evidence:[{label:'Data',value:nextInc.date},{label:'Valor',value:brl(amount)}]});
    }
  }

  if(force){
    return pushProactive('**Brief financeiro:** os motores determinísticos estão temporariamente indisponíveis. Não vou inventar uma análise até conseguir ler o Local Financial Core.',{mood:'focused',fingerprint:'brief-unavailable',source:'brief_unavailable',priority:'info'});
  }
  return null
}'''

pattern=r"function sophyCheckProactivity\(\{force=false,baselineAt=null\}=\{\}\)\{.*?\n\}\n\nlet sophyHeartbeatTimer="
match=re.search(pattern,text,flags=re.S)
if not match:
    raise SystemExit('Função sophyCheckProactivity não encontrada pelo contrato esperado')
text=text[:match.start()]+new_function+'\n\nlet sophyHeartbeatTimer='+text[match.end():]

render_old="renderSophy();applyPrivacy();formatMoneyInputs()"
render_new="renderSophy();if(typeof renderSophyProactiveBrief==='function')renderSophyProactiveBrief();applyPrivacy();formatMoneyInputs()"
if text.count(render_old)!=1:
    raise SystemExit(f'Anchor renderAll inválido: {text.count(render_old)}')
text=text.replace(render_old,render_new,1)

page_old=" document.body.classList.toggle('page-sophy',id==='sophy');\n updateContextFab();"
page_new=" document.body.classList.toggle('page-sophy',id==='sophy');\n if(id==='sophy'&&typeof renderSophyProactiveBrief==='function'){renderSophyProactiveBrief();if(typeof applyPrivacy==='function')applyPrivacy()}\n updateContextFab();"
if text.count(page_old)!=1:
    raise SystemExit(f'Anchor setPage inválido: {text.count(page_old)}')
text=text.replace(page_old,page_new,1)

path.write_text(text,encoding='utf-8')
print('Sophy proactive brief integrado com sucesso.')
