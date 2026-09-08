const { test, expect } = require('@playwright/test');
const { fixture } = require('./helpers');

async function boot(page){
  await page.goto('/index.html');
  await page.waitForFunction(() => window.SFPFinancialIntegrityV2?.version === 2);
}

async function useState(page, value){
  await page.evaluate(v => {
    state = v;
    normalize();
    renderAll();
  }, value);
}

function base(name='Financial integrity v2'){
  const v=fixture(name);
  v.mesAtual='2026-09';
  v.baseDate='2026-09-01';
  v.accounts=[{id:1,name:'Principal',type:'Conta corrente',initial:100,balanceMode:'snapshot',balanceDate:'2026-09-01'}];
  v.cards=[];v.transactions=[];v.transfers=[];v.purchases=[];v.invoices=[];v.recurring=[];v.debts=[];v.creditFacilities=[];
  return v;
}

function tx(id,kind,amount,date,accountId=1,status='pending'){
  return {id,kind,entryType:kind==='income'?'income':'bill',desc:`Evento ${id}`,amount,date,category:kind==='income'?'Trabalho':'Contas',accountId,status,dueDay:+date.slice(8,10),balanceImpact:status==='paid'};
}

test.describe('Financial integrity v2 — #153..#161',()=>{
  test('#153 gasto seguro preserva saldo atual necessário depois da próxima entrada',async({page})=>{
    await boot(page);
    for(const [debt,expected] of [[500,0],[450,50],[350,100]]){
      const v=base();
      v.transactions=[tx(1,'income',400,'2026-09-15'),tx(2,'expense',debt,'2026-09-20')];
      await useState(page,v);
      const result=await page.evaluate(()=>SFPFinancialIntegrityV2.liquiditySnapshot({reference:new Date(2026,8,10)}));
      expect(result.safeToSpendCents).toBe(expected*100);
    }
  });

  test('#154 mesma data usa ordem conservadora e não depende da ordem de inserção',async({page})=>{
    await boot(page);
    const run=async(reverse)=>{
      const v=base();
      const events=[tx(1,'income',400,'2026-09-15'),tx(2,'expense',500,'2026-09-15')];
      v.transactions=reverse?events.reverse():events;
      await useState(page,v);
      return page.evaluate(()=>SFPFinancialIntegrityV2.buildProjection(30,new Date(2026,8,10)));
    };
    const a=await run(false),b=await run(true);
    expect(a.minBalanceCents).toBe(-40000);
    expect(b.minBalanceCents).toBe(a.minBalanceCents);
    expect(a.events.map(e=>e.type)).toEqual(['expense','income']);
  });

  test('#155 Hoje/core e Safe-to-Spend usam o mesmo horizonte-base',async({page})=>{
    await boot(page);
    const v=base();v.accounts[0].initial=1000;v.transactions=[tx(1,'expense',700,'2026-10-25')];
    await useState(page,v);
    const result=await page.evaluate(()=>{
      const ref=new Date(2026,8,10),ctx=financialContextSnapshot({reference:ref});
      return {free:ctx.free.amountCents,legacy:Math.round((allAccountBalance()-commitmentUntilNextIncome(ref))*100),horizon:ctx.liquidity.horizonDays};
    });
    expect(result.free).toBe(30000);
    expect(result.legacy).toBe(30000);
    expect(result.horizon).toBe(365);
  });

  test('#156 consignado afeta caixa exatamente conforme a base salarial explícita',async({page})=>{
    await boot(page);
    const v=base();
    v.transactions=[tx(1,'income',500,'2026-09-15')];
    v.debts=[{id:9,name:'Consignado',balance:100,rate:0,payment:100,installments:1,paidInstallments:0,firstDue:'2026-09-20',lastDue:'2026-09-20',paymentMethod:'payroll',history:[]}];
    v.settings.payrollIncomeBasis='net-after-payroll';
    await useState(page,v);
    const net=await page.evaluate(()=>SFPFinancialIntegrityV2.buildProjection(30,new Date(2026,8,10)).projectedCents);
    await page.evaluate(()=>{state.settings.payrollIncomeBasis='gross-before-payroll'});
    const gross=await page.evaluate(()=>SFPFinancialIntegrityV2.buildProjection(30,new Date(2026,8,10)).projectedCents);
    expect(net-gross).toBe(10000);
  });

  test('#157 obrigação vencida permanece no backlog e reduz gasto seguro',async({page})=>{
    await boot(page);
    const v=base();v.accounts[0].initial=1000;v.transactions=[tx(1,'expense',900,'2026-09-09')];
    await useState(page,v);
    const result=await page.evaluate(()=>{
      const ref=new Date(2026,8,10),l=SFPFinancialIntegrityV2.liquiditySnapshot({reference:ref});
      return {safe:l.safeToSpendCents,overdue:l.overdueEvents.length,status:pendingUpcomingEvents(7,ref)[0]?.status};
    });
    expect(result).toEqual({safe:10000,overdue:1,status:'overdue'});
  });

  test('#158 movimento futuro confirmado não altera saldo realizado antes da data',async({page})=>{
    await boot(page);
    const v=base();v.accounts.push({id:2,name:'Destino',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-01'});
    await useState(page,v);
    const result=await page.evaluate(()=>{
      const today=localCivilDate(),d=new Date(today+'T12:00:00');d.setDate(d.getDate()+1);const tomorrow=localCivilDate(d);
      state.transactions=[{id:10,kind:'income',entryType:'income',desc:'Receita futura',amount:400,date:tomorrow,category:'Trabalho',accountId:1,status:'paid',dueDay:+tomorrow.slice(8,10),balanceImpact:true}];
      state.transfers=[{id:11,desc:'Transferência futura',amount:50,date:tomorrow,fromId:1,toId:2,balanceImpact:true}];
      return {a:accountBalance(1),b:accountBalance(2),scheduled:upcomingEvents(7,new Date()).some(e=>e.id==='tx:10'||e.sourceId===10)};
    });
    expect(result.a).toBe(100);
    expect(result.b).toBe(0);
    expect(result.scheduled).toBe(true);
  });

  test('#159 reserva/investimento ficam protegidos do dinheiro operacional por padrão',async({page})=>{
    await boot(page);
    const v=base();v.accounts.push({id:2,name:'Reserva',type:'Reserva',initial:5000,balanceMode:'snapshot',balanceDate:'2026-09-01'});
    await useState(page,v);
    const result=await page.evaluate(()=>SFPFinancialIntegrityV2.liquiditySnapshot({reference:new Date(2026,8,10)}));
    expect(result.totalAccountCents).toBe(510000);
    expect(result.operationalAvailableCents).toBe(10000);
    expect(result.protectedCents).toBe(500000);
    expect(result.safeToSpendCents).toBe(10000);
  });

  test('#160 cobertura global sem transferência não vira dinheiro livre; transferência programada libera o excedente',async({page})=>{
    await boot(page);
    const v=base();v.accounts=[
      {id:1,name:'Conta do débito',type:'Conta corrente',initial:0,balanceMode:'snapshot',balanceDate:'2026-09-01'},
      {id:2,name:'Carteira',type:'Carteira digital',initial:500,balanceMode:'snapshot',balanceDate:'2026-09-01'}
    ];
    v.transactions=[tx(1,'expense',400,'2026-09-11',1)];
    await useState(page,v);
    const uncovered=await page.evaluate(()=>SFPFinancialIntegrityV2.liquiditySnapshot({reference:new Date(2026,8,10)}));
    expect(uncovered.safeToSpendCents).toBe(0);
    expect(uncovered.negativeRisk ?? uncovered.projection.negativeRisk).toBe(true);
    expect(uncovered.accountRisks).toHaveLength(1);
    expect(uncovered.accountRisks[0]).toMatchObject({accountId:1,requiredTransferCents:40000});

    await page.evaluate(()=>{
      state.transfers=[{id:90,desc:'Cobertura da conta pagadora',amount:400,date:'2026-09-10',fromId:2,toId:1,balanceImpact:true}];
      renderAll();
    });
    const covered=await page.evaluate(()=>SFPFinancialIntegrityV2.liquiditySnapshot({reference:new Date(2026,8,10)}));
    expect(covered.accountRisks).toHaveLength(0);
    expect(covered.safeToSpendCents).toBe(10000);
  });

  test('#161 crédito utilizado sem dívida vinculada vira passivo e reserva conservadora',async({page})=>{
    await boot(page);
    const v=base();v.accounts[0].initial=500;v.creditFacilities=[{id:8,institution:'Banco',name:'Linha',limit:1000,used:400,type:'credit_line'}];
    await useState(page,v);
    const result=await page.evaluate(()=>({debt:debtTotal(),l:SFPFinancialIntegrityV2.liquiditySnapshot({reference:new Date(2026,8,10)})}));
    expect(result.debt).toBe(400);
    expect(result.l.unresolvedCreditCents).toBe(40000);
    expect(result.l.safeToSpendCents).toBe(10000);
  });
});
