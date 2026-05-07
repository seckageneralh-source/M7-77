// M7-77 Revenue Engine
// Manages all 3 revenue streams combined

const EventEmitter = require('events');

class RevenueEngine extends EventEmitter {
  constructor(config, treasury) {
    super();
    this.config = config;
    this.treasury = treasury;
    this.revenue = {
      eventProcessing: 0,
      intelligenceLicense: 0,
      dataProduct: 0,
      total: 0
    };
    this.transactions = [];
  }

  recordRevenue(revenueData) {
    // Record all 3 streams
    if (revenueData.eventFee > 0) {
      this.revenue.eventProcessing += revenueData.eventFee;
    }
    if (revenueData.licenseRevenue > 0) {
      this.revenue.intelligenceLicense += revenueData.licenseRevenue;
    }
    if (revenueData.productRevenue > 0) {
      this.revenue.dataProduct += revenueData.productRevenue;
    }
    
    this.revenue.total += revenueData.totalRevenue;

    this.transactions.push({
      id: revenueData.eventId,
      timestamp: revenueData.timestamp,
      domain: revenueData.domain,
      breakdown: {
        eventFee: revenueData.eventFee,
        licenseRevenue: revenueData.licenseRevenue,
        productRevenue: revenueData.productRevenue
      },
      total: revenueData.totalRevenue
    });
  }

  getRevenueReport() {
    return {
      eventProcessing: this.revenue.eventProcessing.toFixed(2),
      intelligenceLicense: this.revenue.intelligenceLicense.toFixed(2),
      dataProduct: this.revenue.dataProduct.toFixed(2),
      total: this.revenue.total.toFixed(2),
      transactionCount: this.transactions.length
    };
  }
}

module.exports = RevenueEngine;