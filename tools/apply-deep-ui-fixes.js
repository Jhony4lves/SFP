const fs = require('node:fs');

const indexPath='app/src/main/assets/www/index.html';
const briefPath='app/src/main/assets/www/sophy-proactive-brief.js';
let index=fs.readFileSync(indexPath,'utf8');
let brief=fs.readFileSync(briefPath,'utf8');
let changed=false;

if(!index.includes('href="ui-hardening.css"')){
  if(!index.includes('</head>')) throw new Error('index.html missing </head>');
  index=index.replace('</head>','<link rel="stylesheet" href="ui-hardening.css"/>\n</head>');
  changed=true;
}
if(!index.includes('src="ui-hardening.js"')){
  if(!index.includes('</body>')) throw new Error('index.html missing </body>');
  index=index.replace('</body>','<script src="ui-hardening.js"></script>\n</body>');
  changed=true;
}

// Remove global horizontal clipping masks. Geometry is fixed by ui-hardening.css and QA.
const overflowMasks=[
  /body\s*,\s*main\s*\{\s*overflow-x\s*:\s*hidden\s*!important\s*;?\s*\}/gi,
  /body\s*,\s*main\s*\{\s*overflow-x\s*:\s*hidden\s*;?\s*\}/gi,
  /body\s*\{\s*overflow-x\s*:\s*hidden\s*!important\s*;?\s*\}\s*main\s*\{\s*overflow-x\s*:\s*hidden\s*!important\s*;?\s*\}/gi
];
for(const rx of overflowMasks){
  const next=index.replace(rx,'');
  if(next!==index){index=next;changed=true;}
}

const topControlsOld=`#privacyToggle, #notifBellBtn{
    width:36px!important;height:36px!important;min-height:36px!important;
    padding:0!important;display:inline-flex!important;align-items:center!important;
    justify-content:center!important;border-radius:10px!important;flex-shrink:0!important;
  }`;
const topControlsNew=`#privacyToggle, #notifBellBtn{
    width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;
    padding:0!important;display:inline-flex!important;align-items:center!important;
    justify-content:center!important;border-radius:10px!important;flex-shrink:0!important;
  }`;
if(index.includes(topControlsOld)){
  index=index.replace(topControlsOld,topControlsNew);
  changed=true;
}

const dialogOld=`.sfp-dialog-close,
.sfp-dialog-head .icon-button {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  max-width: 36px !important;
  max-height: 36px !important;`;
const dialogNew=`.sfp-dialog-close,
.sfp-dialog-head .icon-button {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
  max-width: 44px !important;
  max-height: 44px !important;`;
if(index.includes(dialogOld)){
  index=index.replace(dialogOld,dialogNew);
  changed=true;
}

const hiddenBrief='@media(orientation:landscape) and (max-height:520px){.sophy-proactive-brief{display:none!important}}';
const adaptiveBrief='@media(orientation:landscape) and (max-height:520px){.sophy-proactive-brief{padding:6px 9px;gap:5px}.sophy-brief-head p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sophy-brief-evidence{max-height:38px;overflow:auto}.sophy-brief-detail{max-height:76px;overflow:auto}}';
if(brief.includes(hiddenBrief)){
  brief=brief.replace(hiddenBrief,adaptiveBrief);
  changed=true;
}

if(changed){
  fs.writeFileSync(indexPath,index);
  fs.writeFileSync(briefPath,brief);
  console.log('Applied deep UI audit fixes.');
}else{
  console.log('Deep UI audit fixes already applied.');
}
