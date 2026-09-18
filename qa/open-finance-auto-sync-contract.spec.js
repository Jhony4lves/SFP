const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/www/open-finance-real-refresh.js'),'utf8');

test('auto-sync relê ao voltar para o app e mede o ciclo de 15 minutos desde a última leitura',()=>{
  expect(source).toContain("const AUTO_INTERVAL_MS=15*60*1000;");
  expect(source).toContain("if(document.visibilityState==='visible')void automaticSync('resume');");
  expect(source).toContain("if(document.visibilityState!=='hidden'&&Date.now()-lastSnapshotReadAt>=AUTO_INTERVAL_MS)void automaticSync('interval');");
});

test('auto-sync usa releitura de snapshot e não chama refreshItems automaticamente',()=>{
  const syncData=source.match(/async function syncCurrentData\(\)[\s\S]*?\n  }\n\n  function configured/);
  const automatic=source.match(/async function automaticSync[\s\S]*?\n  }\n\n  function appendMoreMenuEntry/);
  expect(syncData).not.toBeNull();
  expect(automatic).not.toBeNull();
  expect(syncData[0]).toContain('unified.syncAll()');
  expect(automatic[0]).toContain('syncCurrentData()');
  expect(syncData[0]+automatic[0]).not.toContain('refreshItems');
  expect(syncData[0]+automatic[0]).not.toContain('PluggyRefreshBridge');
});

test('mobile mantém a barra prioritária de 5 itens e oferece Sincronização pelo Mais',()=>{
  expect(source).not.toContain('grid-template-columns:repeat(6,1fr)');
  expect(source).not.toContain('.sidebar .nav button[data-page="openfinance"]{display:flex!important');
  expect(source).toContain('function appendMoreMenuEntry()');
  expect(source).toContain("item.dataset.sfpMorePage=PAGE_ID;");
  expect(source).toContain('<strong>Sincronização</strong><small>Open Finance e atualização de dados</small>');
  expect(source).toContain("more.addEventListener('click',()=>queueMicrotask(appendMoreMenuEntry));");
});

test('menu Mais mobile tem um único dono e o V2 expõe Sincronização',()=>{
  const safeSpend=fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/www/safe-spend-ui.js'),'utf8');
  const insights=fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/www/financial-insights-ui.js'),'utf8');
  expect(safeSpend).not.toContain('sfpMobilePriorityNavV1');
  expect(insights).toContain("const STYLE_ID='sfpMobilePriorityNavV2';");
  expect((insights.match(/\['openfinance','Sincronização','Open Finance e atualização de dados'\]/g)||[]).length).toBe(1);
});
