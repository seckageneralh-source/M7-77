'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || require('path').join(__dirname, '../data/m7.db');
const DATA_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

class M7Database {
  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._init();
    console.log('M7 Database initialized: ' + DB_PATH);
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        domain TEXT,
        type TEXT,
        source TEXT,
        data TEXT,
        score REAL,
        is_premium INTEGER DEFAULT 0,
        is_threat INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

      CREATE TABLE IF NOT EXISTS revenue (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        domain TEXT,
        type TEXT,
        amount REAL,
        is_premium INTEGER DEFAULT 0,
        status TEXT DEFAULT 'SETTLED',
        signature TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_revenue_domain ON revenue(domain);

      CREATE TABLE IF NOT EXISTS insights (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        domain TEXT,
        type TEXT,
        severity INTEGER,
        insight TEXT,
        threat INTEGER DEFAULT 0,
        client_action TEXT,
        ai_powered INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_insights_severity ON insights(severity);

      CREATE TABLE IF NOT EXISTS treasury (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER,
        type TEXT,
        amount REAL,
        balance REAL,
        source TEXT,
        tx_id TEXT,
        prev_hash TEXT,
        hash TEXT
      );

      CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        amount_usd REAL,
        network TEXT,
        rail TEXT,
        status TEXT,
        recipient TEXT,
        tx_hash TEXT,
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS sdl_rules (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER,
        updated_by TEXT DEFAULT 'M7'
      );

      CREATE TABLE IF NOT EXISTS system_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS intelligence_products (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        domain TEXT,
        product_type TEXT,
        content TEXT,
        signature TEXT
      );

      CREATE TABLE IF NOT EXISTS code_modules (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        name TEXT,
        code TEXT,
        status TEXT DEFAULT 'pending',
        test_result TEXT
      );
    `);

    // Initialize SDL rules from current hardcoded values
    const defaultRules = [
      ['pricing.finance',      '1.00'],
      ['pricing.government',   '0.80'],
      ['pricing.healthcare',   '0.75'],
      ['pricing.ai',           '0.50'],
      ['pricing.energy',       '0.40'],
      ['pricing.tech',         '0.20'],
      ['pricing.social',       '0.10'],
      ['pricing.defense',      '2.00'],
      ['pricing.cybersecurity','1.80'],
      ['pricing.legal',        '1.50'],
      ['pricing.realestate',   '1.20'],
      ['pricing.supplychain',  '1.10'],
      ['pricing.science',      '0.90'],
      ['pricing.climate',      '0.60'],
      ['pricing.economy',      '1.30'],
      ['pricing.emerging',     '0.70'],
      ['actualization.rate',   '0.99'],
      ['expense.monthly_cap',  '50.00'],
      ['transfer.min_amount',  '10.00'],
      ['transfer.sweep_threshold', '100.00'],
      ['system.version',       '4.0'],
      ['system.owner',         'SECKA'],
    ];

    const upsert = this.db.prepare(
      'INSERT OR IGNORE INTO sdl_rules (key, value, updated_at) VALUES (?, ?, ?)'
    );
    const now = Date.now();
    defaultRules.forEach(([k, v]) => upsert.run(k, v, now));
    console.log('SDL rules initialized');
  }

  // ── EVENTS ──────────────────────────────────────────────────────────────
  saveEvent(event, score = 0, isPremium = false, isThreat = false) {
    try {
      this.db.prepare(
        'INSERT OR IGNORE INTO events (id,timestamp,domain,type,source,data,score,is_premium,is_threat) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(
        event.id || ('ev-' + Date.now()),
        event.timestamp || Date.now(),
        event.domain, event.type,
        event.source || '',
        JSON.stringify(event.data || {}),
        score,
        isPremium ? 1 : 0,
        isThreat ? 1 : 0
      );
    } catch(e) {}
  }

  getRecentEvents(limit = 100, domain = null) {
    if (domain) {
      return this.db.prepare(
        'SELECT * FROM events WHERE domain=? ORDER BY timestamp DESC LIMIT ?'
      ).all(domain, limit);
    }
    return this.db.prepare(
      'SELECT * FROM events ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  }

  // ── REVENUE ─────────────────────────────────────────────────────────────
  saveRevenue(tx) {
    try {
      this.db.prepare(
        'INSERT OR IGNORE INTO revenue (id,timestamp,domain,type,amount,is_premium,status,signature) VALUES (?,?,?,?,?,?,?,?)'
      ).run(
        tx.id, tx.timestamp || Date.now(),
        tx.domain, tx.type || 'EVENT',
        tx.amount, tx.isPremium ? 1 : 0,
        tx.status || 'SETTLED',
        tx.signature || ''
      );
    } catch(e) {}
  }

  getTotalRevenue() {
    const row = this.db.prepare('SELECT SUM(amount) as total FROM revenue WHERE status=?').get('SETTLED');
    return row?.total || 0;
  }

  getRevenueByDomain() {
    return this.db.prepare(
      'SELECT domain, COUNT(*) as events, SUM(amount) as revenue FROM revenue GROUP BY domain'
    ).all();
  }

  // ── INSIGHTS ─────────────────────────────────────────────────────────────
  saveInsight(insight) {
    try {
      this.db.prepare(
        'INSERT OR IGNORE INTO insights (id,timestamp,domain,type,severity,insight,threat,client_action,ai_powered) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(
        'ins-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
        Date.now(),
        insight.domain || '', insight.type || '',
        insight.severity || 0, insight.insight || '',
        insight.threat ? 1 : 0,
        insight.clientAction || '',
        insight.aiPowered ? 1 : 0
      );
    } catch(e) {}
  }

  getRecentInsights(limit = 50) {
    return this.db.prepare(
      'SELECT * FROM insights ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  }

  // ── TREASURY ──────────────────────────────────────────────────────────────
  saveTreasuryEntry(entry) {
    try {
      this.db.prepare(
        'INSERT INTO treasury (timestamp,type,amount,balance,source,tx_id,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?)'
      ).run(
        entry.timestamp || Date.now(),
        entry.type, entry.amount, entry.balance,
        entry.source || '', entry.txId || '',
        entry.prevHash || '', entry.hash || ''
      );
    } catch(e) {}
  }

  getTreasuryBalance() {
    const row = this.db.prepare(
      'SELECT balance FROM treasury ORDER BY seq DESC LIMIT 1'
    ).get();
    return row?.balance || 0;
  }

  // ── SDL RULES ─────────────────────────────────────────────────────────────
  getRule(key) {
    const row = this.db.prepare('SELECT value FROM sdl_rules WHERE key=?').get(key);
    return row?.value || null;
  }

  setRule(key, value, updatedBy = 'M7') {
    this.db.prepare(
      'INSERT OR REPLACE INTO sdl_rules (key,value,updated_at,updated_by) VALUES (?,?,?,?)'
    ).run(key, String(value), Date.now(), updatedBy);
  }

  getAllRules() {
    return this.db.prepare('SELECT * FROM sdl_rules ORDER BY key').all();
  }

  // ── SYSTEM STATE ──────────────────────────────────────────────────────────
  setState(key, value) {
    this.db.prepare(
      'INSERT OR REPLACE INTO system_state (key,value,updated_at) VALUES (?,?,?)'
    ).run(key, JSON.stringify(value), Date.now());
  }

  getState(key) {
    const row = this.db.prepare('SELECT value FROM system_state WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : null;
  }

  // ── INTELLIGENCE PRODUCTS ─────────────────────────────────────────────────
  saveProduct(domain, type, content, signature = '') {
    this.db.prepare(
      'INSERT INTO intelligence_products (id,timestamp,domain,product_type,content,signature) VALUES (?,?,?,?,?,?)'
    ).run(
      'prod-' + Date.now(),
      Date.now(), domain, type,
      JSON.stringify(content), signature
    );
  }

  getProducts(domain = null, limit = 10) {
    if (domain) {
      return this.db.prepare(
        'SELECT * FROM intelligence_products WHERE domain=? ORDER BY timestamp DESC LIMIT ?'
      ).all(domain, limit);
    }
    return this.db.prepare(
      'SELECT * FROM intelligence_products ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  }

  // ── STATS ──────────────────────────────────────────────────────────────────
  getStats() {
    return {
      events:    this.db.prepare('SELECT COUNT(*) as c FROM events').get().c,
      revenue:   this.db.prepare('SELECT COUNT(*) as c FROM revenue').get().c,
      insights:  this.db.prepare('SELECT COUNT(*) as c FROM insights').get().c,
      treasury:  this.db.prepare('SELECT COUNT(*) as c FROM treasury').get().c,
      transfers: this.db.prepare('SELECT COUNT(*) as c FROM transfers').get().c,
      rules:     this.db.prepare('SELECT COUNT(*) as c FROM sdl_rules').get().c,
      totalRevenue: this.getTotalRevenue(),
      balance:      this.getTreasuryBalance()
    };
  }

  // ── BACKUP ────────────────────────────────────────────────────────────────
  backup(destPath) {
    this.db.backup(destPath);
    console.log('Database backed up to: ' + destPath);
  }
}

// Singleton
let instance = null;
function getDB() {
  if (!instance) instance = new M7Database();
  return instance;
}

module.exports = { M7Database, getDB };
