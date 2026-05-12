'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { getDB } = require('./m7-database');

class SelfHealingEngine extends EventEmitter {
  constructor(ingestion, brain, revenueEngine, treasury) {
    super();
    this.ingestion     = ingestion;
    this.brain         = brain;
    this.revenueEngine = revenueEngine;
    this.treasury      = treasury;
    this.db            = getDB();
    this.isRunning     = false;
    this.healLog       = [];
    this.deadSources   = {};
    this.recoveries    = 0;
    this.lastCheck     = null;
    console.log('Self-Healing Engine initialized');
  }

  _log(type, detail, severity='INFO') {
    const entry = { timestamp: Date.now(), type, detail, severity };
    this.healLog.push(entry);
    if (this.healLog.length > 200) this.healLog.shift();
    if (severity !== 'INFO') console.log(`[HEAL] ${type}: ${detail}`);
    this.emit('heal_action', entry);
  }

  // ── Check every source is alive ──────────────────────────────────────────
  async checkSources() {
    const sources = this.ingestion.sources;
    const now     = Date.now();
    const dc      = this.ingestion.domainCounts || {};
    let   dead    = 0;

    for (const source of sources) {
      const key       = source.url;
      const lastCount = this.deadSources[key]?.lastCount || 0;
      const domain    = source.domain;
      const current   = dc[domain] || 0;

      // Source is dead if domain count hasn't changed in 10 minutes
      if (!this.deadSources[key]) {
        this.deadSources[key] = { lastCount: current, checkedAt: now, deadSince: null };
      } else {
        const entry = this.deadSources[key];
        if (current === entry.lastCount && now - entry.checkedAt > 600000) {
          if (!entry.deadSince) {
            entry.deadSince = now;
            this._log('SOURCE_DEAD', `${source.domain}::${source.type} — no events for 10min`, 'WARN');
            dead++;
          }
        } else {
          // Source recovered
          if (entry.deadSince) {
            this._log('SOURCE_RECOVERED', `${source.domain}::${source.type} — back online`);
            entry.deadSince = null;
            this.recoveries++;
          }
          entry.lastCount = current;
          entry.checkedAt = now;
        }
      }
    }

    if (dead > 0) {
      this._log('HEALTH_CHECK', `${dead} dead sources detected — requesting Claude replacement`, 'WARN');
      await this._replaceDeadSources(dead);
    }

    return dead;
  }

  // ── Replace dead sources via Claude ─────────────────────────────────────
  async _replaceDeadSources(count) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const deadList = Object.entries(this.deadSources)
      .filter(([,v]) => v.deadSince)
      .map(([url]) => url)
      .slice(0, 10);

    if (deadList.length === 0) return;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: 'You are M7 self-healing engine. Replace dead data sources with working alternatives. Respond ONLY with valid JSON.',
          messages: [{ role: 'user', content:
            `These sources are dead: ${deadList.join(', ')}\n` +
            `Suggest ${count} replacement real public API sources.\n` +
            `Return JSON: [{"url":"full_url","domain":"domain","type":"TYPE","interval":15000}]\n` +
            `Only real publicly accessible URLs, no auth required.`
          }]
        })
      });
      const data    = await res.json();
      const text    = data.content[0].text.replace(/```json|```/g,'').trim();
      const newSrcs = JSON.parse(text);

      if (Array.isArray(newSrcs)) {
        let added = 0;
        newSrcs.forEach(src => {
          if (!this.ingestion.sources.find(s => s.url === src.url)) {
            this.ingestion.sources.push(src);
            if (this.ingestion.isRunning) {
              this.ingestion._poll(src);
              const iv = setInterval(() => {
                if (this.ingestion.isRunning) this.ingestion._poll(src);
              }, src.interval || 15000);
              this.ingestion.intervals.push(iv);
            }
            added++;
          }
        });
        if (added > 0) {
          this._log('SOURCES_REPLACED', `Added ${added} replacement sources`, 'INFO');
          this.recoveries += added;
        }
      }
    } catch(e) {
      this._log('REPLACE_ERROR', e.message, 'WARN');
    }
  }

  // ── Check brain is running ────────────────────────────────────────────────
  checkBrain() {
    if (!this.brain.isRunning) {
      this._log('BRAIN_DEAD', 'Brain stopped — restarting', 'CRITICAL');
      this.brain.start();
      this.recoveries++;
      return false;
    }
    // Check brain buffer not stuck
    if (this.brain.eventBuffer.length > 900) {
      this._log('BRAIN_OVERFLOW', 'Buffer overflow — clearing', 'WARN');
      this.brain.eventBuffer = this.brain.eventBuffer.slice(-100);
    }
    return true;
  }

  // ── Check ingestion is running ────────────────────────────────────────────
  checkIngestion() {
    if (!this.ingestion.isRunning) {
      this._log('INGESTION_DEAD', 'Ingestion stopped — restarting', 'CRITICAL');
      this.ingestion.start();
      this.recoveries++;
      return false;
    }
    return true;
  }

  // ── Check revenue engine ──────────────────────────────────────────────────
  checkRevenue() {
    const report = this.revenueEngine.getReport();
    if (report.total === 0 && this.ingestion.eventCount > 1000) {
      this._log('REVENUE_ZERO', 'Events flowing but zero revenue — checking engine', 'WARN');
    }
    return true;
  }

  // ── Check treasury ────────────────────────────────────────────────────────
  checkTreasury() {
    const status = this.treasury.getStatus();
    const dbBal  = this.db.getTreasuryBalance();
    // Sync if drift > $1
    if (Math.abs(status.ledger.balance - dbBal) > 1 && dbBal > 0) {
      this._log('TREASURY_SYNC', `Balance drift detected — DB: $${dbBal.toFixed(2)} RAM: $${status.ledger.balance.toFixed(2)}`, 'WARN');
      // Restore from DB
      this.treasury.balance = dbBal;
      this._log('TREASURY_RESTORED', `Balance restored from DB: $${dbBal.toFixed(2)}`);
    }
    return true;
  }

  // ── Full system health cycle ──────────────────────────────────────────────
  async runHealthCycle() {
    this.lastCheck = Date.now();
    this._log('HEALTH_CYCLE', 'Running full system health check');

    const results = {
      brain:     this.checkBrain(),
      ingestion: this.checkIngestion(),
      revenue:   this.checkRevenue(),
      treasury:  this.checkTreasury(),
      sources:   await this.checkSources()
    };

    const issues = Object.entries(results).filter(([,v]) => v === false || v > 0);
    if (issues.length === 0) {
      this._log('HEALTH_OK', 'All systems nominal');
    } else {
      this._log('HEALTH_ISSUES', `${issues.length} issues found and addressed`, 'WARN');
    }

    // Save health state to DB
    this.db.setState('health_last', {
      timestamp: Date.now(),
      results,
      recoveries: this.recoveries
    });

    this.emit('health_cycle', { results, recoveries: this.recoveries });
    return results;
  }

  start() {
    this.isRunning = true;
    // Full health check every 5 minutes
    setInterval(() => this.runHealthCycle(), 300000);
    // Quick checks every 60 seconds
    setInterval(() => {
      this.checkBrain();
      this.checkIngestion();
    }, 60000);
    // Run first check after 30 seconds
    setTimeout(() => this.runHealthCycle(), 30000);
    console.log('Self-Healing Engine started — monitoring all systems');
  }

  getStatus() {
    return {
      isRunning:   this.isRunning,
      lastCheck:   this.lastCheck,
      recoveries:  this.recoveries,
      deadSources: Object.values(this.deadSources).filter(v => v.deadSince).length,
      recentActions: this.healLog.slice(-10).reverse()
    };
  }
}

module.exports = SelfHealingEngine;
