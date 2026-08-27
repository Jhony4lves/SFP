from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
s = path.read_text(encoding='utf-8')

old = "function sophyCheckProactivity({force=false}={}){\n  if(!state?.sophy)normalize();\n  const sophy=state.sophy;\n  if(!sophy.settings?.proactivityEnabled&&!force)return null;\n  if(!sophy.lastProactiveAt){\n    sophy.lastProactiveAt=new Date().toISOString();\n    if(!force)return null;\n  }\n  if(!sophy.introDone&&!force)return null;\n  const now=Date.now(),lastAt=new Date(sophy.lastProactiveAt).getTime(),hoursSince=(now-lastAt)/(1000*60*60);"
new = "function sophyCheckProactivity({force=false,baselineAt=null}={}){\n  if(!state?.sophy)normalize();\n  const sophy=state.sophy;\n  if(!sophy.settings?.proactivityEnabled&&!force)return null;\n  const now=Date.now(),baseline=Number(baselineAt);\n  if(!sophy.lastProactiveAt&&!force&&!Number.isFinite(baseline))return null;\n  if(!sophy.introDone&&!force)return null;\n  const lastAt=sophy.lastProactiveAt?new Date(sophy.lastProactiveAt).getTime():(Number.isFinite(baseline)?baseline:now),hoursSince=(now-lastAt)/(1000*60*60);"
if s.count(old) != 1:
    raise SystemExit(f'sophyCheckProactivity header: expected 1 match, got {s.count(old)}')
s = s.replace(old, new, 1)

old = "let sophyHeartbeatTimer=null,sophyHeartbeatVisibilityBound=false,sophyHeartbeatInFlight=false;\nasync function sophyHeartbeatTick({force=false,notify=true}={}){\n  if(sophyHeartbeatInFlight)return null;\n  if(!force&&typeof document!=='undefined'&&document.visibilityState==='hidden')return null;\n  sophyHeartbeatInFlight=true;\n  const beforeSophy=clone(state?.sophy||{}),beforeStamp=state?.sophy?.lastProactiveAt||null;\n  try{\n    const text=sophyCheckProactivity({force});\n    const afterStamp=state?.sophy?.lastProactiveAt||null,changed=beforeStamp!==afterStamp;\n    if(!text&&!changed)return null;"
new = "let sophyHeartbeatTimer=null,sophyHeartbeatVisibilityBound=false,sophyHeartbeatInFlight=false,sophyHeartbeatStartedAt=null;\nasync function sophyHeartbeatTick({force=false,notify=true}={}){\n  if(sophyHeartbeatInFlight)return null;\n  if(!force&&typeof document!=='undefined'&&document.visibilityState==='hidden')return null;\n  sophyHeartbeatInFlight=true;\n  const beforeSophy=clone(state?.sophy||{}),beforeStamp=state?.sophy?.lastProactiveAt||null;\n  if(!beforeStamp&&!sophyHeartbeatStartedAt)sophyHeartbeatStartedAt=Date.now();\n  try{\n    const text=sophyCheckProactivity({force,baselineAt:sophyHeartbeatStartedAt});\n    const afterStamp=state?.sophy?.lastProactiveAt||null,changed=beforeStamp!==afterStamp;\n    if(!text&&!changed)return null;\n    if(afterStamp)sophyHeartbeatStartedAt=new Date(afterStamp).getTime();"
if s.count(old) != 1:
    raise SystemExit(f'heartbeat tick block: expected 1 match, got {s.count(old)}')
s = s.replace(old, new, 1)

path.write_text(s, encoding='utf-8')
print('safe Sophy heartbeat persistence patch applied')
