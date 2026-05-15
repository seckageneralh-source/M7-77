'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const { ethers } = require('ethers');
const { getDB } = require('./m7-database');

// SOVEREIGN CAPITAL ENGINE
// Gets USDC and sends it to SECKA MetaMask
// Uses M7 wallet as the sending address
// Monitors on-chain for incoming USDC

const METAMASK     = process.env.SECKA_METAMASK || '0x235215450c893dDaba1F6ff8cEE02bC413fe9f0E';
const M7_WALLET    = '0x374f738B3DfAAA7b217baB4cEad5dA3A7924633E';
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

class SovereignCapitalEngine extends EventEmitter {
  constructor() {
    super();
    this.db          = getDB();
    this.isRunning   = false;
    this.usdcBalance = 0;
    this.polBalance  = 0;
    this.totalSent   = 0;
    this.transfers   = [];
    this.log         = [];
    this.provider    = null;
    this.wallet      = null;

    this._initWallet();
    console.log('Sovereign Capital Engine initialized');
    console.log('M7 Wallet: ' + M7_WALLET);
    console.log('Destination: ' + METAMASK);
  }

  _initWallet() {
    try {
      const crypto = require('crypto');
      const seed   = crypto.createHash('sha256')
        .update((process.env.M7_SECRET || 'M7-SOVEREIGN-SECKA') + '-WALLET')
        .digest('hex');
      this.provider = new ethers.JsonRpcProvider(
        process.env.POLY_RPC || 'https://polygon-rpc.com'
      );
      this.wallet = new ethers.Wallet('0x' + seed, this.provider);
      console.log('Wallet ready: ' + this.wallet.address);
    } catch(e) {
      console.error('Wallet init error:', e.message);
    }
  }

  _log(type, detail) {
    const e = { timestamp: Date.now(), type, detail };
    this.log.push(e);
    if (this.log.length > 200) this.log.shift();
    console.log(`[SCE] ${type}: ${detail}`);
    this.emit('log', e);
  }

  // Check real on-chain balances
  async checkBalances() {
    try {
      // POL balance
      const polBal  = await this.provider.getBalance(this.wallet.address);
      this.polBalance = parseFloat(ethers.formatEther(polBal));

      // USDC balance
      const usdc    = new ethers.Contract(USDC_POLYGON, USDC_ABI, this.provider);
      const usdcBal = await usdc.balanceOf(this.wallet.address);
      this.usdcBalance = parseFloat(ethers.formatUnits(usdcBal, 6));

      this._log('BALANCE_CHECK',
        `POL: ${this.polBalance.toFixed(4)} | USDC: $${this.usdcBalance.toFixed(2)}`
      );
      return { pol: this.polBalance, usdc: this.usdcBalance };
    } catch(e) {
      this._log('BALANCE_ERROR', e.message);
      return { pol: 0, usdc: 0 };
    }
  }

  // Send USDC to MetaMask
  async sendToMetaMask(amountUSD) {
    if (!this.wallet) return { error: 'Wallet not initialized' };

    this._log('SEND_INITIATED', `Sending $${amountUSD} USDC to MetaMask ${METAMASK}`);

    // Check POL for gas
    const balances = await this.checkBalances();
    if (balances.pol < 0.001) {
      const msg = `Need POL for gas. Send 0.01 POL to ${M7_WALLET} on Polygon`;
      this._log('NEED_GAS', msg);
      this.emit('need_gas', { address: M7_WALLET, amount: '0.01 POL', message: msg });
      return { error: 'Need gas', solution: msg, wallet: M7_WALLET };
    }

    if (balances.usdc < amountUSD) {
      const msg = `Need USDC. Send ${amountUSD} USDC to ${M7_WALLET} on Polygon`;
      this._log('NEED_USDC', msg);
      this.emit('need_usdc', { address: M7_WALLET, amount: amountUSD, message: msg });
      return { error: 'Need USDC', solution: msg, wallet: M7_WALLET };
    }

    try {
      const usdc   = new ethers.Contract(USDC_POLYGON, USDC_ABI, this.wallet);
      const amount = ethers.parseUnits(amountUSD.toFixed(2), 6);
      const tx     = await usdc.transfer(METAMASK, amount);
      
      this._log('TX_SENT', `TX: ${tx.hash}`);
      this.emit('tx_sent', { hash: tx.hash, amount: amountUSD });

      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        this.totalSent += amountUSD;
        const transfer = {
          hash:        tx.hash,
          amount:      amountUSD,
          to:          METAMASK,
          timestamp:   Date.now(),
          status:      'CONFIRMED',
          polygonscan: `https://polygonscan.com/tx/${tx.hash}`
        };
        this.transfers.push(transfer);
        this.db.setState('last_transfer', transfer);
        this._log('TX_CONFIRMED', `CONFIRMED: ${tx.hash}`);
        this._log('POLYGONSCAN', `https://polygonscan.com/tx/${tx.hash}`);
        this.emit('transfer_confirmed', transfer);
        return transfer;
      } else {
        this._log('TX_FAILED', `TX failed: ${tx.hash}`);
        return { error: 'Transaction failed', hash: tx.hash };
      }
    } catch(e) {
      this._log('TX_ERROR', e.message);
      return { error: e.message };
    }
  }

  // Update destination
  setDestination(address) {
    process.env.SECKA_METAMASK = address;
    this._log('DESTINATION', 'Updated to: ' + address);
  }

  start() {
    this.isRunning = true;
    // Check balances every 2 minutes
    setInterval(() => this.checkBalances(), 120000);
    setTimeout(() => this.checkBalances(), 5000);
    console.log('Sovereign Capital Engine started');
  }

  getStatus() {
    return {
      isRunning:    this.isRunning,
      m7Wallet:     M7_WALLET,
      destination:  METAMASK,
      balances: {
        pol:  this.polBalance,
        usdc: this.usdcBalance
      },
      totalSent:    parseFloat(this.totalSent.toFixed(2)),
      recentTransfers: this.transfers.slice(-5).reverse(),
      recentLog:    this.log.slice(-10).reverse()
    };
  }
}

module.exports = SovereignCapitalEngine;
