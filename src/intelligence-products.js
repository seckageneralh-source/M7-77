'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const crypto = require('crypto');
const { getDB } = require('./m7-database');

const PRODUCT_TYPES = {
  DAILY_BRIEFING:    'daily_briefing',
  THREAT_REPORT:     'threat_report',
  DOMAIN_ANALYSIS:   'domain_analysis',
  EXECUTIVE_SUMMARY: 'executive_summary',
  SIGNAL_DIGEST:     'signal_digest'
};

class IntelligenceProductsEngine extends EventEmitter {
  constructor(brain, revenueEngine, ingestion) {
    super();
    this.brain         = brain;
    this.revenueEngine = revenueEngine;
    this.ingestion     = ingestion;
    this.db            = getDB();
    this.isRunning     = false;
    this.productsGenerated = 0;
    this.lastGenerated     = null;
    this.productLog        = [];
    console.log('Intelligence Products Engine initialized');
  }

  _sign(content) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(content) + Date.now())
      .digest('hex').substr(0, 32);
  }

  async _callClaude(system, user, maxTokens = 800) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('No API key');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });
    const data = await res.json();
    return data.content[0].text;
  }

  // ── Daily Intelligence Briefing ───────────────────────────────────────────
  async generateDailyBriefing() {
    const rev     = this.revenueEngine.getReport();
    const ing     = this.ingestion.getStats();
    const brain   = this.brain.getStatus();
    const insights= brain.aiInsights || [];
    const threats = brain.threats || [];

    const topDomains = Object.entries(rev.domainBreakdown || {})
      .sort((a,b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([d,v]) => `${d}: ${v.events} events, $${(v.revenue||0).toFixed(2)}`)
      .join('\n');

    const recentInsights = insights.slice(-10)
      .map(i => `[${i.domain}] SEV${i.severity}: ${i.insight}`)
      .join('\n') || 'No insights yet';

    const threatSummary = threats.slice(-5)
      .map(t => t.detail)
      .join('\n') || 'No threats detected';

    try {
      const raw = await this._callClaude(
        'You are M7 sovereign intelligence system. Generate structured daily intelligence briefings. Be precise, actionable, and concise. Respond ONLY with valid JSON.',
        `Generate a daily intelligence briefing based on this data:
TOP DOMAINS BY REVENUE:
${topDomains}

RECENT AI INSIGHTS:
${recentInsights}

THREATS:
${threatSummary}

SYSTEM: ${ing.sources} sources, ${ing.totalEvents} events processed, $${rev.total.toFixed(2)} revenue

Return JSON:
{
  "title": "M7 Daily Intelligence Briefing",
  "date": "${new Date().toISOString().split('T')[0]}",
  "executiveSummary": "2-3 sentence summary",
  "keyDevelopments": ["development 1", "development 2", "development 3"],
  "threatLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "topSignals": [{"domain":"","signal":"","severity":0,"action":""}],
  "recommendations": ["rec 1", "rec 2"],
  "outlook": "brief outlook statement"
}`,
        1000
      );

      const product = JSON.parse(raw.replace(/```json|```/g,'').trim());
      const signature = this._sign(product);
      product.signature  = signature;
      product.generatedAt = Date.now();
      product.aiPowered  = true;

      this.db.saveProduct('all', PRODUCT_TYPES.DAILY_BRIEFING, product, signature);
      this.productsGenerated++;
      this.lastGenerated = Date.now();
      this.productLog.push({ type: PRODUCT_TYPES.DAILY_BRIEFING, timestamp: Date.now() });

      console.log('Daily briefing generated — threat level: ' + product.threatLevel);
      this.emit('product_generated', { type: PRODUCT_TYPES.DAILY_BRIEFING, product });
      return product;
    } catch(e) {
      console.log('Briefing generation failed:', e.message);
      return null;
    }
  }

  // ── Domain Analysis ───────────────────────────────────────────────────────
  async generateDomainAnalysis(domain) {
    const rev    = this.revenueEngine.getReport();
    const domRev = rev.domainBreakdown?.[domain] || { events: 0, revenue: 0 };
    const brain  = this.brain.getStatus();
    const domInsights = (brain.aiInsights || [])
      .filter(i => i.domain === domain)
      .slice(-5)
      .map(i => `SEV${i.severity}: ${i.insight}`)
      .join('\n') || 'No recent insights';

    try {
      const raw = await this._callClaude(
        'You are M7 domain intelligence analyst. Generate precise domain analysis reports. Respond ONLY with valid JSON.',
        `Generate analysis for domain: ${domain.toUpperCase()}
Events: ${domRev.events}
Revenue: $${(domRev.revenue||0).toFixed(2)}
Recent insights:
${domInsights}

Return JSON:
{
  "domain": "${domain}",
  "status": "ACTIVE|ELEVATED|CRITICAL",
  "summary": "2 sentence summary",
  "keySignals": ["signal 1", "signal 2", "signal 3"],
  "riskLevel": "LOW|MEDIUM|HIGH",
  "opportunities": ["opportunity 1", "opportunity 2"],
  "nextActions": ["action 1", "action 2"]
}`,
        600
      );

      const product   = JSON.parse(raw.replace(/```json|```/g,'').trim());
      const signature = this._sign(product);
      product.signature   = signature;
      product.generatedAt = Date.now();

      this.db.saveProduct(domain, PRODUCT_TYPES.DOMAIN_ANALYSIS, product, signature);
      this.productsGenerated++;
      this.emit('product_generated', { type: PRODUCT_TYPES.DOMAIN_ANALYSIS, domain, product });
      return product;
    } catch(e) {
      return null;
    }
  }

  // ── Threat Report ─────────────────────────────────────────────────────────
  async generateThreatReport() {
    const brain   = this.brain.getStatus();
    const threats = brain.threats || [];
    if (threats.length === 0) return null;

    const threatData = threats.slice(-10)
      .map(t => `${t.detail} — domains: ${(t.threats||[]).map(x=>x.domain).join(',')}`)
      .join('\n');

    try {
      const raw = await this._callClaude(
        'You are M7 threat intelligence analyst. Generate actionable threat reports. Respond ONLY with valid JSON.',
        `Generate threat intelligence report:
THREATS DETECTED:
${threatData}

Return JSON:
{
  "reportTitle": "M7 Threat Intelligence Report",
  "timestamp": "${new Date().toISOString()}",
  "threatCount": ${threats.length},
  "overallThreatLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "threats": [{"type":"","severity":0,"description":"","affectedDomains":[],"recommendation":""}],
  "immediateActions": ["action 1", "action 2"],
  "summary": "executive summary"
}`,
        800
      );

      const product   = JSON.parse(raw.replace(/```json|```/g,'').trim());
      const signature = this._sign(product);
      product.signature   = signature;
      product.generatedAt = Date.now();

      this.db.saveProduct('threats', PRODUCT_TYPES.THREAT_REPORT, product, signature);
      this.productsGenerated++;
      this.emit('product_generated', { type: PRODUCT_TYPES.THREAT_REPORT, product });
      return product;
    } catch(e) {
      return null;
    }
  }

  // ── Wire brain insights to DB ─────────────────────────────────────────────
  _wireBrainToDB() {
    this.brain.on('ai_analysis', (data) => {
      const insights = data.insights || [];
      insights.forEach(i => {
        try { this.db.saveInsight({ ...i, aiPowered: true }); } catch(e) {}
      });
    });
  }

  start() {
    this.isRunning = true;
    this._wireBrainToDB();

    // Daily briefing every 6 hours
    setInterval(() => this.generateDailyBriefing(), 6 * 60 * 60 * 1000);

    // Threat report every hour if threats exist
    setInterval(() => this.generateThreatReport(), 60 * 60 * 1000);

    // Domain analysis cycle — one domain every 30 min
    const domains = ['cybersecurity','defense','finance','government','healthcare','ai','energy','legal','economy','tech'];
    let domainIndex = 0;
    setInterval(() => {
      const domain = domains[domainIndex % domains.length];
      this.generateDomainAnalysis(domain);
      domainIndex++;
    }, 30 * 60 * 1000);

    // First briefing after 2 minutes
    setTimeout(() => this.generateDailyBriefing(), 120000);
    setTimeout(() => this.generateThreatReport(), 180000);

    console.log('Intelligence Products Engine started');
  }

  getStatus() {
    return {
      isRunning:         this.isRunning,
      productsGenerated: this.productsGenerated,
      lastGenerated:     this.lastGenerated,
      recentProducts:    this.productLog.slice(-10).reverse(),
      dbProducts:        this.db.getProducts(null, 5)
    };
  }
}

module.exports = IntelligenceProductsEngine;
