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
  const match=source.match(/async function automaticSync[\s\S]*?\n  }\n\n  function installNavigation/);
  expect(match).not.toBeNull();
  expect(match[0]).toContain('unified.syncAll()');
  expect(match[0]).not.toContain('refreshItems');
  expect(match[0]).not.toContain('PluggyRefreshBridge');
});
