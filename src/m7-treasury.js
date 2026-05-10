const EventEmitter = require('events');
const crypto = require('crypto');

class M7Treasury extends EventEmitter {
  constructor() {
    super();
    this.balance = 0;
    this.ledger  = [];
    this.routes  = [
      { name: 'M7 SOVEREIGN HOLD', type: 'internal', allocation: 100, status: 'ACTIVE' }
    ];
    this.transfers = [];
    console.log('🏦 M7 Treasury initialized — Sovereign mode, no Stripe');
  }

  // Hash each transaction into the ledger chain
  _hash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substr(0, 16);
  }

  // Credit revenue into treasury
  credit(amount, tx) {
    this.balance += amount;

    const prev = this.ledger.length > 0 ? this.ledger[this.ledger.length - 1].hash : '0000000000000000';
    const entry = {
      seq:       this.ledger.length + 1,
      timestamp: Date.now(),
      type:      'CREDIT',
      amount:    parseFloat(amount.toFixed(4)),
      balance:   parseFloat(this.balance.toFixed(4)),
      source:    tx ? tx.domain : 'system',
      txId:      tx ? tx.id : null,
      prevHash:  prev
    };
    entry.hash = this._hash(entry);

    this.ledger.push(entry);
    if (this.ledger.length > 2000) this.ledger.shift();

    this.emit('credit', entry);
    return entry;
  }

  // Debit — manual transfer out
  debit(amount, destination, authorizedBy = 'SECKA') {
    if (amount > this.balance) {
      return { error: 'Insufficient treasury balance', balance: this.balance };
    }

    this.balance -= amount;

    const prev = this.ledger[this.ledger.length - 1]?.hash || '0000000000000000';
    const entry = {
      seq:          this.ledger.length + 1,
      timestamp:    Date.now(),
      type:         'DEBIT',
      amount:       parseFloat(amount.toFixed(4)),
      balance:      parseFloat(this.balance.toFixed(4)),
      destination,
      authorizedBy,
      prevHash:     prev
    };
    entry.hash = this._hash(entry);

    this.ledger.push(entry);
    this.transfers.push(entry);

    this.emit('debit', entry);
    return entry;
  }

  // Add a routing rail (bank, crypto, USDC)
  addRoute(route) {
    this.routes.push({
      name:       route.name,
      type:       route.type || 'external',
      address:    route.address,
      allocation: route.allocation || 0,
      status:     'CONFIGURED',
      addedAt:    Date.now()
    });
    console.log('💳 Treasury route added:', route.name);
  }

  getStatus() {
    return {
      balance:       parseFloat(this.balance.toFixed(2)),
      ledgerEntries: this.ledger.length,
      transfers:     this.transfers.length,
      routes:        this.routes,
      lastEntry:     this.ledger[this.ledger.length - 1] || null
    };
  }

  getRecentLedger(n = 20) {
    return this.ledger.slice(-n).reverse();
  }
}

module.exports = M7Treasury;
