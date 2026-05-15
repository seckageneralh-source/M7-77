const express = require('express');
const path = require('path');
const app = express();

class DashboardAPI {
  constructor(processor, brain, treasury, revenueEngine) {
    this.processor = processor;
    this.brain = brain;
    this.treasury = treasury;
    this.revenueEngine = revenueEngine;
    this.setupRoutes();
  }

  setupRoutes() {
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../public')));

    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/dashboard.html'));
    });

    app.get('/api/status', (req, res) => {
      res.json({
        edab: global.m7edab ? global.m7edab.getSummary() : {
          totalBilled: 0,
          totalEvents: 0,
          streams: { eventProcessing: 0, intelligenceLicense: 0, dataProduct: 0 }
        },
        ingestion: global.m7ingestion ? global.m7ingestion.getStats() : {
          totalEvents: 0,
          sources: 8
        },
        recentEvents: global.m7recentEvents || []
      });
    });

    app.get('/api/intelligence/all', (req, res) => {
      const events = global.m7recentEvents || [];
      res.json({
        status: 'success',
        product: 'M7-77 Full Spectrum Intelligence',
        timestamp: new Date().toISOString(),
        powered_by: 'M7-77 Sovereign Intelligence — SECKA DPI Framework',
        total_events: events.length,
        events: events.slice(-10)
      });
    });
  }

  start(port) {
    app.listen(port, () => {
      console.log(`✅ Dashboard API running on http://localhost:${port}`);
      console.log(`📊 Dashboard: http://localhost:${port}/dashboard.html`);
      console.log(`⚙️  Control: http://localhost:${port}/control`);
    });
  }
}

module.exports = DashboardAPI;
// TEMP DEBUG - check globals
