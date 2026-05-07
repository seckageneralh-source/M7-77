// M7-77 Main Entry Point
// Instant event processing post-deployment

const EventProcessor = require('./event-processor');
const M7Brain = require('./m7-brain');
const M7Treasury = require('./m7-treasury');
const RevenueEngine = require('./revenue-engine');
const config = require('../config/m7-config.json');

class M7System {
  constructor() {
    this.processor = new EventProcessor(config);
    this.brain = new M7Brain(config);
    this.treasury = new M7Treasury(config);
    this.revenueEngine = new RevenueEngine(config, this.treasury);
  }

  async initialize() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 M7-77 INITIALIZATION');
    console.log('='.repeat(60) + '\n');

    // Start event processing immediately
    console.log('📊 Starting Event Processing Engine...');
    this.processor.start();

    // Connect event processor to revenue engine
    this.processor.on('revenue_generated', (revenue) => {
      this.treasury.depositRevenue(revenue);
      this.revenueEngine.recordRevenue(revenue);
    });

    this.processor.on('event_processed', (event) => {
      const intelligence = this.brain.processEvent(event);
      if (intelligence) {
        console.log(`✨ Intelligence generated: ${intelligence.manager}`);
      }
    });

    // Start self-evolution loop
    console.log('\n🧬 Activating Self-Evolution Loop...');
    this.brain.startEvolutionLoop();

    // Display status
    this.displayStatus();
  }

  displayStatus() {
    setInterval(() => {
      const processorStats = this.processor.getStats();
      const treasuryStatus = this.treasury.getTreasuryStatus();
      const brainStatus = this.brain.getManagerStatus();

      console.log('\n' + '='.repeat(60));
      console.log('📈 M7-77 REAL-TIME STATUS');
      console.log('='.repeat(60));
      console.log('\n🔄 EVENT PROCESSOR:');
      console.log(`   Events Processed: ${processorStats.eventsProcessed.toLocaleString()}`);
      console.log(`   Processing Rate: ${processorStats.eventsPerSecond.toLocaleString()} events/sec`);
      console.log(`   Revenue Generated: $${processorStats.revenueGenerated}`);
      console.log(`   Est. Daily Revenue: $${processorStats.estimatedDailyRevenue}`);
      console.log(`   Uptime: ${processorStats.uptime}`);

      console.log('\n💰 M7 TREASURY:');
      console.log(`   Current Balance: $${treasuryStatus.balance}`);
      console.log(`   Accounts Configured: ${treasuryStatus.accountsConfigured}`);
      console.log(`   Pending Transfers: ${treasuryStatus.pendingTransfers}`);
      console.log(`   Completed Transfers: ${treasuryStatus.completedTransfers}`);

      console.log('\n🧠 AI MANAGERS (Top 3):');
      brainStatus.slice(0, 3).forEach(manager => {
        console.log(`   • ${manager.name}: ${manager.performance}`);
      });

      console.log('\n' + '='.repeat(60) + '\n');
    }, 10000); // Update every 10 seconds
  }
}

// Start M7-77
const m7 = new M7System();
m7.initialize().catch(console.error);

module.exports = M7System;