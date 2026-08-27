from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
s = path.read_text(encoding='utf-8')

old_income = """  const nextInc=nextIncomeEvent(),today=localCivilDate();
  if(nextInc&&(nextInc.date===today||nextInc.date===monthAdd(today,0))){
    const isToday=nextInc.date===today;
    const text=isToday?`Bom dia! Hoje é dia de recebimento: **${nextInc.desc}** (${brl(nextInc.amount)})! 💰 Não esqueça de conferir a entrada na sua conta!`:`Oi! Amanhã tem previsão de recebimento de **${nextInc.desc}** (${brl(nextInc.amount)}). Seu planejamento tá no rumo certo!`;
    sophy.personaState='cheerful';sophy.lastProactiveAt=new Date().toISOString();
    sophy.messages.push({id:uid(),sender:'sophy',text,at:new Date().toISOString(),emotion:'cheerful'});
    sophy.messages=sophy.messages.slice(-50);
    return text
  }
"""
new_income = """  const nextInc=nextIncomeEvent(),today=localCivilDate(),tomorrowRef=new Date();
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
"""
if s.count(old_income) != 1:
    raise SystemExit(f'income block: expected 1 match, got {s.count(old_income)}')
s = s.replace(old_income, new_income, 1)

old_spontaneous = "  if(force||hoursSince>=12){"
new_spontaneous = "  const localHour=new Date().getHours();\n  if(force||(hoursSince>=12&&localHour>=8&&localHour<22)){"
if s.count(old_spontaneous) != 1:
    raise SystemExit(f'spontaneous gate: expected 1 match, got {s.count(old_spontaneous)}')
s = s.replace(old_spontaneous, new_spontaneous, 1)

marker = "\nwindow.sophySendMessage=sophySendMessage;"
heartbeat = r'''
const SOPHY_HEARTBEAT_INTERVAL_MS=15*60*1000;
let sophyHeartbeatTimer=null,sophyHeartbeatVisibilityBound=false,sophyHeartbeatInFlight=false;
async function sophyHeartbeatTick({force=false,notify=true}={}){
  if(sophyHeartbeatInFlight)return null;
  if(!force&&typeof document!=='undefined'&&document.visibilityState==='hidden')return null;
  sophyHeartbeatInFlight=true;
  const beforeSophy=clone(state?.sophy||{}),beforeStamp=state?.sophy?.lastProactiveAt||null;
  try{
    const text=sophyCheckProactivity({force});
    const afterStamp=state?.sophy?.lastProactiveAt||null,changed=beforeStamp!==afterStamp;
    if(!text&&!changed)return null;
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
'''
if s.count(marker) != 1:
    raise SystemExit(f'heartbeat marker: expected 1 match, got {s.count(marker)}')
s = s.replace(marker, '\n'+heartbeat+"window.sophySendMessage=sophySendMessage;", 1)

old_init = "  sophyCheckProactivity();\n  setTimeout(showOnboarding,250);"
new_init = "  await sophyHeartbeatTick({notify:false});\n  startSophyHeartbeat();\n  setTimeout(showOnboarding,250);"
if s.count(old_init) != 1:
    raise SystemExit(f'init heartbeat: expected 1 match, got {s.count(old_init)}')
s = s.replace(old_init, new_init, 1)

path.write_text(s, encoding='utf-8')
print('Sophy heartbeat patch applied')
