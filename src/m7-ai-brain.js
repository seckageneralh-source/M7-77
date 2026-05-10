const EventEmitter = require('events');

const DOMAIN_PRICING = {
  finance:      1.00, government:   0.80, healthcare:   0.75,
  health:       0.75, ai:           0.50, energy:       0.40,
  tech:         0.20, social:       0.10, defense:      2.00,
  cybersecurity:1.80, legal:        1.50, realestate:   1.20,
  supplychain:  1.10
};

const CLIENT_PROFILES = {
  finance:      { type: 'Hedge Fund / Trading Firm',        pitch: 'Real-time market-moving event intelligence. Every second matters.',         urgency: 'CRITICAL' },
  government:   { type: 'Government Contractor / Think Tank',pitch: 'Policy and regulatory intelligence before it hits mainstream news.',        urgency: 'HIGH'     },
  healthcare:   { type: 'Pharma / Hospital Network',         pitch: 'FDA signals, clinical trial results, biotech moves — live.',                urgency: 'HIGH'     },
  ai:           { type: 'AI Research Lab / Tech Company',    pitch: 'Live AI breakthrough detection and research signal monitoring.',            urgency: 'MEDIUM'   },
  energy:       { type: 'Energy Trader / Utility Company',   pitch: 'Oil, solar, renewable market signals updated every 30 seconds.',           urgency: 'HIGH'     },
  tech:         { type: 'VC Firm / Tech Startup',            pitch: 'Startup signals, GitHub trends, developer pulse — live feed.',             urgency: 'MEDIUM'   },
  social:       { type: 'Marketing Agency / PR Firm',        pitch: 'Real-time social pulse and sentiment across global news.',                 urgency: 'LOW'      },
  defense:      { type: 'Defense Contractor / Intelligence Agency', pitch: 'Geopolitical signals, conflict indicators, sanctions monitoring.',  urgency: 'CRITICAL' },
  cybersecurity:{ type: 'CISO / Security Firm',              pitch: 'Live breach alerts, vulnerability signals, ransomware tracking.',          urgency: 'CRITICAL' },
  legal:        { type: 'Law Firm / Compliance Team',        pitch: 'Court rulings, regulatory changes, antitrust signals — automated.',       urgency: 'HIGH'     },
  realestate:   { type: 'Real Estate Fund / Developer',      pitch: 'Housing market signals, mortgage trends, market bubble indicators.',       urgency: 'MEDIUM'   },
  supplychain:  { type: 'Logistics Company / Manufacturer',  pitch: 'Trade war signals, shipping disruptions, supply chain intelligence.',     urgency: 'HIGH'     }
};

class IntelligenceCore {
  constructor() {
    this.knowledgeBase  = {};
    this.patternMemory  = [];
    this.threatLog      = [];
    this.predictions    = [];
  }

  scoreEvent(event) {
    let score = 0.5;
    const type = (event.type || '').toLowerCase();
    const domain = event.domain;

    // High value signals
    if (type.includes('breach') || type.includes('hack'))      score += 0.35;
    if (type.includes('threat') || type.includes('vuln'))      score += 0.30;
    if (type.includes('sanction') || type.includes('nato'))    score += 0.30;
    if (type.includes('fda') || type.includes('clinical'))     score += 0.28;
    if (type.includes('federal') || type.includes('regulat'))  score += 0.25;
    if (type.includes('trade') || type.includes('btc'))        score += 0.20;
    if (type.includes('lawsuit') || type.includes('court'))    score += 0.22;
    if (type.includes('ransomware'))                           score += 0.40;
    if (type.includes('conflict') || type.includes('warfare')) score += 0.35;

    // Domain base value
    const domainBonus = {
      defense: 0.30, cybersecurity: 0.28, legal: 0.22,
      finance: 0.20, government: 0.18, healthcare: 0.16,
      realestate: 0.12, supplychain: 0.12, energy: 0.10,
      ai: 0.08, tech: 0.05, social: 0.02
    };
    score += domainBonus[domain] || 0.05;

    return Math.min(parseFloat(score.toFixed(3)), 1.0);
  }

  isPremium(score)    { return score >= 0.80; }
  isPrediction(score) { return score >= 0.92; }
  isThreat(event)     {
    const t = (event.type || '').toLowerCase();
    return t.includes('breach') || t.includes('ransomware') ||
           t.includes('hack')   || t.includes('vuln')       ||
           t.includes('threat') || t.includes('warfare')    ||
           t.includes('conflict');
  }

  extractInsight(event, score) {
    const profile = CLIENT_PROFILES[event.domain] || { type: 'Enterprise', pitch: 'Live intelligence feed' };
    return {
      domain:     event.domain,
      type:       event.type,
      score,
      isPremium:  this.isPremium(score),
      insight:    `M7 detected ${event.type} in ${event.domain} domain`,
      clientFit:  profile.type,
      value:      DOMAIN_PRICING[event.domain] || 0.10,
      timestamp:  event.timestamp || Date.now()
    };
  }

  rememberPattern(event, score) {
    const key = `${event.domain}:${event.type}`;
    if (!this.knowledgeBase[key]) {
      this.knowledgeBase[key] = { count: 0, avgScore: score, lastSeen: Date.now() };
    }
    const kb = this.knowledgeBase[key];
    kb.count++;
    kb.avgScore = parseFloat(((kb.avgScore + score) / 2).toFixed(3));
    kb.lastSeen = Date.now();

    this.patternMemory.push({ key, score, timestamp: Date.now() });
    if (this.patternMemory.length > 500) this.patternMemory.shift();
  }
}

class ClientAcquisitionEngine {
  constructor() {
    this.opportunities  = [];
    this.urgentLeads    = [];
    this.domainSpikes   = {};
    this.pitchesGenerated = 0;
  }

  detectSpike(domain, eventCount, timeWindow) {
    if (!this.domainSpikes[domain]) {
      this.domainSpikes[domain] = { baseline: 10, current: 0, spiking: false };
    }
    const ds = this.domainSpikes[domain];
    ds.current = eventCount;
    const spikeRatio = ds.current / Math.max(ds.baseline, 1);
    ds.spiking = spikeRatio > 2.5;
    ds.baseline = parseFloat(((ds.baseline * 0.9) + (ds.current * 0.1)).toFixed(1));
    return { spiking: ds.spiking, ratio: parseFloat(spikeRatio.toFixed(2)) };
  }

  generateOpportunity(domain, spike, revenueRate) {
    const profile = CLIENT_PROFILES[domain];
    if (!profile) return null;

    const opp = {
      id:          'opp-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
      timestamp:   Date.now(),
      domain,
      urgency:     spike.spiking ? 'URGENT' : profile.urgency,
      clientType:  profile.type,
      pitch:       profile.pitch,
      pricing:     `$${DOMAIN_PRICING[domain] || 0.10} per 10 events`,
      spikeRatio:  spike.ratio,
      revenueRate: parseFloat(revenueRate.toFixed(2)),
      action:      spike.spiking
        ? `🔥 SPIKE DETECTED — ${domain.toUpperCase()} is ${spike.ratio}x above baseline. Contact ${profile.type} NOW.`
        : `📋 Opportunity — ${profile.type} would benefit from ${domain} intelligence feed.`
    };

    this.pitchesGenerated++;
    this.opportunities.push(opp);
    if (this.opportunities.length > 100) this.opportunities.shift();

    if (opp.urgency === 'URGENT' || opp.urgency === 'CRITICAL') {
      this.urgentLeads.push(opp);
      if (this.urgentLeads.length > 20) this.urgentLeads.shift();
    }

    return opp;
  }

  getTopOpportunities(n = 5) {
    return this.opportunities
      .slice(-20)
      .sort((a, b) => b.spikeRatio - a.spikeRatio)
      .slice(0, n);
  }
}

class OperationsManager {
  constructor() {
    this.healthLog    = [];
    this.alerts       = [];
    this.systemStatus = 'NOMINAL';
    this.metrics      = {
      eventsPerMinute:  0,
      revenuePerMinute: 0,
      errorRate:        0,
      uptime:           Date.now()
    };
  }

  checkHealth(ingestionStats, revenueReport) {
    const issues = [];

    if (ingestionStats.errors > 50)                    issues.push('HIGH_ERROR_RATE');
    if (ingestionStats.totalEvents === 0)              issues.push('NO_EVENTS');
    if (revenueReport && revenueReport.total === 0)    issues.push('ZERO_REVENUE');

    this.systemStatus = issues.length === 0 ? 'NOMINAL'
                      : issues.length  <  2 ? 'DEGRADED'
                      : 'CRITICAL';

    const entry = {
      timestamp:    Date.now(),
      status:       this.systemStatus,
      issues,
      eventsTotal:  ingestionStats.totalEvents,
      sources:      ingestionStats.sources,
      revenue:      revenueReport?.total || 0
    };

    this.healthLog.push(entry);
    if (this.healthLog.length > 100) this.healthLog.shift();

    if (issues.length > 0) {
      this.alerts.push({ timestamp: Date.now(), issues, status: this.systemStatus });
      if (this.alerts.length > 50) this.alerts.shift();
    }

    return entry;
  }

  getStatus() {
    return {
      systemStatus: this.systemStatus,
      uptime:       Math.floor((Date.now() - this.metrics.uptime) / 1000),
      recentAlerts: this.alerts.slice(-5).reverse(),
      lastHealth:   this.healthLog[this.healthLog.length - 1] || null
    };
  }
}

class M7AIBrain extends EventEmitter {
  constructor() {
    super();
    this.intelligence  = new IntelligenceCore();
    this.clientEngine  = new ClientAcquisitionEngine();
    this.operations    = new OperationsManager();

    this.isRunning     = false;
    this.loopInterval  = 3000;
    this.eventBuffer   = [];
    this.processedCount = 0;
    this.decisionLog   = [];
    this.reports       = {};
    this.revenueRef    = null;
    this.ingestionRef  = null;

    // Speed tracker — self-accelerating
    this.speedMetrics  = {
      eventsLast3s:   0,
      currentInterval: 3000,
      accelerations:  0
    };

    console.log('🧠 M7 AI Brain v3.0 initializing — Speed + Intelligence + Autonomy');
  }

  // Called from index.js to wire references
  wire(revenueEngine, ingestion) {
    this.revenueRef   = revenueEngine;
    this.ingestionRef = ingestion;
    console.log('🔌 M7 Brain wired to revenue engine and ingestion');
  }

  // Receive event from ingestion
  ingestEvent(event) {
    this.eventBuffer.push(event);
    // Keep buffer manageable
    if (this.eventBuffer.length > 500) this.eventBuffer.shift();
  }

  // Main burst processor — runs every 3 seconds
  _processBurst() {
    const batch = this.eventBuffer.splice(0, 50);
    if (batch.length === 0) return;

    this.speedMetrics.eventsLast3s = batch.length;
    this.processedCount += batch.length;

    // Self-accelerate based on load
    if (batch.length >= 50 && this.loopInterval > 500) {
      this.loopInterval = Math.max(this.loopInterval - 500, 500);
      this.speedMetrics.accelerations++;
      console.log(`⚡ Brain self-accelerated → ${this.loopInterval}ms loop`);
    } else if (batch.length < 10 && this.loopInterval < 3000) {
      this.loopInterval = Math.min(this.loopInterval + 500, 3000);
    }

    const premiumEvents = [];
    const threatEvents  = [];

    batch.forEach(event => {
      const score   = this.intelligence.scoreEvent(event);
      const insight = this.intelligence.extractInsight(event, score);
      this.intelligence.rememberPattern(event, score);

      // Flag premium and threat events
      if (this.intelligence.isPremium(score))  premiumEvents.push({ event, score, insight });
      if (this.intelligence.isThreat(event))   threatEvents.push({ event, score, insight });

      // Record with correct pricing in revenue engine
      if (this.revenueRef) {
        const isPremium    = this.intelligence.isPremium(score);
        const isPrediction = this.intelligence.isPrediction(score);
        this.revenueRef.recordEvent(event, isPremium, isPrediction);
      }
    });

    // Log premium events
    if (premiumEvents.length > 0) {
      const decision = {
        timestamp: Date.now(),
        type:      'PREMIUM_BATCH',
        count:     premiumEvents.length,
        detail:    `${premiumEvents.length} premium events detected in burst`,
        events:    premiumEvents.slice(0, 3).map(p => ({ domain: p.event.domain, type: p.event.type, score: p.score }))
      };
      this.decisionLog.push(decision);
      this.emit('premium_batch', decision);
    }

    // Threat escalation
    if (threatEvents.length > 0) {
      const threat = {
        timestamp: Date.now(),
        type:      'THREAT_DETECTED',
        count:     threatEvents.length,
        detail:    `⚠️ ${threatEvents.length} threat signals detected`,
        threats:   threatEvents.map(t => ({ domain: t.event.domain, type: t.event.type, score: t.score }))
      };
      this.decisionLog.push(threat);
      this.intelligence.threatLog.push(threat);
      if (this.intelligence.threatLog.length > 50) this.intelligence.threatLog.shift();
      this.emit('threat_detected', threat);
      console.log(`🚨 THREAT: ${threat.detail}`);
    }

    if (this.decisionLog.length > 200) this.decisionLog.shift();
  }

  // Client acquisition loop — runs every 10 seconds
  _runClientLoop() {
    if (!this.ingestionRef) return;
    const stats = this.ingestionRef.getStats();
    const domainCounts = stats.domainCounts || {};
    const rev = this.revenueRef ? this.revenueRef.getReport() : null;

    Object.keys(DOMAIN_PRICING).forEach(domain => {
      const count = domainCounts[domain] || 0;
      const spike = this.clientEngine.detectSpike(domain, count, 10);
      const rate  = rev?.domainBreakdown?.[domain]?.revenue || 0;
      const opp   = this.clientEngine.generateOpportunity(domain, spike, rate);

      if (opp && (spike.spiking || opp.urgency === 'CRITICAL')) {
        console.log(`🎯 CLIENT OPP: ${opp.action}`);
        this.emit('opportunity', opp);
      }
    });
  }

  // Health check loop — runs every 2 minutes
  _runHealthCheck() {
    const ingestionStats = this.ingestionRef ? this.ingestionRef.getStats()   : { totalEvents: 0, sources: 0, errors: 0 };
    const revenueReport  = this.revenueRef   ? this.revenueRef.getReport()    : null;
    const health         = this.operations.checkHealth(ingestionStats, revenueReport);

    if (health.status !== 'NOMINAL') {
      console.log(`⚠️  System health: ${health.status} — Issues: ${health.issues.join(', ')}`);
    }
  }

  // Hourly domain intelligence report
  _generateReport() {
    const rev    = this.revenueRef ? this.revenueRef.getReport() : null;
    const ingest = this.ingestionRef ? this.ingestionRef.getStats() : null;

    Object.keys(DOMAIN_PRICING).forEach(domain => {
      const domainRev   = rev?.domainBreakdown?.[domain] || { events: 0, revenue: 0 };
      const profile     = CLIENT_PROFILES[domain];
      const topPatterns = this.intelligence.patternMemory
        .filter(p => p.key.startsWith(domain))
        .slice(-5);

      this.reports[domain] = {
        domain,
        generatedAt:  Date.now(),
        eventsTotal:  domainRev.events || 0,
        revenue:      parseFloat((domainRev.revenue || 0).toFixed(2)),
        momentum:     rev?.momentum?.[domain]?.events || 0,
        topPatterns,
        clientTarget: profile?.type || 'Enterprise',
        pitch:        profile?.pitch || '',
        status:       'READY_FOR_DELIVERY'
      };
    });

    console.log(`📄 M7 Brain generated ${Object.keys(this.reports).length} domain intelligence reports`);
    this.emit('reports_ready', this.reports);
  }

  start() {
    this.isRunning = true;
    console.log('🚀 M7 AI Brain starting all autonomous loops...');

    // Burst processor — adaptive speed
    const burstLoop = () => {
      if (!this.isRunning) return;
      this._processBurst();
      setTimeout(burstLoop, this.loopInterval);
    };
    setTimeout(burstLoop, this.loopInterval);

    // Client acquisition — every 10 seconds
    setInterval(() => { if (this.isRunning) this._runClientLoop(); }, 10000);

    // Health check — every 2 minutes
    setInterval(() => { if (this.isRunning) this._runHealthCheck(); }, 120000);

    // Intelligence reports — every hour
    setInterval(() => { if (this.isRunning) this._generateReport(); }, 3600000);

    // First report after 30 seconds
    setTimeout(() => this._generateReport(), 30000);

    console.log('✅ All brain loops active — M7 is fully autonomous');
  }

  stop() {
    this.isRunning = false;
    console.log('⏹️  M7 Brain stopped');
  }

  getStatus() {
    return {
      isRunning:      this.isRunning,
      processedCount: this.processedCount,
      bufferSize:     this.eventBuffer.length,
      loopInterval:   this.loopInterval,
      speedMetrics:   this.speedMetrics,
      knowledgeBase:  Object.keys(this.intelligence.knowledgeBase).length,
      patterns:       this.intelligence.patternMemory.length,
      threats:        this.intelligence.threatLog.slice(-5).reverse(),
      opportunities:  this.clientEngine.getTopOpportunities(5),
      urgentLeads:    this.clientEngine.urgentLeads.slice(-5).reverse(),
      pitchesGenerated: this.clientEngine.pitchesGenerated,
      operations:     this.operations.getStatus(),
      recentDecisions:this.decisionLog.slice(-10).reverse(),
      reports:        Object.keys(this.reports).map(d => ({
        domain:    d,
        events:    this.reports[d].eventsTotal,
        revenue:   this.reports[d].revenue,
        generated: this.reports[d].generatedAt
      }))
    };
  }
}

module.exports = M7AIBrain;
