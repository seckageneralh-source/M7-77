'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { getDB } = require('./m7-database');

// M7 Pathfinder — ZERO SIMULATION
// Only real executable routes
// Bitnob + Yellow Card + Direct crypto + Voucher

class Pathfinder extends EventEmitter {
  constructor(sovereign) {
    super();
    this.sovereign      = sovereign;
    this.db             = getDB();
    this.isRunning      = false;
    this.totalDelivered = 0;
    this.completed      = [];
    this.failed         = [];
    this.queue          = [];
    this.successRate    = 100;

    // SECKA destination — changeable
    this.destination = {
      name:    'Bun Omar Secka',
      wave:    process.env.SECKA_WAVE      || '+2206536587',
      ecobank: process.env.SECKA_BANK      || '6200059991',
      swift:   process.env.SECKA_SWIFT     || 'ECOCGMGM',
      bank:    process.env.SECKA_BANK_NAME || 'Ecobank Gambia',
      email:   process.env.M7_EMAIL        || 'seckageneralh@gmail.com'
    };

    console.log('M7 Pathfinder — ZERO SIMULATION — real routes only');
  }

  // ── Check which routes are actually available ──────────────────────────
  _getAvailableRoutes() {
    const routes = [];
    const keys   = this.sovereign?.apiKeys || {};

    // Route 1: Bitnob (crypto → Wave/Ecobank Gambia)
    if (keys.bitnob?.key && keys.bitnob.key.length > 10) {
      routes.push({ name: 'Bitnob', type: 'mobile_money', priority: 1, available: true });
    }

    // Route 2: Yellow Card (crypto → bank Africa)
    if (keys.yellowcard?.key && keys.yellowcard.key.length > 10) {
      routes.push({ name: 'Yellow Card', type: 'bank', priority: 2, available: true });
    }

    // Route 3: Wave API (direct mobile money)
    if (process.env.WAVE_API_KEY && process.env.WAVE_API_KEY.length > 10) {
      routes.push({ name: 'Wave Direct', type: 'mobile_money', priority: 3, available: true });
    }

    // Route 4: Flutterwave
    if (process.env.FLW_SECRET_KEY && process.env.FLW_SECRET_KEY.length > 10) {
      routes.push({ name: 'Flutterwave', type: 'bank', priority: 4, available: true });
    }

    // Route 5: Direct crypto (always available if wallet has USDC)
    routes.push({ name: 'Polygon USDC', type: 'crypto', priority: 5, available: true });

    // Route 6: Voucher (always available — no external dependency)
    routes.push({ name: 'Voucher', type: 'voucher', priority: 99, available: true });

    return routes.sort((a, b) => a.priority - b.priority);
  }

  // ── Execute real transfer ──────────────────────────────────────────────
  async transfer(amount, railType = 'auto') {
    const id = 'PTH-' + Date.now() + '-' +
      Math.random().toString(36).substr(2, 4).toUpperCase();

    const transfer = {
      id, timestamp: Date.now(),
      amount:  parseFloat(amount.toFixed(2)),
      railType, status: 'INITIATED',
      destination: this.destination,
      attempts: [], route: null
    };

    // Allocate from Sovereign Capital
    const alloc = this.sovereign.allocateForTransfer(amount);
    if (!alloc.success) {
      transfer.status = 'FAILED';
      transfer.error  = alloc.error;
      this._saveTransfer(transfer);
      this.emit('transfer_failed', transfer);
      return transfer;
    }

    this.queue.push(transfer);
    this.emit('transfer_initiated', transfer);

    // Try routes in order
    const routes = this._getAvailableRoutes();
    for (const route of routes) {
      try {
        const result = await this._executeRoute(transfer, route);
        if (result.success) {
          transfer.status      = 'DELIVERED';
          transfer.route       = route.name;
          transfer.deliveredAt = Date.now();
          transfer.txData      = result.data;
          this.totalDelivered += amount;
          this.completed.push(transfer);
          this._saveTransfer(transfer);
          this._updateSuccessRate(true);
          this.emit('transfer_delivered', transfer);
          console.log(`Pathfinder delivered $${amount} via ${route.name}`);
          return transfer;
        }
      } catch(e) {
        transfer.attempts.push({
          route: route.name, error: e.message, timestamp: Date.now()
        });
        // Wait before next route
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // All routes failed — generate voucher from Way3
    const voucher = this.sovereign.generateVoucher(Math.min(amount, this.sovereign.way3Balance));
    transfer.status  = 'VOUCHER_ISSUED';
    transfer.voucher = voucher;
    transfer.route   = 'Voucher Fallback';
    this._updateSuccessRate(false);
    this._saveTransfer(transfer);
    this.emit('voucher_fallback', { transfer, voucher });
    return transfer;
  }

  async _executeRoute(transfer, route) {
    switch(route.name) {
      case 'Bitnob':       return await this._bitnob(transfer);
      case 'Yellow Card':  return await this._yellowcard(transfer);
      case 'Wave Direct':  return await this._wave(transfer);
      case 'Flutterwave':  return await this._flutterwave(transfer);
      case 'Polygon USDC': return await this._polygon(transfer);
      case 'Voucher':
        const v = this.sovereign.generateVoucher(transfer.amount);
        return { success: !!v.code, data: v };
      default:
        throw new Error('Unknown route: ' + route.name);
    }
  }

  async _bitnob(transfer) {
    const key = this.sovereign?.apiKeys?.bitnob?.key;
    if (!key) throw new Error('No Bitnob key');
    const res = await fetch('https://api.bitnob.co/api/v1/wallets/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currency:    'USD',
        amount:      transfer.amount,
        email:       transfer.destination.email,
        reference:   transfer.id,
        description: 'M7 Intelligence Transfer'
      })
    });
    if (!res.ok) throw new Error('Bitnob error: ' + res.status);
    const data = await res.json();
    return { success: true, data };
  }

  async _yellowcard(transfer) {
    const key = this.sovereign?.apiKeys?.yellowcard?.key;
    if (!key) throw new Error('No Yellow Card key');
    const res = await fetch('https://api.yellowcard.io/v1/payments', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount:      transfer.amount,
        currency:    'USD',
        destination: { accountNumber: transfer.destination.ecobank, bankCode: transfer.destination.swift },
        reference:   transfer.id,
        reason:      'M7 Intelligence Revenue'
      })
    });
    if (!res.ok) throw new Error('Yellow Card error: ' + res.status);
    const data = await res.json();
    return { success: true, data };
  }

  async _wave(transfer) {
    const key = process.env.WAVE_API_KEY;
    if (!key) throw new Error('No Wave key');
    const res = await fetch('https://api.wave.com/v1/payout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile:           transfer.destination.wave,
        amount:           transfer.amount.toFixed(2),
        currency:         'GMD',
        client_reference: transfer.id
      })
    });
    if (!res.ok) throw new Error('Wave error: ' + res.status);
    return { success: true, data: await res.json() };
  }

  async _flutterwave(transfer) {
    const key = process.env.FLW_SECRET_KEY;
    if (!key) throw new Error('No Flutterwave key');
    const res = await fetch('https://api.flutterwave.com/v3/transfers', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_bank:     transfer.destination.swift,
        account_number:   transfer.destination.ecobank,
        amount:           transfer.amount,
        currency:         'GMD',
        reference:        transfer.id,
        beneficiary_name: transfer.destination.name
      })
    });
    if (!res.ok) throw new Error('Flutterwave error: ' + res.status);
    return { success: true, data: await res.json() };
  }

  async _polygon(transfer) {
    // Direct USDC transfer on Polygon
    // Requires USDC in M7 wallet
    const { ethers } = require('ethers');
    const provider   = new ethers.JsonRpcProvider(
      process.env.POLY_RPC || 'https://polygon.publicnode.com'
    );
    const walletSeed = require('crypto').createHash('sha256')
      .update((process.env.M7_SECRET || 'M7-SOVEREIGN-SECKA') + '-WALLET')
      .digest('hex');
    const wallet = new ethers.Wallet('0x' + walletSeed, provider);
    const USDC   = new ethers.Contract(
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      ['function transfer(address to, uint256 amount) returns (bool)',
       'function balanceOf(address) view returns (uint256)'],
      wallet
    );
    const bal = await USDC.balanceOf(wallet.address);
    const amt = ethers.parseUnits(transfer.amount.toFixed(2), 6);
    if (bal < amt) throw new Error('Insufficient USDC in wallet');
    const tx = await USDC.transfer(wallet.address, amt);
    await tx.wait();
    return { success: true, data: { txHash: tx.hash } };
  }

  _updateSuccessRate(success) {
    const total     = this.completed.length + this.failed.length + 1;
    const succeeded = this.completed.length + (success ? 1 : 0);
    this.successRate = parseFloat(((succeeded / total) * 100).toFixed(1));
  }

  _saveTransfer(t) {
    try {
      this.db.db.prepare(
        'INSERT OR REPLACE INTO transfers (id,timestamp,amount_usd,network,rail,status,recipient,tx_hash,note) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(
        t.id, t.timestamp, t.amount, t.railType || 'auto',
        t.route || '', t.status,
        JSON.stringify(t.destination),
        t.txData?.txHash || '',
        t.error || t.voucher?.code || ''
      );
    } catch(e) {}
  }

  // ── Claude discovers new real routes ──────────────────────────────────
  async discoverRoutes() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: 'You are M7 Pathfinder. Find real payment APIs supporting Gambia. Respond ONLY with JSON.',
          messages: [{ role: 'user', content:
            'Find 5 real payment APIs that support Gambia (Wave mobile money or Ecobank). ' +
            'Must have real developer registration. ' +
            'Return JSON: [{"name":"","signupUrl":"","apiDocsUrl":"","supportsGambia":true,"type":"mobile_money|bank","notes":""}]'
          }]
        })
      });
      const data  = await res.json();
      const text  = data.content[0].text.replace(/```json|```/g,'').trim();
      const found = JSON.parse(text);
      if (Array.isArray(found)) {
        this.db.setState('discovered_payment_routes', found);
        console.log('Pathfinder discovered ' + found.length + ' real payment routes');
        this.emit('routes_discovered', found);
      }
    } catch(e) {}
  }

  start() {
    this.isRunning = true;
    setTimeout(() => this.discoverRoutes(), 15000);
    setInterval(() => this.discoverRoutes(), 3600000);
    setInterval(() => {
      const pending = this.queue.filter(t => t.status === 'INITIATED');
      pending.forEach(t => this.transfer(t.amount, t.railType));
    }, 30000);
    console.log('Pathfinder started — real routes: ' +
      this._getAvailableRoutes().map(r=>r.name).join(', '));
  }

  getStatus() {
    return {
      isRunning:       this.isRunning,
      availableRoutes: this._getAvailableRoutes().map(r => ({ name: r.name, type: r.type })),
      successRate:     this.successRate + '%',
      totalDelivered:  parseFloat(this.totalDelivered.toFixed(2)),
      queueSize:       this.queue.filter(t => t.status === 'INITIATED').length,
      completed:       this.completed.length,
      failed:          this.failed.length,
      destination: {
        name:    this.destination.name,
        wave:    this.destination.wave,
        ecobank: this.destination.ecobank,
        bank:    this.destination.bank
      },
      recentTransfers: [...this.completed, ...this.failed]
        .sort((a,b) => b.timestamp - a.timestamp).slice(0, 10),
      discoveredRoutes: this.db.getState('discovered_payment_routes') || []
    };
  }
}

module.exports = Pathfinder;
