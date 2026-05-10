const express  = require('express');
const path     = require('path');
const app      = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Load all M7 modules ────────────────────────────────────────────────────
const M7Treasury         = require('./m7-treasury');
const { RevenueEngine }  = require('./revenue-engine');
const RealEventIngestion = require('./real-event-ingestion');
const AWSExchange        = require('./aws-exchange');
const AutonomousRevenue  = require('./autonomous-revenue');
const M7AIBrain          = require('./m7-ai-brain');
const rapidApiRouter     = require('./rapidapi-gateway');

// ── Boot sequence ──────────────────────────────────────────────────────────
console.log('');
console.log('🚀 M7-77 SOVEREIGN SYSTEM v3.0 BOOTING...');
console.log('');

// 1. Treasury
const treasury = new M7Treasury();

// 2. Revenue engine — 12 domains, momentum pricing
const revenueEngine = new RevenueEngine(treasury);

// 3. AWS Exchange
const awsExchange = new AWSExchange(treasury);
awsExchange.addSubscriber({ name: 'HEDGE_FUND_ALPHA',    domains: ['finance','government','defense'],       tier: 'enterprise' });
awsExchange.addSubscriber({ name: 'GOV_INTEL_CLIENT',    domains: ['government','defense','legal'],         tier: 'enterprise' });
awsExchange.addSubscriber({ name: 'CYBER_SECURITY_FIRM', domains: ['cybersecurity','defense'],              tier: 'enterprise' });
awsExchange.addSubscriber({ name: 'HEALTH_ANALYTICS_CO', domains: ['healthcare','legal'],                   tier: 'standard'   });
awsExchange.addSubscriber({ name: 'SUPPLY_CHAIN_INTEL',  domains: ['supplychain','energy','finance'],       tier: 'standard'   });

// 4. Autonomous revenue engine
const autonomousRevenue = new AutonomousRevenue(treasury, revenueEngine);
autonomousRevenue.startGrowthLoop();

// 5. M7 AI Brain — full intelligence + speed
const brain = new M7AIBrain();

// 6. Event ingestion — 80+ sources, 12 domains
const ingestion = new RealEventIngestion();

// ── Global state ───────────────────────────────────────────────────────────
global.m7recentEvents = [];
global.m7state = {
  startTime:   Date.now(),
  totalEvents: 0
};

// Wire brain to revenue and ingestion
brain.wire(revenueEngine, ingestion);

// ── Event pipeline ─────────────────────────────────────────────────────────
// ingestion → brain (handles revenue recording internally)
// ingestion → global state + aws exchange
ingestion.on('event', (event) => {
  global.m7state.totalEvents++;

  // Brain ingests and processes — it calls revenueEngine.recordEvent internally
  brain.ingestEvent(event);

  // Enrich with pricing for display
  const PRICING = {
    finance:1.00,government:0.80,healthcare:0.75,health:0.75,
    ai:0.50,energy:0.40,tech:0.20,social:0.10,
    defense:2.00,cybersecurity:1.80,legal:1.50,
    realestate:1.20,supplychain:1.10
  };
  const base  = PRICING[event.domain] || 0.10;
  const total = base + base * 5 + base * 20;

  const enriched = { ...event, value: base, total: parseFloat(total.toFixed(2)) };

  global.m7recentEvents.push(enriched);
  if (global.m7recentEvents.length > 200) global.m7recentEvents.shift();

  // AWS Exchange auto-delivery every 100 events
  if (global.m7state.totalEvents % 100 === 0) {
    awsExchange.autoDeliver(global.m7recentEvents.slice(-100));
  }
});

// Brain events — log to console
brain.on('threat_detected', (threat) => {
  console.log(`🚨 THREAT: ${threat.detail}`);
});
brain.on('opportunity', (opp) => {
  if (opp.urgency === 'URGENT' || opp.urgency === 'CRITICAL') {
    console.log(`🎯 URGENT OPP [${opp.domain.toUpperCase()}]: ${opp.clientType}`);
  }
});

// ── Start everything ───────────────────────────────────────────────────────
ingestion.start();
brain.start();

// ── Mount RapidAPI gateway ─────────────────────────────────────────────────
app.use('/rapidapi', rapidApiRouter);

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Main status
app.get('/api/status', (req, res) => {
  const rev    = revenueEngine.getReport();
  const treas  = treasury.getStatus();
  const ingest = ingestion.getStats();
  const brainS = brain.getStatus();

  res.json({
    status: 'LIVE', system: 'M7-77', owner: 'SECKA',
    uptime: process.uptime(),
    edab: {
      totalBilled: rev.total,
      totalEvents: rev.transactionCount,
      streams: {
        eventProcessing:     rev.streams.eventProcessing,
        intelligenceLicense: rev.streams.intelligenceLicense,
        dataProduct:         rev.streams.dataProduct,
        premium:             rev.streams.premium
      },
      domainBreakdown: rev.domainBreakdown,
      momentum:        rev.momentum,
      velocity:        rev.velocity
    },
    ingestion: {
      totalEvents:  ingest.totalEvents,
      sources:      ingest.sources,
      domains:      12,
      domainCounts: ingest.domainCounts,
      errors:       ingest.errors,
      status:       ingest.status
    },
    treasury: {
      balance:       treas.balance,
      ledgerEntries: treas.ledgerEntries,
      routes:        treas.routes
    },
    brain: {
      processedCount:   brainS.processedCount,
      loopInterval:     brainS.loopInterval,
      speedMetrics:     brainS.speedMetrics,
      knowledgeBase:    brainS.knowledgeBase,
      threats:          brainS.threats,
      opportunities:    brainS.opportunities,
      urgentLeads:      brainS.urgentLeads,
      pitchesGenerated: brainS.pitchesGenerated,
      recentDecisions:  brainS.recentDecisions,
      operations:       brainS.operations
    },
    awsExchange:  awsExchange.getStatus(),
    recentEvents: global.m7recentEvents.slice(-20)
  });
});

// Brain status
app.get('/api/brain', (req, res) => res.json(brain.getStatus()));

// Opportunities
app.get('/api/opportunities', (req, res) => {
  res.json({
    urgent:  brain.clientEngine.urgentLeads.slice(-10).reverse(),
    top:     brain.clientEngine.getTopOpportunities(10),
    total:   brain.clientEngine.pitchesGenerated
  });
});

// Intelligence reports
app.get('/api/reports', (req, res) => res.json(brain.reports));

// Threats
app.get('/api/threats', (req, res) => {
  res.json(brain.intelligence.threatLog.slice(-20).reverse());
});

// Revenue
app.get('/api/revenue', (req, res) => res.json(revenueEngine.getReport()));

// Ledger
app.get('/api/ledger', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ total: treasury.ledger.length, balance: treasury.balance, transactions: treasury.getRecentLedger(limit) });
});

// Treasury
app.get('/api/treasury', (req, res) => res.json(treasury.getStatus()));

// Treasury — add route
app.post('/api/treasury/route', (req, res) => {
  const { name, type, address, allocation } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  treasury.addRoute({ name, type, address, allocation });
  res.json({ success: true, routes: treasury.routes });
});

// Treasury — transfer
app.post('/api/treasury/transfer', (req, res) => {
  const { amount, destination } = req.body;
  if (!amount || !destination) return res.status(400).json({ error: 'amount and destination required' });
  res.json(treasury.debit(parseFloat(amount), destination));
});

// AWS Exchange
app.get('/api/exchange', (req, res) => res.json(awsExchange.getStatus()));

// Autonomous revenue
app.get('/api/autonomous', (req, res) => res.json(autonomousRevenue.getStatus()));

// Issue API key
app.post('/api/subscribers', (req, res) => {
  const { name, plan, domain } = req.body;
  if (!name || !plan) return res.status(400).json({ error: 'name and plan required' });
  const key = autonomousRevenue.issueApiKey(name, plan, domain || 'all');
  res.json({ success: true, apiKey: key, subscriber: name, plan });
});

// Meter real API call
app.post('/api/call', (req, res) => {
  const { apiKey, domain } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
  const result = autonomousRevenue.meterRealCall(apiKey, domain || 'tech');
  if (!result.authorized) return res.status(401).json(result);
  const events = (global.m7recentEvents || [])
    .filter(e => domain === 'all' || e.domain === domain)
    .slice(-10);
  res.json({ ...result, events });
});

// Transactions
app.get('/api/transactions', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(revenueEngine.getRecentTransactions(limit));
});

// Health
app.get('/health', (req, res) => res.json({
  status:    'LIVE',
  uptime:    process.uptime(),
  events:    global.m7state.totalEvents,
  revenue:   treasury.balance,
  brain:     brain.isRunning,
  ingestion: ingestion.isRunning,
  domains:   12,
  sources:   ingestion.sources.length
}));

// ── Start server ───────────────────────────────────────────────────────────
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('');
  console.log('█▀▄▀█ ▀▀███ ▄▄  ▄▄▀▀▀▀█▀▀');
  console.log('█ ▀ █   ███ ██  ██▄▄    █  ');
  console.log('█   █   ███ ██  ██       █  ');
  console.log('▀   ▀ ▀▀███ ▀▀  ▀▀▀▀▀▀▀▀▀  ');
  console.log('');
  console.log(`✅ M7-77 v3.0 FULLY LIVE — port ${port}`);
  console.log(`🧠 AI Brain     → AUTONOMOUS`);
  console.log(`🌐 Sources      → ${ingestion.sources.length} across 12 domains`);
  console.log(`💰 Revenue      → 12-domain tiered + momentum pricing`);
  console.log(`🏦 Treasury     → SOVEREIGN`);
  console.log(`🎯 Client Engine → HUNTING`);
  console.log(`📡 RapidAPI GW  → LIVE`);
  console.log('');
});
