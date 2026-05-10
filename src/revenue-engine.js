const EventEmitter = require('events');

// M7-77 Tiered Pricing — locked in by SECKA
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

const INTELLIGENCE_MULT  = 5;
const DATA_PRODUCT_MULT  = 20;

class RevenueEngine extends EventEmitter {
  constructor(treasury) {
    super();
    this.treasury = treasury;
    this.revenue = {
      eventProcessing:     0,
      intelligenceLicense: 0,
      dataProduct:         0,
      total:               0
    };
    this.transactions = [];
    this.domainTotals = {};
  }

  priceEvent(domain) {
    const base = DOMAIN_PRICING[domain] || 0.10;
    return {
      eventFee:       base,
      licenseRevenue: parseFloat((base * INTELLIGENCE_MULT).toFixed(4)),
      productRevenue: parseFloat((base * DATA_PRODUCT_MULT).toFixed(4)),
      totalRevenue:   parseFloat((base + base * INTELLIGENCE_MULT + base * DATA_PRODUCT_MULT).toFixed(4)),
      pricePerTen:    parseFloat((base * 10).toFixed(4))
    };
  }

  recordEvent(event) {
    const pricing = this.priceEvent(event.domain);

    this.revenue.eventProcessing    += pricing.eventFee;
    this.revenue.intelligenceLicense += pricing.licenseRevenue;
    this.revenue.dataProduct         += pricing.productRevenue;
    this.revenue.total               += pricing.totalRevenue;

    if (!this.domainTotals[event.domain]) {
      this.domainTotals[event.domain] = { events: 0, revenue: 0 };
    }
    this.domainTotals[event.domain].events++;
    this.domainTotals[event.domain].revenue += pricing.totalRevenue;

    const tx = {
      id:        event.id || ('tx-' + Date.now() + '-' + Math.random().toString(36).substr(2,6)),
      timestamp: event.timestamp || Date.now(),
      domain:    event.domain,
      type:      event.type || 'EVENT',
      pricing,
      status:    'SETTLED'
    };

    this.transactions.push(tx);
    if (this.transactions.length > 1000) this.transactions.shift();

    if (this.treasury) {
      this.treasury.credit(pricing.totalRevenue, tx);
    }

    this.emit('revenue', tx);
    return tx;
  }

  getReport() {
    const t = this.revenue.total;
    return {
      streams: {
        eventProcessing:    parseFloat(this.revenue.eventProcessing.toFixed(2)),
        intelligenceLicense: parseFloat(this.revenue.intelligenceLicense.toFixed(2)),
        dataProduct:        parseFloat(this.revenue.dataProduct.toFixed(2))
      },
      total:            parseFloat(t.toFixed(2)),
      transactionCount: this.transactions.length,
      domainBreakdown:  this.domainTotals,
      pricing:          DOMAIN_PRICING
    };
  }

  getRecentTransactions(n = 20) {
    return this.transactions.slice(-n).reverse();
  }
}

module.exports = { RevenueEngine, DOMAIN_PRICING };
