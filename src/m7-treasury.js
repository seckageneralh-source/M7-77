'use strict';
const EventEmitter = require('events');
const crypto = require('crypto');
const M7Wallet = require('./m7-wallet');

const SWEEP_THRESHOLD = parseFloat(process.env.SWEEP_THRESHOLD||'1000');
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
    console.log('M7 Treasury — Ledger + Wallet initialized');
    console.log('  Sweep threshold: $'+SWEEP_THRESHOLD);
  }
  _hash(data){return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substr(0,16);}
  credit(amount,tx){
    this.balance+=amount;this.credited+=amount;
    this.wallet.accumulate(amount);
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
  getStatus(){
    return{
      ledger:{balance:parseFloat(this.balance.toFixed(2)),totalCredited:parseFloat(this.credited.toFixed(2)),totalDebited:parseFloat(this.debited.toFixed(2)),entries:this.ledger.length,lastEntry:this.ledger[this.ledger.length-1]||null},
      wallet:this.wallet.getStatus(),
      sweep:{autoEnabled:this.autoSweepEnabled,threshold:SWEEP_THRESHOLD,totalSwept:parseFloat(this.totalSwept.toFixed(2)),lastSweepAt:this.lastSweepAt,recentSweeps:this.sweepLog.slice(-5).reverse()}
    };
  }
  getRecentLedger(n=20){return this.ledger.slice(-n).reverse();}
  get ledgerEntries(){return this.ledger.length;}
}
module.exports=M7Treasury;
