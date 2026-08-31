const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/index.html');
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');
  await page.waitForFunction(()=>window.SFPWhatIf?.version===1);
}

function coreSnapshot(){
  return {
    referenceDate:'2026-08-31',
    availableCents:100000,
    accounts:{totalCents:100000},
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
  };
}

test.describe('SFP What-if Engine',()=>{
  test('carrega contrato versionado, centavos e read-only',async({page})=>{
    await boot(page);
    const base=coreSnapshot(),scenario={type:'spend_now',amountCents:25000};
    const result=await page.evaluate(({base,scenario})=>{
      const before=JSON.stringify({base,scenario});
      const report=window.SFPWhatIf.simulate({snapshot:base,scenario});
      return {before,after:JSON.stringify({base,scenario}),version:window.SFPWhatIf.version,contracts:report.contracts};
    },{base,scenario});
    expect(result.version).toBe(1);
    expect(result.after).toBe(result.before);
    expect(result.contracts).toEqual({readOnly:true,persisted:false,moneyUnit:'cents',hiddenBuffer:false,sourceOfTruth:'Local Financial Core'});
  });

  test('E se eu gastar hoje reduz caixa, livre e toda a trajetória futura',async({page})=>{
    await boot(page);
    const report=await page.evaluate(base=>window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'spend_now',amountCents:25000}}),coreSnapshot());
    expect(report.baseline.availableCents).toBe(100000);
    expect(report.simulated.availableCents).toBe(75000);
    expect(report.simulated.freeCents).toBe(55000);
    expect(report.delta.availableCents).toBe(-25000);
    expect(report.delta.netWorthCents).toBe(-25000);
    expect(report.simulated.projections[0].projectedCents).toBe(185000);
    expect(report.simulated.projections[0].minBalanceCents).toBe(45000);
    expect(report.simulated.projections[0].negativeRisk).toBe(false);
  });

  test('gasto que estoura o caixa sinaliza risco negativo sem persistir nada',async({page})=>{
    await boot(page);
    const report=await page.evaluate(base=>window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'spend_now',amountCents:90000}}),coreSnapshot());
    expect(report.simulated.safeToSpendCents).toBe(0);
    expect(report.simulated.projections[0].minBalanceCents).toBe(-20000);
    expect(report.simulated.projections[0].negativeRisk).toBe(true);
  });

  test('compra parcelada distribui centavos exatamente e só afeta horizontes onde vence',async({page})=>{
    await boot(page);
    const report=await page.evaluate(base=>window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'installment_purchase',totalCents:10001,installments:3,firstDueDate:'2026-09-10'}}),coreSnapshot());
    expect(report.installmentImpact.installmentCents).toEqual([3334,3334,3333]);
    expect(report.installmentImpact.sumCents).toBe(10001);
    expect(report.delta.commitmentCents).toBe(10001);
    expect(report.simulated.projections[0].projectedCents).toBe(210000);
    expect(report.simulated.projections[1].projectedCents).toBe(166666);
    expect(report.events[0]).toMatchObject({date:'2026-09-10',amountCents:3334,origin:'what_if_installment'});
  });

  test('parcela antes da próxima entrada aumenta reservado e reduz livre atual projetado',async({page})=>{
    await boot(page);
    const report=await page.evaluate(base=>window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'installment_purchase',totalCents:12000,installments:2,firstDueDate:'2026-09-03'}}),coreSnapshot());
    expect(report.simulated.availableCents).toBe(100000);
    expect(report.simulated.reservedCents).toBe(26000);
    expect(report.simulated.freeCents).toBe(74000);
    expect(report.delta.reservedCents).toBe(6000);
  });

  test('guardar todo mês vira compromisso de reserva, preserva patrimônio e projeta meta',async({page})=>{
    await boot(page);
    const report=await page.evaluate(base=>window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'monthly_saving',amountCents:15000,months:6,startDate:'2026-09-01',currentGoalCents:20000,targetGoalCents:100000,goalId:7}}),coreSnapshot());
    expect(report.goalImpact).toMatchObject({goalId:7,currentCents:20000,totalContributionCents:90000,projectedCents:110000,targetCents:100000,reachesTarget:true,remainingAfterCents:0});
    expect(report.delta.netWorthCents).toBe(0);
    expect(report.delta.commitmentCents).toBe(90000);
    expect(report.simulated.reservedCents).toBe(35000);
    expect(report.assumptions.join(' ')).toContain('não reduz patrimônio líquido');
  });

  test('amortização reduz caixa e dívida pelo mesmo principal e estima juros/prazo quando há contrato suficiente',async({page})=>{
    await boot(page);
    const report=await page.evaluate(base=>window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'debt_amortization',amountCents:20000,date:'2026-08-31',debt:{id:11,balanceCents:100000,monthlyRate:0.02,paymentCents:12000}}}),coreSnapshot());
    expect(report.simulated.availableCents).toBe(80000);
    expect(report.debtImpact.balanceAfterCents).toBe(80000);
    expect(report.debtImpact.amortizationCents).toBe(20000);
    expect(report.debtImpact.interestSavedCents).toBeGreaterThan(0);
    expect(report.debtImpact.monthsSaved).toBeGreaterThanOrEqual(1);
    expect(report.delta.netWorthCents).toBe(0);
  });

  test('amortização sem taxa/parcela não inventa economia de juros',async({page})=>{
    await boot(page);
    const report=await page.evaluate(base=>window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'debt_amortization',amountCents:20000,debt:{id:11,balanceCents:100000}}}),coreSnapshot());
    expect(report.debtImpact.interestSavedCents).toBeNull();
    expect(report.debtImpact.monthsSaved).toBeNull();
    expect(report.debtImpact.amortizationCents).toBe(20000);
    expect(report.simulated.availableCents).toBe(80000);
    expect(report.limitations.join(' ')).toContain('projeções condicionais');
  });

  test('amortização maior que o saldo falha fechada e nunca cria divergência caixa × dívida',async({page})=>{
    await boot(page);
    const result=await page.evaluate(base=>{
      const before=JSON.stringify(base);
      let error='';
      try{window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'debt_amortization',amountCents:120000,debt:{id:11,balanceCents:100000,monthlyRate:0.02,paymentCents:12000}}});}catch(e){error=e.message;}
      return {error,before,after:JSON.stringify(base)};
    },coreSnapshot());
    expect(result.error).toContain('cannot exceed debt.balanceCents');
    expect(result.after).toBe(result.before);
  });

  test('amortização exige saldo conhecido da dívida',async({page})=>{
    await boot(page);
    const error=await page.evaluate(base=>{
      try{window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'debt_amortization',amountCents:20000,debt:{id:11}}});return null;}catch(e){return e.message;}
    },coreSnapshot());
    expect(error).toContain('debt.balanceCents is required');
  });

  test('datas mensais preservam dia e ajustam fim do mês',async({page})=>{
    await boot(page);
    const dates=await page.evaluate(()=>[
      window.SFPWhatIf.addMonths('2026-01-31',1),
      window.SFPWhatIf.addMonths('2028-01-31',1),
      window.SFPWhatIf.addMonths('2026-08-31',1)
    ]);
    expect(dates).toEqual(['2026-02-28','2028-02-29','2026-09-30']);
  });

  test('cenário inválido falha fechado em vez de adivinhar',async({page})=>{
    await boot(page);
    const errors=await page.evaluate(base=>{
      const list=[];
      try{window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'installment_purchase',totalCents:50000,installments:10}})}catch(e){list.push(e.message)}
      try{window.SFPWhatIf.simulate({snapshot:base,scenario:{type:'spend_now',amountCents:0}})}catch(e){list.push(e.message)}
      return list;
    },coreSnapshot());
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('firstDueDate');
    expect(errors[1]).toContain('amountCents');
  });
});
