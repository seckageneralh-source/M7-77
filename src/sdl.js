'use strict';
const EventEmitter = require('events');
const { getDB } = require('./m7-database');

// Software Defined Logic — zero hardcoded values
// All system behavior driven by DB rules
// M7 AI rewrites rules at runtime

class SoftwareDefinedLogic extends EventEmitter {
  constructor() {
    super();
    this.db      = getDB();
    this.cache   = {};
    this.watches = {};
    this._loadAll();
    console.log('Software Defined Logic initialized — zero hardcoded values');
  }

  _loadAll() {
    const rules = this.db.getAllRules();
    rules.forEach(r => { this.cache[r.key] = r.value; });
    console.log(`SDL loaded ${rules.length} rules from DB`);
  }

  get(key, defaultValue = null) {
    if (this.cache[key] !== undefined) return this.cache[key];
    const val = this.db.getRule(key);
    if (val !== null) { this.cache[key] = val; return val; }
    return defaultValue;
  }

  getNumber(key, defaultValue = 0) {
    return parseFloat(this.get(key, defaultValue.toString()));
  }

  getBool(key, defaultValue = false) {
    const v = this.get(key, defaultValue.toString());
    return v === 'true' || v === '1';
  }

  set(key, value, updatedBy = 'M7') {
    this.cache[key] = String(value);
    this.db.setRule(key, value, updatedBy);
    // Trigger watchers
    if (this.watches[key]) {
      this.watches[key].forEach(fn => { try { fn(value); } catch(e) {} });
    }
    this.emit('rule_changed', { key, value, updatedBy });
  }

  watch(key, callback) {
    if (!this.watches[key]) this.watches[key] = [];
    this.watches[key].push(callback);
  }

  // Bulk update from M7 AI
  bulkSet(rules, updatedBy = 'M7') {
    Object.entries(rules).forEach(([k,v]) => this.set(k, v, updatedBy));
    return Object.keys(rules).length;
  }

  // Get all rules as object
  getAll() {
    this._loadAll();
    return this.cache;
  }

  // M7 AI rewrites logic based on performance
  async rewrite(context, apiKey) {
    if (!apiKey) return null;
    try {
      const currentRules = this.getAll();
      const relevantRules = Object.entries(currentRules)
        .filter(([k]) => !k.startsWith('system.'))
        .slice(0, 20)
        .map(([k,v]) => `${k}: ${v}`)
        .join('\n');

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: 'You are M7 logic optimizer. Rewrite system rules to improve performance. Respond ONLY with valid JSON.',
          messages: [{ role: 'user', content:
            `Context: ${context}\nCurrent rules:\n${relevantRules}\n` +
            `Suggest rule updates to improve performance. Return JSON: {"rule_key": "new_value"} for rules to change only.`
          }]
        })
      });
      const data    = await res.json();
      const updates = JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());
      const changed = this.bulkSet(updates, 'M7-AI-REWRITE');
      this.emit('rules_rewritten', { changed, updates });
      return { changed, updates };
    } catch(e) { return null; }
  }

  getStatus() {
    return {
      totalRules: Object.keys(this.cache).length,
      rules:      this.getAll()
    };
  }
}

module.exports = SoftwareDefinedLogic;
