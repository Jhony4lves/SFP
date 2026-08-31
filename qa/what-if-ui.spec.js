const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await expectBootComplete(page, expect);
  await page.waitForFunction(()=>window.SFPWhatIf?.version===1&&window.SFPWhatIfUI?.version===1);
  await page.locator('button[data-page="simuladores"]').click();
  await expect(page.locator('#whatIfPlanner')).toBeVisible();
}

async function deterministicCore(page){
  await page.evaluate(()=>{
    window.__qaOriginalFinancialContextSnapshot=window.financialContextSnapshot;
    window.financialContextSnapshot=()=>({
      version:1,
      referenceDate:'2026-08-31',
      availableCents:100000,
      accounts:{totalCents:100000,items:[]},
      reserved:{status:'known',amountCents:20000,reasons:[]},
      free:{status:'known',amountCents:80000,formula:'AVAILABLE - RESERVED'},
      nextIncome:{date:'2026-09-05',amountCents:150000,type:'income'},
      projections:[
        {days:7,availableCents:100000,projectedCents:210000,minBalanceCents:70000,minDate:'2026-09-02',negativeRisk:false,events:[
          {id:'rent',date:'2026-09-02',type:'expense',amountCents:30000,balanceCents:70000,origin:'recurring'},
          {id:'salary',date:'2026-09-05',type:'income',amountCents:150000,balanceCents:220000,origin:'recurring'},
          {id:'phone',date:'2026-09-06',type:'expense',amountCents:10000,balanceCents:210000,origin:'recurring'}
        ]},
        {days:30,availableCents:100000,projectedCents:170000,minBalanceCents:70000,minDate:'2026-09-02',negativeRisk:false,events:[
          {id:'rent',date:'2026-09-02',type:'expense',amountCents:30000,balanceCents:70000,origin:'recurring'},
          {id:'salary',date:'2026-09-05',type:'income',amountCents:150000,balanceCents:220000,origin:'recurring'},
          {id:'phone',date:'2026-09-06',type:'expense',amountCents:10000,balanceCents:210000,origin:'recurring'},
          {id:'card',date:'2026-09-10',type:'expense',amountCents:40000,balanceCents:170000,origin:'invoice'}
        ]}
      ]
    });
  });
}

test.describe('SFP What-if UI',()=>{
  test('simula gasto com Antes × Depois sem alterar state nem persistir cenário',async({page})=>{
    await boot(page);await deterministicCore(page);
    const before=await page.evaluate(()=>JSON.stringify(state));
    await page.locator('#whatIfType').selectOption('spend_now');
    await page.locator('#whatIfAmount').fill('250');
    await page.locator('#whatIfDate').fill('2026-08-31');
    await page.locator('#whatIfRun').click();
    await expect(page.locator('#whatIfResult')).toBeVisible();
    await expect(page.locator('#whatIfResult')).toContainText('Antes');
    await expect(page.locator('#whatIfResult')).toContainText('Depois');
    const report=await page.evaluate(()=>window.SFPWhatIfUI.getLastReport());
    expect(report.delta.availableCents).toBe(-25000);
    expect(report.baseline.freeCents).toBe(80000);
    expect(report.simulated.freeCents).toBe(55000);
    expect(report.contracts).toMatchObject({readOnly:true,persisted:false,moneyUnit:'cents'});
    expect(await page.evaluate(()=>JSON.stringify(state))).toBe(before);
  });

  test('compra parcelada usa o mesmo engine e mostra período do parcelamento',async({page})=>{
    await boot(page);await deterministicCore(page);
    await page.locator('#whatIfType').selectOption('installment_purchase');
    await page.locator('#whatIfTotal').fill('100.01');
    await page.locator('#whatIfInstallments').fill('3');
    await page.locator('#whatIfFirstDue').fill('2026-09-10');
    await page.locator('#whatIfRun').click();
    const report=await page.evaluate(()=>window.SFPWhatIfUI.getLastReport());
    expect(report.installmentImpact.installmentCents).toEqual([3334,3334,3333]);
    await expect(page.locator('#whatIfResult')).toContainText('3x');
    await expect(page.locator('#whatIfResult')).toContainText('R$ 100,01');
  });

  test('amortização maior que o saldo falha fechado e não produz relatório',async({page})=>{
    await boot(page);await deterministicCore(page);
    await page.locator('#whatIfType').selectOption('debt_amortization');
    await page.locator('#whatIfDebtAmount').fill('1200');
    await page.locator('#whatIfDebtBalance').fill('1000');
    await page.locator('#whatIfDebtPayment').fill('100');
    await page.locator('#whatIfDebtRate').fill('2');
    await page.locator('#whatIfRun').click();
    expect(await page.evaluate(()=>window.SFPWhatIfUI.getLastReport())).toBeNull();
    await expect(page.locator('#whatIfResult')).toContainText('Não consegui simular');
    await expect(page.locator('#whatIfResult')).toContainText('amountCents cannot exceed debt.balanceCents');
  });
});
