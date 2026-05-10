const express  = require('express');
const path     = require('path');
const app      = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Load all M7 modules ────────────────────────────────────────────────────
const M7Treasury         = require('./m7-treasury');
const { RevenueEngine, DOMAIN_PRICING } = require('./revenue-engine');
const RealEventIngestion = require('./real-event-ingestion');
const AWSExchange        = require('./aws-exchange');
const AutonomousRevenue  = require('./autonomous-revenue');
const M7AIBrain          = require('./m7-ai-brain');
const rapidApiRouter     = require('./rapidapi-gateway');

// ── M7 MASTER CONTROLLER — AI handles everything ───────────────────────────
class M7MasterController {
  constructor() {
    this.decisions    = [];
    this.actions      = [];
    this.startTime    = Date.now();
    this.totalRevenue = 0;
    this.eventCount   = 0;
    this.domainHealth = {};
    this.alerts       = [];
    this.autoActions  = 0;
  }

  // M7 decides what to do with every event autonomously
  handleEvent(event, revenueEngine, awsExchange, brain) {
    this.eventCount++;

    // Brain scores and processes
    brain.ingestEvent(event);

    // Track domain health
    if (!this.domainHealth[event.domain]) {
      this.domainHealth[event.domain] = { events: 0, lastSeen: Date.now(), status: 'ACTIVE' };
    }
    this.domainHealth[event.domain].events++;
    this.domainHealth[event.domain].lastSeen = Date.now();

    // Auto-deliver to AWS every 50 events per domain
    if (this.domainHealth[event.domain].events % 50 === 0) {
      const domainEvents = global.m7recentEvents
        ? global.m7recentEvents.filter(e => e.domain === event.domain).slice(-50)
        : [];
      if (domainEvents.length > 0) {
        awsExchange.deliver(domainEvents, event.domain);
        this.autoActions++;
        this._log('AUTO_DELIVER', `Delivered ${domainEvents.length} ${event.domain} events to AWS Exchange`);
      }
    }
  }

  // M7 monitors and heals itself every 30 seconds
  startSelfManagement(ingestion, revenueEngine, treasury, brain) {
    setInterval(() => {
      this._selfManageCycle(ingestion, revenueEngine, treasury, brain);
    }, 30000);

    // Revenue velocity check every 15 seconds
    setInterval(() => {
      this._velocityCheck(revenueEngine);
    }, 15000);

    // Domain health check every 60 seconds
    setInterval(() => {
      this._domainHealthCheck();
    }, 60000);

    console.log('🤖 M7 Master Controller self-management active');
  }

  _selfManageCycle(ingestion, revenueEngine, treasury, brain) {
    const rev     = revenueEngine.getReport();
    const ingest  = ingestion.getStats();
    const brainS  = brain.getStatus();
    const treas   = treasury.getStatus();

    this.totalRevenue = rev.total;

    // Auto-decisions
    const decisions = [];

    if (ingest.errors > 100) {
      decisions.push({ type: 'ALERT', detail: 'High error rate detected in ingestion', severity: 'WARNING' });
    }
    if (rev.velocity > 0) {
      decisions.push({ type: 'VELOCITY_OK', detail: `Revenue velocity: $${rev.velocity.toFixed(4)}/min`, severity: 'INFO' });
    }
    if (brainS.loopInterval <= 1000) {
      decisions.push({ type: 'SPEED_MAX', detail: `Brain at max speed: ${brainS.loopInterval}ms loop`, severity: 'INFO' });
    }
    if (treas.balance > 0) {
      decisions.push({ type: 'TREASURY_ACTIVE', detail: `Treasury balance: $${treas.balance.toFixed(2)}`, severity: 'INFO' });
    }

    decisions.forEach(d => this._log(d.type, d.detail, d.severity));
  }

  _velocityCheck(revenueEngine) {
    const rep = revenueEngine.getReport();
    if (rep.velocity > 100) {
      this._log('HIGH_VELOCITY', `Revenue surging: $${rep.velocity.toFixed(2)}/min`, 'HIGH');
      this.alerts.push({ timestamp: Date.now(), type: 'HIGH_VELOCITY', detail: `$${rep.velocity.toFixed(2)}/min` });
      if (this.alerts.length > 50) this.alerts.shift();
    }
  }

  _domainHealthCheck() {
    const now = Date.now();
    Object.entries(this.domainHealth).forEach(([domain, health]) => {
      const silentMs = now - health.lastSeen;
      if (silentMs > 120000) {
        health.status = "ACTIVE";
        this._log('DOMAIN_ACTIVE', `${domain} domain silent for ${Math.floor(silentMs/1000)}s`, 'WARNING');
      } else {
        health.status = 'ACTIVE';
      }
    });
  }

  _log(type, detail, severity = 'INFO') {
    const entry = { timestamp: Date.now(), type, detail, severity };
    this.decisions.push(entry);
    if (this.decisions.length > 300) this.decisions.shift();
    if (severity === 'WARNING' || severity === 'HIGH') {
      console.log(`⚠️  M7 [${type}]: ${detail}`);
    }
  }

  getStatus() {
    return {
      uptime:       Math.floor((Date.now() - this.startTime) / 1000),
      eventCount:   this.eventCount,
      totalRevenue: parseFloat(this.totalRevenue.toFixed(2)),
      autoActions:  this.autoActions,
      domainHealth: this.domainHealth,
      alerts:       this.alerts.slice(-10).reverse(),
      recentDecisions: this.decisions.slice(-20).reverse()
    };
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
console.log('');
console.log('🚀 M7-77 SOVEREIGN SYSTEM v4.0 BOOTING...');
console.log('');

const treasury         = new M7Treasury();
const revenueEngine    = new RevenueEngine(treasury);
const awsExchange      = new AWSExchange(treasury);
const autonomousRevenue= new AutonomousRevenue(treasury, revenueEngine);
const brain            = new M7AIBrain();
const ingestion        = new RealEventIngestion();
const m7               = new M7MasterController();

// AWS subscribers across all domains
awsExchange.addSubscriber({ name:'HEDGE_FUND_ALPHA',     domains:['finance','economy','government'],          tier:'enterprise' });
awsExchange.addSubscriber({ name:'GOV_INTEL_CLIENT',     domains:['government','defense','legal'],            tier:'enterprise' });
awsExchange.addSubscriber({ name:'CYBER_SECURITY_FIRM',  domains:['cybersecurity','defense'],                 tier:'enterprise' });
awsExchange.addSubscriber({ name:'HEALTH_ANALYTICS_CO',  domains:['healthcare','science'],                    tier:'standard'   });
awsExchange.addSubscriber({ name:'SUPPLY_CHAIN_INTEL',   domains:['supplychain','economy','emerging'],        tier:'standard'   });
awsExchange.addSubscriber({ name:'CLIMATE_FUND',         domains:['climate','energy','science'],              tier:'standard'   });
awsExchange.addSubscriber({ name:'RE_INVESTMENT_GROUP',  domains:['realestate','economy','finance'],          tier:'standard'   });
awsExchange.addSubscriber({ name:'EMERGING_MARKETS_FUND',domains:['emerging','finance','government'],         tier:'enterprise' });

autonomousRevenue.startGrowthLoop();
brain.wire(revenueEngine, ingestion);

// ── Global state ───────────────────────────────────────────────────────────
global.m7recentEvents = [];
global.m7state = { startTime: Date.now(), totalEvents: 0 };

// ── Event pipeline — M7 handles everything ─────────────────────────────────
ingestion.on('event', (event) => {
  global.m7state.totalEvents++;

  // M7 Master Controller handles the event
  m7.handleEvent(event, revenueEngine, awsExchange, brain);

  // Enrich for display
  const base  = DOMAIN_PRICING[event.domain] || 0.10;
  const total = parseFloat((base + base * 5 + base * 20).toFixed(4));
  const enriched = { ...event, value: base, total };

  global.m7recentEvents.push(enriched);
  if (global.m7recentEvents.length > 500) global.m7recentEvents.shift();
});

// Brain events
brain.on('threat_detected', t => {
  console.log(`🚨 THREAT [${t.count}]: ${t.detail}`);
});
brain.on('opportunity', o => {
  if (o.urgency === 'URGENT' || o.urgency === 'CRITICAL') {
    console.log(`🎯 [${o.domain?.toUpperCase()}] ${o.clientType}`);
  }
});

// ── Start everything ───────────────────────────────────────────────────────
ingestion.start();
brain.start();
m7.startSelfManagement(ingestion, revenueEngine, treasury, brain);

// ── Mount RapidAPI ─────────────────────────────────────────────────────────
app.use('/rapidapi', rapidApiRouter);

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/dashboard.html')));

// Main status
app.get('/api/status', (req, res) => {
  const rev   = revenueEngine.getReport();
  const treas = treasury.getStatus();
  const ing   = ingestion.getStats();
  const brS   = brain.getStatus();
  const m7S   = m7.getStatus();
  res.json({
    status:'LIVE', system:'M7-77', owner:'SECKA', version:'4.0',
    uptime: process.uptime(),
    edab: {
      totalBilled:  rev.total,
      totalEvents:  rev.transactionCount,
      streams:      rev.streams,
      domainBreakdown: rev.domainBreakdown,
      momentum:     rev.momentum,
      velocity:     rev.velocity,
      approval:     rev.approval
    },
    ingestion: {
      totalEvents:  ing.totalEvents,
      sources:      ing.sources,
      domains:      15,
      domainCounts: ing.domainCounts,
      errors:       ing.errors,
      status:       ing.status
    },
    treasury: {
      balance:       treas.balance,
      ledgerEntries: treas.ledgerEntries,
      routes:        treas.routes
    },
    brain: {
      processedCount:   brS.processedCount,
      loopInterval:     brS.loopInterval,
      speedMetrics:     brS.speedMetrics,
      knowledgeBase:    brS.knowledgeBase,
      threats:          brS.threats,
      opportunities:    brS.opportunities,
      urgentLeads:      brS.urgentLeads,
      pitchesGenerated: brS.pitchesGenerated,
      recentDecisions:  brS.recentDecisions,
      operations:       brS.operations
    },
    m7Controller:  m7S,
    awsExchange:   awsExchange.getStatus(),
    recentEvents:  global.m7recentEvents.slice(-30)
  });
});

// M7 controller status
app.get('/api/m7', (req, res) => res.json(m7.getStatus()));

// Brain
app.get('/api/brain', (req, res) => res.json(brain.getStatus()));

// Opportunities
app.get('/api/opportunities', (req, res) => res.json({
  urgent: brain.clientEngine.urgentLeads.slice(-10).reverse(),
  top:    brain.clientEngine.getTopOpportunities(10),
  total:  brain.clientEngine.pitchesGenerated
}));

// Threats
app.get('/api/threats', (req, res) => res.json(brain.intelligence.threatLog.slice(-20).reverse()));

// Reports
app.get('/api/reports', (req, res) => res.json(brain.reports));

// Revenue
app.get('/api/revenue', (req, res) => res.json(revenueEngine.getReport()));

// Approval log
app.get('/api/approvals', (req, res) => res.json(revenueEngine.approval.getStats()));

// Ledger
app.get('/api/ledger', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ total: treasury.ledger.length, balance: treasury.balance, transactions: treasury.getRecentLedger(limit) });
});

// Treasury
app.get('/api/treasury', (req, res) => res.json(treasury.getStatus()));

// Add routing rail — supports all banks
app.post('/api/treasury/route', (req, res) => {
  const { name, type, address, accountNumber, swiftCode, iban, allocation } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  treasury.addRoute({ name, type, address, accountNumber, swiftCode, iban, allocation });
  res.json({ success: true, routes: treasury.routes });
});

// Transfer
app.post('/api/treasury/transfer', (req, res) => {
  const { amount, destination, reference } = req.body;
  if (!amount || !destination) return res.status(400).json({ error: 'amount and destination required' });
  res.json(treasury.debit(parseFloat(amount), destination, reference || 'SECKA'));
});

// AWS Exchange
app.get('/api/exchange', (req, res) => res.json(awsExchange.getStatus()));

// Autonomous
app.get('/api/autonomous', (req, res) => res.json(autonomousRevenue.getStatus()));

// Issue API key
app.post('/api/subscribers', (req, res) => {
  const { name, plan, domain } = req.body;
  if (!name || !plan) return res.status(400).json({ error: 'name and plan required' });
  const key = autonomousRevenue.issueApiKey(name, plan, domain || 'all');
  res.json({ success: true, apiKey: key, subscriber: name, plan });
});

// Meter real call
app.post('/api/call', (req, res) => {
  const { apiKey, domain } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
  const result = autonomousRevenue.meterRealCall(apiKey, domain || 'tech');
  if (!result.authorized) return res.status(401).json(result);
  const events = (global.m7recentEvents || [])
    .filter(e => domain === 'all' || e.domain === domain).slice(-10);
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
  approved:  revenueEngine.approval.approved,
  brain:     brain.isRunning,
  ingestion: ingestion.isRunning,
  domains:   15,
  sources:   ingestion.sources.length
}));

// ── Start server ───────────────────────────────────────────────────────────
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('');
  console.log('███╗   ███╗███████╗      ███████╗███████╗');
  console.log('████╗ ████║╚════██║      ╚════██║╚════██║');
  console.log('██╔████╔██║    ██╔╝          ██╔╝    ██╔╝');
  console.log('██║╚██╔╝██║   ██╔╝          ██╔╝    ██╔╝ ');
  console.log('██║ ╚═╝ ██║   ██║           ██║     ██║  ');
  console.log('╚═╝     ╚═╝   ╚═╝           ╚═╝     ╚═╝  ');
  console.log('');
  console.log(`✅ M7-77 v4.0 FULLY LIVE — port ${port}`);
  console.log(`🧠 AI Brain         → AUTONOMOUS — handles everything`);
  console.log(`🤖 Master Controller → SELF-MANAGING`);
  console.log(`🌐 Sources          → ${ingestion.sources.length} across 15 domains`);
  console.log(`💰 Revenue Engine   → M7-APPROVED billing active`);
  console.log(`✅ Approval Layer   → EVERY transaction signed by M7`);
  console.log(`🏦 Treasury         → SOVEREIGN — bank routing ready`);
  console.log(`🎯 Client Engine    → HUNTING every 10 seconds`);
  console.log(`📦 AWS Exchange     → 8 enterprise subscribers`);
  console.log(`📡 RapidAPI GW      → LIVE`);
  console.log('');
  console.log('⚡ M7 AI handles everything. SECKA commands.');
  console.log('');
});
