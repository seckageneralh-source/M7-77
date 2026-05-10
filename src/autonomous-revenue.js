const EventEmitter = require('events');

// M7-77 Autonomous Revenue Engine
// Runs 24/7 without human intervention
// Tracks, pursues, and reports real vs simulated revenue

class AutonomousRevenue extends EventEmitter {
  constructor(treasury, revenueEngine) {
    super();
    this.treasury      = treasury;
    this.revenueEngine = revenueEngine;
    this.isRunning     = false;

    // Real revenue — only counts when a real API key subscriber calls
    this.realRevenue = {
      total:           0,
      eventProcessing: 0,
      intelligence:    0,
      dataProduct:     0,
      transactions:    []
    };

    // Simulated — internal meter (what M7 would earn at scale)
    this.simulatedRevenue = {
      total: 0
    };

    // Subscriber registry — API keys mapped to plans
    this.subscribers = {};

    // Growth engine state
    this.growth = {
      apiKeysIssued:    0,
      activeSubscribers: 0,
      totalCalls:       0,
      conversionEvents: []
    };

    // Autonomous actions log
    this.actionsLog = [];

    console.log('🤖 Autonomous Revenue Engine initialized');
  }

  // Issue a real API key to a new subscriber
  issueApiKey(subscriberName, plan, domain) {
    const key = 'M7-' + Math.random().toString(36).substr(2,9).toUpperCase() +
                '-'   + Math.random().toString(36).substr(2,9).toUpperCase();

    this.subscribers[key] = {
      name:       subscriberName,
      plan,
      domain:     domain || 'all',
      key,
      issuedAt:   Date.now(),
      calls:      0,
      realBilled: 0,
      status:     'ACTIVE'
    };

    this.growth.apiKeysIssued++;
    this.growth.activeSubscribers++;

    const action = {
      timestamp: Date.now(),
      type:      'API_KEY_ISSUED',
      detail:    `Key issued to ${subscriberName} — Plan: ${plan} — Domain: ${domain || 'all'}`
    };
    this.actionsLog.push(action);
    this.emit('action', action);

    console.log(`🔑 API key issued → ${subscriberName} | ${plan} | ${key}`);
    return key;
  }

  // Validate an API key and meter a real call
  meterRealCall(apiKey, domain) {
    const sub = this.subscribers[apiKey];
    if (!sub || sub.status !== 'ACTIVE') {
      return { authorized: false, error: 'Invalid or inactive API key' };
    }

    const PRICING = {
      finance: 1.00, government: 0.80, healthcare: 0.75,
      health:  0.75, ai: 0.50,        energy: 0.40,
      tech:    0.20, social: 0.10
    };

    const price = PRICING[domain] || PRICING[sub.domain] || 0.10;

    // This is REAL revenue
    sub.calls++;
    sub.realBilled        += price;
    this.growth.totalCalls++;
    this.realRevenue.total += price;

    const tx = {
      id:          'real-' + Date.now() + '-' + Math.random().toString(36).substr(2,6),
      timestamp:   Date.now(),
      type:        'REAL_REVENUE',
      subscriber:  sub.name,
      apiKey:      apiKey.substr(0,10) + '...',
      domain,
      amount:      price,
      status:      'CONFIRMED'
    };

    this.realRevenue.transactions.push(tx);
    if (this.realRevenue.transactions.length > 500) {
      this.realRevenue.transactions.shift();
    }

    // Credit real revenue to treasury
    if (this.treasury) {
      this.treasury.credit(price, tx);
    }

    this.emit('real_revenue', tx);
    console.log(`💵 REAL REVENUE → $${price} from ${sub.name} | ${domain}`);

    return { authorized: true, price, callId: tx.id, subscriber: sub.name };
  }

  // Autonomous growth loop — runs every 60 seconds
  // Checks system health, logs status, prepares reports
  startGrowthLoop() {
    this.isRunning = true;
    console.log('🔄 Autonomous growth loop started');

    this.growthInterval = setInterval(() => {
      this._runGrowthCycle();
    }, 60000);

    // Run immediately
    this._runGrowthCycle();
  }

  _runGrowthCycle() {
    const rev    = this.revenueEngine ? this.revenueEngine.getReport() : null;
    const simTotal = rev ? rev.total : 0;
    this.simulatedRevenue.total = simTotal;

    const action = {
      timestamp:        Date.now(),
      type:             'GROWTH_CYCLE',
      simulatedRevenue: simTotal,
      realRevenue:      this.realRevenue.total,
      activeSubscribers: this.growth.activeSubscribers,
      totalCalls:       this.growth.totalCalls,
      detail:           `Cycle complete — Sim: $${simTotal.toFixed(2)} | Real: $${this.realRevenue.total.toFixed(2)}`
    };

    this.actionsLog.push(action);
    if (this.actionsLog.length > 200) this.actionsLog.shift();

    this.emit('growth_cycle', action);
    console.log(`📊 Growth cycle — Simulated: $${simTotal.toFixed(2)} | Real: $${this.realRevenue.total.toFixed(2)} | Subscribers: ${this.growth.activeSubscribers}`);
  }

  stop() {
    this.isRunning = false;
    if (this.growthInterval) clearInterval(this.growthInterval);
    console.log('⏹️  Autonomous revenue engine stopped');
  }

  getStatus() {
    return {
      isRunning:         this.isRunning,
      realRevenue: {
        total:        parseFloat(this.realRevenue.total.toFixed(2)),
        transactions: this.realRevenue.transactions.slice(-10).reverse()
      },
      simulatedRevenue: {
        total: parseFloat(this.simulatedRevenue.total.toFixed(2))
      },
      subscribers: {
        total:  this.growth.apiKeysIssued,
        active: this.growth.activeSubscribers,
        list:   Object.values(this.subscribers).map(s => ({
          name:       s.name,
          plan:       s.plan,
          domain:     s.domain,
          calls:      s.calls,
          realBilled: parseFloat(s.realBilled.toFixed(2)),
          status:     s.status,
          issuedAt:   s.issuedAt
        }))
      },
      totalCalls:  this.growth.totalCalls,
      actionsLog:  this.actionsLog.slice(-20).reverse()
    };
  }
}

module.exports = AutonomousRevenue;
