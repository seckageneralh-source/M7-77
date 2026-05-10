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

    // 50+ real live sources across 7 domains
    this.sources = [

      // ── FINANCE (10 sources) ──────────────────────────────────────────
      { url: 'https://api.binance.com/api/v3/ticker/24hr',                          domain: 'finance', type: 'CRYPTO_MARKET',    interval: 10000  },
      { url: 'https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=20',       domain: 'finance', type: 'CRYPTO_TRADE',     interval: 8000   },
      { url: 'https://api.binance.com/api/v3/trades?symbol=ETHUSDT&limit=20',       domain: 'finance', type: 'CRYPTO_TRADE',     interval: 8000   },
      { url: 'https://api.binance.com/api/v3/ticker/price',                         domain: 'finance', type: 'PRICE_TICK',       interval: 12000  },
      { url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',                     domain: 'finance', type: 'BTC_PRICE',        interval: 15000  },
      { url: 'https://api.coinbase.com/v2/prices/ETH-USD/spot',                     domain: 'finance', type: 'ETH_PRICE',        interval: 15000  },
      { url: 'https://api.coinpaprika.com/v1/tickers?limit=50',                     domain: 'finance', type: 'MARKET_OVERVIEW',  interval: 30000  },
      { url: 'https://api.coincap.io/v2/assets?limit=20',                           domain: 'finance', type: 'ASSET_RANKING',    interval: 20000  },
      { url: 'https://api.coincap.io/v2/rates',                                     domain: 'finance', type: 'EXCHANGE_RATES',   interval: 25000  },
      { url: 'https://api.coinpaprika.com/v1/coins',                                domain: 'finance', type: 'COIN_LIST',        interval: 60000  },

      // ── TECH (8 sources) ─────────────────────────────────────────────
      { url: 'https://hn.algolia.com/api/v1/search_by_date?tags=story',             domain: 'tech',    type: 'HN_STORY',         interval: 20000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=startup',       domain: 'tech',    type: 'STARTUP_NEWS',     interval: 30000  },
      { url: 'https://api.github.com/events',                                       domain: 'tech',    type: 'GITHUB_EVENT',     interval: 15000  },
      { url: 'https://api.github.com/repos/trending',                               domain: 'tech',    type: 'TRENDING_REPO',    interval: 60000  },
      { url: 'https://www.reddit.com/r/technology/new.json',                        domain: 'tech',    type: 'TECH_REDDIT',      interval: 25000  },
      { url: 'https://www.reddit.com/r/programming/new.json',                       domain: 'tech',    type: 'PROGRAMMING_NEWS', interval: 30000  },
      { url: 'https://www.reddit.com/r/devops/new.json',                            domain: 'tech',    type: 'DEVOPS_NEWS',      interval: 35000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=software',      domain: 'tech',    type: 'SOFTWARE_NEWS',    interval: 40000  },

      // ── AI (8 sources) ───────────────────────────────────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=AI',            domain: 'ai',      type: 'AI_NEWS',          interval: 20000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=machine+learning', domain: 'ai',   type: 'ML_NEWS',          interval: 25000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=LLM',           domain: 'ai',      type: 'LLM_NEWS',         interval: 30000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=ChatGPT',       domain: 'ai',      type: 'GPT_NEWS',         interval: 30000  },
      { url: 'https://www.reddit.com/r/artificial/new.json',                        domain: 'ai',      type: 'AI_REDDIT',        interval: 25000  },
      { url: 'https://www.reddit.com/r/MachineLearning/new.json',                   domain: 'ai',      type: 'ML_REDDIT',        interval: 30000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=neural+network',domain: 'ai',      type: 'NEURAL_NEWS',      interval: 35000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=deep+learning', domain: 'ai',      type: 'DL_NEWS',          interval: 40000  },

      // ── GOVERNMENT (6 sources) ───────────────────────────────────────
      { url: 'https://api.federalregister.gov/v1/articles?per_page=20&order=newest',domain: 'government', type: 'FEDERAL_REG',  interval: 30000  },
      { url: 'https://api.federalregister.gov/v1/articles?per_page=10&order=newest&fields[]=title&fields[]=publication_date&fields[]=agencies', domain: 'government', type: 'REGULATORY', interval: 45000 },
      { url: 'https://www.reddit.com/r/politics/new.json',                          domain: 'government', type: 'POLITICS',      interval: 25000  },
      { url: 'https://www.reddit.com/r/worldnews/new.json',                         domain: 'government', type: 'WORLD_NEWS',    interval: 20000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=government',    domain: 'government', type: 'GOV_TECH',      interval: 35000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=policy',        domain: 'government', type: 'POLICY_NEWS',   interval: 40000  },

      // ── HEALTHCARE (6 sources) ───────────────────────────────────────
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=healthcare',    domain: 'healthcare', type: 'HEALTH_NEWS',   interval: 30000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=FDA',           domain: 'healthcare', type: 'FDA_NEWS',      interval: 35000  },
      { url: 'https://www.reddit.com/r/medicine/new.json',                          domain: 'healthcare', type: 'MEDICINE',      interval: 30000  },
      { url: 'https://www.reddit.com/r/Health/new.json',                            domain: 'healthcare', type: 'HEALTH_REDDIT', interval: 35000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=biotech',       domain: 'healthcare', type: 'BIOTECH_NEWS',  interval: 40000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=medical',       domain: 'healthcare', type: 'MEDICAL_NEWS',  interval: 45000  },

      // ── ENERGY (6 sources) ───────────────────────────────────────────
      { url: 'https://www.reddit.com/r/energy/new.json',                            domain: 'energy',  type: 'ENERGY_REDDIT',   interval: 30000  },
      { url: 'https://www.reddit.com/r/RenewableEnergy/new.json',                   domain: 'energy',  type: 'RENEWABLE',       interval: 35000  },
      { url: 'https://www.reddit.com/r/oil/new.json',                               domain: 'energy',  type: 'OIL_MARKET',      interval: 30000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=energy',        domain: 'energy',  type: 'ENERGY_NEWS',     interval: 35000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=solar',         domain: 'energy',  type: 'SOLAR_NEWS',      interval: 40000  },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=oil+price',     domain: 'energy',  type: 'OIL_PRICE',       interval: 45000  },

      // ── SOCIAL (6 sources) ───────────────────────────────────────────
      { url: 'https://www.reddit.com/r/worldnews/hot.json',                         domain: 'social',  type: 'WORLD_HOT',       interval: 20000  },
      { url: 'https://www.reddit.com/r/news/new.json',                              domain: 'social',  type: 'NEWS_REDDIT',     interval: 20000  },
      { url: 'https://www.reddit.com/r/business/new.json',                          domain: 'social',  type: 'BUSINESS_NEWS',   interval: 25000  },
      { url: 'https://www.reddit.com/r/economics/new.json',                         domain: 'social',  type: 'ECONOMICS',       interval: 30000  },
      { url: 'https://hn.algolia.com/api/v1/search_by_date?tags=comment',           domain: 'social',  type: 'HN_COMMENT',      interval: 15000  },
      { url: 'https://www.reddit.com/r/investing/new.json',                         domain: 'social',  type: 'INVESTING',       interval: 25000  }
    ];
  }

  _fetch(url, cb) {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'M7-77-Intelligence-Engine/2.0',
        'Accept':     'application/json'
      },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { cb(null, JSON.parse(data)); }
        catch(e) { cb(e); }
      });
    });
    req.on('error', cb);
    req.on('timeout', () => { req.destroy(); cb(new Error('timeout')); });
  }

  _extract(data, domain, type, url) {
    const events   = [];
    const ts       = Date.now();
    const baseId   = `${domain}-${ts}-`;

    const push = (item, idx) => {
      events.push({
        id:        baseId + idx,
        domain,
        type,
        source:    url,
        timestamp: ts,
        data:      item
      });
    };

    try {
      if (Array.isArray(data))                       data.slice(0, 15).forEach(push);
      else if (data?.data?.children)                 data.data.children.slice(0, 15).forEach((c, i) => push(c.data, i));
      else if (data?.hits)                           data.hits.slice(0, 15).forEach(push);
      else if (data?.results)                        data.results.slice(0, 10).forEach(push);
      else if (data?.data && typeof data.data === 'object') [data.data].forEach(push);
      else if (data)                                 [data].forEach(push);
    } catch(e) {}

    return events;
  }

  _poll(source) {
    this._fetch(source.url, (err, data) => {
      if (err) { this.errorCount++; return; }
      const events = this._extract(data, source.domain, source.type, source.url);
      events.forEach(event => {
        this.eventCount++;
        this.emit('event', event);
      });
    });
  }

  start() {
    this.isRunning = true;
    console.log(`🌐 M7 Ingestion starting — ${this.sources.length} sources across 7 domains`);

    // Poll each source immediately then on its own interval
    this.sources.forEach(source => {
      this._poll(source);
      const iv = setInterval(() => {
        if (this.isRunning) this._poll(source);
      }, source.interval);
      this.intervals.push(iv);
    });

    console.log('✅ All sources live — events flowing');
  }

  stop() {
    this.isRunning = false;
    this.intervals.forEach(i => clearInterval(i));
    this.intervals = [];
    console.log('⏹️  Ingestion stopped');
  }

  getStats() {
    return {
      totalEvents: this.eventCount,
      sources:     this.sources.length,
      domains:     7,
      errors:      this.errorCount,
      status:      this.isRunning ? 'RUNNING' : 'STOPPED'
    };
  }
}

module.exports = RealEventIngestion;
