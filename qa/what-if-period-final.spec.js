const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await page.waitForFunction(()=>window.SFPWhatIf?.version===1&&window.SFPWhatIfUI?.version===1);
  await page.locator('button[data-page="simuladores"]').click();
  await expect(page.locator('#whatIfPlanner')).toBeVisible();
}

async function deterministicCore(page){
  await page.evaluate(()=>{
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

test.describe('What-if final-period comparison',()=>{
  test('guardar todo mês mostra o saldo final do período completo',async({page})=>{
    await boot(page);await deterministicCore(page);
    await page.locator('#whatIfType').selectOption('monthly_saving');
    await page.locator('#whatIfMonthly').fill('150');
    await page.locator('#whatIfMonths').fill('6');
    await page.locator('#whatIfStart').fill('2026-09-01');
    await page.locator('#whatIfRun').click();

    const report=await page.evaluate(()=>window.SFPWhatIfUI.getLastReport());
    const period=await page.evaluate(r=>window.SFPWhatIfUI.periodComparison(r),report);
    expect(period).toMatchObject({
      endDate:'2027-02-01',
      beforeCents:170000,
      afterCents:80000,
      knownThroughDate:'2026-09-30',
      extendsBeyondKnownCore:true
    });
    const result=page.locator('#whatIfResult');
    await expect(result).toContainText('01/02/2027');
    await expect(result).toContainText('R$ 1.700,00');
    await expect(result).toContainText('R$ 800,00');
    await expect(result).toContainText('fim do período');
    await expect(result).toContainText('o core conhece eventos até 30/09/2026');
  });

  test('compra parcelada usa o vencimento da última parcela como fim do período',async({page})=>{
    await boot(page);await deterministicCore(page);
    await page.locator('#whatIfType').selectOption('installment_purchase');
    await page.locator('#whatIfTotal').fill('100.01');
    await page.locator('#whatIfInstallments').fill('3');
    await page.locator('#whatIfFirstDue').fill('2026-09-10');
    await page.locator('#whatIfRun').click();

    const report=await page.evaluate(()=>window.SFPWhatIfUI.getLastReport());
    const period=await page.evaluate(r=>window.SFPWhatIfUI.periodComparison(r),report);
    expect(period).toMatchObject({endDate:'2026-11-10',beforeCents:170000,afterCents:159999});
    await expect(page.locator('#whatIfResult')).toContainText('10/11/2026');
    await expect(page.locator('#whatIfResult')).toContainText('R$ 1.599,99');
  });

  test('gasto imediato continua comparando o próprio dia, não um horizonte futuro arbitrário',async({page})=>{
    await boot(page);await deterministicCore(page);
    await page.locator('#whatIfType').selectOption('spend_now');
    await page.locator('#whatIfAmount').fill('250');
    await page.locator('#whatIfDate').fill('2026-08-31');
    await page.locator('#whatIfRun').click();

    const report=await page.evaluate(()=>window.SFPWhatIfUI.getLastReport());
    const period=await page.evaluate(r=>window.SFPWhatIfUI.periodComparison(r),report);
    expect(period).toMatchObject({endDate:'2026-08-31',beforeCents:100000,afterCents:75000,extendsBeyondKnownCore:false});
  });
});
