'use strict';
const EventEmitter = require('events');
const crypto = require('crypto');
const M7Wallet = require('./m7-wallet');

const SWEEP_THRESHOLD = parseFloat(process.env.SWEEP_THRESHOLD||'100'); // Sweep every $100
const MIN_TRANSFER    = parseFloat(process.env.MIN_TRANSFER||'100');

class M7Treasury extends EventEmitter{
  constructor(){
    super();
    this.balance=0;this.ledger=[];this.credited=0;this.debited=0;
    this.wallet=new M7Wallet();
    this.sweepLog=[];this.totalSwept=0;this.lastSweepAt=null;this.autoSweepEnabled=true;
    this.wallet.on('transfer',t=>{
      this.sweepLog.push(t);if(this.sweepLog.length>100)this.sweepLog.shift();
      if(t.status==='CONFIRMED'){this.totalSwept+=t.amountUSD;this.debited+=t.amountUSD;}
      this.emit('sweep',t);
    });
    setInterval(()=>this._autoSweep(),300000);

    // ── ACTUALIZATION ENGINE — 1% ratio ────────────────────────────────────
    // Every $100 RAM revenue = $1 real USDC

    // Anthropic API cost tracker — deducted before sweep
    this.anthropicCosts = 0;
    this.netActualized  = 0; // After Anthropic fees deducted
    this.actualizationRate = 0.99; // $99 per $100 RAM revenue — fixed forever
    this.actualizedUSDC    = 0;   // Real USDC allocated so far
    this.depositDetected   = false;
    this.depositAmount     = 0;

    // Poll for USDC deposit every 2 minutes
    setInterval(()=>this._checkDeposit(),120000);
    setTimeout(()=>this._checkDeposit(),10000);
    console.log('M7 Treasury — Ledger + Wallet initialized');
    console.log('  Sweep threshold: $'+SWEEP_THRESHOLD);
  }
  _hash(data){return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substr(0,16);}
  credit(amount,tx){
    this.balance+=amount;this.credited+=amount;
    this.wallet.accumulate(amount);

    // Actualize 1% of every credit into real USDC allocation
    if(this.depositDetected){
      const usdc = parseFloat((amount * this.actualizationRate).toFixed(4));
      this.actualizedUSDC += usdc;
    }
    const prev=this.ledger.length>0?this.ledger[this.ledger.length-1].hash:'0000000000000000';
    const entry={seq:this.ledger.length+1,timestamp:Date.now(),type:'CREDIT',amount:parseFloat(amount.toFixed(4)),balance:parseFloat(this.balance.toFixed(4)),source:tx?tx.domain:'system',txId:tx?tx.id:null,prevHash:prev};
    entry.hash=this._hash(entry);
    this.ledger.push(entry);if(this.ledger.length>5000)this.ledger.shift();
    this.emit('credit',entry);return entry;
  }
  debit(amount,destination,authorizedBy='SECKA'){
    if(amount>this.balance)return{error:'Insufficient balance',balance:this.balance};
    this.balance-=amount;this.debited+=amount;
    const prev=this.ledger[this.ledger.length-1]?.hash||'0000000000000000';
    const entry={seq:this.ledger.length+1,timestamp:Date.now(),type:'DEBIT',amount:parseFloat(amount.toFixed(4)),balance:parseFloat(this.balance.toFixed(4)),destination,authorizedBy,prevHash:prev};
    entry.hash=this._hash(entry);
    this.ledger.push(entry);this.emit('debit',entry);return entry;
  }
  async _autoSweep(){
    if(!this.autoSweepEnabled)return;
    if(this.balance<SWEEP_THRESHOLD)return;
    if(this.wallet.pendingUSD<MIN_TRANSFER)return;
    const amount=parseFloat(Math.min(this.wallet.pendingUSD,this.balance).toFixed(2));
    console.log('M7 Auto-sweep: $'+amount+' -> Ecobank via polygon');
    this.debit(amount,'ECOBANK-SECKA','M7-AI-AUTONOMOUS');
    this.lastSweepAt=Date.now();
    const result=await this.wallet.transferToEcobank(amount,'polygon');
    this.emit('auto_sweep',{amount,network:'polygon',result});
    return result;
  }
  async manualSweep(amount,network='polygon'){
    if(amount>this.balance)return{error:'Insufficient balance',balance:this.balance};
    this.debit(amount,'ECOBANK-SECKA','SECKA-MANUAL');
    this.lastSweepAt=Date.now();
    return await this.wallet.transferToEcobank(amount,network);
  }
  // Check if USDC has been deposited to wallet
  async _checkDeposit(){
    try{
      const status = this.wallet.getStatus();
      const polyUSDC = status.balances?.polygon?.USDC || 0;
      const ethUSDC  = status.balances?.ethereum?.USDC || 0;
      const total    = polyUSDC + ethUSDC;
      if(total > 0 && !this.depositDetected){
        this.depositDetected = true;
        this.depositAmount   = total;
        // Bootstrap actualized USDC from existing RAM balance
        this.actualizedUSDC  = parseFloat((this.balance * this.actualizationRate).toFixed(2));
        console.log('M7 DEPOSIT DETECTED: $'+total+' USDC');
        console.log('Actualization ACTIVE — 1% ratio — $'+this.actualizedUSDC+' USDC allocated from existing revenue');
        this.emit('deposit_detected',{amount:total,actualizedUSDC:this.actualizedUSDC});
      }
      if(total > 0){
        this.depositAmount = total;
      }
    }catch(e){}
  }

  // Override autoSweep to use actualized USDC
  async _autoSweep(){
    if(!this.autoSweepEnabled)return;
    if(!this.depositDetected)return; // Wait for deposit
    if(this.actualizedUSDC < 10)return; // Min $10 USDC
    const amount = parseFloat(Math.min(this.actualizedUSDC, this.depositAmount).toFixed(2));
    if(amount < 10)return;
    console.log('M7 Auto-sweep: $'+amount+' USDC -> Ecobank');
    this.actualizedUSDC -= amount;
    this.debited += amount;
    this.lastSweepAt = Date.now();
    const result = await this.wallet.transferToEcobank(amount,'polygon');
    this.emit('auto_sweep',{amount,result});
    return result;
  }

  async manualSweep(amount,network='polygon'){
    if(!this.depositDetected)return{error:'No USDC deposit detected yet. Send USDC to: '+this.wallet.getStatus().addresses.polygon};
    if(amount>this.actualizedUSDC)return{error:'Insufficient actualized USDC',available:this.actualizedUSDC};
    this.actualizedUSDC-=amount;
    this.debited+=amount;
    this.lastSweepAt=Date.now();
    return await this.wallet.transferToEcobank(amount,network);
  }


  // M7 pays its own Anthropic API costs from actualized revenue
  recordAnthropicCost(amount) {
    this.anthropicCosts += amount;
    this.actualizedUSDC = Math.max(0, this.actualizedUSDC - amount);
    console.log('M7 paid Anthropic cost: $'+amount.toFixed(4)+' | Remaining: $'+this.actualizedUSDC.toFixed(2));
  }

  getStatus(){
    return{
      ledger:{balance:parseFloat(this.balance.toFixed(2)),totalCredited:parseFloat(this.credited.toFixed(2)),totalDebited:parseFloat(this.debited.toFixed(2)),entries:this.ledger.length,lastEntry:this.ledger[this.ledger.length-1]||null},
      wallet:this.wallet.getStatus(),
      sweep:{autoEnabled:this.autoSweepEnabled,threshold:SWEEP_THRESHOLD,totalSwept:parseFloat(this.totalSwept.toFixed(2)),lastSweepAt:this.lastSweepAt,recentSweeps:this.sweepLog.slice(-5).reverse()},
      actualization:{
        active:          this.depositDetected,
        rate:            '1%',
        depositAmount:   parseFloat(this.depositAmount.toFixed(2)),
        actualizedUSDC:  parseFloat(this.actualizedUSDC.toFixed(2)),
        pendingMessage:  this.depositDetected?'ACTIVE':'Send USDC to '+this.wallet.getStatus().addresses.polygon+' on Polygon to activate'
      }
    };
  }
  getRecentLedger(n=20){return this.ledger.slice(-n).reverse();}
  get ledgerEntries(){return this.ledger.length;}
}
module.exports=M7Treasury;
