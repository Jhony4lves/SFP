import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const SERVICE_VERSION = '1.0.0';

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

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function sanitize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|password|credential|authorization|clientsecret|accesskey|apikey/i.test(k)) {
        out[k] = '[REDACTED]';
      } else if (/(^|_)(itemId|accountId|cardId|transactionId|loanId|id)$/i.test(k)) {
        out[k] = v == null ? v : 'hash:' + hashValue(v);
      } else if (/description|merchant|counterparty|document|cpf|cnpj|email|phone/i.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  if (typeof value === 'string') return value.slice(0, 300);
  return value;
}

function finite(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function almostEqual(a, b, tolerance = 0.02) {
  return Math.abs(a - b) <= tolerance;
}

function analyze(payload) {
  const anomalies = [];
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
  const loans = Array.isArray(payload?.loans) ? payload.loans : [];

  for (const card of cards) {
    const limit = finite(card.creditLimit);
    const available = finite(card.availableLimit);
    const used = finite(card.usedLimit);
    const current = finite(card.currentBill);
    const future = finite(card.futureCommitments);

    if (limit != null && available != null && used != null && !almostEqual(limit - available, used, 0.05)) {
      anomalies.push({
        code: 'CARD_LIMIT_MISMATCH',
        institution: card.institution || 'unknown',
        expectedUsed: Number((limit - available).toFixed(2)),
        reportedUsed: used
      });
    }

    if (used != null && current != null && future != null && !almostEqual(current + future, used, 0.05)) {
      anomalies.push({
        code: 'CARD_USAGE_COMPOSITION_MISMATCH',
        institution: card.institution || 'unknown',
        expectedUsed: Number((current + future).toFixed(2)),
        reportedUsed: used
      });
    }

    if (card.currentCycleMonth && card.providerCycleMonth && card.currentCycleMonth !== card.providerCycleMonth) {
      anomalies.push({
        code: 'CARD_CYCLE_DIVERGENCE',
        institution: card.institution || 'unknown',
        sfpCycle: card.currentCycleMonth,
        providerCycle: card.providerCycleMonth
      });
    }
  }

  for (const account of accounts) {
    const provider = finite(account.providerBalance);
    const sfp = finite(account.sfpBalance);
    if (provider != null && sfp != null && !almostEqual(provider, sfp, 0.01)) {
      anomalies.push({
        code: 'ACCOUNT_BALANCE_DIVERGENCE',
        institution: account.institution || 'unknown',
        providerBalance: provider,
        sfpBalance: sfp,
        delta: Number((sfp - provider).toFixed(2))
      });
    }
  }

  for (const loan of loans) {
    const outstanding = finite(loan.outstandingBalance);
    const installment = finite(loan.installmentAmount);
    const months = Number(loan.remainingMonths);
    if (outstanding != null && installment != null && Number.isFinite(months) && months > 0 && installment * months + 0.01 < outstanding) {
      anomalies.push({
        code: 'LOAN_SCHEDULE_UNDERSHOOTS_BALANCE',
        institution: loan.institution || 'unknown',
        outstandingBalance: outstanding,
        scheduledTotal: Number((installment * months).toFixed(2))
      });
    }
  }

  return {
    ok: anomalies.length === 0,
    anomalyCount: anomalies.length,
    anomalies,
    summary: {
      accounts: accounts.length,
      cards: cards.length,
      loans: loans.length
    }
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    return json(res, 200, {
      ok: true,
      service: 'sfp-openfinance-diagnostics',
      version: SERVICE_VERSION,
      storesData: false,
      purpose: 'Compare provider snapshots with SFP financial truth without storing banking data.'
    });
  }

  if (req.method === 'POST' && req.url === '/v1/openfinance/diagnostics') {
    try {
      const payload = await readJson(req);
      const clean = sanitize(payload);
      const analysis = analyze(clean);
      const eventId = crypto.randomUUID();
      console.log(JSON.stringify({
        type: 'sfp_openfinance_diagnostic',
        eventId,
        capturedAt: new Date().toISOString(),
        payload: clean,
        analysis
      }));
      return json(res, 200, { eventId, ...analysis });
    } catch (error) {
      const status = error?.message === 'payload_too_large' ? 413 : 400;
      return json(res, status, { ok: false, error: error?.message || 'invalid_request' });
    }
  }

  return json(res, 404, { ok: false, error: 'not_found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ type: 'startup', service: 'sfp-openfinance-diagnostics', port: PORT, version: SERVICE_VERSION }));
});
