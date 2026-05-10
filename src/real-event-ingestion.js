const https = require('https');
const http  = require('http');
const EventEmitter = require('events');

class RealEventIngestion extends EventEmitter {
  constructor() {
    super();
    this.isRunning    = false;
    this.eventCount   = 0;
    this.intervals    = [];
    this.errorCount   = 0;
    this.domainCounts = {};

    this.sources = [

      // ── FINANCE (15 sources) ──────────────────────────────────────────
      { url:'https://api.binance.com/api/v3/ticker/24hr',                              domain:'finance',       type:'CRYPTO_MARKET',     interval:5000  },
      { url:'https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=25',           domain:'finance',       type:'BTC_TRADE',          interval:4000  },
      { url:'https://api.binance.com/api/v3/trades?symbol=ETHUSDT&limit=25',           domain:'finance',       type:'ETH_TRADE',          interval:4000  },
      { url:'https://api.binance.com/api/v3/trades?symbol=SOLUSDT&limit=25',           domain:'finance',       type:'SOL_TRADE',          interval:5000  },
      { url:'https://api.binance.com/api/v3/ticker/price',                             domain:'finance',       type:'PRICE_TICK',         interval:3000  },
      { url:'https://api.coinbase.com/v2/prices/BTC-USD/spot',                         domain:'finance',       type:'BTC_SPOT',           interval:6000  },
      { url:'https://api.coinbase.com/v2/prices/ETH-USD/spot',                         domain:'finance',       type:'ETH_SPOT',           interval:6000  },
      { url:'https://api.coinbase.com/v2/prices/SOL-USD/spot',                         domain:'finance',       type:'SOL_SPOT',           interval:8000  },
      { url:'https://api.coincap.io/v2/assets?limit=50',                               domain:'finance',       type:'ASSET_RANK',         interval:10000 },
      { url:'https://api.coincap.io/v2/rates',                                         domain:'finance',       type:'FX_RATES',           interval:12000 },
      { url:'https://api.coinpaprika.com/v1/tickers?limit=100',                        domain:'finance',       type:'MARKET_OVERVIEW',    interval:15000 },
      { url:'https://api.coinpaprika.com/v1/coins',                                    domain:'finance',       type:'COIN_UNIVERSE',      interval:60000 },
      { url:'https://www.reddit.com/r/investing/new.json',                             domain:'finance',       type:'INVEST_SIGNAL',      interval:15000 },
      { url:'https://www.reddit.com/r/stocks/new.json',                                domain:'finance',       type:'STOCK_SIGNAL',       interval:15000 },
      { url:'https://www.reddit.com/r/CryptoCurrency/new.json',                        domain:'finance',       type:'CRYPTO_REDDIT',      interval:12000 },

      // ── TECH (12 sources) ────────────────────────────────────────────
      { url:'https://hn.algolia.com/api/v1/search_by_date?tags=story',                 domain:'tech',          type:'HN_STORY',           interval:10000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=startup',           domain:'tech',          type:'STARTUP',            interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=software',          domain:'tech',          type:'SOFTWARE',           interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=cloud',             domain:'tech',          type:'CLOUD',              interval:20000 },
      { url:'https://api.github.com/events',                                           domain:'tech',          type:'GITHUB_EVENT',       interval:8000  },
      { url:'https://www.reddit.com/r/technology/new.json',                            domain:'tech',          type:'TECH_NEWS',          interval:12000 },
      { url:'https://www.reddit.com/r/programming/new.json',                           domain:'tech',          type:'CODE_NEWS',          interval:15000 },
      { url:'https://www.reddit.com/r/devops/new.json',                                domain:'tech',          type:'DEVOPS',             interval:18000 },
      { url:'https://www.reddit.com/r/opensource/new.json',                            domain:'tech',          type:'OPENSOURCE',         interval:20000 },
      { url:'https://www.reddit.com/r/webdev/new.json',                                domain:'tech',          type:'WEBDEV',             interval:20000 },
      { url:'https://www.reddit.com/r/SaaS/new.json',                                  domain:'tech',          type:'SAAS_SIGNAL',        interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=api',               domain:'tech',          type:'API_NEWS',           interval:25000 },

      // ── AI (12 sources) ──────────────────────────────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=AI',                domain:'ai',            type:'AI_SIGNAL',          interval:10000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=machine+learning',  domain:'ai',            type:'ML_SIGNAL',          interval:12000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=LLM',               domain:'ai',            type:'LLM_SIGNAL',         interval:12000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=ChatGPT',           domain:'ai',            type:'GPT_SIGNAL',         interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=neural+network',    domain:'ai',            type:'NEURAL_NET',         interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=deep+learning',     domain:'ai',            type:'DEEP_LEARNING',      interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=AGI',               domain:'ai',            type:'AGI_SIGNAL',         interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=OpenAI',            domain:'ai',            type:'OPENAI_SIGNAL',      interval:15000 },
      { url:'https://www.reddit.com/r/artificial/new.json',                            domain:'ai',            type:'AI_REDDIT',          interval:12000 },
      { url:'https://www.reddit.com/r/MachineLearning/new.json',                       domain:'ai',            type:'ML_REDDIT',          interval:15000 },
      { url:'https://www.reddit.com/r/ChatGPT/new.json',                               domain:'ai',            type:'GPT_REDDIT',         interval:12000 },
      { url:'https://www.reddit.com/r/singularity/new.json',                           domain:'ai',            type:'SINGULARITY',        interval:20000 },

      // ── GOVERNMENT (10 sources) ──────────────────────────────────────
      { url:'https://api.federalregister.gov/v1/articles?per_page=20&order=newest',    domain:'government',    type:'FEDERAL_REG',        interval:20000 },
      { url:'https://api.federalregister.gov/v1/articles?per_page=10&order=newest&fields[]=title&fields[]=agencies', domain:'government', type:'REGULATORY', interval:30000 },
      { url:'https://www.reddit.com/r/politics/new.json',                              domain:'government',    type:'POLITICS',           interval:12000 },
      { url:'https://www.reddit.com/r/worldnews/new.json',                             domain:'government',    type:'WORLD_NEWS',         interval:10000 },
      { url:'https://www.reddit.com/r/geopolitics/new.json',                           domain:'government',    type:'GEOPOLITICS',        interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=government',        domain:'government',    type:'GOV_SIGNAL',         interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=policy',            domain:'government',    type:'POLICY',             interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=regulation',        domain:'government',    type:'REGULATION',         interval:25000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=election',          domain:'government',    type:'ELECTION',           interval:20000 },
      { url:'https://www.reddit.com/r/GlobalNews/new.json',                            domain:'government',    type:'GLOBAL_NEWS',        interval:15000 },

      // ── HEALTHCARE (10 sources) ──────────────────────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=healthcare',        domain:'healthcare',    type:'HEALTH_SIGNAL',      interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=FDA',               domain:'healthcare',    type:'FDA_SIGNAL',         interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=biotech',           domain:'healthcare',    type:'BIOTECH',            interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=clinical+trial',    domain:'healthcare',    type:'CLINICAL_TRIAL',     interval:25000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=drug+approval',     domain:'healthcare',    type:'DRUG_APPROVAL',      interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=medical',           domain:'healthcare',    type:'MEDICAL_NEWS',       interval:25000 },
      { url:'https://www.reddit.com/r/medicine/new.json',                              domain:'healthcare',    type:'MEDICINE',           interval:20000 },
      { url:'https://www.reddit.com/r/Health/new.json',                                domain:'healthcare',    type:'HEALTH_REDDIT',      interval:20000 },
      { url:'https://www.reddit.com/r/nursing/new.json',                               domain:'healthcare',    type:'NURSING',            interval:30000 },
      { url:'https://www.reddit.com/r/pharmacy/new.json',                              domain:'healthcare',    type:'PHARMACY',           interval:30000 },

      // ── ENERGY (10 sources) ──────────────────────────────────────────
      { url:'https://www.reddit.com/r/energy/new.json',                                domain:'energy',        type:'ENERGY_NEWS',        interval:15000 },
      { url:'https://www.reddit.com/r/RenewableEnergy/new.json',                       domain:'energy',        type:'RENEWABLE',          interval:18000 },
      { url:'https://www.reddit.com/r/oil/new.json',                                   domain:'energy',        type:'OIL_MARKET',         interval:15000 },
      { url:'https://www.reddit.com/r/solar/new.json',                                 domain:'energy',        type:'SOLAR',              interval:20000 },
      { url:'https://www.reddit.com/r/nuclear/new.json',                               domain:'energy',        type:'NUCLEAR',            interval:25000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=energy',            domain:'energy',        type:'ENERGY_SIGNAL',      interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=solar',             domain:'energy',        type:'SOLAR_SIGNAL',       interval:25000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=oil+price',         domain:'energy',        type:'OIL_PRICE',          interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=clean+energy',      domain:'energy',        type:'CLEAN_ENERGY',       interval:25000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=battery',           domain:'energy',        type:'BATTERY_TECH',       interval:30000 },

      // ── SOCIAL (8 sources) ───────────────────────────────────────────
      { url:'https://www.reddit.com/r/news/new.json',                                  domain:'social',        type:'BREAKING_NEWS',      interval:8000  },
      { url:'https://www.reddit.com/r/worldnews/hot.json',                             domain:'social',        type:'WORLD_HOT',          interval:8000  },
      { url:'https://www.reddit.com/r/business/new.json',                              domain:'social',        type:'BUSINESS',           interval:12000 },
      { url:'https://www.reddit.com/r/economics/new.json',                             domain:'social',        type:'ECONOMICS',          interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search_by_date?tags=comment',               domain:'social',        type:'HN_PULSE',           interval:6000  },
      { url:'https://www.reddit.com/r/TrueOffMyChest/new.json',                        domain:'social',        type:'SENTIMENT',          interval:20000 },
      { url:'https://www.reddit.com/r/todayilearned/new.json',                         domain:'social',        type:'VIRAL_SIGNAL',       interval:15000 },
      { url:'https://www.reddit.com/r/explainlikeimfive/new.json',                     domain:'social',        type:'TREND_SIGNAL',       interval:20000 },

      // ── DEFENSE (10 sources) — $2.00/10 ─────────────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=defense',           domain:'defense',       type:'DEFENSE_SIGNAL',     interval:12000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=military',          domain:'defense',       type:'MILITARY_INTEL',     interval:12000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=NATO',              domain:'defense',       type:'NATO_SIGNAL',        interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=warfare',           domain:'defense',       type:'WARFARE_INTEL',      interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=sanctions',         domain:'defense',       type:'SANCTIONS',          interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=weapon',            domain:'defense',       type:'WEAPONS_SIGNAL',     interval:18000 },
      { url:'https://www.reddit.com/r/geopolitics/new.json',                           domain:'defense',       type:'GEOPOLITICS',        interval:12000 },
      { url:'https://www.reddit.com/r/CredibleDefense/new.json',                       domain:'defense',       type:'CREDIBLE_DEFENSE',   interval:15000 },
      { url:'https://www.reddit.com/r/worldnews/new.json?limit=10',                    domain:'defense',       type:'CONFLICT_SIGNAL',    interval:10000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=intelligence+agency', domain:'defense',     type:'INTEL_AGENCY',       interval:20000 },

      // ── CYBERSECURITY (12 sources) — $1.80/10 ───────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=cybersecurity',     domain:'cybersecurity', type:'CYBER_SIGNAL',       interval:8000  },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=hacking',           domain:'cybersecurity', type:'HACK_SIGNAL',        interval:8000  },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=ransomware',        domain:'cybersecurity', type:'RANSOMWARE',         interval:10000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=data+breach',       domain:'cybersecurity', type:'BREACH_ALERT',       interval:8000  },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=vulnerability',     domain:'cybersecurity', type:'VULN_ALERT',         interval:8000  },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=malware',           domain:'cybersecurity', type:'MALWARE_ALERT',      interval:10000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=zero+day',          domain:'cybersecurity', type:'ZERO_DAY',           interval:8000  },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=phishing',          domain:'cybersecurity', type:'PHISHING',           interval:12000 },
      { url:'https://www.reddit.com/r/netsec/new.json',                                domain:'cybersecurity', type:'NETSEC',             interval:8000  },
      { url:'https://www.reddit.com/r/cybersecurity/new.json',                         domain:'cybersecurity', type:'CYBER_REDDIT',       interval:10000 },
      { url:'https://www.reddit.com/r/hacking/new.json',                               domain:'cybersecurity', type:'HACK_REDDIT',        interval:12000 },
      { url:'https://www.reddit.com/r/AskNetsec/new.json',                             domain:'cybersecurity', type:'NETSEC_QA',          interval:15000 },

      // ── LEGAL (8 sources) — $1.50/10 ────────────────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=lawsuit',           domain:'legal',         type:'LAWSUIT',            interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=compliance',        domain:'legal',         type:'COMPLIANCE',         interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=court',             domain:'legal',         type:'COURT_RULING',       interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=antitrust',         domain:'legal',         type:'ANTITRUST',          interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=GDPR',              domain:'legal',         type:'GDPR',               interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=patent',            domain:'legal',         type:'PATENT',             interval:20000 },
      { url:'https://www.reddit.com/r/law/new.json',                                   domain:'legal',         type:'LAW_REDDIT',         interval:15000 },
      { url:'https://api.federalregister.gov/v1/articles?per_page=10&order=newest',    domain:'legal',         type:'REGULATORY',         interval:25000 },

      // ── REAL ESTATE (8 sources) — $1.20/10 ──────────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=real+estate',       domain:'realestate',    type:'RE_SIGNAL',          interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=housing+market',    domain:'realestate',    type:'HOUSING_MARKET',     interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=mortgage',          domain:'realestate',    type:'MORTGAGE',           interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=property',          domain:'realestate',    type:'PROPERTY',           interval:20000 },
      { url:'https://www.reddit.com/r/RealEstate/new.json',                            domain:'realestate',    type:'RE_REDDIT',          interval:15000 },
      { url:'https://www.reddit.com/r/REBubble/new.json',                              domain:'realestate',    type:'BUBBLE_SIGNAL',      interval:15000 },
      { url:'https://www.reddit.com/r/FirstTimeHomeBuyer/new.json',                    domain:'realestate',    type:'BUYER_SIGNAL',       interval:20000 },
      { url:'https://www.reddit.com/r/realestateinvesting/new.json',                   domain:'realestate',    type:'RE_INVEST',          interval:18000 },

      // ── SUPPLY CHAIN (8 sources) — $1.10/10 ─────────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=supply+chain',      domain:'supplychain',   type:'SUPPLY_CHAIN',       interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=logistics',         domain:'supplychain',   type:'LOGISTICS',          interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=shipping',          domain:'supplychain',   type:'SHIPPING',           interval:18000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=trade+war',         domain:'supplychain',   type:'TRADE_SIGNAL',       interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=tariff',            domain:'supplychain',   type:'TARIFF',             interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=semiconductor',     domain:'supplychain',   type:'SEMICONDUCTOR',      interval:18000 },
      { url:'https://www.reddit.com/r/supplychain/new.json',                           domain:'supplychain',   type:'SC_REDDIT',          interval:15000 },
      { url:'https://www.reddit.com/r/manufacturing/new.json',                         domain:'supplychain',   type:'MANUFACTURING',      interval:20000 },

      // ── SPACE & SCIENCE (8 sources) — $0.90/10 ──────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=space',             domain:'science',       type:'SPACE_SIGNAL',       interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=NASA',              domain:'science',       type:'NASA_SIGNAL',        interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=SpaceX',            domain:'science',       type:'SPACEX_SIGNAL',      interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=quantum',           domain:'science',       type:'QUANTUM',            interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=physics',           domain:'science',       type:'PHYSICS',            interval:25000 },
      { url:'https://www.reddit.com/r/space/new.json',                                 domain:'science',       type:'SPACE_REDDIT',       interval:15000 },
      { url:'https://www.reddit.com/r/science/new.json',                               domain:'science',       type:'SCIENCE_REDDIT',     interval:15000 },
      { url:'https://www.reddit.com/r/Futurology/new.json',                            domain:'science',       type:'FUTUROLOGY',         interval:20000 },

      // ── CLIMATE & ENVIRONMENT (6 sources) — $0.60/10 ────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=climate+change',    domain:'climate',       type:'CLIMATE_SIGNAL',     interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=environment',       domain:'climate',       type:'ENV_SIGNAL',         interval:25000 },
      { url:'https://www.reddit.com/r/ClimateChange/new.json',                         domain:'climate',       type:'CLIMATE_REDDIT',     interval:20000 },
      { url:'https://www.reddit.com/r/environment/new.json',                           domain:'climate',       type:'ENV_REDDIT',         interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=carbon',            domain:'climate',       type:'CARBON_SIGNAL',      interval:25000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=sustainability',    domain:'climate',       type:'SUSTAINABILITY',      interval:25000 },

      // ── ECONOMY & MACRO (8 sources) — $1.30/10 ──────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=inflation',         domain:'economy',       type:'INFLATION',          interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=recession',         domain:'economy',       type:'RECESSION_SIGNAL',   interval:15000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=interest+rate',     domain:'economy',       type:'RATE_SIGNAL',        interval:12000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=GDP',               domain:'economy',       type:'GDP_SIGNAL',         interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=Federal+Reserve',   domain:'economy',       type:'FED_SIGNAL',         interval:12000 },
      { url:'https://www.reddit.com/r/Economics/new.json',                             domain:'economy',       type:'ECON_REDDIT',        interval:12000 },
      { url:'https://www.reddit.com/r/MacroEconomics/new.json',                        domain:'economy',       type:'MACRO',              interval:15000 },
      { url:'https://www.reddit.com/r/wallstreetbets/new.json',                        domain:'economy',       type:'MARKET_SENTIMENT',   interval:8000  },

      // ── EMERGING MARKETS (6 sources) — $0.70/10 ─────────────────────
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=Africa',            domain:'emerging',      type:'AFRICA_SIGNAL',      interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=emerging+markets',  domain:'emerging',      type:'EM_SIGNAL',          interval:20000 },
      { url:'https://www.reddit.com/r/Africa/new.json',                                domain:'emerging',      type:'AFRICA_REDDIT',      interval:20000 },
      { url:'https://www.reddit.com/r/India/new.json',                                 domain:'emerging',      type:'INDIA_SIGNAL',       interval:20000 },
      { url:'https://hn.algolia.com/api/v1/search?tags=story&query=fintech+Africa',    domain:'emerging',      type:'AFRICA_FINTECH',     interval:25000 },
      { url:'https://www.reddit.com/r/China/new.json',                                 domain:'emerging',      type:'CHINA_SIGNAL',       interval:20000 }
    ];
  }

  _fetch(url, cb) {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers:{ 'User-Agent':'M7-77-Intelligence/4.0', 'Accept':'application/json' },
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
    const push   = (item, idx) => events.push({
      id:`${domain}-${ts}-${idx}`, domain, type, source:url, timestamp:ts, data:item
    });
    try {
      if (Array.isArray(data))           data.slice(0,20).forEach(push);
      else if (data?.data?.children)     data.data.children.slice(0,20).forEach((c,i)=>push(c.data,i));
      else if (data?.hits)               data.hits.slice(0,20).forEach(push);
      else if (data?.results)            data.results.slice(0,10).forEach(push);
      else if (data?.data)               [data.data].forEach(push);
      else if (data)                     [data].forEach(push);
    } catch(e){}
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
    console.log(`🌐 M7 Ingestion v4.0 — ${this.sources.length} sources — 15 domains — ALL INTERNET`);
    this.sources.forEach(source => {
      this._poll(source);
      const iv = setInterval(() => { if (this.isRunning) this._poll(source); }, source.interval);
      this.intervals.push(iv);
    });
    console.log(`✅ ${this.sources.length} sources live — events flowing`);
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
      domains:      15,
      errors:       this.errorCount,
      domainCounts: this.domainCounts,
      status:       this.isRunning ? 'RUNNING' : 'STOPPED'
    };
  }
}

module.exports = RealEventIngestion;
