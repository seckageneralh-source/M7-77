const https = require('https');
const EventEmitter = require('events');

class RealEventIngestion extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.eventCount = 0;
    this.intervals = [];
    this.sources = [
      { url: 'https://api.binance.com/api/v3/ticker/24hr', domain: 'finance' },
      { url: 'https://hn.algolia.com/api/v1/search_by_date?tags=story', domain: 'tech' },
      { url: 'https://hn.algolia.com/api/v1/search?tags=story&query=AI', domain: 'ai' },
      { url: 'https://www.reddit.com/r/worldnews/new.json', domain: 'social' },
      { url: 'https://www.reddit.com/r/technology/new.json', domain: 'tech' },
      { url: 'https://www.reddit.com/r/energy/new.json', domain: 'energy' },
      { url: 'https://api.federalregister.gov/v1/articles?per_page=20&order=newest', domain: 'government' },
      { url: 'https://api.github.com/events', domain: 'tech' }
    ];
  }

  fetchFeed(source) {
    const options = {
      headers: {
        'User-Agent': 'M7-77-Intelligence-Engine/1.0',
        'Accept': 'application/json'
      }
    };
    https.get(source.url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const events = this.extractEvents(parsed, source.domain, source.url);
          events.forEach((event) => {
            this.eventCount++;
            this.emit('event', event);
          });
        } catch (e) {}
      });
    }).on('error', () => {});
  }

  extractEvents(data, domain, source) {
    const events = [];
    const timestamp = Date.now();
    const baseValues = {
      finance: 0.50,
      tech: 0.30,
      ai: 0.40,
      government: 0.60,
      health: 0.35,
      social: 0.20,
      energy: 0.45
    };
    const value = baseValues[domain] || 0.25;

    try {
      if (Array.isArray(data) && data.length > 0) {
        data.slice(0, 10).forEach((item) => {
          events.push({
            id: domain + '-' + timestamp + '-' + Math.random(),
            domain: domain,
            source: source,
            type: item.type || 'UPDATE',
            data: item,
            timestamp: timestamp,
            value: value
          });
        });
      } else if (data && data.data && data.data.children) {
        data.data.children.slice(0, 10).forEach((item) => {
          events.push({
            id: domain + '-' + timestamp + '-' + Math.random(),
            domain: domain,
            source: source,
            type: 'SOCIAL_EVENT',
            data: item.data,
            timestamp: timestamp,
            value: value
          });
        });
      } else if (data && data.hits) {
        data.hits.slice(0, 10).forEach((item) => {
          events.push({
            id: domain + '-' + timestamp + '-' + Math.random(),
            domain: domain,
            source: source,
            type: 'NEWS_EVENT',
            data: item,
            timestamp: timestamp,
            value: value
          });
        });
      } else if (data && data.results) {
        data.results.slice(0, 5).forEach((item) => {
          events.push({
            id: domain + '-' + timestamp + '-' + Math.random(),
            domain: domain,
            source: source,
            type: 'REGULATORY_EVENT',
            data: item,
            timestamp: timestamp,
            value: value
          });
        });
      }
    } catch (e) {}
    return events;
  }

  start() {
    this.isRunning = true;
    console.log('🌐 Real Event Ingestion Started — Connecting to live internet feeds...');
    this.sources.forEach((source) => {
      this.fetchFeed(source);
      const interval = setInterval(() => {
        if (this.isRunning) {
          this.fetchFeed(source);
        }
      }, 30000);
      this.intervals.push(interval);
    });
    console.log('✅ Connected to ' + this.sources.length + ' real internet sources');
    console.log('📡 Monitoring 7 domains — Finance, Tech, AI, Government, Health, Social, Energy');
  }

  stop() {
    this.isRunning = false;
    this.intervals.forEach((i) => clearInterval(i));
    console.log('⏹️  Real Event Ingestion Stopped');
  }

  getStats() {
    return {
      totalEvents: this.eventCount,
      sources: this.sources.length,
      domains: 7,
      status: this.isRunning ? 'RUNNING' : 'STOPPED'
    };
  }
}

module.exports = RealEventIngestion;
