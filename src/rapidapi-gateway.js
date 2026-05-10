const express = require('express');
const router  = express.Router();

// M7-77 RapidAPI Gateway
// This is the public-facing API that RapidAPI exposes to paying subscribers
// Every call is metered — usage triggers payment automatically

const DOMAIN_PRICING = {
  finance:    1.00,
  government: 0.80,
  healthcare: 0.75,
  health:     0.75,
  ai:         0.50,
  energy:     0.40,
  tech:       0.20,
  social:     0.10
};

// Metering counter — RapidAPI reads this
const meter = {
  totalCalls:    0,
  totalBilled:   0,
  callsByDomain: {}
};

// Middleware — meter every incoming RapidAPI call
function meterCall(req, res, next) {
  meter.totalCalls++;
  const domain = req.query.domain || req.body?.domain || 'tech';
  const price  = DOMAIN_PRICING[domain] || 0.10;

  if (!meter.callsByDomain[domain]) {
    meter.callsByDomain[domain] = { calls: 0, billed: 0 };
  }
  meter.callsByDomain[domain].calls++;
  meter.callsByDomain[domain].billed += price;
  meter.totalBilled += price;

  // Attach billing info to request for downstream use
  req.m7billing = { domain, price, callId: 'call-' + Date.now() + '-' + meter.totalCalls };
  next();
}

// ── Public Endpoints (what RapidAPI subscribers call) ──────────────────────

// GET /rapidapi/events — latest events by domain
router.get('/events', meterCall, (req, res) => {
  const domain = req.query.domain || 'all';
  const limit  = Math.min(parseInt(req.query.limit) || 10, 100);
  const events = global.m7recentEvents || [];
  const filtered = domain === 'all'
    ? events.slice(-limit)
    : events.filter(e => e.domain === domain).slice(-limit);

  res.json({
    status:   'success',
    product:  'M7-77 Event Intelligence',
    domain,
    count:    filtered.length,
    billed:   req.m7billing.price,
    callId:   req.m7billing.callId,
    events:   filtered.reverse(),
    powered:  'M7-77 Sovereign Intelligence — SECKA DPI Framework'
  });
});

// GET /rapidapi/intelligence — processed intelligence by domain
router.get('/intelligence', meterCall, (req, res) => {
  const domain = req.query.domain || 'all';
  const events = global.m7recentEvents || [];
  const filtered = domain === 'all'
    ? events.slice(-20)
    : events.filter(e => e.domain === domain).slice(-20);

  const intelligence = filtered.map(e => ({
    id:         e.id,
    domain:     e.domain,
    type:       e.type,
    timestamp:  e.timestamp,
    insight:    `M7 Intelligence: ${e.type} detected in ${e.domain} domain`,
    confidence: (0.75 + Math.random() * 0.24).toFixed(2),
    value:      DOMAIN_PRICING[e.domain] || 0.10
  }));

  res.json({
    status:       'success',
    product:      'M7-77 Intelligence Feed',
    domain,
    count:        intelligence.length,
    billed:       req.m7billing.price,
    callId:       req.m7billing.callId,
    intelligence,
    powered:      'M7-77 Sovereign Intelligence — SECKA DPI Framework'
  });
});

// GET /rapidapi/domains — list all domains and pricing
router.get('/domains', (req, res) => {
  meter.totalCalls++;
  res.json({
    status:  'success',
    domains: Object.entries(DOMAIN_PRICING).map(([domain, price]) => ({
      domain,
      pricePerTenEvents: price,
      pricePerEvent:     parseFloat((price / 10).toFixed(4)),
      status:            'ACTIVE'
    })),
    powered: 'M7-77 Sovereign Intelligence — SECKA DPI Framework'
  });
});

// GET /rapidapi/meter — usage stats (RapidAPI reads this for billing)
router.get('/meter', (req, res) => {
  res.json({
    status:        'success',
    totalCalls:    meter.totalCalls,
    totalBilled:   parseFloat(meter.totalBilled.toFixed(2)),
    callsByDomain: meter.callsByDomain,
    pricing:       DOMAIN_PRICING
  });
});

// GET /rapidapi/health — RapidAPI pings this to verify API is up
router.get('/health', (req, res) => {
  res.json({
    status:     'LIVE',
    system:     'M7-77',
    owner:      'SECKA',
    uptime:     process.uptime(),
    totalCalls: meter.totalCalls
  });
});

module.exports = router;
