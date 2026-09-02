const { test } = require('@playwright/test');
const fs = require('node:fs');

async function boot(page){
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof state!=='undefined'&&typeof renderTx==='function'&&typeof renderRecurring==='function');
}

test('DEEP-UI-SECURITY persisted-data render sink map',async({page},testInfo)=>{
  test.setTimeout(90000);
  await boot(page);
  const findings=await page.evaluate(async()=>{
    const results=[];
    const clone=v=>JSON.parse(JSON.stringify(v));
    const wait=()=>new Promise(r=>setTimeout(r,60));
    const marker=(id,surface)=>`<img id="${id}" src="x-invalid" onerror="window.__sfpSink='${surface}'">CANARIO-${surface}`;
    async function record(surface,id,render,mutate,restore){
      window.__sfpSink='';
      try{mutate();render();await wait();results.push({surface,executed:window.__sfpSink===surface,injectedNode:!!document.getElementById(id)});}catch(error){results.push({surface,error:String(error?.message||error),executed:false,injectedNode:false});}
      try{restore();render();}catch{}
    }

    const tx0=clone(state.transactions),month0=state.mesAtual;
    await record('transactions','auditSinkTx',renderTx,()=>{
      const date=`${state.mesAtual}-02`;const aid=state.accounts[0]?.id||1;
      state.transactions.push({id:910001,kind:'expense',entryType:'expense',desc:marker('auditSinkTx','transactions'),amount:1,date,category:'Outros',accountId:aid,status:'paid',dueDay:2,tags:[],note:'',balanceImpact:true,createdAt:Date.now()});
      document.getElementById('txSearch').value='';document.getElementById('txFilter').value='all';
    },()=>{state.transactions=tx0;state.mesAtual=month0;});

    const rec0=clone(state.recurring);
    await record('recurring','auditSinkRecurring',renderRecurring,()=>{state.recurring=[...state.recurring,{id:910002,desc:marker('auditSinkRecurring','recurring'),type:'expense',amount:1,day:2,category:'Outros',accountId:state.accounts[0]?.id||1,start:state.mesAtual,end:'',active:true,skips:[]}];},()=>{state.recurring=rec0;});

    const credit0=clone(state.creditFacilities||[]);
    await record('credit-facilities','auditSinkCredit',renderCreditFacilities,()=>{state.creditFacilities=[{id:910003,institution:marker('auditSinkCredit','credit-facilities'),name:'Linha',limit:100,used:0}];},()=>{state.creditFacilities=credit0;});

    const assets0=clone(state.assets);
    await record('patrimony-assets','auditSinkAsset',renderPatrimony,()=>{state.assets=[...state.assets,{id:910004,name:marker('auditSinkAsset','patrimony-assets'),value:100,type:'Outro'}];},()=>{state.assets=assets0;});

    const templates0=clone(state.csvTemplates);
    await record('csv-templates','auditSinkCsv',renderCsvTemplates,()=>{state.csvTemplates=[{id:910005,name:marker('auditSinkCsv','csv-templates'),dateIndex:0,descIndex:1,valueIndex:2}];},()=>{state.csvTemplates=templates0;});

    const statements0=clone(state.statements);
    await record('statement-history','auditSinkStatement',renderStatements,()=>{state.statements=[{id:910006,account:marker('auditSinkStatement','statement-history'),file:'arquivo.csv',months:[state.mesAtual],count:1}];},()=>{state.statements=statements0;});

    const acc0=clone(state.accounts);
    await record('reconciliation-center','auditSinkRecon',renderReconcileCenter,()=>{if(!state.accounts.length)return;state.accounts[0].name=marker('auditSinkRecon','reconciliation-center');state.accounts[0].reconciled={balance:0,date:'2026-09-02',difference:1};},()=>{state.accounts=acc0;});

    const budgets0=clone(state.categoryBudgets||{});
    await record('category-budgets','auditSinkBudget',renderBudget,()=>{state.categoryBudgets={...state.categoryBudgets,[marker('auditSinkBudget','category-budgets')]:100};},()=>{state.categoryBudgets=budgets0;});

    return results;
  });
  const out=testInfo.outputPath('deep-ui-security-sinks.json');
  fs.writeFileSync(out,JSON.stringify({findings},null,2));
  await testInfo.attach('deep-ui-security-sinks.json',{path:out,contentType:'application/json'});
});
