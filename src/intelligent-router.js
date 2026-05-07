// M7-77 Intelligent Routing System
// Smart fund distribution and domain optimization

class IntelligentRouter {
  constructor(treasury, config) {
    this.treasury = treasury;
    this.config = config;
    this.routingHistory = [];
    this.domainPerformance = {};
  }

  // Smart routing based on performance metrics
  smartRoute(amount, preferences = {}) {
    const availableAccounts = this.treasury.bankAccounts;
    const optimalRoute = this.calculateOptimalRoute(amount, availableAccounts, preferences);
    
    console.log(`🎯 Smart Route Selected: ${optimalRoute.rail} -> ${optimalRoute.account.bankName || optimalRoute.account.currency}`);
    
    return optimalRoute;
  }

  calculateOptimalRoute(amount, accounts, preferences) {
    const routes = [];

    Object.values(accounts).forEach(account => {
      let score = 0;
      let rail = 'bankTransfer';

      if (account.walletId) {
        rail = 'cryptoRail';
        score = amount > 100000 ? 85 : 75; // Crypto better for large amounts
      } else if (amount > 50000) {
        rail = 'wireTransfer';
        score = 90;
      } else {
        rail = 'bankTransfer';
        score = 80;
      }

      if (account.isDefault) score += 10;

      routes.push({
        account: account,
        rail: rail,
        score: score,
        estimatedFee: this.calculateFee(rail, amount)
      });
    });

    const optimalRoute = routes.sort((a, b) => b.score - a.score)[0];
    this.routingHistory.push({
      timestamp: Date.now(),
      amount: amount,
      route: optimalRoute.rail,
      account: optimalRoute.account.accountId || optimalRoute.account.walletId
    });

    return optimalRoute;
  }

  calculateFee(rail, amount) {
    const fees = {
      bankTransfer: amount * 0.005 + 0.25,
      wireTransfer: amount * 0.01 + 10,
      cryptoRail: 0, // Network fees only
      paypalTransfer: amount * 0.022
    };
    return fees[rail] || 0;
  }
}

module.exports = IntelligentRouter;