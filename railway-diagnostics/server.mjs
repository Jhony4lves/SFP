import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const SERVICE_VERSION = '1.1.0';

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  });
  res.end(payload);
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value) {
  return value == null ? null : Number(Number(value).toFixed(2));
}

function almostEqual(a, b, tolerance = 0.02) {
  return Math.abs(a - b) <= tolerance;
}

function safeInstitution(value) {
  const text = String(value || 'unknown').replace(/[\r\n\t]+/g, ' ').trim();
  return text.slice(0, 80) || 'unknown';
}

function normalizeInvoiceDiagnostic(payload) {
  const account = payload?.displayCalendar?.account || {};
  const credit = account?.creditData || {};
  const commitment = payload?.commitment || {};
  const evidence = payload?.displayEvidence || {};
  const refresh = payload?.refresh || {};

  const creditLimit = finite(credit.creditLimit);
  const availableLimit = finite(credit.availableCreditLimit);
  const providerBalance = finite(account.balance);
  const bankCurrentUsage = finite(commitment.bankCurrentUsage);
  const usedLimit = bankCurrentUsage ?? providerBalance ?? (
    creditLimit != null && availableLimit != null ? creditLimit - availableLimit : null
  );

  return {
    sourceSchema: String(payload?.schema || 'sfp-invoice-diagnostic-v4'),
    refresh: {
      outcome: String(refresh?.outcome || ''),
      requested: finite(refresh?.request?.requested),
      started: finite(refresh?.request?.started),
      complete: refresh?.request?.complete === true,
      needsUser: refresh?.request?.needsUser === true,
      failed: refresh?.request?.failed === true
    },
    accounts: [],
    cards: [{
      institution: safeInstitution(account.presentationName || account.marketingName || account.name),
      creditLimit,
      availableLimit,
      usedLimit,
      currentBill: finite(evidence.amount),
      sfpProjectedOutstanding: finite(commitment.sfpProjectedOutstanding ?? commitment.sfpOutstanding),
      sfpFuturePlanned: finite(commitment.sfpFuturePlanned),
      billOfficial: evidence.official === true,
      billSource: String(evidence.source || ''),
      bankDueDateAvailable: Boolean(evidence.bankDueDate),
      bankCloseDateAvailable: Boolean(evidence.bankCloseDate),
      transactionCount: finite(evidence.transactionCount),
      pendingCount: finite(evidence.pendingCount),
      paymentsExcluded: finite(evidence.paymentsExcluded)
    }],
    loans: []
  };
}

function normalizeGeneric(payload) {
  return {
    sourceSchema: String(payload?.schema || payload?.sourceSchema || 'generic'),
    refresh: payload?.refresh && typeof payload.refresh === 'object' ? {
      outcome: String(payload.refresh.outcome || ''),
      requested: finite(payload.refresh.requested),
      started: finite(payload.refresh.started),
      complete: payload.refresh.complete === true,
      needsUser: payload.refresh.needsUser === true,
      failed: payload.refresh.failed === true
    } : null,
    sync: payload?.sync && typeof payload.sync === 'object' ? {
      bankUnmapped: finite(payload.sync.bankUnmapped),
      cardUnmapped: finite(payload.sync.cardUnmapped),
      snapshots: finite(payload.sync.snapshots),
      payments: finite(payload.sync.payments),
      already: finite(payload.sync.already),
      review: finite(payload.sync.review)
    } : null,
    accounts: (Array.isArray(payload?.accounts) ? payload.accounts : []).slice(0, 50).map(account => ({
      institution: safeInstitution(account?.institution),
      providerBalance: finite(account?.providerBalance),
      sfpBalance: finite(account?.sfpBalance)
    })),
    cards: (Array.isArray(payload?.cards) ? payload.cards : []).slice(0, 50).map(card => ({
      institution: safeInstitution(card?.institution),
      creditLimit: finite(card?.creditLimit),
      availableLimit: finite(card?.availableLimit),
      usedLimit: finite(card?.usedLimit),
      currentBill: finite(card?.currentBill),
      futureCommitments: finite(card?.futureCommitments),
      sfpProjectedOutstanding: finite(card?.sfpProjectedOutstanding),
      sfpFuturePlanned: finite(card?.sfpFuturePlanned),
      currentCycleMonth: /^\d{4}-\d{2}$/.test(String(card?.currentCycleMonth || '')) ? card.currentCycleMonth : null,
      providerCycleMonth: /^\d{4}-\d{2}$/.test(String(card?.providerCycleMonth || '')) ? card.providerCycleMonth : null
    })),
    loans: (Array.isArray(payload?.loans) ? payload.loans : []).slice(0, 50).map(loan => ({
      institution: safeInstitution(loan?.institution),
      outstandingBalance: finite(loan?.outstandingBalance),
      installmentAmount: finite(loan?.installmentAmount),
      remainingMonths: finite(loan?.remainingMonths)
    }))
  };
}

export function normalize(payload) {
  if (payload?.schema === 'sfp-invoice-diagnostic-v4') return normalizeInvoiceDiagnostic(payload);
  return normalizeGeneric(payload);
}

export function analyze(input) {
  const payload = normalize(input);
  const anomalies = [];

  for (const card of payload.cards) {
    const limit = finite(card.creditLimit);
    const available = finite(card.availableLimit);
    const used = finite(card.usedLimit);
    const current = finite(card.currentBill);
    const future = finite(card.futureCommitments);
    const projected = finite(card.sfpProjectedOutstanding);

    if (limit != null && available != null && used != null && !almostEqual(limit - available, used, 0.05)) {
      anomalies.push({
        code: 'CARD_LIMIT_MISMATCH',
        institution: card.institution,
        expectedUsed: rounded(limit - available),
        reportedUsed: rounded(used)
      });
    }

    if (used != null && current != null && future != null && !almostEqual(current + future, used, 0.05)) {
      anomalies.push({
        code: 'CARD_USAGE_COMPOSITION_MISMATCH',
        institution: card.institution,
        expectedUsed: rounded(current + future),
        reportedUsed: rounded(used)
      });
    }

    if (used != null && projected != null && !almostEqual(used, projected, 0.05)) {
      anomalies.push({
        code: 'CARD_SFP_OUTSTANDING_DIVERGENCE',
        institution: card.institution,
        bankUsage: rounded(used),
        sfpProjectedOutstanding: rounded(projected),
        delta: rounded(projected - used)
      });
    }

    if (card.currentCycleMonth && card.providerCycleMonth && card.currentCycleMonth !== card.providerCycleMonth) {
      anomalies.push({
        code: 'CARD_CYCLE_DIVERGENCE',
        institution: card.institution,
        sfpCycle: card.currentCycleMonth,
        providerCycle: card.providerCycleMonth
      });
    }

    if (card.billOfficial === false) {
      anomalies.push({
        code: 'CARD_BILL_RECONSTRUCTED',
        institution: card.institution,
        source: card.billSource || 'unknown'
      });
    }
  }

  for (const account of payload.accounts) {
    const provider = finite(account.providerBalance);
    const sfp = finite(account.sfpBalance);
    if (provider != null && sfp != null && !almostEqual(provider, sfp, 0.01)) {
      anomalies.push({
        code: 'ACCOUNT_BALANCE_DIVERGENCE',
        institution: account.institution,
        providerBalance: rounded(provider),
        sfpBalance: rounded(sfp),
        delta: rounded(sfp - provider)
      });
    }
  }

  for (const loan of payload.loans) {
    const outstanding = finite(loan.outstandingBalance);
    const installment = finite(loan.installmentAmount);
    const months = finite(loan.remainingMonths);
    if (outstanding != null && installment != null && months != null && months > 0 && installment * months + 0.01 < outstanding) {
      anomalies.push({
        code: 'LOAN_SCHEDULE_UNDERSHOOTS_BALANCE',
        institution: loan.institution,
        outstandingBalance: rounded(outstanding),
        scheduledTotal: rounded(installment * months)
      });
    }
  }

  if (payload.refresh?.outcome === 'rejected' && payload.refresh?.started === 0) {
    anomalies.push({
      code: 'OPENFINANCE_REFRESH_REJECTED',
      requested: payload.refresh.requested,
      started: payload.refresh.started
    });
  }

  if ((payload.sync?.bankUnmapped || 0) > 0) {
    anomalies.push({
      code: 'OPENFINANCE_BANK_UNMAPPED',
      count: payload.sync.bankUnmapped
    });
  }

  if ((payload.sync?.cardUnmapped || 0) > 0) {
    anomalies.push({
      code: 'OPENFINANCE_CARD_UNMAPPED',
      count: payload.sync.cardUnmapped
    });
  }

  if ((payload.sync?.review || 0) > 0) {
    anomalies.push({
      code: 'OPENFINANCE_REVIEW_REQUIRED',
      count: payload.sync.review
    });
  }

  return {
    ok: anomalies.length === 0,
    anomalyCount: anomalies.length,
    anomalies,
    summary: {
      sourceSchema: payload.sourceSchema,
      accounts: payload.accounts.length,
      cards: payload.cards.length,
      loans: payload.loans.length,
      refreshOutcome: payload.refresh?.outcome || null,
      review: payload.sync?.review ?? null,
      bankUnmapped: payload.sync?.bankUnmapped ?? null,
      cardUnmapped: payload.sync?.cardUnmapped ?? null
    },
    normalized: payload
  };
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 512 * 1024) throw new Error('payload_too_large');
  }
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});

    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      return json(res, 200, {
        ok: true,
        service: 'sfp-openfinance-diagnostics',
        version: SERVICE_VERSION,
        storesData: false,
        logsRawTransactions: false,
        purpose: 'Compare provider snapshots with SFP financial truth using aggregate diagnostics only.'
      });
    }

    if (req.method === 'POST' && req.url === '/v1/openfinance/diagnostics') {
      try {
        const raw = await readJson(req);
        const analysis = analyze(raw);
        const eventId = crypto.randomUUID();

        console.log(JSON.stringify({
          type: 'sfp_openfinance_diagnostic',
          eventId,
          capturedAt: new Date().toISOString(),
          summary: analysis.summary,
          anomalies: analysis.anomalies
        }));

        return json(res, 200, {
          eventId,
          ok: analysis.ok,
          anomalyCount: analysis.anomalyCount,
          anomalies: analysis.anomalies,
          summary: analysis.summary,
          normalized: analysis.normalized
        });
      } catch (error) {
        const status = error?.message === 'payload_too_large' ? 413 : 400;
        return json(res, status, { ok: false, error: error?.message || 'invalid_request' });
      }
    }

    return json(res, 404, { ok: false, error: 'not_found' });
  });
}

