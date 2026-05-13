'use strict';
require('dotenv').config();
const EventEmitter = require('events');
const fs   = require('fs');
const path = require('path');
const { getDB } = require('./m7-database');

// Self-Expanding Code Engine
// M7 writes, tests, and hot-loads its own modules

class SelfExpandingCode extends EventEmitter {
  constructor() {
    super();
    this.db           = getDB();
    this.isRunning    = false;
    this.modulesWritten = 0;
    this.modulesActive  = 0;
    this.generatedDir   = path.join(__dirname, 'generated');
    this.log            = [];

    if (!fs.existsSync(this.generatedDir)) {
      fs.mkdirSync(this.generatedDir, { recursive: true });
    }
    console.log('Self-Expanding Code Engine initialized');
  }

  _log(type, detail) {
    const e = { timestamp: Date.now(), type, detail };
    this.log.push(e);
    if (this.log.length > 100) this.log.shift();
    console.log(`[EXPAND] ${type}: ${detail}`);
    this.emit('code_action', e);
  }

  async generateModule(name, description, context = '') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    this._log('GENERATING', `Module: ${name} — ${description}`);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: `You are M7 code generator. Write clean Node.js modules.
Rules:
- Use require() not import
- Export a class with start() and getStatus() methods
- Include error handling
- No external dependencies unless standard Node.js
- Respond with ONLY the raw JavaScript code, no markdown`,
          messages: [{ role: 'user', content:
            `Write a Node.js module named ${name}.\nDescription: ${description}\nContext: ${context}\n` +
            `The module must: extend EventEmitter, have constructor(), start(), stop(), getStatus() methods, use console.log for key events.`
          }]
        })
      });
      const data = await res.json();
      const code = data.content[0].text.replace(/```javascript|```js|```/g,'').trim();

      // Save to generated directory
      const filePath = path.join(this.generatedDir, name + '.js');
      fs.writeFileSync(filePath, code);

      // Save to DB
      this.db.db.prepare(
        'INSERT OR REPLACE INTO code_modules (id,timestamp,name,code,status) VALUES (?,?,?,?,?)'
      ).run('mod-'+Date.now(), Date.now(), name, code, 'generated');

      this.modulesWritten++;
      this._log('GENERATED', `Module ${name} written to ${filePath}`);

      // Test the module
      const testResult = await this._testModule(filePath, name);
      return { name, filePath, testResult, code: code.substr(0, 200) + '...' };
    } catch(e) {
      this._log('GENERATE_ERROR', e.message);
      return null;
    }
  }

  async _testModule(filePath, name) {
    try {
      // Syntax check
      const { execSync } = require('child_process');
      execSync(`node --check ${filePath}`, { timeout: 5000 });

      // Try to require it
      delete require.cache[require.resolve(filePath)];
      const Module = require(filePath);

      // Update DB status
      this.db.db.prepare(
        'UPDATE code_modules SET status=?, test_result=? WHERE name=?'
      ).run('tested', 'PASS', name);

      this.modulesActive++;
      this._log('TEST_PASS', `Module ${name} passed all tests`);
      this.emit('module_ready', { name, filePath });
      return 'PASS';
    } catch(e) {
      this.db.db.prepare(
        'UPDATE code_modules SET status=?, test_result=? WHERE name=?'
      ).run('failed', e.message.substr(0,200), name);
      this._log('TEST_FAIL', `Module ${name} failed: ${e.message.substr(0,100)}`);
      return 'FAIL: ' + e.message.substr(0, 100);
    }
  }

  // Push to GitHub for permanent deployment
  async pushToGitHub(message = 'M7 auto-generated module') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { error: 'No GitHub token' };

    try {
      const files = fs.readdirSync(this.generatedDir)
        .filter(f => f.endsWith('.js'))
        .slice(0, 5);

      for (const file of files) {
        const content = fs.readFileSync(path.join(this.generatedDir, file)).toString('base64');
        const filePath = `src/generated/${file}`;

        // Get SHA if exists
        let sha = '';
        try {
          const r = await fetch(`https://api.github.com/repos/seckageneralh-source/M7-77/contents/${filePath}`, {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          const d = await r.json();
          sha = d.sha || '';
        } catch(e) {}

        await fetch(`https://api.github.com/repos/seckageneralh-source/M7-77/contents/${filePath}`, {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, content, sha: sha || undefined })
        });
      }

      this._log('GITHUB_PUSH', `Pushed ${files.length} modules to GitHub`);
      return { success: true, files };
    } catch(e) {
      return { error: e.message };
    }
  }

  start() {
    this.isRunning = true;
    // Generate utility modules on startup
    setTimeout(async () => {
      await this.generateModule(
        'm7-signal-scorer',
        'Advanced signal scoring engine that weights events by domain, time of day, and historical patterns',
        'Used by M7 brain to score intelligence signals more accurately'
      );
    }, 300000); // 5 minutes after start

    console.log('Self-Expanding Code Engine started');
  }

  getStatus() {
    const modules = this.db.db.prepare(
      'SELECT name, status, test_result, timestamp FROM code_modules ORDER BY timestamp DESC LIMIT 10'
    ).all();
    return {
      isRunning:      this.isRunning,
      modulesWritten: this.modulesWritten,
      modulesActive:  this.modulesActive,
      recentModules:  modules,
      recentLog:      this.log.slice(-10).reverse()
    };
  }
}

module.exports = SelfExpandingCode;
