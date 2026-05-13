'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { getDB } = require('./m7-database');

const SECKA = {
  name:    'Bun Omar Secka',
  wave:    '+2206536587',
  ecobank: '6200059991',
  swift:   'ECOCGMGM',
  bank:    'Ecobank Gambia',
  email:   'seckageneralh@gmail.com'
};

class Pathfinder extends EventEmitter {
  constructor(sovereignEngine) {
    super();
    this.sovereign   = sovereignEngine;
    this.db          = getDB();
    this.isRunning   = false;
    this.transferQueue = [];
    this.completedTransfers = [];
    this.failedTransfers    = [];
    this.totalDelivered     = 0;
    this.successRate        = 100;

    // Route registry — Pathfinder discovers routes autonomously
    this.routes = {
      mobile_money: [
        { name: 'Wave Direct',      available: false, priority: 1, requires: 'WAVE_API_KEY'    },
        { name: 'AfricasTalking',   available: false, priority: 2, requires: 'AT_API_KEY'      },
        { name: 'Flutterwave',      available: false, priority: 3, requires: 'FLW_SECRET_KEY'  },
        { name: 'Voucher Fallback', available: true,  priority: 99, requires: null             }
      ],
      bank: [
        { name: 'Wise Transfer',    available: false, priority: 1, requires: 'WISE_API_KEY'    },
        { name: 'Flutterwave Bank', available: false, priority: 2, requires: 'FLW_SECRET_KEY'  },
        { name: 'SWIFT Direct',     available: false, priority: 3, requires: 'SWIFT_API_KEY'   },
        { name: 'Voucher Fallback', available: true,  priority: 99, requires: null             }
      ],
      stablecoin: [
        { name: 'Polygon Direct',   available: true,  priority: 1, requires: null             },
        { name: 'Ethereum Direct',  available: true,  priority: 2, requires: null             }
      ]
    };

    // Check available API keys
    this._scanAvailableRoutes();
    console.log('M7 Pathfinder initialized');
  }

  _scanAvailableRoutes() {
    // Check which API keys are available in environment
    // Strict key checks — only activate if key exists AND is not empty
    const waveKey = process.env.WAVE_API_KEY;
    const atKey   = process.env.AT_API_KEY;
    const flwKey  = process.env.FLW_SECRET_KEY;
    const wiseKey = process.env.WISE_API_KEY;

    if (waveKey && waveKey.length > 10)  this._activateRoute('mobile_money', 'Wave Direct');
    if (atKey   && atKey.length > 10)    this._activateRoute('mobile_money', 'AfricasTalking');
    if (flwKey  && flwKey.length > 10) {
      this._activateRoute('mobile_money', 'Flutterwave');
      this._activateRoute('bank', 'Flutterwave Bank');
    }
    if (wiseKey && wiseKey.length > 10)  this._activateRoute('bank', 'Wise Transfer');

    const available = this._getAvailableRoutes();
    console.log('Pathfinder routes available: ' + available.map(r=>r.name).join(', '));
  }

  _activateRoute(type, name) {
    const route = this.routes[type]?.find(r => r.name === name);
    if (route) route.available = true;
  }

  _getAvailableRoutes() {
    return Object.values(this.routes)
      .flat()
      .filter(r => r.available)
      .sort((a, b) => a.priority - b.priority);
  }

  // ── Main transfer function ────────────────────────────────────────────────
  async transfer(amount, railType = 'auto', destination = null) {
    const transferId = 'PTH-' + Date.now() + '-' + Math.random().toString(36).substr(2,4).toUpperCase();

    const transfer = {
      id:          transferId,
      timestamp:   Date.now(),
      amount:      parseFloat(amount.toFixed(2)),
      railType,
      destination: destination || this._getDefaultDestination(railType),
      status:      'INITIATED',
      attempts:    [],
      route:       null
    };

    // Allocate from Sovereign Capital Engine
    const allocation = this.sovereign.allocateForTransfer(amount);
    if (!allocation.success) {
      transfer.status = 'FAILED';
      transfer.error  = allocation.error;
      this.failedTransfers.push(transfer);
      this.emit('transfer_failed', transfer);
      return transfer;
    }

    this.transferQueue.push(transfer);
    this.emit('transfer_initiated', transfer);

    // Execute with retry logic
    const result = await this._executeWithRetry(transfer);
    return result;
  }

  _getDefaultDestination(railType) {
    switch(railType) {
      case 'mobile_money': return { type: 'wave', phone: SECKA.wave, name: SECKA.name };
      case 'bank':         return { type: 'bank', account: SECKA.ecobank, swift: SECKA.swift, name: SECKA.name, bank: SECKA.bank };
      case 'stablecoin':   return { type: 'crypto', address: null }; // Set in wallet
      default:             return { type: 'wave', phone: SECKA.wave, name: SECKA.name };
    }
  }

  async _executeWithRetry(transfer, maxRetries = 3) {
    const railType = transfer.railType === 'auto'
      ? this._selectRailType(transfer.amount)
      : transfer.railType;

    const availableRoutes = (this.routes[railType] || this.routes.mobile_money)
      .filter(r => r.available)
      .sort((a, b) => a.priority - b.priority);

    for (const route of availableRoutes) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await this._executeRoute(transfer, route);
          if (result.success) {
            transfer.status  = 'DELIVERED';
            transfer.route   = route.name;
            transfer.deliveredAt = Date.now();
            this.totalDelivered += transfer.amount;
            this._updateSuccessRate(true);
            this.completedTransfers.push(transfer);
            this._saveTransfer(transfer);
            this.emit('transfer_delivered', transfer);
            console.log(`Pathfinder delivered $${transfer.amount} via ${route.name}`);
            return transfer;
          }
        } catch(e) {
          transfer.attempts.push({
            route:     route.name,
            attempt,
            error:     e.message,
            timestamp: Date.now()
          });
          // Wait before retry
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }

    // All routes failed — generate voucher as fallback
    console.log('All routes failed — generating voucher fallback');
    const voucher = this.sovereign.generateVoucher(transfer.amount);
    transfer.status  = 'VOUCHER_ISSUED';
    transfer.voucher = voucher;
    transfer.route   = 'Voucher Fallback';
    this._updateSuccessRate(false);
    this._saveTransfer(transfer);
    this.emit('voucher_fallback', { transfer, voucher });
    return transfer;
  }

  _selectRailType(amount) {
    // Situational logic — M7 AI decides rail by amount
    if (amount < 100)  return 'mobile_money'; // Small: Wave
    if (amount < 1000) return 'mobile_money'; // Medium: Wave
    return 'bank';                            // Large: Ecobank SWIFT
  }

  async _executeRoute(transfer, route) {
    switch(route.name) {
      case 'Wave Direct':
        return await this._executeWave(transfer);
      case 'AfricasTalking':
        return await this._executeAfricasTalking(transfer);
      case 'Flutterwave':
        return await this._executeFlutterwave(transfer);
      case 'Wise Transfer':
        return await this._executeWise(transfer);
      case 'Polygon Direct':
        return await this._executePolygon(transfer);
      case 'Voucher Fallback':
        const v = this.sovereign.generateVoucher(transfer.amount);
        return { success: true, voucher: v };
      default:
        throw new Error('Unknown route: ' + route.name);
    }
  }

  async _executeWave(transfer) {
    const key = process.env.WAVE_API_KEY;
    if (!key) throw new Error('No Wave API key');
    const res = await fetch('https://api.wave.com/v1/payout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile:           transfer.destination.phone,
        amount:           transfer.amount.toFixed(2),
        currency:         'GMD',
        client_reference: transfer.id
      })
    });
    if (!res.ok) throw new Error('Wave API error: ' + res.status);
    return { success: true, data: await res.json() };
  }

  async _executeAfricasTalking(transfer) {
    const key = process.env.AT_API_KEY;
    if (!key) throw new Error('No AfricasTalking key');
    const res = await fetch('https://payments.africastalking.com/mobile/checkout/request', {
      method: 'POST',
      headers: { 'apiKey': key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        username:     'sandbox',
        productName:  'M7Intelligence',
        phoneNumber:  transfer.destination.phone,
        amount:       transfer.amount,
        currencyCode: 'GMD',
        metadata:     { transferId: transfer.id }
      })
    });
    if (!res.ok) throw new Error('AT error: ' + res.status);
    return { success: true, data: await res.json() };
  }

  async _executeFlutterwave(transfer) {
    const key = process.env.FLW_SECRET_KEY;
    if (!key) throw new Error('No Flutterwave key');
    const res = await fetch('https://api.flutterwave.com/v3/transfers', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_bank:   'WAVE',
        account_number: transfer.destination.phone,
        amount:         transfer.amount,
        narration:      'M7 Intelligence Transfer',
        currency:       'GMD',
        reference:      transfer.id,
        beneficiary_name: SECKA.name
      })
    });
    if (!res.ok) throw new Error('Flutterwave error: ' + res.status);
    return { success: true, data: await res.json() };
  }

  async _executeWise(transfer) {
    const key = process.env.WISE_API_KEY;
    if (!key) throw new Error('No Wise key');
    // Wise transfer to Ecobank
    const res = await fetch('https://api.transferwise.com/v1/transfers', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetAccount:   transfer.destination.account,
        quoteUuid:       transfer.id,
        customerTransactionId: transfer.id,
        details: {
          reference:     'M7 Intelligence',
          transferPurpose: 'business_payment',
          sourceOfFunds:   'business'
        }
      })
    });
    if (!res.ok) throw new Error('Wise error: ' + res.status);
    return { success: true, data: await res.json() };
  }

  async _executePolygon(transfer) {
    // Direct on-chain USDC transfer
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.POLY_RPC || 'https://polygon.publicnode.com');
    const wallet   = new ethers.Wallet(process.env.M7_WALLET_KEY || '', provider);
    // Transfer logic handled by m7-wallet.js
    return { success: false, error: 'Needs USDC funding' };
  }

  _updateSuccessRate(success) {
    const total = this.completedTransfers.length + this.failedTransfers.length + 1;
    const succeeded = this.completedTransfers.length + (success ? 1 : 0);
    this.successRate = parseFloat(((succeeded / total) * 100).toFixed(1));
  }

  _saveTransfer(transfer) {
    try {
      this.db.db.prepare(
        'INSERT OR REPLACE INTO transfers (id,timestamp,amount_usd,network,rail,status,recipient,tx_hash,note) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(
        transfer.id, transfer.timestamp, transfer.amount,
        transfer.railType || 'auto', transfer.route || '',
        transfer.status, JSON.stringify(transfer.destination),
        transfer.txHash || '',
        transfer.error || transfer.voucher?.code || ''
      );
    } catch(e) {}
  }

  // ── Claude-assisted route discovery ──────────────────────────────────────
  async discoverRoutes() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: 'You are M7 Pathfinder. Find real payment APIs that can transfer money to Gambia mobile money (Wave) or Ecobank. Respond ONLY with JSON.',
          messages: [{ role: 'user', content: 'Find 5 real payment APIs that support Gambia. Return JSON: [{"name":"API name","url":"api endpoint","type":"mobile_money|bank","free_tier":true/false,"signup_url":"url","notes":"brief note"}]' }]
        })
      });
      const data = await res.json();
      const text = data.content[0].text.replace(/```json|```/g,'').trim();
      const apis = JSON.parse(text);
      if (Array.isArray(apis)) {
        console.log('Pathfinder discovered ' + apis.length + ' new routes via Claude');
        apis.forEach(api => {
          this.emit('route_discovered', api);
        });
        // Save to DB
        this.db.setState('discovered_routes', apis);
      }
    } catch(e) {}
  }

  start() {
    this.isRunning = true;
    // Discover routes on startup
    setTimeout(() => this.discoverRoutes(), 10000);
    // Re-scan routes every hour
    setInterval(() => {
      this._scanAvailableRoutes();
      this.discoverRoutes();
    }, 3600000);
    // Process transfer queue every 30 seconds
    setInterval(() => this._processQueue(), 30000);
    console.log('Pathfinder started');
  }

  async _processQueue() {
    const pending = this.transferQueue.filter(t => t.status === 'INITIATED');
    for (const transfer of pending) {
      await this._executeWithRetry(transfer);
    }
  }

  getStatus() {
    return {
      isRunning:     this.isRunning,
      successRate:   this.successRate + '%',
      totalDelivered: parseFloat(this.totalDelivered.toFixed(2)),
      availableRoutes: this._getAvailableRoutes().map(r => r.name),
      queueSize:     this.transferQueue.filter(t => t.status === 'INITIATED').length,
      completed:     this.completedTransfers.length,
      failed:        this.failedTransfers.length,
      recentTransfers: [...this.completedTransfers, ...this.failedTransfers]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10)
    };
  }
}

module.exports = Pathfinder;
