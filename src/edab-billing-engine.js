class EDABBillingEngine {
  constructor(treasury) {
    this.treasury = treasury;
    this.billingLedger = [];
    this.totalBilled = 0;
    this.streamTotals = {
      eventProcessing: 0,
      intelligenceLicense: 0,
      dataProduct: 0
    };
  }

  billEvent(event) {
    const fee = event.value || 0.50;
    const billing = {
      id: 'BILL-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      eventId: event.id,
      domain: event.domain,
      type: event.type,
      eventProcessingFee: fee,
      intelligenceLicenseFee: fee * 5,
      dataProductFee: fee * 20,
      total: fee + (fee * 5) + (fee * 20),
      status: 'SETTLED'
    };

    this.billingLedger.push(billing);
    this.totalBilled += billing.total;
    this.streamTotals.eventProcessing += billing.eventProcessingFee;
    this.streamTotals.intelligenceLicense += billing.intelligenceLicenseFee;
    this.streamTotals.dataProduct += billing.dataProductFee;

    if (this.treasury && this.treasury.credit) {
      this.treasury.credit(billing.total, billing);
    }

    if (this.billingLedger.length > 1000) {
      this.billingLedger = this.billingLedger.slice(-500);
    }

    return billing;
  }

  getSummary() {
    return {
      totalBilled: this.totalBilled,
      totalEvents: this.billingLedger.length,
      streams: this.streamTotals,
      recentTransactions: this.billingLedger.slice(-10),
      status: 'ACTIVE'
    };
  }
}

module.exports = EDABBillingEngine;
