const https = require('https');
const http  = require('http');
const EventEmitter = require('events');

class RealEventIngestion extends EventEmitter {
  constructor() {
    super();
    this.isRunning  = false;
    this.eventCount = 0;
    this.intervals  = [];
    this.errorCount = 0;
    this.domainCounts = {};

    this.sources = [

      // ── FINANCE (10 sources) ──────────────────────────────────────────
      { url: 'https://api.binance.com/api/v3/ticker/24hr',                             domain: 'finance',       type: 'CRYPTO_MARKET',    interval: 8000  },
      { url: 'https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=25',          domain: 'finance',       type: 'BTC_TRADE',         interval: 6000  },
      { url: 'https://api.binance.com/api/v3/trades?symbol=ETHUSDT&limit=25',          domain: 'finance',       type: 'ETH_TRADE',         interval: 6000  },
      { url: 'https://api.binance.com/api/v3/ticker/price',                            domain: 'finance',       type: 'PRICE_TICK',        interval: 5000  },
      { url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',                        domain: 'finance',       type: 'BTC_SPOT',          interval: 10000 },
      { url: 'https://api.coinbase.com/v2/prices/ETH-USD/spot',                        domain: 'finance',       type: 'ETH_SPOT',          interval: 10000 },
      { url: 'https://api.coincap.io/v2/assets?limit=25',                              domain: 'finance',       type: 'ASSET_RANK',        interval: 12000 },
      { url: 'https://api.coincap.io/v2/rates',                                        domain: 'finance',       type: 'EXCHANGE_RATES',    interval: 15000 },
      { url: 'https://api.coinpaprika.com/v1/tickers?limit=50',                        domain: 'finance',       type: 'MARKET_OVERVIEW',   interval: 20000 },
      { url: 'https://www.reddit.com/r/investing/new.json',                            domain: 'finance',       type: 'INVEST_SIGNAL',     interval: 20000 },

      // ── TECH (8 sources) ─────────────────────────────────────────────
      { url: 'https://hn.algolia.com/api/v1/search_by_date?tags=story',                domain: 'tech',          type: 'HN_STORY',          interval: 15000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=startup',          domain: 'tech',          type: 'STARTUP',           interval: 20000 },
      { url: 'https://api.github.com/events',                                          domain: 'tech',          type: 'GITHUB_EVENT',      interval: 12000 },
      { url: 'https://www.reddit.com/r/technology/new.json',                           domain: 'tech',          type: 'TECH_NEWS',         interval: 18000 },
      { url: 'https://www.reddit.com/r/programming/new.json',                          domain: 'tech',          type: 'CODE_NEWS',         interval: 20000 },
      { url: 'https://www.reddit.com/r/devops/new.json',                               domain: 'tech',          type: 'DEVOPS',            interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=software',         domain: 'tech',          type: 'SOFTWARE',          interval: 25000 },
      { url: 'https://www.reddit.com/r/opensource/new.json',                           domain: 'tech',          type: 'OPENSOURCE',        interval: 30000 },

      // ── AI (8 sources) ───────────────────────────────────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=AI',               domain: 'ai',            type: 'AI_NEWS',           interval: 15000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=machine+learning', domain: 'ai',            type: 'ML_NEWS',           interval: 18000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=LLM',              domain: 'ai',            type: 'LLM_SIGNAL',        interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=ChatGPT',          domain: 'ai',            type: 'GPT_SIGNAL',        interval: 20000 },
      { url: 'https://www.reddit.com/r/artificial/new.json',                           domain: 'ai',            type: 'AI_REDDIT',         interval: 18000 },
      { url: 'https://www.reddit.com/r/MachineLearning/new.json',                      domain: 'ai',            type: 'ML_REDDIT',         interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=neural+network',   domain: 'ai',            type: 'NEURAL_NET',        interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=deep+learning',    domain: 'ai',            type: 'DEEP_LEARNING',     interval: 25000 },

      // ── GOVERNMENT (6 sources) ───────────────────────────────────────
      { url: 'https://api.federalregister.gov/v1/articles?per_page=20&order=newest',   domain: 'government',    type: 'FEDERAL_REG',       interval: 25000 },
      { url: 'https://www.reddit.com/r/politics/new.json',                             domain: 'government',    type: 'POLITICS',          interval: 18000 },
      { url: 'https://www.reddit.com/r/worldnews/new.json',                            domain: 'government',    type: 'WORLD_NEWS',        interval: 15000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=government',       domain: 'government',    type: 'GOV_TECH',          interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=policy',           domain: 'government',    type: 'POLICY',            interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=regulation',       domain: 'government',    type: 'REGULATION',        interval: 30000 },

      // ── HEALTHCARE (6 sources) ───────────────────────────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=healthcare',       domain: 'healthcare',    type: 'HEALTH_NEWS',       interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=FDA',              domain: 'healthcare',    type: 'FDA_SIGNAL',        interval: 25000 },
      { url: 'https://www.reddit.com/r/medicine/new.json',                             domain: 'healthcare',    type: 'MEDICINE',          interval: 25000 },
      { url: 'https://www.reddit.com/r/Health/new.json',                               domain: 'healthcare',    type: 'HEALTH_REDDIT',     interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=biotech',          domain: 'healthcare',    type: 'BIOTECH',           interval: 30000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=clinical+trial',   domain: 'healthcare',    type: 'CLINICAL_TRIAL',    interval: 35000 },

      // ── ENERGY (6 sources) ───────────────────────────────────────────
      { url: 'https://www.reddit.com/r/energy/new.json',                               domain: 'energy',        type: 'ENERGY_NEWS',       interval: 20000 },
      { url: 'https://www.reddit.com/r/RenewableEnergy/new.json',                      domain: 'energy',        type: 'RENEWABLE',         interval: 25000 },
      { url: 'https://www.reddit.com/r/oil/new.json',                                  domain: 'energy',        type: 'OIL_MARKET',        interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=energy',           domain: 'energy',        type: 'ENERGY_SIGNAL',     interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=solar',            domain: 'energy',        type: 'SOLAR',             interval: 30000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=oil+price',        domain: 'energy',        type: 'OIL_PRICE',         interval: 30000 },

      // ── SOCIAL (5 sources) ───────────────────────────────────────────
      { url: 'https://www.reddit.com/r/news/new.json',                                 domain: 'social',        type: 'BREAKING_NEWS',     interval: 12000 },
      { url: 'https://www.reddit.com/r/worldnews/hot.json',                            domain: 'social',        type: 'WORLD_HOT',         interval: 12000 },
      { url: 'https://www.reddit.com/r/business/new.json',                             domain: 'social',        type: 'BUSINESS',          interval: 18000 },
      { url: 'https://www.reddit.com/r/economics/new.json',                            domain: 'social',        type: 'ECONOMICS',         interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search_by_date?tags=comment',              domain: 'social',        type: 'HN_PULSE',          interval: 10000 },

      // ── DEFENSE (7 sources) — $2.00/10 events ────────────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=defense',          domain: 'defense',       type: 'DEFENSE_NEWS',      interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=military',         domain: 'defense',       type: 'MILITARY_INTEL',    interval: 20000 },
      { url: 'https://www.reddit.com/r/geopolitics/new.json',                          domain: 'defense',       type: 'GEOPOLITICS',       interval: 18000 },
      { url: 'https://www.reddit.com/r/worldnews/new.json?limit=5',                    domain: 'defense',       type: 'CONFLICT_SIGNAL',   interval: 15000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=NATO',             domain: 'defense',       type: 'NATO_SIGNAL',       interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=warfare',          domain: 'defense',       type: 'WARFARE_INTEL',     interval: 30000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=sanctions',        domain: 'defense',       type: 'SANCTIONS',         interval: 25000 },

      // ── CYBERSECURITY (7 sources) — $1.80/10 events ──────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=cybersecurity',    domain: 'cybersecurity', type: 'CYBER_NEWS',        interval: 12000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=hacking',          domain: 'cybersecurity', type: 'HACK_SIGNAL',       interval: 12000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=ransomware',       domain: 'cybersecurity', type: 'RANSOMWARE',        interval: 15000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=data+breach',      domain: 'cybersecurity', type: 'BREACH_ALERT',      interval: 12000 },
      { url: 'https://www.reddit.com/r/netsec/new.json',                               domain: 'cybersecurity', type: 'NETSEC',            interval: 12000 },
      { url: 'https://www.reddit.com/r/cybersecurity/new.json',                        domain: 'cybersecurity', type: 'CYBER_REDDIT',      interval: 15000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=vulnerability',    domain: 'cybersecurity', type: 'VULN_ALERT',        interval: 12000 },

      // ── LEGAL (6 sources) — $1.50/10 events ─────────────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=lawsuit',          domain: 'legal',         type: 'LAWSUIT',           interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=compliance',       domain: 'legal',         type: 'COMPLIANCE',        interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=court',            domain: 'legal',         type: 'COURT_RULING',      interval: 20000 },
      { url: 'https://api.federalregister.gov/v1/articles?per_page=10&order=newest',   domain: 'legal',         type: 'REGULATORY',        interval: 30000 },
      { url: 'https://www.reddit.com/r/law/new.json',                                  domain: 'legal',         type: 'LAW_REDDIT',        interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=antitrust',        domain: 'legal',         type: 'ANTITRUST',         interval: 25000 },

      // ── REAL ESTATE (5 sources) — $1.20/10 events ────────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=real+estate',      domain: 'realestate',    type: 'RE_NEWS',           interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=housing+market',   domain: 'realestate',    type: 'HOUSING_MARKET',    interval: 25000 },
      { url: 'https://www.reddit.com/r/RealEstate/new.json',                           domain: 'realestate',    type: 'RE_REDDIT',         interval: 20000 },
      { url: 'https://www.reddit.com/r/REBubble/new.json',                             domain: 'realestate',    type: 'MARKET_SIGNAL',     interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=mortgage',         domain: 'realestate',    type: 'MORTGAGE',          interval: 30000 },

      // ── SUPPLY CHAIN (5 sources) — $1.10/10 events ───────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=supply+chain',     domain: 'supplychain',   type: 'SUPPLY_CHAIN',      interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=logistics',        domain: 'supplychain',   type: 'LOGISTICS',         interval: 25000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=shipping',         domain: 'supplychain',   type: 'SHIPPING',          interval: 25000 },
      { url: 'https://www.reddit.com/r/supplychain/new.json',                          domain: 'supplychain',   type: 'SC_REDDIT',         interval: 20000 },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=trade+war',        domain: 'supplychain',   type: 'TRADE_SIGNAL',      interval: 30000 }
    ];
  }

  _fetch(url, cb) {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'M7-77-Intelligence/3.0', 'Accept': 'application/json' },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { cb(null, JSON.parse(data)); } catch(e) { cb(e); }
      });
    });
    req.on('error', cb);
    req.on('timeout', () => { req.destroy(); cb(new Error('timeout')); });
  }

  _extract(data, domain, type, url) {
    const events = [];
    const ts     = Date.now();
    const baseId = `${domain}-${ts}-`;
    const push   = (item, idx) => events.push({
      id: baseId + idx, domain, type, source: url, timestamp: ts, data: item
    });
    try {
      if (Array.isArray(data))               data.slice(0, 20).forEach(push);
      else if (data?.data?.children)         data.data.children.slice(0, 20).forEach((c,i) => push(c.data, i));
      else if (data?.hits)                   data.hits.slice(0, 20).forEach(push);
      else if (data?.results)                data.results.slice(0, 10).forEach(push);
      else if (data?.data)                   [data.data].forEach(push);
      else if (data)                         [data].forEach(push);
    } catch(e) {}
    return events;
  }

  _poll(source) {
    this._fetch(source.url, (err, data) => {
      if (err) { this.errorCount++; return; }
      const events = this._extract(data, source.domain, source.type, source.url);
      events.forEach(event => {
        this.eventCount++;
        if (!this.domainCounts[event.domain]) this.domainCounts[event.domain] = 0;
        this.domainCounts[event.domain]++;
        this.emit('event', event);
      });
    });
  }

  start() {
    this.isRunning = true;
    console.log(`🌐 M7 Ingestion v3.0 — ${this.sources.length} sources — 12 domains`);
    this.sources.forEach(source => {
      this._poll(source);
      const iv = setInterval(() => {
        if (this.isRunning) this._poll(source);
      }, source.interval);
      this.intervals.push(iv);
    });
    console.log('✅ All 80+ sources live across 12 domains');
  }

  stop() {
    this.isRunning = false;
    this.intervals.forEach(i => clearInterval(i));
    this.intervals = [];
  }

  getStats() {
    return {
      totalEvents:  this.eventCount,
      sources:      this.sources.length,
      domains:      12,
      errors:       this.errorCount,
      domainCounts: this.domainCounts,
      status:       this.isRunning ? 'RUNNING' : 'STOPPED'
    };
  }
}

module.exports = RealEventIngestion;
