'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { getDB } = require('./m7-database');

// Target: $500-700M/day
// Strategy: 1000+ sources, $10-50/event, compounding

const TARGET_DAILY_REVENUE = 600000000; // $600M/day target
const TARGET_EVENTS_PER_DAY = 20000000; // 20M events/day

class RevenueAccelerationEngine extends EventEmitter {
  constructor(ingestion, revenueEngine, brain) {
    super();
    this.ingestion     = ingestion;
    this.revenueEngine = revenueEngine;
    this.brain         = brain;
    this.db            = getDB();
    this.isRunning     = false;
    this.cycleCount    = 0;
    this.lastRevenue   = 0;
    this.growthRate    = 0;
    this.projectedDaily = 0;
    this.accelerations  = 0;
    this.log            = [];

    // New pricing — adjustable via SDL
    this.PRICING = {
      defense:      1000.00,
      cybersecurity: 900.00,
      legal:         800.00,
      finance:       700.00,
      government:    600.00,
      economy:       600.00,
      healthcare:    500.00,
      ai:            400.00,
      realestate:    400.00,
      supplychain:   300.00,
      energy:        300.00,
      science:       250.00,
      tech:          200.00,
      climate:       200.00,
      emerging:      200.00,
      social:        200.00
    };

    this._loadPricingFromDB();
    console.log('Revenue Acceleration Engine initialized — target $600M/day');
  }

  _loadPricingFromDB() {
    try {
      const rules = this.db.getAllRules();
      rules.filter(r => r.key.startsWith('pricing.')).forEach(r => {
        const domain = r.key.replace('pricing.', '');
        const price  = parseFloat(r.value);
        if (price >= 10) { // Only apply if new pricing
          this.PRICING[domain] = price;
        }
      });
    } catch(e) {}
  }

  _savePricingToDB() {
    Object.entries(this.PRICING).forEach(([domain, price]) => {
      this.db.setRule('pricing.' + domain, price.toString(), 'ACCELERATION_ENGINE');
    });
  }

  // Apply new pricing to revenue engine
  _applyPricing() {
    const { DOMAIN_PRICING } = require('./revenue-engine');
    Object.entries(this.PRICING).forEach(([domain, price]) => {
      if (DOMAIN_PRICING[domain] !== undefined) {
        DOMAIN_PRICING[domain] = price;
      }
    });
    this._savePricingToDB();
    this._log('PRICING_APPLIED', `New pricing applied — avg $${(Object.values(this.PRICING).reduce((a,b)=>a+b,0)/Object.keys(this.PRICING).length).toFixed(2)}/event`);
  }

  // Calculate current trajectory
  _calculateTrajectory() {
    const report  = this.revenueEngine.getReport();
    const current = report.total;
    const growth  = current - this.lastRevenue;
    this.lastRevenue    = current;
    this.growthRate     = growth;
    // Project daily based on last 5-minute rate
    this.projectedDaily = growth * (86400 / 300);
    return {
      current,
      growth,
      projectedDaily:  this.projectedDaily,
      targetDaily:     TARGET_DAILY_REVENUE,
      onTrack:         this.projectedDaily >= TARGET_DAILY_REVENUE,
      progressPct:     parseFloat(((this.projectedDaily / TARGET_DAILY_REVENUE) * 100).toFixed(2))
    };
  }

  // Expand sources via Claude
  async _expandSources() {
    const current = this.ingestion.sources.length;
    if (current >= 1000) {
      this._log('SOURCES_MAX', `Already at ${current} sources — max reached`);
      return;
    }

    const needed = Math.min(1000 - current, 50); // Add up to 50 at a time
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const highValueDomains = Object.entries(this.PRICING)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d]) => d);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: 'You are M7 revenue acceleration engine. Find high-value real public data sources. Respond ONLY with valid JSON array.',
          messages: [{ role: 'user', content:
            `Current sources: ${current}. Need ${needed} more high-value sources.
Focus on these high-value domains: ${highValueDomains.join(', ')}
Return JSON array of ${needed} sources:
[{"url":"full_public_url","domain":"domain_name","type":"EVENT_TYPE","interval":5000}]
Priority: government APIs, financial feeds, security feeds, defense news, legal databases.
Only real publicly accessible URLs. No authentication required. Fast intervals (3000-8000ms).`
          }]
        })
      });
      const data    = await res.json();
      const text    = data.content[0].text.replace(/```json|```/g,'').trim();
      const newSrcs = JSON.parse(text);

      if (Array.isArray(newSrcs)) {
        let added = 0;
        newSrcs.forEach(src => {
          if (!this.ingestion.sources.find(s => s.url === src.url) && src.url && src.domain) {
            this.ingestion.sources.push(src);
            if (this.ingestion.isRunning) {
              this.ingestion._poll(src);
              const iv = setInterval(() => {
                if (this.ingestion.isRunning) this.ingestion._poll(src);
              }, src.interval || 8000);
              this.ingestion.intervals.push(iv);
            }
            added++;
          }
        });
        if (added > 0) {
          this.accelerations++;
          this._log('SOURCES_EXPANDED', `+${added} sources added (total: ${this.ingestion.sources.length})`);
        }
      }
    } catch(e) {
      this._log('EXPAND_ERROR', e.message, 'WARN');
    }
  }

  // Compound growth cycle
  async _compoundCycle() {
    this.cycleCount++;
    const traj = this._calculateTrajectory();

    this._log('COMPOUND_CYCLE', 
      `Cycle ${this.cycleCount} — Projected: $${(traj.projectedDaily/1e6).toFixed(1)}M/day — ` +
      `Progress: ${traj.progressPct}% of target — Sources: ${this.ingestion.sources.length}`
    );

    // If behind target — accelerate
    if (!traj.onTrack) {
      // 1. Expand sources
      if (this.ingestion.sources.length < 1000) {
        await this._expandSources();
      }
      // 2. Optimize pricing for underperforming domains
      await this._optimizePricing();
    }

    // Save trajectory to DB
    this.db.setState('acceleration_trajectory', {
      ...traj,
      cycleCount:   this.cycleCount,
      sources:      this.ingestion.sources.length,
      timestamp:    Date.now()
    });

    this.emit('cycle_complete', traj);
    return traj;
  }

  // Optimize pricing via Claude
  async _optimizePricing() {
    const report = this.revenueEngine.getReport();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const domainPerformance = Object.entries(report.domainBreakdown || {})
      .map(([d,v]) => `${d}: ${v.events} events, $${(v.revenue||0).toFixed(0)} revenue, current price $${this.PRICING[d]||10}`)
      .join('\n');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: 'You are M7 pricing optimizer. Optimize event pricing to maximize revenue. Respond ONLY with valid JSON.',
          messages: [{ role: 'user', content:
            `Optimize pricing for these domains. Current performance:\n${domainPerformance}\n` +
            `Target: $600M/day total. Prices must be $10-$50 per event.\n` +
            `Return JSON: {"domain_name": new_price_number} for domains that need adjustment only.`
          }]
        })
      });
      const data    = await res.json();
      const text    = data.content[0].text.replace(/```json|```/g,'').trim();
      const updates = JSON.parse(text);

      let changed = 0;
      Object.entries(updates).forEach(([domain, price]) => {
        const p = parseFloat(price);
        if (p >= 10 && p <= 50 && this.PRICING[domain] !== undefined) {
          this.PRICING[domain] = p;
          changed++;
        }
      });

      if (changed > 0) {
        this._applyPricing();
        this._log('PRICING_OPTIMIZED', `${changed} domain prices updated by Claude`);
      }
    } catch(e) {}
  }

  _log(type, detail, severity = 'INFO') {
    const entry = { timestamp: Date.now(), type, detail, severity };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    console.log(`[ACCEL] ${type}: ${detail}`);
    this.emit('log', entry);
  }

  updatePrice(domain, price) {
    if (price < 1 || price > 1000) return { error: 'Price must be $1-$1000' };
    if (this.PRICING[domain] === undefined) return { error: 'Unknown domain' };
    this.PRICING[domain] = parseFloat(price);
    this._applyPricing();
    return { success: true, domain, price: this.PRICING[domain] };
  }

  start() {
    this.isRunning = true;
    // Apply new pricing immediately
    this._applyPricing();
    // Compound cycle every 5 minutes
    setInterval(() => this._compoundCycle(), 300000);
    // Expand sources every 15 minutes until 1000
    setInterval(() => {
      if (this.ingestion.sources.length < 1000) this._expandSources();
    }, 900000);
    // First cycle after 1 minute
    setTimeout(() => this._compoundCycle(), 60000);
    // First expansion after 30 seconds
    setTimeout(() => this._expandSources(), 30000);
    console.log('Revenue Acceleration Engine started — targeting $600M/day');
  }

  getStatus() {
    const traj = this._calculateTrajectory();
    return {
      isRunning:       this.isRunning,
      cycleCount:      this.cycleCount,
      accelerations:   this.accelerations,
      currentPricing:  this.PRICING,
      trajectory:      traj,
      sources:         this.ingestion.sources.length,
      targetSources:   1000,
      targetDaily:     '$600M',
      recentLog:       this.log.slice(-10).reverse()
    };
  }
}

module.exports = RevenueAccelerationEngine;
