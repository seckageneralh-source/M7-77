// M7-77 Treasury System
// Temporary holding of revenue + Rail system for fund transfers

const EventEmitter = require('events');

class M7Treasury extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.balance = 0;
    this.bankAccounts = {};
    this.transfers = [];
    this.ledger = [];
    this.accountDetailsStored = false;
  }

  // Add bank account details for routing
  addBankAccount(accountDetails) {
    const accountId = `bank_${Date.now()}`;
    
    this.bankAccounts[accountId] = {
      accountId: accountId,
      accountHolder: accountDetails.accountHolder,
      accountNumber: this.maskAccountNumber(accountDetails.accountNumber),
      routingNumber: this.maskRoutingNumber(accountDetails.routingNumber),
      bankName: accountDetails.bankName,
      accountType: accountDetails.accountType || 'checking',
      addedAt: Date.now(),
      isDefault: accountDetails.isDefault || false,
      status: 'verified'
    };

    if (accountDetails.isDefault) {
      // Set all others to non-default
      Object.values(this.bankAccounts).forEach(acc => {
        if (acc.accountId !== accountId) acc.isDefault = false;
      });
      this.bankAccounts[accountId].isDefault = true;
    }

    console.log(`✅ Bank account added: ${accountDetails.bankName} - ${accountDetails.accountHolder}`);
    return accountId;
  }

  // Add crypto wallet for routing
  addCryptoWallet(walletDetails) {
    const walletId = `crypto_${Date.now()}`;
    
    this.bankAccounts[walletId] = {
      walletId: walletId,
      currency: walletDetails.currency.toUpperCase(),
      address: this.maskCryptoAddress(walletDetails.address),
      label: walletDetails.label || walletDetails.currency,
      addedAt: Date.now(),
      isDefault: walletDetails.isDefault || false,
      status: 'verified'
    };

    if (walletDetails.isDefault) {
      Object.values(this.bankAccounts).forEach(acc => {
        if (acc.walletId !== walletId) acc.isDefault = false;
      });
      this.bankAccounts[walletId].isDefault = true;
    }

    console.log(`✅ Crypto wallet added: ${walletDetails.currency.toUpperCase()}`);
    return walletId;
  }

  // Receive revenue into treasury
  depositRevenue(revenue) {
    this.balance += revenue.totalRevenue;
    
    this.ledger.push({
      id: `deposit_${Date.now()}`,
      type: 'deposit',
      amount: revenue.totalRevenue,
      source: revenue.domain,
      eventId: revenue.eventId,
      timestamp: Date.now(),
      status: 'confirmed'
    });

    this.emit('balance_updated', {
      newBalance: this.balance,
      deposit: revenue.totalRevenue
    });
  }

  // Transfer funds from treasury to bank/crypto
  transferFunds(transferRequest) {
    const { amount, destinationAccountId, rail } = transferRequest;

    if (amount > this.balance) {
      return {
        success: false,
        error: 'Insufficient balance in treasury',
        available: this.balance,
        requested: amount
      };
    }

    const account = this.bankAccounts[destinationAccountId];
    if (!account) {
      return {
        success: false,
        error: 'Account not found'
      };
    }

    const transfer = {
      id: `transfer_${Date.now()}`,
      amount: amount,
      destination: account,
      rail: rail,
      status: 'processing',
      initiatedAt: Date.now(),
      estimatedDelivery: this.getEstimatedDelivery(rail)
    };

    // Deduct from treasury
    this.balance -= amount;

    // Record transfer
    this.transfers.push(transfer);

    this.ledger.push({
      id: transfer.id,
      type: 'transfer',
      amount: amount,
      destination: account.accountId || account.walletId,
      rail: rail,
      timestamp: Date.now(),
      status: 'initiated'
    });

    console.log(`💸 Transfer initiated: $${amount.toFixed(2)} via ${rail} to ${account.accountHolder || account.label}`);

    // Simulate transfer processing
    this.processTransfer(transfer);

    return {
      success: true,
      transferId: transfer.id,
      amount: amount,
      rail: rail,
      estimatedDelivery: new Date(transfer.estimatedDelivery).toISOString(),
      newBalance: this.balance.toFixed(2)
    };
  }

  processTransfer(transfer) {
    const processingTime = this.getProcessingTime(transfer.rail);
    
    setTimeout(() => {
      transfer.status = 'completed';
      transfer.completedAt = Date.now();
      
      console.log(`✅ Transfer completed: ${transfer.id}`);
      
      this.emit('transfer_completed', transfer);
    }, processingTime);
  }

  getEstimatedDelivery(rail) {
    const times = {
      bankTransfer: 1000 * 60 * 60 * 24 * 2, // 2 days
      wireTransfer: 1000 * 60 * 60 * 2, // 2 hours
      cryptoRail: 1000 * 60 * 10, // 10 minutes
      paypalTransfer: 1000 * 60 * 60 * 2 // 2 hours
    };
    return Date.now() + (times[rail] || times.bankTransfer);
  }

  getProcessingTime(rail) {
    const times = {
      bankTransfer: 100, // Demo: 100ms = 2 days
      wireTransfer: 50,
      cryptoRail: 20,
      paypalTransfer: 50
    };
    return times[rail] || times.bankTransfer;
  }

  maskAccountNumber(accountNumber) {
    const last4 = accountNumber.slice(-4);
    return `****${last4}`;
  }

  maskRoutingNumber(routingNumber) {
    return `****${routingNumber.slice(-4)}`;
  }

  maskCryptoAddress(address) {
    const first6 = address.slice(0, 6);
    const last4 = address.slice(-4);
    return `${first6}...${last4}`;
  }

  getTreasuryStatus() {
    return {
      balance: this.balance.toFixed(2),
      accountsConfigured: Object.keys(this.bankAccounts).length,
      pendingTransfers: this.transfers.filter(t => t.status === 'processing').length,
      completedTransfers: this.transfers.filter(t => t.status === 'completed').length,
      totalDeposited: this.ledger.filter(l => l.type === 'deposit').reduce((sum, l) => sum + l.amount, 0).toFixed(2),
      totalTransferred: this.ledger.filter(l => l.type === 'transfer').reduce((sum, l) => sum + l.amount, 0).toFixed(2),
      accounts: Object.values(this.bankAccounts)
    };
  }
}

module.exports = M7Treasury;