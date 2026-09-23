const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

function stateFor(name='Transaction balance #272'){
  const value=fixture(name);
  value.settings={...(value.settings||{}),name};
  value.mesAtual='2026-09';
  value.baseDate='2026-09-23';
  value.accounts=[{
    id:1,
    name:'Itaú',
    type:'Conta corrente',
    initial:532.22,
    balanceMode:'snapshot',
    balanceDate:'2026-09-23',
    reconciled:{balance:532.22,date:'2026-09-23',difference:0,source:'open-finance',providerUpdatedAt:'2026-09-23T12:00:00.000Z'}
  }];
  value.cards=[];
  value.transactions=[];
  value.transfers=[];
  value.purchases=[];
  value.invoices=[];
  value.recurring=[];
  return value;
}

async function boot(page,name='Transaction balance #272'){
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await writeIndexedDB(page,stateFor(name));
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await expectBootComplete(page,expect,name);
  await page.waitForFunction(()=>window.SFPOpenFinanceFinancialTruth?.version===1);
}

test('#272 transação POSTED mais recente corrige Itaú 532,22 para 274,82',async({page})=>{
  await boot(page,'Itaú transaction balance #272');

  const result=await page.evaluate(async()=> {
    const report=await SFPOpenFinanceFinancialTruth.reconcileSnapshot({
      ok:true,
      items:[{
        id:'item-itau',
        institution:'Itaú',
        connectorName:'MeuPluggy',
        updatedAt:'2026-09-23T12:00:00.000Z',
        accounts:[{
          id:'acc-itau',
          type:'BANK',
          subtype:'CHECKING_ACCOUNT',
          name:'Itaú',
          marketingName:'Itaú',
          presentationName:'Itaú',
          balance:532.22,
          updatedAt:'2026-09-23T12:00:00.000Z',
          transactionPreviewHasMore:false,
          transactions:[
            {
              id:'tx-1',
              type:'DEBIT',
              status:'POSTED',
              date:'2026-09-23T13:00:00.000Z',
              order:1,
              updatedAt:'2026-09-23T13:01:00.000Z',
              amount:100,
              balance:432.22
            },
            {
              id:'tx-2',
              type:'DEBIT',
              status:'POSTED',
              date:'2026-09-23T14:00:00.000Z',
              order:2,
              updatedAt:'2026-09-23T14:01:00.000Z',
              amount:157.40,
              balance:274.82
            }
          ]
        }]
      }]
    });
    return{
      report,
      balance:accountBalance(1),
      account:state.accounts.find(row=>row.id===1)
    };
  });

  expect(result.report.ok).toBe(true);
  expect(result.balance).toBe(274.82);
  expect(result.account.initial).toBe(274.82);
  expect(result.account.reconciled).toMatchObject({
    balance:274.82,
    source:'open-finance',
    balanceEvidence:'transaction-balance',
    providerUpdatedAt:'2026-09-23T14:01:00.000Z'
  });
});

test('#272 PENDING com balance nunca vence a última transação confirmada',async({page})=>{
  await boot(page,'Pending balance ignored #272');

  const result=await page.evaluate(async()=> {
    await SFPOpenFinanceFinancialTruth.reconcileSnapshot({
      ok:true,
      items:[{
        id:'item-itau',
        institution:'Itaú',
        updatedAt:'2026-09-23T12:00:00.000Z',
        accounts:[{
          id:'acc-itau',
          type:'BANK',
          name:'Itaú',
          marketingName:'Itaú',
          presentationName:'Itaú',
          balance:532.22,
          updatedAt:'2026-09-23T12:00:00.000Z',
          transactions:[
            {id:'posted',type:'DEBIT',status:'POSTED',date:'2026-09-23T14:00:00.000Z',order:1,updatedAt:'2026-09-23T14:01:00.000Z',amount:257.40,balance:274.82},
            {id:'pending',type:'DEBIT',status:'PENDING',date:'2026-09-23T15:00:00.000Z',order:2,updatedAt:'2026-09-23T15:01:00.000Z',amount:174.82,balance:100.00}
          ]
        }]
      }]
    });
    return{
      balance:accountBalance(1),
      evidence:state.accounts[0].reconciled?.balanceEvidence,
      providerUpdatedAt:state.accounts[0].reconciled?.providerUpdatedAt
    };
  });

  expect(result).toEqual({
    balance:274.82,
    evidence:'transaction-balance',
    providerUpdatedAt:'2026-09-23T14:01:00.000Z'
  });
});

test('#272 transação antiga não sobrescreve snapshot de conta mais novo',async({page})=>{
  await boot(page,'Newer account snapshot #272');

  const result=await page.evaluate(async()=> {
    await SFPOpenFinanceFinancialTruth.reconcileSnapshot({
      ok:true,
      items:[{
        id:'item-itau',
        institution:'Itaú',
        updatedAt:'2026-09-23T18:00:00.000Z',
        accounts:[{
          id:'acc-itau',
          type:'BANK',
          name:'Itaú',
          marketingName:'Itaú',
          presentationName:'Itaú',
          balance:300,
          updatedAt:'2026-09-23T18:00:00.000Z',
          transactions:[
            {id:'old',type:'DEBIT',status:'POSTED',date:'2026-09-23T14:00:00.000Z',order:1,updatedAt:'2026-09-23T14:01:00.000Z',amount:257.40,balance:274.82}
          ]
        }]
      }]
    });
    return{
      balance:accountBalance(1),
      evidence:state.accounts[0].reconciled?.balanceEvidence,
      providerUpdatedAt:state.accounts[0].reconciled?.providerUpdatedAt
    };
  });

  expect(result).toEqual({
    balance:300,
    evidence:'account-balance',
    providerUpdatedAt:'2026-09-23T18:00:00.000Z'
  });
});

test('#272 instituição sem transaction.balance mantém account.balance',async({page})=>{
  await boot(page,'No transaction balance #272');

  const result=await page.evaluate(async()=> {
    await SFPOpenFinanceFinancialTruth.reconcileSnapshot({
      ok:true,
      items:[{
        id:'item-itau',
        institution:'Itaú',
        updatedAt:'2026-09-23T12:00:00.000Z',
        accounts:[{
          id:'acc-itau',
          type:'BANK',
          name:'Itaú',
          marketingName:'Itaú',
          presentationName:'Itaú',
          balance:532.22,
          updatedAt:'2026-09-23T12:00:00.000Z',
          transactions:[
            {id:'tx',type:'DEBIT',status:'POSTED',date:'2026-09-23T14:00:00.000Z',order:1,updatedAt:'2026-09-23T14:01:00.000Z',amount:257.40}
          ]
        }]
      }]
    });
    return{
      balance:accountBalance(1),
      evidence:state.accounts[0].reconciled?.balanceEvidence
    };
  });

  expect(result).toEqual({
    balance:532.22,
    evidence:'account-balance'
  });
});

test('#272 fonte duplicada com transaction.balance mais nova vence snapshot antigo',async({page})=>{
  await boot(page,'Duplicate Item transaction balance #272');

  const result=await page.evaluate(async()=> {
    await SFPOpenFinanceFinancialTruth.reconcileSnapshot({
      ok:true,
      items:[
        {
          id:'item-old',
          institution:'Itaú',
          updatedAt:'2026-09-22T18:00:00.000Z',
          accounts:[{
            id:'acc-old',type:'BANK',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',
            balance:532.22,updatedAt:'2026-09-22T18:00:00.000Z',transactions:[]
          }]
        },
        {
          id:'item-current',
          institution:'Itaú',
          updatedAt:'2026-09-23T12:00:00.000Z',
          accounts:[{
            id:'acc-current',type:'BANK',name:'Itaú',marketingName:'Itaú',presentationName:'Itaú',
            balance:532.22,updatedAt:'2026-09-23T12:00:00.000Z',
            transactions:[
              {id:'tx-current',type:'DEBIT',status:'POSTED',date:'2026-09-23T14:00:00.000Z',order:1,updatedAt:'2026-09-23T14:01:00.000Z',amount:257.40,balance:274.82}
            ]
          }]
        }
      ]
    });
    return{
      balance:accountBalance(1),
      evidence:state.accounts[0].reconciled?.balanceEvidence,
      providerUpdatedAt:state.accounts[0].reconciled?.providerUpdatedAt
    };
  });

  expect(result).toEqual({
    balance:274.82,
    evidence:'transaction-balance',
    providerUpdatedAt:'2026-09-23T14:01:00.000Z'
  });
});
