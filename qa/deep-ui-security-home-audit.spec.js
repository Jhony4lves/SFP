const { test } = require('@playwright/test');
const fs = require('node:fs');

async function boot(page){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderToday==='function');
}

test('DEEP-UI-SECURITY home render stored-xss probes',async({page},testInfo)=>{
  await boot(page);
  const findings=[];

  const accountProbe=await page.evaluate(async()=>{
    window.__sfpAuditHome='';
    const account=state.accounts[0];
    const original=account.name;
    account.name='<img id="auditInjectedHomeAccount" src="x-invalid" onerror="window.__sfpAuditHome=\'account\'">CONTA-CANARIO';
    renderToday();
    await new Promise(r=>setTimeout(r,80));
    const result={executed:window.__sfpAuditHome==='account',injectedNode:!!document.getElementById('auditInjectedHomeAccount'),html:document.getElementById('todayAccounts')?.innerHTML||''};
    account.name=original;renderToday();
    return result;
  });
  findings.push({surface:'today-accounts',...accountProbe});

  const eventProbe=await page.evaluate(async()=>{
    window.__sfpAuditHome='';
    const original=state.transactions.slice();
    const date=typeof localCivilDate==='function'?localCivilDate():new Date().toISOString().slice(0,10);
    const accountId=state.accounts[0]?.id||1;
    state.transactions.push({id:991337,kind:'expense',entryType:'bill',desc:'<img id="auditInjectedHomeEvent" src="x-invalid" onerror="window.__sfpAuditHome=\'event\'">EVENTO-CANARIO',amount:1,date,category:'Outros',accountId,status:'pending',dueDay:Number(date.slice(8,10)),tags:[],note:'',balanceImpact:false,createdAt:Date.now()});
    renderToday();
    await new Promise(r=>setTimeout(r,80));
    const result={executed:window.__sfpAuditHome==='event',injectedNode:!!document.getElementById('auditInjectedHomeEvent'),html:document.getElementById('todayNext')?.innerHTML||''};
    state.transactions=original;renderToday();
    return result;
  });
  findings.push({surface:'today-upcoming',...eventProbe});

  const out=testInfo.outputPath('deep-ui-security-home.json');
  fs.writeFileSync(out,JSON.stringify({findings},null,2));
  await testInfo.attach('deep-ui-security-home.json',{path:out,contentType:'application/json'});
});
