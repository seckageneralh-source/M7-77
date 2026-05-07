// M7-77 Updated Main Entry Point
// With all advanced features integrated

const EventProcessor = require('./event-processor');
const M7Brain = require('./m7-brain');
const M7Treasury = require('./m7-treasury');
const RevenueEngine = require('./revenue-engine');
const DashboardAPI = require('./dashboard-api');
const AdvancedFeatures = require('./advanced-features');
const IntelligentRouter = require('./intelligent-router');
const WhitelabelAPI = require('./whitelabel-api');
const ComplianceManager = require('./compliance-manager');
const AnalyticsEngine = require('./analytics-engine');
const config = require('../config/m7-config.json');

class M7System {
  constructor() {
    this.processor = new EventProcessor(config);
    this.brain = new M7Brain(config);
    this.treasury = new M7Treasury(config);
    this.revenueEngine = new RevenueEngine(config, this.treasury);
    this.advancedFeatures = new AdvancedFeatures(this.processor, this.brain, this.treasury);
    this.router = new IntelligentRouter(this.treasury, config);
    this.compliance = new ComplianceManager();
    this.analytics = new AnalyticsEngine();
    this.dashboardAPI = new DashboardAPI(this.processor, this.brain, this.treasury, this.revenueEngine);
    this.whitelabelAPI = new WhitelabelAPI(this.brain, this.revenueEngine);
  }

  async initialize() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 M7-77 INITIALIZATION - FULL STACK');
    console.log('='.repeat(70) + '\n');

    // Phase 1: Core Systems
    console.log('📊 PHASE 1: Initializing Core Systems');
    console.log('  ✅ Event Processor');
    console.log('  ✅ M7 Brain (10 AI Managers)');
    console.log('  ✅ Treasury & Rail System');
    console.log('  ✅ Revenue Engine (3 Streams)\n');

    this.processor.start();

    this.processor.on('revenue_generated', (revenue) => {
      this.treasury.depositRevenue(revenue);
      this.revenueEngine.recordRevenue(revenue);
      this.compliance.auditTransaction(revenue);
    });

    this.processor.on('event_processed', (event) => {
      const intelligence = this.brain.processEvent(event);
    });

    // Phase 2: Advanced Features
    console.log('📈 PHASE 2: Activating Advanced Features');
    this.advancedFeatures.startAdvancedMonitoring();

    // Phase 3: AI Evolution
    console.log('\n🧠 PHASE 3: Starting Self-Evolution Loop');
    this.brain.startEvolutionLoop();

    // Phase 4: APIs & Dashboards
    console.log('\n🌐 PHASE 4: Launching APIs & Dashboards');
    this.dashboardAPI.start(3000);

    // Phase 5: Reporting
    console.log('\n📋 PHASE 5: Generating Initial Reports');
    setTimeout(() => {
      const report = this.analytics.generateComprehensiveReport('1h');
      console.log('\n📊 24-Hour Forecast Generated');
      console.log(`   Total Events: ${report.summary.totalEvents}`);
      console.log(`   Projected Revenue: ${report.summary.totalRevenue}`);
    }, 2000);

    // Status Display
    this.displayComprehensiveStatus();
  }

  displayComprehensiveStatus() {
    setInterval(() => {
      const processorStats = this.processor.getStats();
      const treasuryStatus = this.treasury.getTreasuryStatus();
      const complianceStatus = this.compliance.getComplianceReport();

      console.log('\n' + '='.repeat(70));
      console.log('📊 M7-77 COMPREHENSIVE STATUS');
      console.log('='.repeat(70));
      
      console.log('\n⚙️  PROCESSING ENGINE:');
      console.log(`   Events: ${processorStats.eventsProcessed.toLocaleString()} processed`);
      console.log(`   Rate: ${processorStats.eventsPerSecond.toLocaleString()} events/sec`);
      console.log(`   Revenue: $${processorStats.revenueGenerated}`);
      console.log(`   Daily Est: $${processorStats.estimatedDailyRevenue}`);

      console.log('\n💰 TREASURY:');
      console.log(`   Balance: $${treasuryStatus.balance}`);
      console.log(`   Accounts: ${treasuryStatus.accountsConfigured}`);
      console.log(`   Pending: ${treasuryStatus.pendingTransfers}`);
      console.log(`   Completed: ${treasuryStatus.completedTransfers}`);

      console.log('\n🛡️  COMPLIANCE:');
      console.log(`   Status: ${complianceStatus.status}`);
      console.log(`   Rate: ${complianceStatus.complianceRate}`);
      console.log(`   Audited: ${complianceStatus.totalTransactionsAudited} transactions`);

      console.log('\n' + '='.repeat(70) + '\n');
    }, 15000);
  }
}

// Initialize
const m7 = new M7System();
m7.initialize().catch(console.error);

module.exports = M7System;