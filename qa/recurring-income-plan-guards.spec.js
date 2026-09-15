const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateFor(name){
  const value=fixture(name);
  value.mesAtual='2026-09';
  value.baseDate='2026-09-01';
  value.accounts=[{id:1,name:'Nubank',type:'Conta corrente',initial:1000,balanceMode:'snapshot',balanceDate:'2026-09-01'}];
  value.cards=[];
  value.purchases=[];
  value.transfers=[];
  value.transactions=[];
  value.recurring=[];
  value.recurringGroups=[];
  value.trash=[];
  return value;
}

async function boot(page,value){
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,value);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,value.settings.name);
  await page.waitForFunction(()=>window.SFPRecurringIncomePlan?.version===1);
  await page.waitForFunction(()=>window.__SFP_RECURRING_INCOME_PLAN_CHILD_GUARDS_V1===true);
  await page.waitForFunction(()=>window.__SFP_RECURRING_INCOME_PLAN_TRASH_GUARD_V1===true);
}

async function createPlan(page){
  return page.evaluate(()=>SFPRecurringIncomePlan.upsert({
    desc:'Salário Águas de Niterói',
    targetAmount:2273,
    accountId:1,
    start:'2026-09',
    end:'',
    firstAmount:1591.10,
    firstDay:1,
    secondAmount:681.90,
    secondDay:15
  }));
}

test('#218 ações genéricas destrutivas não quebram uma quinzena filha isoladamente',async({page})=>{
  await boot(page,stateFor('Guardas do plano salarial #218'));
  await createPlan(page);

  const result=await page.evaluate(async()=>{
    const plan=state.recurringGroups[0];
    const [firstId,secondId]=plan.memberRecurringIds;
    const first=state.recurring.find(item=>item.id===firstId);

    const before={
      rules:state.recurring.length,
      firstActive:first.active,
      firstSkips:[...(first.skips||[])]
    };

    toggleRec(firstId);
    skipRec(firstId);
    await removeRec(firstId);

    const afterProtected={
      rules:state.recurring.length,
      firstExists:Boolean(state.recurring.find(item=>item.id===firstId)),
      firstActive:state.recurring.find(item=>item.id===firstId)?.active,
      firstSkips:[...(state.recurring.find(item=>item.id===firstId)?.skips||[])]
    };

    await postRec(secondId);

    return{
      before,
      afterProtected,
      transactionCount:state.transactions.length,
      postedRecurringId:state.transactions[0]?.recurringId,
      groupStillExists:Boolean(state.recurringGroups.find(item=>item.id===plan.id))
    };
  });

  expect(result.before).toEqual({rules:2,firstActive:true,firstSkips:[]});
  expect(result.afterProtected).toEqual({rules:2,firstExists:true,firstActive:true,firstSkips:[]});
  expect(result.transactionCount).toBe(1);
  expect(result.postedRecurringId).toBeTruthy();
  expect(result.groupStillExists).toBe(true);
});

test('#218 editar uma quinzena filha abre o plano agregado e explicita total líquido',async({page})=>{
  await boot(page,stateFor('Editar filho redireciona ao plano #218'));
  await createPlan(page);

  const firstId=await page.evaluate(()=>state.recurringGroups[0].memberRecurringIds[0]);
  await page.evaluate(id=>editRec(id),firstId);

  await expect(page.locator('#salaryIncomePlanForm')).toHaveCount(1);
  await expect(page.locator('#salaryPlanTarget')).toHaveValue('2273');
  await expect(page.locator('#salaryPlanFirstAmount')).toHaveValue('1591.1');
  await expect(page.locator('#salaryPlanSecondAmount')).toHaveValue('681.9');
  await expect(page.locator('#salaryPlanTarget').locator('xpath=..')).toContainText('Total líquido planejado no mês');
  await expect(page.locator('#salaryIncomePlanForm .note')).toContainText('total líquido mensal');
});

test('#218 restaurar qualquer item apagado do plano traz agregado e duas quinzenas juntos',async({page})=>{
  await boot(page,stateFor('Restaurar plano salarial inteiro #218'));
  await createPlan(page);

  const deleted=await page.evaluate(async()=>{
    const plan=state.recurringGroups[0];
    const id=plan.id;
    const removed=SFPRecurringIncomePlan.remove(id);
    await save('Excluir plano salarial para teste');
    return{
      removed,
      groups:state.recurringGroups.length,
      rules:state.recurring.length,
      trash:state.trash.map(entry=>({type:entry.type,groupId:entry.type==='recurringGroup'?entry.item?.id:entry.item?.recurringGroupId}))
    };
  });

  expect(deleted.removed).toBe(true);
  expect(deleted.groups).toBe(0);
  expect(deleted.rules).toBe(0);
  expect(deleted.trash).toHaveLength(3);
  expect(deleted.trash.filter(entry=>entry.type==='recurringGroup')).toHaveLength(1);
  expect(deleted.trash.filter(entry=>entry.type==='recurring')).toHaveLength(2);

  await page.evaluate(()=>showTrash());
  await page.locator('[data-restore]').first().click();
  await expect.poll(()=>page.evaluate(()=>({groups:state.recurringGroups.length,rules:state.recurring.length,trash:state.trash.length}))).toEqual({groups:1,rules:2,trash:0});

  const restored=await page.evaluate(()=>({
    summary:SFPRecurringIncomePlan.summary(state.recurringGroups[0],'2026-09'),
    memberIds:state.recurringGroups[0].memberRecurringIds,
    ruleIds:state.recurring.map(item=>item.id)
  }));
  expect(restored.summary.targetAmount).toBe(2273);
  expect(restored.memberIds.sort()).toEqual(restored.ruleIds.sort());
});
