'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { ethers } = require('ethers');
const { getDB } = require('./m7-database');

const SECKA = {
  name:    'Bun Omar Secka',
  email:   'seckageneralh@gmail.com',
  wave:    '+2206536587',
  ecobank: '6200059991',
  swift:   'ECOCGMGM',
  bank:    'Ecobank Gambia',
  metamask:'0x235215450c893dDaba1F6ff8cEE02bC413fe9f0E'
};

const M7_WALLET    = '0x374f738B3DfAAA7b217baB4cEad5dA3A7924633E';
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)'
];

class SovereignCapitalEngine extends EventEmitter {
  constructor() {
    super();
    this.db           = getDB();
    this.isRunning    = false;
    this.usdcBalance  = 0;
    this.polBalance   = 0;
    this.totalSent    = 0;
    this.transfers    = [];
    this.log          = [];
    this.discoveries  = [];
    this.registrations= {};
    this.activeRoute  = null;
    this.provider     = null;
    this.wallet       = null;
    this._initWallet();
    this._restoreState();
    console.log('Sovereign Capital Engine — FIAT MODULE ACTIVE');
  }

  _initWallet() {
    try {
      const crypto = require('crypto');
      const seed   = crypto.createHash('sha256')
        .update((process.env.M7_SECRET||'M7-SOVEREIGN-SECKA')+'-WALLET')
        .digest('hex');
      this.provider = new ethers.JsonRpcProvider(
        process.env.POLY_RPC||'https://polygon-rpc.com'
      );
      this.wallet = new ethers.Wallet('0x'+seed, this.provider);
      console.log('Wallet: '+this.wallet.address);
    } catch(e) { console.error('Wallet error:',e.message); }
  }

  _restoreState() {
    try {
      const s = this.db.getState('sce_state');
      if (s) {
        this.totalSent     = s.totalSent     || 0;
        this.registrations = s.registrations || {};
        this.activeRoute   = s.activeRoute   || null;
        this.discoveries   = s.discoveries   || [];
      }
    } catch(e) {}
  }

  _save() {
    this.db.setState('sce_state', {
      totalSent:     this.totalSent,
      registrations: this.registrations,
      activeRoute:   this.activeRoute,
      discoveries:   this.discoveries
    });
  }

  _log(type, detail, severity='INFO') {
    const e = { timestamp: Date.now(), type, detail, severity };
    this.log.push(e);
    if (this.log.length > 200) this.log.shift();
    console.log(`[SCE] ${type}: ${detail}`);
    this.emit('log', e);
  }

  // Check on-chain balances
  async checkBalances() {
    try {
      const pol = await this.provider.getBalance(this.wallet.address);
      this.polBalance = parseFloat(ethers.formatEther(pol));
      const usdc = new ethers.Contract(USDC_POLYGON, USDC_ABI, this.provider);
      const ub   = await usdc.balanceOf(this.wallet.address);
      this.usdcBalance = parseFloat(ethers.formatUnits(ub, 6));
      return { pol: this.polBalance, usdc: this.usdcBalance };
    } catch(e) { return { pol: 0, usdc: 0 }; }
  }

  // Discover fiat APIs autonomously via Claude
  async discoverFiatAPIs() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;
    this._log('DISCOVER', 'Claude searching for Gambia fiat APIs...');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: 'You are M7 sovereign capital engine. Find real payment APIs for Gambia. Respond ONLY with valid JSON.',
          messages: [{ role: 'user', content: `Find every real payment API or service that can send money to:
1. Wave mobile money +2206536587 in Gambia
2. Ecobank account 6200059991 SWIFT ECOCGMGM Gambia

Requirements:
- Real API with documented endpoints
- Supports Gambia (GM)
- Has free tier or personal account option
- Can receive webhook/API registration

Return JSON array:
[{
  "name": "service name",
  "type": "mobile_money|bank_transfer|crypto_offramp",
  "supportsGambia": true,
  "registrationUrl": "url",
  "apiDocsUrl": "url", 
  "freeAccount": true/false,
  "kycRequired": "none|email|id",
  "notes": "how it works for Gambia"
}]`
          }]
        })
      });
      const data    = await res.json();
      const text    = data.content[0].text.replace(/```json|```/g,'').trim();
      const found   = JSON.parse(text);
      if (Array.isArray(found)) {
        this.discoveries = found;
        this._save();
        this._log('DISCOVERED', `Found ${found.length} potential fiat routes for Gambia`);
        found.forEach(f => {
          this._log('ROUTE', `${f.name} — ${f.type} — KYC: ${f.kycRequired} — Gambia: ${f.supportsGambia}`);
        });
        // Auto-attempt registration on easiest routes
        const easy = found.filter(f => f.kycRequired === 'none' || f.kycRequired === 'email');
        if (easy.length > 0) {
          this._log('AUTO_REGISTER', `Attempting registration on ${easy.length} easy routes`);
          for (const route of easy.slice(0, 3)) {
            await this._attemptRegistration(route);
          }
        }
        this.emit('routes_discovered', found);
      }
    } catch(e) {
      this._log('DISCOVER_ERROR', e.message, 'WARN');
    }
  }

  // Attempt real registration on a discovered route
  async _attemptRegistration(route) {
    if (this.registrations[route.name]?.status === 'ACTIVE') return;
    this._log('REGISTER', `Attempting: ${route.name}`);
    try {
      const res = await fetch(route.registrationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:     SECKA.email,
          name:      SECKA.name,
          firstName: 'Bun Omar',
          lastName:  'Secka',
          phone:     SECKA.wave,
          country:   'GM',
          currency:  'GMD'
        })
      });
      const status = res.ok ? 'PENDING_EMAIL' : 'FAILED';
      this.registrations[route.name] = {
        status,
        route,
        timestamp:  Date.now(),
        httpStatus: res.status
      };
      this._save();
      this._log('REGISTER_RESULT', `${route.name}: ${status} (HTTP ${res.status})`);
      if (res.ok) {
        this.emit('action_required', {
          type:    'EMAIL_VERIFICATION',
          service: route.name,
          email:   SECKA.email,
          detail:  `Check ${SECKA.email} to verify ${route.name}`
        });
      }
    } catch(e) {
      this.registrations[route.name] = { status: 'UNREACHABLE', error: e.message, timestamp: Date.now() };
      this._save();
      this._log('REGISTER_ERROR', `${route.name}: ${e.message}`, 'WARN');
    }
  }

  // Activate a route when API key is received
  activateRoute(service, apiKey) {
    if (this.registrations[service]) {
      this.registrations[service].status = 'ACTIVE';
      this.registrations[service].apiKey = apiKey;
    } else {
      this.registrations[service] = { status: 'ACTIVE', apiKey, timestamp: Date.now() };
    }
    this.activeRoute = service;
    this._save();
    this._log('ROUTE_ACTIVATED', `${service} is now ACTIVE — transfers enabled`);
    this.emit('route_activated', { service });
  }

  // Send fiat via active route
  async sendFiat(amount) {
    if (!this.activeRoute) {
      this._log('NO_ROUTE', 'No active fiat route — running discovery', 'WARN');
      await this.discoverFiatAPIs();
      return { error: 'No active route yet — discovery running, check back soon' };
    }
    const route = this.registrations[this.activeRoute];
    if (!route?.apiKey) {
      return { error: 'Route not fully activated — awaiting API key' };
    }
    this._log('SEND_FIAT', `Sending $${amount} via ${this.activeRoute}`);
    // Execute via pathfinder
    this.emit('send_fiat', { amount, route: this.activeRoute, destination: SECKA });
    return { initiated: true, amount, route: this.activeRoute, destination: SECKA.wave };
  }

  // Send USDC to MetaMask (crypto path)
  async sendToMetaMask(amount) {
    const balances = await this.checkBalances();
    if (balances.pol < 0.001) {
      return {
        error:    'Need gas',
        solution: `Send 0.01 POL to ${M7_WALLET} on Polygon`,
        wallet:   M7_WALLET,
        faucet:   'https://faucet.polygon.technology'
      };
    }
    if (balances.usdc < amount) {
      return {
        error:    'Need USDC',
        solution: `Send ${amount} USDC to ${M7_WALLET} on Polygon`,
        wallet:   M7_WALLET
      };
    }
    try {
      const usdc   = new ethers.Contract(USDC_POLYGON, USDC_ABI, this.wallet);
      const amt    = ethers.parseUnits(amount.toFixed(2), 6);
      const tx     = await usdc.transfer(SECKA.metamask, amt);
      const receipt= await tx.wait();
      if (receipt.status === 1) {
        this.totalSent += amount;
        const transfer = {
          hash:        tx.hash,
          amount,
          to:          SECKA.metamask,
          timestamp:   Date.now(),
          status:      'CONFIRMED',
          polygonscan: `https://polygonscan.com/tx/${tx.hash}`
        };
        this.transfers.push(transfer);
        this._log('TX_CONFIRMED', `${tx.hash}`);
        this.emit('transfer_confirmed', transfer);
        return transfer;
      }
    } catch(e) {
      return { error: e.message };
    }
  }

  start() {
    this.isRunning = true;
    // Discover fiat APIs immediately
    setTimeout(() => this.discoverFiatAPIs(), 5000);
    // Re-discover every 6 hours
    setInterval(() => this.discoverFiatAPIs(), 6 * 60 * 60 * 1000);
    // Check balances every 2 min
    setInterval(() => this.checkBalances(), 120000);
    setTimeout(() => this.checkBalances(), 3000);
    console.log('Sovereign Capital Engine started — fiat discovery active');
  }

  getStatus() {
    return {
      isRunning:      this.isRunning,
      m7Wallet:       M7_WALLET,
      destination:    SECKA.metamask,
      balances:       { pol: this.polBalance, usdc: this.usdcBalance },
      activeRoute:    this.activeRoute,
      discoveries:    this.discoveries,
      registrations:  this.registrations,
      totalSent:      parseFloat(this.totalSent.toFixed(2)),
      recentTransfers:this.transfers.slice(-5).reverse(),
      recentLog:      this.log.slice(-10).reverse(),
      accounts: {
        wave:     SECKA.wave,
        ecobank:  SECKA.ecobank,
        metamask: SECKA.metamask
      }
    };
  }
}

module.exports = SovereignCapitalEngine;
