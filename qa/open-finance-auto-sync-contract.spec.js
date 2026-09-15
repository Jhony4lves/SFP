const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/www/open-finance-real-refresh.js'),'utf8');

test('auto-sync relê no retorno ao app sem esperar o intervalo de 15 minutos',()=>{
  expect(source).toContain("const AUTO_INTERVAL_MS=15*60*1000;");
  expect(source).toContain("if(document.visibilityState==='visible')void automaticSync('resume');");
  expect(source).not.toContain("Date.now()-lastSnapshotReadAt>=AUTO_INTERVAL_MS");
});

test('auto-sync usa releitura de snapshot e não chama refreshItems automaticamente',()=>{
  const match=source.match(/async function automaticSync[\s\S]*?\n  }\n\n  function installNavigation/);
  expect(match).not.toBeNull();
  expect(match[0]).toContain('unified.syncAll()');
  expect(match[0]).not.toContain('refreshItems');
  expect(match[0]).not.toContain('PluggyRefreshBridge');
});
