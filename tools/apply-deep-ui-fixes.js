const fs = require('node:fs');

const indexPath='app/src/main/assets/www/index.html';
const briefPath='app/src/main/assets/www/sophy-proactive-brief.js';
const safePath='app/src/main/assets/www/safe-spend-ui.js';
const insightsPath='app/src/main/assets/www/financial-insights-ui.js';
let index=fs.readFileSync(indexPath,'utf8');
let brief=fs.readFileSync(briefPath,'utf8');
let safe=fs.readFileSync(safePath,'utf8');
let insights=fs.readFileSync(insightsPath,'utf8');
let changed=false;

function replaceOne(source,oldText,newText,label){
  if(source.includes(newText))return source;
  if(!source.includes(oldText)){console.log(`skip ${label}: source already differs`);return source;}
  changed=true;console.log(`patched ${label}`);return source.replace(oldText,newText);
}

if(!index.includes('href="ui-hardening.css"')){
  if(!index.includes('</head>')) throw new Error('index.html missing </head>');
  index=index.replace('</head>','<link rel="stylesheet" href="ui-hardening.css"/>\n</head>');changed=true;
}
if(!index.includes('src="ui-hardening.js"')){
  if(!index.includes('</body>')) throw new Error('index.html missing </body>');
  index=index.replace('</body>','<script src="ui-hardening.js"></script>\n</body>');changed=true;
}

for(const rx of [
  /body\s*,\s*main\s*\{\s*overflow-x\s*:\s*hidden\s*!important\s*;?\s*\}/gi,
  /body\s*,\s*main\s*\{\s*overflow-x\s*:\s*hidden\s*;?\s*\}/gi,
  /body\s*\{\s*overflow-x\s*:\s*hidden\s*!important\s*;?\s*\}\s*main\s*\{\s*overflow-x\s*:\s*hidden\s*!important\s*;?\s*\}/gi
]){const next=index.replace(rx,'');if(next!==index){index=next;changed=true;}}

index=replaceOne(index,`#privacyToggle, #notifBellBtn{
    width:36px!important;height:36px!important;min-height:36px!important;
    padding:0!important;display:inline-flex!important;align-items:center!important;
    justify-content:center!important;border-radius:10px!important;flex-shrink:0!important;
  }`,`#privacyToggle, #notifBellBtn{
    width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;
    padding:0!important;display:inline-flex!important;align-items:center!important;
    justify-content:center!important;border-radius:10px!important;flex-shrink:0!important;
  }`,'top quick actions');

index=replaceOne(index,`.sfp-dialog-close,
.sfp-dialog-head .icon-button {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  max-width: 36px !important;
  max-height: 36px !important;`,`.sfp-dialog-close,
.sfp-dialog-head .icon-button {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
  max-width: 44px !important;
  max-height: 44px !important;`,'dialog close target');

index=replaceOne(index,`.month-selector-bar{
    height:36px!important;min-height:36px!important;padding:2px 4px!important;`,`.month-selector-bar{
    height:44px!important;min-height:44px!important;padding:0 4px!important;`,'month selector bar');
index=replaceOne(index,`.month-selector-bar .month-nav-btn{
    height:28px!important;min-height:28px!important;width:28px!important;
    padding:0!important;`,`.month-selector-bar .month-nav-btn{
    height:44px!important;min-height:44px!important;width:44px!important;min-width:44px!important;
    padding:0!important;`,'month navigation target');

brief=replaceOne(brief,'@media(orientation:landscape) and (max-height:520px){.sophy-proactive-brief{display:none!important}}','@media(orientation:landscape) and (max-height:520px){.sophy-proactive-brief{padding:6px 9px;gap:5px}.sophy-brief-head p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sophy-brief-evidence{max-height:38px;overflow:auto}.sophy-brief-detail{max-height:76px;overflow:auto}}','Sophy landscape brief');
brief=replaceOne(brief,'.sophy-brief-head p{margin:2px 0 0;color:var(--color-text-secondary);font-size:9.8px;line-height:1.4}', '.sophy-brief-head p{margin:2px 0 0;color:var(--color-text-secondary);font-size:11px;line-height:1.4}','Sophy brief summary font');
brief=replaceOne(brief,'.sophy-brief-evidence span{font-size:9px;', '.sophy-brief-evidence span{font-size:11px;','Sophy brief evidence font');
brief=replaceOne(brief,'.sophy-brief-foot details{min-width:0;flex:1;color:var(--color-text-secondary);font-size:9px}', '.sophy-brief-foot details{min-width:0;flex:1;color:var(--color-text-secondary);font-size:11px}','Sophy brief details font');
brief=replaceOne(brief,'.sophy-brief-actions button{min-height:30px;padding:5px 9px;font-size:9.5px}', '.sophy-brief-actions button{min-height:44px;padding:8px 10px;font-size:11px}','Sophy brief action target');
brief=replaceOne(brief,'.sophy-brief-detail{display:none;border-top:1px solid var(--color-border);padding-top:8px;white-space:pre-line;color:var(--color-text-secondary);font-size:9.5px;', '.sophy-brief-detail{display:none;border-top:1px solid var(--color-border);padding-top:8px;white-space:pre-line;color:var(--color-text-secondary);font-size:11px;','Sophy detail font');

for(const [from,to,label] of [
  ['.safe-spend-eyebrow{font-size:9px;','.safe-spend-eyebrow{font-size:11px;','safe spend eyebrow'],
  ['.safe-spend-equation small{display:block;color:var(--color-text-muted);font-size:8.5px;','.safe-spend-equation small{display:block;color:var(--color-text-muted);font-size:11px;','safe spend equation labels'],
  ['.safe-spend-projection-head small{display:block;font-size:9.5px;','.safe-spend-projection-head small{display:block;font-size:11px;','safe spend projection meta'],
  ['.safe-spend-min{font-size:10px;','.safe-spend-min{font-size:11px;','safe spend minimum meta'],
  ['border:1px solid var(--color-border);font-size:9.5px}', 'border:1px solid var(--color-border);font-size:11px}','safe spend event text'],
  ['.safe-spend-foot p{margin:0;color:var(--color-text-secondary);font-size:9.5px;', '.safe-spend-foot p{margin:0;color:var(--color-text-secondary);font-size:11px;','safe spend foot text'],
  ['.safe-spend-foot button{min-height:34px;padding:6px 10px;font-size:10px;', '.safe-spend-foot button{min-height:44px;padding:8px 10px;font-size:11px;','safe spend action target']
]) safe=replaceOne(safe,from,to,label);

for(const [from,to,label] of [
  ['.financial-insight-copy p{margin:3px 0 0;color:var(--color-text-secondary);font-size:10.5px;', '.financial-insight-copy p{margin:3px 0 0;color:var(--color-text-secondary);font-size:11px;','insight body font'],
  ['.financial-insight-severity{font-size:8.5px;', '.financial-insight-severity{font-size:11px;','insight severity font'],
  ['.financial-insight-evidence{font-size:10px;', '.financial-insight-evidence{font-size:11px;','insight evidence font'],
  ['.financial-insight-details summary{cursor:pointer;color:var(--color-text-secondary);font-size:10px;', '.financial-insight-details summary{cursor:pointer;color:var(--color-text-secondary);font-size:11px;','insight summary font'],
  ['.financial-insight-details p{margin:7px 0 0;font-size:10px;', '.financial-insight-details p{margin:7px 0 0;font-size:11px;','insight detail font'],
  ['.financial-insight-actions button{min-height:34px;padding:6px 10px;font-size:10px}', '.financial-insight-actions button{min-height:44px;padding:8px 10px;font-size:11px}','insight action target'],
  ['.financial-insights-empty small{display:block;margin-top:2px;color:var(--color-text-secondary);font-size:10px}', '.financial-insights-empty small{display:block;margin-top:2px;color:var(--color-text-secondary);font-size:11px}','insight empty font']
]) insights=replaceOne(insights,from,to,label);

if(changed){
  fs.writeFileSync(indexPath,index);fs.writeFileSync(briefPath,brief);fs.writeFileSync(safePath,safe);fs.writeFileSync(insightsPath,insights);
  console.log('Applied deep UI audit fixes.');
}else console.log('Deep UI audit fixes already applied.');
