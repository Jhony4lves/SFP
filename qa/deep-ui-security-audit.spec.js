const { test } = require('@playwright/test');
const fs = require('node:fs');
const { fixture } = require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderAll==='function');
  await page.evaluate(()=>{state.settings={...(state.settings||{}),onboardingDone:true};});
}

test('DEEP-UI-SECURITY rendered user text injection probes',async({page},testInfo)=>{
  test.setTimeout(60000);
  await boot(page);
  const findings=[];

  const searchProbe=await page.evaluate(async()=>{
    window.__sfpAuditXss='';
    const marker='<img id="auditInjectedSearch" src="x-invalid" onerror="window.__sfpAuditXss=\'search\'">TESTE-INJECAO';
    state.transactions=[{id:999001,kind:'expense',entryType:'expense',desc:marker,amount:1,date:'2026-09-02',category:'Outros',accountId:1,status:'paid',tags:[],balanceImpact:true}];
    const input=document.getElementById('globalSearch');input.value='teste-injecao';
    renderGlobalSearch();
    await new Promise(r=>setTimeout(r,80));
    return {executed:window.__sfpAuditXss==='search',injectedNode:!!document.getElementById('auditInjectedSearch'),html:document.getElementById('globalResults')?.innerHTML||''};
  });
  findings.push({surface:'global-search',...searchProbe});

  const trashProbe=await page.evaluate(async()=>{
    window.__sfpAuditXss='';
    const marker='<img id="auditInjectedTrash" src="x-invalid" onerror="window.__sfpAuditXss=\'trash\'">LIXEIRA-INJECAO';
    state.trash=[{type:'transaction',deletedAt:'2026-09-02T00:00:00.000Z',item:{id:999002,desc:marker}}];
    showTrash();
    await new Promise(r=>setTimeout(r,80));
    return {executed:window.__sfpAuditXss==='trash',injectedNode:!!document.getElementById('auditInjectedTrash'),html:document.getElementById('modalRoot')?.innerHTML||''};
  });
  findings.push({surface:'trash',...trashProbe});

  const out=testInfo.outputPath('deep-ui-security-injection.json');
  fs.writeFileSync(out,JSON.stringify({findings},null,2));
  await testInfo.attach('deep-ui-security-injection.json',{path:out,contentType:'application/json'});
});
