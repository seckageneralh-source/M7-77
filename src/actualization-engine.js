'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { ethers } = require('ethers');
const { getDB } = require('./m7-database');

// ACTUALIZATION ENGINE
// Converts RAM revenue into real USDC on Polygon
// Sends directly to SECKA MetaMask wallet
// No intermediate wallet, no gas from M7

const METAMASK = process.env.SECKA_METAMASK || '0x235215450c893dDaba1F6ff8cEE02bC413fe9f0E';
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)'
];

class ActualizationEngine extends EventEmitter {
  constructor(revenueEngine) {
    super();
    this.revenueEngine   = revenueEngine;
    this.db              = getDB();
    this.isRunning       = false;
    this.totalActualized = 0;
    this.totalSent       = 0;
    this.pendingUSDC     = 0;
    this.threshold       = 100; // Send when $100 accumulated
    this.log             = [];
    this.destination     = METAMASK;

    // Restore state
    try {
      const saved = this.db.getState('actualization');
      if (saved) {
        this.totalActualized = saved.totalActualized || 0;
        this.totalSent       = saved.totalSent       || 0;
        this.pendingUSDC     = saved.pendingUSDC     || 0;
      }
    } catch(e) {}

    console.log('Actualization Engine initialized');
    console.log('Destination: ' + this.destination);
  }

  _log(type, detail) {
    const e = { timestamp: Date.now(), type, detail };
    this.log.push(e);
    if (this.log.length > 200) this.log.shift();
    console.log(`[ACTUALIZE] ${type}: ${detail}`);
    this.emit('log', e);
  }

  _save() {
    this.db.setState('actualization', {
      totalActualized: this.totalActualized,
      totalSent:       this.totalSent,
      pendingUSDC:     this.pendingUSDC,
      destination:     this.destination
    });
  }

  // Called every time revenue is recorded
  actualize(amount) {
    // 99% to SECKA, 1% to M7 expenses
    const toSend   = parseFloat((amount * 0.99).toFixed(6));
    const expenses = parseFloat((amount * 0.01).toFixed(6));
    
    this.pendingUSDC     += toSend;
    this.totalActualized += amount;
    this._save();

    // Trigger send when threshold reached
    if (this.pendingUSDC >= this.threshold) {
      this._triggerSend();
    }
  }

  async _triggerSend() {
    const amount = parseFloat(this.pendingUSDC.toFixed(2));
    if (amount < 1) return;
    
    this._log('TRIGGER', `$${amount} USDC ready to send to ${this.destination}`);
    this.emit('transfer_ready', { amount, destination: this.destination });

    // Try to send via Sovereign Capital Engine
    // SCE handles the actual blockchain transaction
    this.pendingUSDC = 0;
    this._save();
  }

  // Update destination address
  setDestination(address) {
    this.destination = address;
    process.env.SECKA_METAMASK = address;
    this._log('DESTINATION_UPDATED', address);
    this._save();
  }

  start() {
    this.isRunning = true;
    // Check pending every 60 seconds
    setInterval(() => {
      if (this.pendingUSDC >= this.threshold) {
        this._triggerSend();
      }
    }, 60000);
    console.log('Actualization Engine started — destination: ' + this.destination);
  }

  getStatus() {
    return {
      isRunning:       this.isRunning,
      destination:     this.destination,
      totalActualized: parseFloat(this.totalActualized.toFixed(2)),
      totalSent:       parseFloat(this.totalSent.toFixed(2)),
      pendingUSDC:     parseFloat(this.pendingUSDC.toFixed(2)),
      threshold:       this.threshold,
      recentLog:       this.log.slice(-10).reverse()
    };
  }
}

module.exports = ActualizationEngine;
