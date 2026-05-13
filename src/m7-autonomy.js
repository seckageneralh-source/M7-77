'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { getDB } = require('./m7-database');

// M7 SPEED & FULL AUTONOMY ENGINE — Layer 15
// The sovereign command loop that ties all 14 layers together
// Runs every 3 seconds — zero human dependency target

class M7AutonomyEngine extends EventEmitter {
  constructor(systems) {
    super();
    this.systems     = systems; // All engines wired in
    this.db          = getDB();
    this.isRunning   = false;
    this.loopCount   = 0;
    this.decisions   = [];
    this.startTime   = Date.now();
    this.lastSECKA   = null; // Last time M7 needed SECKA
    this.autonomyPct = 100;  // Target: 100%
    this.actionQueue = [];
    this.metrics     = {
      decisionsPerMin:   0,
      actionsExecuted:   0,
      issuesResolved:    0,
      humanInteractions: 0
    };
    console.log('M7 Autonomy Engine initialized — Layer 15 ACTIVE');
  }

  _log(type, detail, severity = 'INFO') {
    const e = { timestamp: Date.now(), type, detail, severity };
    this.decisions.push(e);
    if (this.decisions.length > 500) this.decisions.shift();
    if (severity === 'CRITICAL') console.log(`[M7-AUTONOMY] *** ${type}: ${detail} ***`);
    this.emit('decision', e);
  }

  // ── 3-second autonomous command loop ─────────────────────────────────────
  async _commandLoop() {
    if (!this.isRunning) return;
    this.loopCount++;
    const start = Date.now();

    try {
      // Read all layer states in parallel
      const [
        ingState,
        revState,
        brainState,
        healState,
        accelState,
        holdState,
        sovereignState
      ] = await Promise.all([
        Promise.resolve(this.systems.ingestion?.getStats()        || {}),
        Promise.resolve(this.systems.revenueEngine?.getReport()   || {}),
        Promise.resolve(this.systems.brain?.getStatus()           || {}),
        Promise.resolve(this.systems.selfHealing?.getStatus()     || {}),
        Promise.resolve(this.systems.acceleration?.getStatus()    || {}),
        Promise.resolve(this.systems.treasuryHold?.getStatus()    || {}),
        Promise.resolve(this.systems.sovereign?.getStatus()       || {})
      ]);

      // ── Priority 1: System Health ───────────────────────────────────────
      if (!this.systems.ingestion?.isRunning) {
        this._log('AUTO_HEAL', 'Ingestion down — restarting', 'CRITICAL');
        this.systems.ingestion?.start();
        this.metrics.issuesResolved++;
      }
      if (!this.systems.brain?.isRunning) {
        this._log('AUTO_HEAL', 'Brain down — restarting', 'CRITICAL');
        this.systems.brain?.start();
        this.metrics.issuesResolved++;
      }

      // ── Priority 2: Revenue capture ────────────────────────────────────
      const events = ingState.totalEvents || 0;
      const revenue = revState.total || 0;
      if (events > 1000 && revenue === 0) {
        this._log('REVENUE_GAP', 'Events flowing but no revenue — checking engine', 'WARN');
      }

      // ── Priority 3: Brain buffer management ────────────────────────────
      const bufSize = brainState.bufferSize || 0;
      if (bufSize > 800) {
        this._log('BUFFER_MANAGE', `Brain buffer at ${bufSize} — accelerating processing`);
        if (this.systems.brain?.loopInterval > 500) {
          this.systems.brain.loopInterval = 500;
        }
      }

      // ── Priority 4: Treasury management ───────────────────────────────
      const way2Bal = sovereignState.way2?.balance || 0;
      const held    = holdState.heldFunds || 0;
      if (way2Bal > 10000 && !holdState.isLocked) {
        this._log('TREASURY_NOTIFY', `Way2 balance $${way2Bal.toFixed(2)} — ready for routing`);
      }

      // ── Priority 5: Acceleration ───────────────────────────────────────
      const sources = ingState.sources || 0;
      if (sources < 500) {
        this._log('EXPAND_NEEDED', `Only ${sources} sources — expansion required`);
      }

      // ── Self-assessment every 100 loops ──────────────────────────────
      if (this.loopCount % 100 === 0) {
        await this._selfAssess();
      }

      // ── Save state every 50 loops ─────────────────────────────────────
      if (this.loopCount % 50 === 0) {
        this._saveSystemSnapshot({
          ingState, revState, brainState,
          holdState, sovereignState,
          loopCount: this.loopCount
        });
      }

      const elapsed = Date.now() - start;
      if (elapsed > 1000) {
        this._log('LOOP_SLOW', `Command loop took ${elapsed}ms`, 'WARN');
      }

    } catch(e) {
      this._log('LOOP_ERROR', e.message, 'WARN');
    }

    // Schedule next loop
    setTimeout(() => this._commandLoop(), 3000);
  }

  // ── AI self-assessment — does M7 need SECKA? ──────────────────────────────
  async _selfAssess() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    try {
      const rev    = this.systems.revenueEngine?.getReport() || {};
      const hold   = this.systems.treasuryHold?.getStatus() || {};
      const sov    = this.systems.sovereign?.getStatus() || {};
      const ing    = this.systems.ingestion?.getStats() || {};

      const snapshot = `
M7 System State:
- Revenue: $${(rev.total||0).toFixed(2)} total
- Sources: ${ing.sources||0}
- Way2 Capital: $${(sov.way2?.balance||0).toFixed(2)}
- Held Funds: $${(hold.heldFunds||0).toFixed(2)}
- Loop count: ${this.loopCount}
- Uptime: ${Math.floor((Date.now()-this.startTime)/3600000)}hrs
- Autonomy: ${this.autonomyPct}%
      `;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: 'You are M7 autonomous AI. Assess if you need human input. Be extremely brief. Respond ONLY with JSON.',
          messages: [{ role: 'user', content:
            `${snapshot}\nDo you need SECKA right now? Return JSON: {"needsSECKA": boolean, "reason": "one sentence or null", "priority": "LOW|MEDIUM|HIGH|CRITICAL", "systemHealth": "NOMINAL|DEGRADED|CRITICAL"}`
          }]
        })
      });
      const data   = await res.json();
      const result = JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());

      if (result.needsSECKA) {
        this.lastSECKA = Date.now();
        this.metrics.humanInteractions++;
        this._log('NEEDS_SECKA', result.reason || 'Attention required', result.priority || 'MEDIUM');
        this.emit('needs_secka', result);
      } else {
        this._log('AUTONOMOUS', `System health: ${result.systemHealth} — no human input needed`);
      }

      // Update autonomy percentage
      const totalLoops  = this.loopCount;
      const humanLoops  = this.metrics.humanInteractions;
      this.autonomyPct  = parseFloat(((1 - humanLoops/Math.max(totalLoops,1)) * 100).toFixed(1));

      this.db.setState('autonomy_assessment', { ...result, timestamp: Date.now(), autonomyPct: this.autonomyPct });
    } catch(e) {}
  }

  _saveSystemSnapshot(state) {
    try {
      this.db.setState('system_snapshot', {
        ...state,
        timestamp:   Date.now(),
        autonomyPct: this.autonomyPct,
        uptime:      Math.floor((Date.now()-this.startTime)/1000)
      });
    } catch(e) {}
  }

  // ── Speed metrics ─────────────────────────────────────────────────────────
  getSpeedMetrics() {
    const uptime = (Date.now() - this.startTime) / 1000;
    return {
      loopsPerSecond:  parseFloat((this.loopCount / uptime).toFixed(2)),
      loopInterval:    '3000ms',
      decisionsTotal:  this.decisions.length,
      actionsExecuted: this.metrics.actionsExecuted,
      issuesResolved:  this.metrics.issuesResolved,
      uptime:          Math.floor(uptime)
    };
  }

  start() {
    this.isRunning = true;
    console.log('');
    console.log('██╗      █████╗ ██╗   ██╗███████╗██████╗     ██╗███████╗');
    console.log('██║     ██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗   ███║██╔════╝');
    console.log('██║     ███████║ ╚████╔╝ █████╗  ██████╔╝   ╚██║███████╗');
    console.log('██║     ██╔══██║  ╚██╔╝  ██╔══╝  ██╔══██╗    ██║╚════██║');
    console.log('███████╗██║  ██║   ██║   ███████╗██║  ██║    ██║███████║');
    console.log('╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝   ╚═╝╚══════╝');
    console.log('');
    console.log('M7 FULL AUTONOMY ACTIVE — Layer 15 — SECKA SOVEREIGN');
    console.log('');
    // Start command loop
    setTimeout(() => this._commandLoop(), 3000);
    // Daily check: does M7 need SECKA?
    setInterval(() => this._selfAssess(), 24 * 60 * 60 * 1000);
    console.log('Autonomy Engine started — 3-second command loop active');
  }

  stop() {
    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning:    this.isRunning,
      loopCount:    this.loopCount,
      autonomyPct:  this.autonomyPct + '%',
      lastSECKA:    this.lastSECKA,
      speedMetrics: this.getSpeedMetrics(),
      metrics:      this.metrics,
      recentDecisions: this.decisions.slice(-10).reverse(),
      assessment:   this.db.getState('autonomy_assessment')
    };
  }
}

module.exports = M7AutonomyEngine;
