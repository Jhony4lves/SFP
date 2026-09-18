import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, normalize } from './server.mjs';

test('generic account divergence is detected', () => {
  const result = analyze({
    accounts: [{ institution: 'Itaú', providerBalance: 532.22, sfpBalance: 530 }]
  });
  assert.equal(result.anomalyCount, 1);
  assert.equal(result.anomalies[0].code, 'ACCOUNT_BALANCE_DIVERGENCE');
  assert.equal(result.anomalies[0].delta, -2.22);
});

test('loan schedule below outstanding balance is detected', () => {
  const result = analyze({
    loans: [{ institution: 'Itaú', outstandingBalance: 4200, installmentAmount: 500, remainingMonths: 8 }]
  });
  assert.equal(result.anomalies[0].code, 'LOAN_SCHEDULE_UNDERSHOOTS_BALANCE');
});

test('invoice diagnostic v4 is reduced to aggregate metrics only', () => {
  const raw = {
    schema: 'sfp-invoice-diagnostic-v4',
    refresh: {
      outcome: 'rejected',
      request: { requested: 3, started: 0, complete: false }
    },
    displayEvidence: {
      amount: 170.84,
      official: false,
      source: 'open-finance-cycle-transactions',
      transactionCount: 13,
      pendingCount: 13,
      paymentsExcluded: 59.99
    },
    displayCalendar: {
      account: {
        id: 'sensitive-id',
        itemId: 'sensitive-item',
        name: 'platinum',
        balance: 400.36,
        creditData: {
          creditLimit: 600,
          availableCreditLimit: 199.64
        },
        transactions: [{
          id: 'transaction-id',
          date: '2026-09-12',
          description: 'Sensitive merchant',
          amount: 86.90
        }]
      }
    },
    commitment: {
      bankCurrentUsage: 400.36,
      sfpProjectedOutstanding: 306.01
    }
  };

  const normalized = normalize(raw);
  const serialized = JSON.stringify(normalized);
  assert.equal(normalized.cards[0].usedLimit, 400.36);
  assert.equal(normalized.cards[0].currentBill, 170.84);
  assert.equal(serialized.includes('Sensitive merchant'), false);
  assert.equal(serialized.includes('transaction-id'), false);
  assert.equal(serialized.includes('2026-09-12'), false);
  assert.equal(serialized.includes('86.9'), false);

  const result = analyze(raw);
  assert.ok(result.anomalies.some(x => x.code === 'CARD_SFP_OUTSTANDING_DIVERGENCE'));
  assert.ok(result.anomalies.some(x => x.code === 'CARD_BILL_RECONSTRUCTED'));
  assert.ok(result.anomalies.some(x => x.code === 'OPENFINANCE_REFRESH_REJECTED'));
});
