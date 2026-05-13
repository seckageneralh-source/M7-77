'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { getDB } = require('./m7-database');

class GrowthEngine extends EventEmitter {
  constructor(ingestion, revenueEngine, brain, acceleration) {
    super();
    this.ingestion     = ingestion;
    this.revenueEngine = revenueEngine;
    this.brain         = brain;
    this.acceleration  = acceleration;
    this.db            = getDB();
    this.isRunning     = false;
    this.cycleCount    = 0;
    this.improvements  = [];
    this.log           = [];
    console.log('Growth Engine initialized');
  }

  _log(type, detail) {
    const e = { timestamp: Date.now(), type, detail };
    this.log.push(e);
    if (this.log.length > 200) this.log.shift();
    console.log(`[GROWTH] ${type}: ${detail}`);
    this.emit('growth_action', e);
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

  async runGrowthCycle() {
    this.cycleCount++;
    this._log('GROWTH_CYCLE', `Cycle ${this.cycleCount} starting`);

    const rev    = this.revenueEngine.getReport();
    const ing    = this.ingestion.getStats();
    const brain  = this.brain.getStatus();
    const accel  = this.acceleration.getStatus();

    // Build system snapshot for Claude
    const snapshot = `
SYSTEM STATE:
- Sources: ${ing.sources} / 1000 target
- Events: ${ing.totalEvents} total
- Revenue: $${rev.total.toFixed(2)}
- Projected daily: $${(accel.trajectory?.projectedDaily||0/1e6).toFixed(1)}M
- Claude calls: ${brain.claudeMetrics?.totalCalls||0}
- Top domains: ${Object.entries(rev.domainBreakdown||{}).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,3).map(([d,v])=>`${d}:$${(v.revenue||0).toFixed(0)}`).join(', ')}
- Underperforming: ${Object.entries(rev.domainBreakdown||{}).filter(([,v])=>(v.events||0)<100).map(([d])=>d).join(', ')||'none'}
    `;

    try {
      const raw = await this._callClaude(
        'You are M7 growth strategist. Analyze system performance and suggest specific improvements. Respond ONLY with valid JSON.',
        `Analyze this M7 system and suggest growth actions:\n${snapshot}\n
Return JSON:
{
  "analysis": "2 sentence assessment",
  "topIssue": "biggest bottleneck",
  "actions": [
    {"type":"pricing|sources|domains|brain","action":"specific action","expectedImpact":"impact description","priority":1}
  ],
  "weeklyTarget": "$X revenue target",
  "confidence": 0.0-1.0
}`,
        600
      );

      const result = JSON.parse(raw.replace(/```json|```/g,'').trim());
      this.improvements.push({ ...result, timestamp: Date.now() });
      if (this.improvements.length > 50) this.improvements.shift();

      // Auto-execute high priority actions
      (result.actions || []).filter(a => a.priority === 1).forEach(action => {
        this._executeAction(action);
      });

      this.db.setState('growth_latest', { ...result, timestamp: Date.now() });
      this._log('CYCLE_COMPLETE', `Analysis: ${result.analysis}`);
      this.emit('cycle_complete', result);
      return result;
    } catch(e) {
      this._log('CYCLE_ERROR', e.message);
      return null;
    }
  }

  _executeAction(action) {
    try {
      switch(action.type) {
        case 'pricing':
          this._log('AUTO_ACTION', `Pricing: ${action.action}`);
          break;
        case 'sources':
          if (this.ingestion.sources.length < 1000) {
            this._log('AUTO_ACTION', `Sources: ${action.action}`);
          }
          break;
        case 'brain':
          this._log('AUTO_ACTION', `Brain: ${action.action}`);
          break;
        default:
          this._log('AUTO_ACTION', `${action.type}: ${action.action}`);
      }
      this.emit('action_executed', action);
    } catch(e) {}
  }

  start() {
    this.isRunning = true;
    // Weekly optimization cycle
    setInterval(() => this.runGrowthCycle(), 7 * 24 * 60 * 60 * 1000);
    // Daily light cycle
    setInterval(() => this.runGrowthCycle(), 24 * 60 * 60 * 1000);
    // First cycle after 5 minutes
    setTimeout(() => this.runGrowthCycle(), 300000);
    console.log('Growth Engine started');
  }

  getStatus() {
    return {
      isRunning:    this.isRunning,
      cycleCount:   this.cycleCount,
      improvements: this.improvements.slice(-5).reverse(),
      recentLog:    this.log.slice(-10).reverse(),
      latest:       this.db.getState('growth_latest')
    };
  }
}

module.exports = GrowthEngine;
