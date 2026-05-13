'use strict';
const EventEmitter = require('events');
const crypto = require('crypto');
const { getDB } = require('./m7-database');

// M7 Treasury Hold Engine
// Holds ALL funds — releases ONLY on SECKA command or pre-defined conditions

class M7TreasuryHold extends EventEmitter {
  constructor(sovereign) {
    super();
    this.sovereign   = sovereign;
    this.db          = getDB();
    this.heldFunds   = 0;
    this.releasedTotal = 0;
    this.holdLog     = [];
    this.releaseConditions = [];
    this.isLocked    = false; // When true — NO releases regardless of conditions
    this.releaseQueue = [];

    this._restoreState();
    console.log('M7 Treasury Hold Engine initialized — funds secured');
  }

  _restoreState() {
    try {
      const saved = this.db.getState('treasury_hold');
      if (saved) {
        this.heldFunds       = saved.heldFunds       || 0;
        this.releasedTotal   = saved.releasedTotal   || 0;
        this.releaseConditions = saved.releaseConditions || [];
        this.isLocked        = saved.isLocked        || false;
        console.log('Treasury Hold restored — held: $' + this.heldFunds.toFixed(2));
      }
    } catch(e) {}
  }

  _saveState() {
    this.db.setState('treasury_hold', {
      heldFunds:          this.heldFunds,
      releasedTotal:      this.releasedTotal,
      releaseConditions:  this.releaseConditions,
      isLocked:           this.isLocked
    });
  }

  _log(type, detail, severity = 'INFO') {
    const entry = { timestamp: Date.now(), type, detail, severity };
    this.holdLog.push(entry);
    if (this.holdLog.length > 200) this.holdLog.shift();
    console.log(`[HOLD] ${type}: ${detail}`);
    this.emit('hold_action', entry);
  }

  // Receive funds from sovereign engine
  receiveFunds(amount) {
    this.heldFunds += amount;
    this._saveState();
    this._log('FUNDS_RECEIVED', `+$${amount.toFixed(2)} held — total: $${this.heldFunds.toFixed(2)}`);
    // Check release conditions
    this._checkConditions();
  }

  // SECKA manual release
  release(amount, destination, authorization = 'SECKA') {
    if (this.isLocked) {
      return { error: 'Treasury is LOCKED — unlock first' };
    }
    if (amount > this.heldFunds) {
      return { error: 'Insufficient held funds', available: this.heldFunds };
    }

    const releaseId = 'REL-' + Date.now() + '-' + Math.random().toString(36).substr(2,4).toUpperCase();
    const signature = crypto.createHash('sha256')
      .update(releaseId + amount + authorization + Date.now())
      .digest('hex').substr(0, 16);

    this.heldFunds     -= amount;
    this.releasedTotal += amount;

    const release = {
      id:            releaseId,
      timestamp:     Date.now(),
      amount:        parseFloat(amount.toFixed(2)),
      destination,
      authorization,
      signature,
      status:        'RELEASED'
    };

    this.releaseQueue.push(release);
    if (this.releaseQueue.length > 100) this.releaseQueue.shift();
    this._saveState();
    this._log('FUNDS_RELEASED', `$${amount.toFixed(2)} released by ${authorization} → ${destination}`);
    this.emit('funds_released', release);
    return release;
  }

  // Lock treasury — NO releases
  lock(reason = 'SECKA command') {
    this.isLocked = true;
    this._saveState();
    this._log('TREASURY_LOCKED', `Locked: ${reason}`, 'WARN');
    this.emit('locked', { reason, timestamp: Date.now() });
    return { locked: true, reason };
  }

  // Unlock treasury
  unlock(authorization = 'SECKA') {
    this.isLocked = false;
    this._saveState();
    this._log('TREASURY_UNLOCKED', `Unlocked by ${authorization}`);
    this.emit('unlocked', { authorization, timestamp: Date.now() });
    return { locked: false };
  }

  // Add release condition — M7 auto-releases when condition met
  addCondition(condition) {
    // condition: { type: 'threshold'|'time'|'manual', value, destination, amount }
    const id = 'COND-' + Date.now();
    const cond = { id, ...condition, addedAt: Date.now(), triggered: false };
    this.releaseConditions.push(cond);
    this._saveState();
    this._log('CONDITION_ADDED', `Condition: ${condition.type} — ${JSON.stringify(condition)}`);
    return cond;
  }

  removeCondition(id) {
    this.releaseConditions = this.releaseConditions.filter(c => c.id !== id);
    this._saveState();
    return { success: true };
  }

  // Check if any conditions are met
  _checkConditions() {
    if (this.isLocked) return;
    const now = Date.now();

    this.releaseConditions.forEach(cond => {
      if (cond.triggered) return;

      let shouldRelease = false;

      if (cond.type === 'threshold' && this.heldFunds >= cond.value) {
        shouldRelease = true;
      } else if (cond.type === 'time' && now >= cond.value) {
        shouldRelease = true;
      }

      if (shouldRelease) {
        const amount = cond.amount || this.heldFunds;
        if (amount <= this.heldFunds) {
          cond.triggered = true;
          this.release(amount, cond.destination || 'SECKA-DEFAULT', 'AUTO-CONDITION');
          this._log('CONDITION_TRIGGERED', `Condition ${cond.id} triggered — released $${amount.toFixed(2)}`);
        }
      }
    });
  }

  getStatus() {
    return {
      heldFunds:         parseFloat(this.heldFunds.toFixed(2)),
      releasedTotal:     parseFloat(this.releasedTotal.toFixed(2)),
      isLocked:          this.isLocked,
      conditions:        this.releaseConditions,
      recentReleases:    this.releaseQueue.slice(-5).reverse(),
      recentLog:         this.holdLog.slice(-10).reverse()
    };
  }
}

module.exports = M7TreasuryHold;
