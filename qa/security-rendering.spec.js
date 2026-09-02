const { test, expect } = require('@playwright/test');
const fs=require('node:fs');

const MOBILE={width:390,height:844};
const PAYLOAD='<img data-sfp-xss-canary src=x onerror="window.__sfpXss=(window.__sfpXss||0)+1">';

async function boot(page){
  await page.setViewportSize(MOBILE);
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
}

async function expectCanaryInert(page){
  await page.waitForTimeout(30);
  expect(await page.locator('[data-sfp-xss-canary]').count()).toBe(0);
  expect(await page.evaluate(()=>window.__sfpXss||0)).toBe(0);
}

test.describe('Stored financial text stays inert in HTML renderers',()=>{
  test('Hoje, busca global e lixeira renderizam markup persistido como texto',async({page})=>{
    await boot(page);
    await page.evaluate(payload=>{
      window.__sfpXss=0;
      const account={id:990001,name:payload,type:payload,initial:0,balanceDate:'2026-09-02'};
      state.accounts=[account];
      const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
      const date=tomorrow.toISOString().slice(0,10);
      state.transactions=[{id:990002,accountId:account.id,date,desc:`needle ${payload}`,category:payload,kind:'expense',amount:12.34,status:'pending',balanceImpact:false,tags:[]}];
      state.transfers=[];state.invoices=[];
      state.trash=[{type:'transaction',item:{id:990003,desc:payload},deletedAt:'2026-09-02T10:00:00.000Z'}];
      renderToday();
    },PAYLOAD);
    await expect(page.locator('#todayAccounts')).toContainText(PAYLOAD);
    await expect(page.locator('#todayNext')).toContainText(PAYLOAD);
    await expectCanaryInert(page);

    await page.evaluate(()=>{document.getElementById('globalSearch').value='needle';renderGlobalSearch();});
    await expect(page.locator('#globalResults')).toContainText(PAYLOAD);
    await expectCanaryInert(page);

    await page.evaluate(()=>showTrash());
    await expect(page.locator('#modalRoot')).toContainText(PAYLOAD);
    await expectCanaryInert(page);
  });

  test('listas financeiras secundárias escapam nomes, descrições e metadados importados',async({page})=>{
    await boot(page);
    await page.evaluate(payload=>{
      window.__sfpXss=0;
      const account={id:991001,name:payload,type:'Conta corrente',initial:0,balanceDate:'2026-09-02',reconciled:{difference:1}};
      state.accounts=[account];
      state.transactions=[{id:991002,accountId:account.id,date:`${state.mesAtual}-02`,desc:payload,category:payload,kind:'expense',amount:10,status:'paid',balanceImpact:false,tags:[]}];
      state.transfers=[];state.invoices=[];
      state.recurring=[{id:991003,desc:payload,type:'expense',amount:20,day:5,active:true,skippedMonths:[]}];
      state.creditFacilities=[{id:991004,institution:payload,name:payload,limit:100,used:0}];
      state.assets=[{id:991005,name:payload,value:100}];
      state.csvTemplates=[{id:991006,name:payload,dateIndex:0,descIndex:1,valueIndex:2}];
      state.statements=[{account:payload,file:payload,months:[state.mesAtual],count:1}];
      renderTx();renderCreditFacilities();renderRecurring();renderPatrimony();renderCsvTemplates();renderStatements();renderReconcileCenter();
    },PAYLOAD);
    for(const selector of ['#txTable','#creditFacilities','#recList','#assetGrid','#csvTemplates','#stmtHistory','#reconcileCenter']){
      await expect(page.locator(selector)).toContainText(PAYLOAD);
    }
    await expectCanaryInert(page);
  });
});

test('security guardrail: known persisted fields are escaped before innerHTML interpolation',()=>{
  const source=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
  const forbidden=[
    '<b>${e.desc}</b>',
    '<b>${a.name}</b><strong>${brl(accountBalance(a.id))}',
    '<b>${r.title}</b><small>${r.sub}</small>',
    '<b>${t.desc}</b>${originChip(t)}',
    '<b>${x.institution} • ${x.name}</b>',
    '<b>${r.desc}</b><small>${r.type}',
    '<b>${s.account}</b><small>${s.file}',
    '<b>${i.title}</b><small>${i.sub}</small>'
  ];
  const hits=forbidden.filter(pattern=>source.includes(pattern));
  expect(hits,`Unsafe HTML interpolation returned:\n${hits.join('\n')}`).toEqual([]);
});
