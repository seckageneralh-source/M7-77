'use strict';
const EventEmitter = require('events');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { getDB } = require('./m7-database');

// M7 Sovereign Identity
// Every insight, every transfer, every decision — cryptographically signed
// SECKA is sole owner — sovereign proof

class M7Identity extends EventEmitter {
  constructor() {
    super();
    this.db        = getDB();
    this.isReady   = false;
    this.sigCount  = 0;
    this.publicKey = null;
    this.address   = null;
    this._init();
    console.log('M7 Identity Engine initialized');
  }

  _init() {
    try {
      // Generate deterministic identity from M7 secret
      const seed = crypto.createHash('sha256')
        .update((process.env.M7_SECRET || 'M7-SOVEREIGN-SECKA') + '-IDENTITY')
        .digest('hex');
      const wallet     = new ethers.Wallet('0x' + seed);
      this.privateKey  = wallet.privateKey;
      this.publicKey   = wallet.publicKey;
      this.address     = wallet.address;
      this.isReady     = true;

      // Save public identity to DB
      this.db.setState('m7_identity', {
        address:   this.address,
        publicKey: this.publicKey,
        owner:     'SECKA — Bun Omar Secka',
        createdAt: Date.now(),
        version:   '4.0'
      });

      console.log('M7 Identity ready');
      console.log('  Sovereign address: ' + this.address);
    } catch(e) {
      console.error('Identity init error:', e.message);
    }
  }

  // Sign any data — proves M7 produced it
  sign(data) {
    if (!this.isReady) return null;
    try {
      const payload   = JSON.stringify(data);
      const hash      = crypto.createHash('sha256').update(payload).digest('hex');
      const wallet    = new ethers.Wallet(this.privateKey);
      // Synchronous signing
      const signature = wallet.signMessageSync(hash);
      this.sigCount++;
      return {
        hash,
        signature,
        signer:    this.address,
        timestamp: Date.now(),
        owner:     'SECKA'
      };
    } catch(e) { return null; }
  }

  // Verify a signature
  verify(data, signature, expectedSigner) {
    try {
      const payload  = JSON.stringify(data);
      const hash     = crypto.createHash('sha256').update(payload).digest('hex');
      const signer   = ethers.verifyMessage(hash, signature);
      return {
        valid:    signer.toLowerCase() === expectedSigner.toLowerCase(),
        signer,
        expected: expectedSigner
      };
    } catch(e) {
      return { valid: false, error: e.message };
    }
  }

  // Sign an intelligence product
  signProduct(product) {
    const sig = this.sign(product);
    if (!sig) return product;
    return { ...product, m7Signature: sig, sovereign: true, owner: 'SECKA' };
  }

  // Sign a transfer
  signTransfer(transfer) {
    const sig = this.sign({
      id:     transfer.id,
      amount: transfer.amount,
      to:     transfer.destination,
      ts:     transfer.timestamp
    });
    return { ...transfer, m7Signature: sig };
  }

  getStatus() {
    return {
      isReady:    this.isReady,
      address:    this.address,
      publicKey:  this.publicKey,
      sigCount:   this.sigCount,
      owner:      'SECKA — Bun Omar Secka',
      sovereign:  true,
      version:    '4.0'
    };
  }
}

module.exports = M7Identity;
