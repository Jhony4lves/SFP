const fs=require('node:fs');
const indexPath='app/src/main/assets/www/index.html';
const safePath='app/src/main/assets/www/safe-spend-ui.js';
let index=fs.readFileSync(indexPath,'utf8');
let safe=fs.readFileSync(safePath,'utf8');
let changed=false;

function replace(source,from,to,label){
  if(source.includes(to)){console.log(`ok ${label}`);return source;}
  if(!source.includes(from)) throw new Error(`missing source for ${label}`);
  changed=true;console.log(`patched ${label}`);return source.replace(from,to);
}

if(!index.includes('function calendarCompactAmount(value)')){
  const anchor='function renderCalendar(){';
  if(!index.includes(anchor)) throw new Error('missing calendar renderer');
  const helper=`function calendarCompactAmount(value){\n const n=Math.abs(Number(value)||0);\n if(n>=1000000)return \`${'${(n/1000000).toLocaleString(\'pt-BR\',{maximumFractionDigits:1})}'}M\`;\n if(n>=1000)return \`${'${(n/1000).toLocaleString(\'pt-BR\',{maximumFractionDigits:n>=100000?0:1})}'}k\`;\n return Math.round(n).toLocaleString('pt-BR');\n}\n`;
  index=index.replace(anchor,helper+anchor);changed=true;console.log('patched calendar compact helper');
}

const oldCalendar=`    h+=\`<button type="button" class="day\${e.length?' has-events':''}" onclick="openCalendarDay('\${ds}')" aria-label="\${label}"><div class="daytop"><span class="daynum">\${d}</span>\${dots?\`<div class="cal-indicators">\${dots}</div>\`:''}</div>\${inc?\`<span class="cal-flow inc">+ \${brl(inc)}</span>\`:''}\${exp?\`<span class="cal-flow exp">− \${brl(exp)}</span>\`:''}\${e.length?\`<span class="cal-count">\${e.length} \${e.length===1?'evento':'eventos'}</span>\`:''}</button>\``;
const newCalendar=`    h+=\`<button type="button" class="day\${e.length?' has-events':''}" onclick="openCalendarDay('\${ds}')" aria-label="\${sfpEsc(label)}"><div class="daytop"><span class="daynum">\${d}</span>\${dots?\`<div class="cal-indicators">\${dots}</div>\`:''}</div>\${inc?\`<span class="cal-flow inc" title="\${sfpEsc('+ '+brl(inc))}"><span class="cal-flow-full" aria-hidden="true">+ \${brl(inc)}</span><span class="cal-flow-compact" aria-hidden="true">+\${calendarCompactAmount(inc)}</span></span>\`:''}\${exp?\`<span class="cal-flow exp" title="\${sfpEsc('− '+brl(exp))}"><span class="cal-flow-full" aria-hidden="true">− \${brl(exp)}</span><span class="cal-flow-compact" aria-hidden="true">−\${calendarCompactAmount(exp)}</span></span>\`:''}\${e.length?\`<span class="cal-count">\${e.length} \${e.length===1?'evento':'eventos'}</span>\`:''}</button>\``;
index=replace(index,oldCalendar,newCalendar,'calendar exact/compact amounts');

const oldSafe=`    return events.slice(0,10).map(event=>{const sign=event.type==='income'?'+':'−';return \`<div class="safe-spend-event" data-type="\${escapeHtml(event.type)}"><span class="safe-spend-event-date">\${escapeHtml(datePt(event.date))}</span><span class="safe-spend-event-desc" data-money>\${sign} \${money(event.amountCents)} · \${escapeHtml(event.origin||'evento')}</span><span class="safe-spend-event-balance" data-money>\${money(event.balanceCents)}</span></div>\`;}).join('')+(events.length>10?\`<small class="muted">+ \${events.length-10} evento(s) na projeção.</small>\`:'');`;
const newSafe=`    return events.slice(0,10).map(event=>{const sign=event.type==='income'?'+':'−',detail=\`${'${sign} ${money(event.amountCents)} · ${event.origin||\'evento\'}'}\`;return \`<div class="safe-spend-event" data-type="\${escapeHtml(event.type)}"><span class="safe-spend-event-date">\${escapeHtml(datePt(event.date))}</span><span class="safe-spend-event-desc" data-money title="\${escapeHtml(detail)}">\${escapeHtml(detail)}</span><span class="safe-spend-event-balance" data-money>\${money(event.balanceCents)}</span></div>\`;}).join('')+(events.length>10?\`<small class="muted">+ \${events.length-10} evento(s) na projeção.</small>\`:'');`;
safe=replace(safe,oldSafe,newSafe,'safe-spend full event title');

if(changed){
  fs.writeFileSync(indexPath,index);
  fs.writeFileSync(safePath,safe);
  console.log('P1/P2 layout source fixes applied.');
}else console.log('P1/P2 layout source fixes already present.');
