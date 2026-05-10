const EventEmitter = require('events');
const crypto = require('crypto');

const DOMAIN_PRICING = {
  finance:      1.00,
  government:   0.80,
  healthcare:   0.75,
  health:       0.75,
  ai:           0.50,
  energy:       0.40,
  tech:         0.20,
  social:       0.10,
  defense:      2.00,
  cybersecurity:1.80,
  legal:        1.50,
  realestate:   1.20,
  supplychain:  1.10,
  science:      0.90,
  climate:      0.60,
  economy:      1.30,
  emerging:     0.70
};

const INTELLIGENCE_MULT = 5;
const DATA_PRODUCT_MULT = 20;
const PREMIUM_MULT      = 3;
const PREDICTION_MULT   = 10;

class M7ApprovalEngine {
  constructor() {
    this.approved  = 0;
    this.rejected  = 0;
    this.log       = [];
  }

  // M7 approves every revenue entry before it commits
  approve(tx) {
    // Validation rules
    if (!tx.domain)                         return this._reject(tx, 'NO_DOMAIN');
    if (!DOMAIN_PRICING[tx.domain] && tx.domain !== 'health') return this._reject(tx, 'UNKNOWN_DOMAIN');
    if (tx.pricing.totalRevenue <= 0)       return this._reject(tx, 'ZERO_REVENUE');
    if (tx.pricing.totalRevenue > 100000)   return this._reject(tx, 'EXCEEDS_LIMIT');

    // Sign the transaction
    tx.approved    = true;
    tx.approvedAt  = Date.now();
    tx.signature   = crypto.createHash('sha256')
      .update(JSON.stringify({ id: tx.id, domain: tx.domain, total: tx.pricing.totalRevenue, ts: tx.approvedAt }))
      .digest('hex').substr(0, 24);
    tx.approvedBy  = 'M7-AI-SOVEREIGN';

    this.approved++;
    this.log.push({ id: tx.id, status: 'APPROVED', signature: tx.signature, ts: tx.approvedAt });
    if (this.log.length > 500) this.log.shift();
    return { approved: true, tx };
  }

  _reject(tx, reason) {
    this.rejected++;
    tx.approved = false;
    tx.rejectedReason = reason;
    this.log.push({ id: tx.id, status: 'REJECTED', reason, ts: Date.now() });
    if (this.log.length > 500) this.log.shift();
    return { approved: false, reason };
  }

  getStats() {
    return {
      approved:     this.approved,
      rejected:     this.rejected,
      approvalRate: this.approved + this.rejected > 0
        ? ((this.approved / (this.approved + this.rejected)) * 100).toFixed(1) + '%'
        : '100%',
      recentLog:    this.log.slice(-10).reverse()
    };
  }
}

class RevenueEngine extends EventEmitter {
  constructor(treasury) {
    super();
    this.treasury     = treasury;
    this.approval     = new M7ApprovalEngine();
    this.revenue      = {
      eventProcessing:     0,
      intelligenceLicense: 0,
      dataProduct:         0,
      premium:             0,
      total:               0
    };
    this.transactions  = [];
    this.domainTotals  = {};
    this.momentum      = {};
    this.velocityLog   = [];
    this.thisMinuteRev = 0;
    this.lastMinuteRev = 0;

    // Velocity tracker
    setInterval(() => {
      this.lastMinuteRev = this.thisMinuteRev;
      this.thisMinuteRev = 0;
      this.velocityLog.push({ timestamp: Date.now(), revenue: this.lastMinuteRev });
      if (this.velocityLog.length > 60) this.velocityLog.shift();
    }, 60000);

    console.log('💰 Revenue Engine v4.0 — 15 domains — M7 Approval Layer ACTIVE');
  }

  getMomentumMultiplier(domain) {
    const m = this.momentum[domain];
    if (!m) return 1.0;
    if (m.events > 1000) return 3.0;
    if (m.events > 500)  return 2.5;
    if (m.events > 200)  return 2.0;
    if (m.events > 100)  return 1.5;
    if (m.events > 50)   return 1.25;
    return 1.0;
  }

  priceEvent(domain, isPremium = false, isPrediction = false) {
    const base     = DOMAIN_PRICING[domain] || 0.10;
    const momentum = this.getMomentumMultiplier(domain);
    const boosted  = base * momentum;
    const final    = isPrediction ? boosted * PREDICTION_MULT
                   : isPremium    ? boosted * PREMIUM_MULT
                   : boosted;

    return {
      base, momentum,
      eventFee:       parseFloat(final.toFixed(6)),
      licenseRevenue: parseFloat((final * INTELLIGENCE_MULT).toFixed(6)),
      productRevenue: parseFloat((final * DATA_PRODUCT_MULT).toFixed(6)),
      totalRevenue:   parseFloat((final + final * INTELLIGENCE_MULT + final * DATA_PRODUCT_MULT).toFixed(6)),
      isPremium, isPrediction
    };
  }

  recordEvent(event, isPremium = false, isPrediction = false) {
    const pricing = this.priceEvent(event.domain, isPremium, isPrediction);

    const tx = {
      id:        event.id || ('tx-' + Date.now() + '-' + Math.random().toString(36).substr(2,8)),
      timestamp: event.timestamp || Date.now(),
      domain:    event.domain,
      type:      event.type || 'EVENT',
      pricing,
      status:    'PENDING'
    };

    // M7 must approve before committing
    const result = this.approval.approve(tx);
    if (!result.approved) {
      return null; // Rejected — not counted
    }

    tx.status = 'SETTLED';

    // Update momentum
    if (!this.momentum[event.domain]) {
      this.momentum[event.domain] = { events: 0, lastReset: Date.now() };
    }
    this.momentum[event.domain].events++;

    // Commit to revenue
    this.revenue.eventProcessing    += pricing.eventFee;
    this.revenue.intelligenceLicense += pricing.licenseRevenue;
    this.revenue.dataProduct         += pricing.productRevenue;
    this.revenue.total               += pricing.totalRevenue;
    this.thisMinuteRev               += pricing.totalRevenue;
    if (isPremium || isPrediction) this.revenue.premium += pricing.totalRevenue;

    // Domain totals
    if (!this.domainTotals[event.domain]) {
      this.domainTotals[event.domain] = { events: 0, revenue: 0, momentum: 1 };
    }
    this.domainTotals[event.domain].events++;
    this.domainTotals[event.domain].revenue  += pricing.totalRevenue;
    this.domainTotals[event.domain].momentum  = pricing.momentum;

    // Store transaction
    this.transactions.push(tx);
    if (this.transactions.length > 5000) this.transactions.shift();

    // Route to treasury — M7 approved
    if (this.treasury) this.treasury.credit(pricing.totalRevenue, tx);

    this.emit('revenue', tx);
    return tx;
  }

  getReport() {
    return {
      streams: {
        eventProcessing:     parseFloat(this.revenue.eventProcessing.toFixed(2)),
        intelligenceLicense: parseFloat(this.revenue.intelligenceLicense.toFixed(2)),
        dataProduct:         parseFloat(this.revenue.dataProduct.toFixed(2)),
        premium:             parseFloat(this.revenue.premium.toFixed(2))
      },
      total:            parseFloat(this.revenue.total.toFixed(2)),
      transactionCount: this.transactions.length,
      domainBreakdown:  this.domainTotals,
      momentum:         this.momentum,
      velocity:         this.lastMinuteRev,
      approval:         this.approval.getStats(),
      pricing:          DOMAIN_PRICING
    };
  }

  getRecentTransactions(n = 20) {
    return this.transactions.slice(-n).reverse();
  }
}

module.exports = { RevenueEngine, DOMAIN_PRICING };
