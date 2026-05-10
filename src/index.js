const express  = require('express');
const path     = require('path');
const app      = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Load all M7 modules ────────────────────────────────────────────────────
const M7Treasury             = require('./m7-treasury');
const { RevenueEngine }      = require('./revenue-engine');
const RealEventIngestion     = require('./real-event-ingestion');
const AWSExchange            = require('./aws-exchange');
const rapidApiRouter         = require('./rapidapi-gateway');

// ── Boot sequence ──────────────────────────────────────────────────────────
console.log('');
console.log('🚀 M7-77 SOVEREIGN SYSTEM BOOTING...');
console.log('');

// 1. Treasury first — everything flows through it
const treasury = new M7Treasury();

// 2. Revenue engine — wired to treasury
const revenueEngine = new RevenueEngine(treasury);

// 3. AWS Exchange — wired to treasury
const awsExchange = new AWSExchange(treasury);

// Add demo enterprise subscribers (replace with real ones when live on AWS)
awsExchange.addSubscriber({ name: 'HEDGE_FUND_ALPHA',   domains: ['finance', 'government'], tier: 'enterprise' });
awsExchange.addSubscriber({ name: 'GOV_INTEL_CLIENT',   domains: ['government', 'ai'],      tier: 'enterprise' });
awsExchange.addSubscriber({ name: 'HEALTH_ANALYTICS_CO',domains: ['healthcare', 'ai'],      tier: 'standard'   });

// 4. Event ingestion — the heartbeat of M7
const ingestion = new RealEventIngestion();

// Global state — dashboard and API read from here
global.m7recentEvents = [];
global.m7state = {
  startTime: Date.now(),
  totalEvents: 0
};

// Wire ingestion → revenue engine → treasury → aws exchange
ingestion.on('event', (event) => {
  global.m7state.totalEvents++;

  // Record revenue (auto-credits treasury)
  const tx = revenueEngine.recordEvent(event);

  // Enrich event with revenue data
  const enriched = {
    ...event,
    total:   tx.pricing.totalRevenue,
    revenue: tx.pricing
  };

  // Rolling window of last 100 events
  global.m7recentEvents.push(enriched);
  if (global.m7recentEvents.length > 100) global.m7recentEvents.shift();

  // Auto-deliver to AWS Exchange subscribers every 50 events
  if (global.m7state.totalEvents % 50 === 0) {
    awsExchange.autoDeliver(global.m7recentEvents.slice(-50));
  }
});

// Start ingestion
ingestion.start();

// ── Mount RapidAPI gateway ─────────────────────────────────────────────────
app.use('/rapidapi', rapidApiRouter);

// ── Dashboard ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// ── Core API ───────────────────────────────────────────────────────────────

// Main status — dashboard polls this every 5s
app.get('/api/status', (req, res) => {
  const rev    = revenueEngine.getReport();
  const treas  = treasury.getStatus();
  const ingest = ingestion.getStats();

  res.json({
    status:  'LIVE',
    system:  'M7-77',
    owner:   'SECKA',
    uptime:  process.uptime(),
    edab: {
      totalBilled: rev.total,
      totalEvents: rev.transactionCount,
      streams: {
        eventProcessing:     rev.streams.eventProcessing,
        intelligenceLicense: rev.streams.intelligenceLicense,
        dataProduct:         rev.streams.dataProduct
      },
      domainBreakdown: rev.domainBreakdown
    },
    ingestion: {
      totalEvents: ingest.totalEvents,
      sources:     ingest.sources,
      domains:     7,
      status:      ingest.status
    },
    treasury: {
      balance:       treas.balance,
      ledgerEntries: treas.ledgerEntries,
      routes:        treas.routes
    },
    awsExchange: awsExchange.getStatus(),
    recentEvents: global.m7recentEvents.slice(-20)
  });
});

// Revenue breakdown
app.get('/api/revenue', (req, res) => {
  res.json(revenueEngine.getReport());
});

// Full ledger
app.get('/api/ledger', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({
    total:        treasury.ledger.length,
    balance:      treasury.balance,
    transactions: treasury.getRecentLedger(limit)
  });
});

// Treasury status
app.get('/api/treasury', (req, res) => {
  res.json(treasury.getStatus());
});

// Treasury — add routing rail
app.post('/api/treasury/route', (req, res) => {
  const { name, type, address, allocation } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  treasury.addRoute({ name, type, address, allocation });
  res.json({ success: true, routes: treasury.routes });
});

// Treasury — authorize transfer
app.post('/api/treasury/transfer', (req, res) => {
  const { amount, destination } = req.body;
  if (!amount || !destination) return res.status(400).json({ error: 'amount and destination required' });
  const result = treasury.debit(parseFloat(amount), destination);
  res.json(result);
});

// AWS Exchange status
app.get('/api/exchange', (req, res) => {
  res.json(awsExchange.getStatus());
});

// Recent transactions
app.get('/api/transactions', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(revenueEngine.getRecentTransactions(limit));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status:  'LIVE',
    uptime:  process.uptime(),
    events:  global.m7state.totalEvents,
    revenue: treasury.balance,
    ingestion: ingestion.isRunning
  });
});

// ── Start server ───────────────────────────────────────────────────────────
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('');
  console.log('██╗   ██╗███████╗      ███████╗███████╗');
  console.log('███╗ ███║╚════██║      ╚════██║╚════██║');
  console.log('██╔███╔██║    ██╔╝          ██╔╝    ██╔╝');
  console.log('██║╚═╝ ██║   ██╔╝          ██╔╝    ██╔╝');
  console.log('██║    ██║   ██║           ██║     ██║ ');
  console.log('╚═╝    ╚═╝   ╚═╝           ╚═╝     ╚═╝ ');
  console.log('');
  console.log(`✅ M7-77 FULLY LIVE on port ${port}`);
  console.log(`📊 Dashboard     → http://localhost:${port}`);
  console.log(`💰 Revenue API   → http://localhost:${port}/api/revenue`);
  console.log(`🏦 Treasury API  → http://localhost:${port}/api/treasury`);
  console.log(`📋 Ledger API    → http://localhost:${port}/api/ledger`);
  console.log(`🌐 RapidAPI GW   → http://localhost:${port}/rapidapi/events`);
  console.log(`📦 AWS Exchange  → http://localhost:${port}/api/exchange`);
  console.log('');
  console.log('⚡ All systems nominal — SECKA DPI Framework active');
  console.log('');
});
