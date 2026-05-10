const EventEmitter = require('events');

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
  supplychain:  1.10
};

const INTELLIGENCE_MULT = 5;
const DATA_PRODUCT_MULT = 20;
const PREMIUM_MULT      = 3;
const PREDICTION_MULT   = 10;

class RevenueEngine extends EventEmitter {
  constructor(treasury) {
    super();
    this.treasury     = treasury;
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
    this.lastMinuteRev = 0;
    this.thisMinuteRev = 0;

    // Track velocity every minute
    setInterval(() => {
      this.lastMinuteRev = this.thisMinuteRev;
      this.thisMinuteRev = 0;
      this.velocityLog.push({
        timestamp: Date.now(),
        revenue:   this.lastMinuteRev
      });
      if (this.velocityLog.length > 60) this.velocityLog.shift();
    }, 60000);

    console.log('💰 Revenue Engine v3.0 — 12 domains, momentum pricing, velocity tracking');
  }

  // Apply momentum multiplier based on domain activity
  getMomentumMultiplier(domain) {
    const m = this.momentum[domain] || { events: 0, lastReset: Date.now() };
    if (m.events > 500)  return 3.0;
    if (m.events > 200)  return 2.0;
    if (m.events > 100)  return 1.5;
    if (m.events > 50)   return 1.25;
    return 1.0;
  }

  priceEvent(domain, isPremium = false, isPrediction = false) {
    const base       = DOMAIN_PRICING[domain] || 0.10;
    const momentum   = this.getMomentumMultiplier(domain);
    const multiplied = base * momentum;
    const finalBase  = isPrediction ? multiplied * PREDICTION_MULT
                     : isPremium    ? multiplied * PREMIUM_MULT
                     : multiplied;

    return {
      base,
      momentum,
      eventFee:       parseFloat(finalBase.toFixed(4)),
      licenseRevenue: parseFloat((finalBase * INTELLIGENCE_MULT).toFixed(4)),
      productRevenue: parseFloat((finalBase * DATA_PRODUCT_MULT).toFixed(4)),
      totalRevenue:   parseFloat((finalBase + finalBase * INTELLIGENCE_MULT + finalBase * DATA_PRODUCT_MULT).toFixed(4)),
      isPremium,
      isPrediction
    };
  }

  recordEvent(event, isPremium = false, isPrediction = false) {
    const pricing = this.priceEvent(event.domain, isPremium, isPrediction);

    // Update momentum
    if (!this.momentum[event.domain]) {
      this.momentum[event.domain] = { events: 0, lastReset: Date.now() };
    }
    this.momentum[event.domain].events++;

    // Accumulate revenue
    this.revenue.eventProcessing    += pricing.eventFee;
    this.revenue.intelligenceLicense += pricing.licenseRevenue;
    this.revenue.dataProduct         += pricing.productRevenue;
    this.revenue.total               += pricing.totalRevenue;
    this.thisMinuteRev               += pricing.totalRevenue;

    if (isPremium || isPrediction) {
      this.revenue.premium += pricing.totalRevenue;
    }

    // Domain totals
    if (!this.domainTotals[event.domain]) {
      this.domainTotals[event.domain] = { events: 0, revenue: 0, momentum: 1 };
    }
    this.domainTotals[event.domain].events++;
    this.domainTotals[event.domain].revenue   += pricing.totalRevenue;
    this.domainTotals[event.domain].momentum   = pricing.momentum;

    const tx = {
      id:        event.id || ('tx-' + Date.now() + '-' + Math.random().toString(36).substr(2,6)),
      timestamp: event.timestamp || Date.now(),
      domain:    event.domain,
      type:      event.type || 'EVENT',
      pricing,
      status:    'SETTLED'
    };

    this.transactions.push(tx);
    if (this.transactions.length > 2000) this.transactions.shift();

    if (this.treasury) this.treasury.credit(pricing.totalRevenue, tx);

    this.emit('revenue', tx);
    return tx;
  }

  getReport() {
    const velocity = this.velocityLog.length > 1
      ? this.velocityLog[this.velocityLog.length - 1]?.revenue || 0
      : 0;

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
      velocity,
      pricing:          DOMAIN_PRICING
    };
  }

  getRecentTransactions(n = 20) {
    return this.transactions.slice(-n).reverse();
  }
}

module.exports = { RevenueEngine, DOMAIN_PRICING };
