'use strict';
const EventEmitter = require('events');
const { getDB } = require('./m7-database');

class RailManager extends EventEmitter {
  constructor(pathfinder, sovereign) {
    super();
    this.pathfinder = pathfinder;
    this.sovereign  = sovereign;
    this.db         = getDB();
    this.rails      = {};
    this._loadRails();
    console.log('Rail Manager initialized');
  }

  _loadRails() {
    try {
      const saved = this.db.getState('rail_manager');
      if (saved) {
        this.rails = saved;
        console.log('Rails restored: ' + Object.keys(this.rails).length);
      }
    } catch(e) {}
  }

  _saveRails() {
    this.db.setState('rail_manager', this.rails);
  }

  addRail(config) {
    const id = 'RAIL-' + Date.now();
    const rail = {
      id,
      type:       config.type, // bank | mobile_money | stablecoin
      name:       config.name || 'Rail ' + id,
      active:     true,
      addedAt:    Date.now(),
      // Bank fields
      accountName:   config.accountName   || null,
      accountNumber: config.accountNumber || null,
      bankName:      config.bankName      || null,
      swiftCode:     config.swiftCode     || null,
      ibanCode:      config.ibanCode      || null,
      country:       config.country       || null,
      // Mobile money fields
      phoneNumber:   config.phoneNumber   || null,
      network:       config.network       || null,
      // Stablecoin fields
      walletAddress: config.walletAddress || null,
      chainNetwork:  config.chainNetwork  || null,
      // Stats
      totalSent:     0,
      lastUsed:      null,
      successCount:  0,
      failCount:     0
    };
    this.rails[id] = rail;
    this._saveRails();
    this.emit('rail_added', rail);
    console.log('Rail added: ' + rail.name + ' (' + rail.type + ')');
    return rail;
  }

  removeRail(id) {
    if (this.rails[id]) {
      delete this.rails[id];
      this._saveRails();
      return { success: true };
    }
    return { error: 'Rail not found' };
  }

  toggleRail(id, active) {
    if (this.rails[id]) {
      this.rails[id].active = active;
      this._saveRails();
      return { success: true, active };
    }
    return { error: 'Rail not found' };
  }

  // Select best rail for situation
  selectRail(amount, preferredType = null) {
    const activeRails = Object.values(this.rails).filter(r => r.active);
    if (activeRails.length === 0) return null;

    // Situational logic
    let candidates = activeRails;
    if (preferredType) {
      candidates = activeRails.filter(r => r.type === preferredType);
      if (candidates.length === 0) candidates = activeRails;
    } else if (amount >= 1000) {
      // Large amounts → bank rail preferred
      const bankRails = activeRails.filter(r => r.type === 'bank');
      if (bankRails.length > 0) candidates = bankRails;
    } else {
      // Small/medium → mobile money preferred
      const mobileRails = activeRails.filter(r => r.type === 'mobile_money');
      if (mobileRails.length > 0) candidates = mobileRails;
    }

    // Pick rail with highest success rate
    return candidates.sort((a, b) => {
      const rateA = a.successCount / Math.max(a.successCount + a.failCount, 1);
      const rateB = b.successCount / Math.max(b.successCount + b.failCount, 1);
      return rateB - rateA;
    })[0];
  }

  // Execute transfer via best rail
  async executeTransfer(amount, preferredType = null) {
    const rail = this.selectRail(amount, preferredType);
    if (!rail) {
      // No rails configured — use defaults (Secka's accounts)
      return await this.pathfinder.transfer(amount, 'auto');
    }

    const result = await this.pathfinder.transfer(amount, rail.type, {
      type:          rail.type,
      accountName:   rail.accountName,
      accountNumber: rail.accountNumber,
      swiftCode:     rail.swiftCode,
      bankName:      rail.bankName,
      phone:         rail.phoneNumber,
      network:       rail.network,
      walletAddress: rail.walletAddress,
      chainNetwork:  rail.chainNetwork
    });

    // Update rail stats
    if (result.status === 'DELIVERED') {
      rail.successCount++;
      rail.totalSent += amount;
      rail.lastUsed   = Date.now();
    } else {
      rail.failCount++;
    }
    this._saveRails();
    return result;
  }

  getStatus() {
    return {
      totalRails:  Object.keys(this.rails).length,
      activeRails: Object.values(this.rails).filter(r => r.active).length,
      rails:       Object.values(this.rails)
    };
  }
}

module.exports = RailManager;
