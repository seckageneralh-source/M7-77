'use strict';
const EventEmitter = require('events');
const crypto = require('crypto');

const DOMAIN_PRICING = {
  finance:1.00, government:0.80, healthcare:0.75, health:0.75,
  ai:0.50, energy:0.40, tech:0.20, social:0.10, defense:2.00,
  cybersecurity:1.80, legal:1.50, realestate:1.20, supplychain:1.10,
  science:0.90, climate:0.60, economy:1.30, emerging:0.70
};

class M7ApprovalEngine {
  constructor(){this.approved=0;this.rejected=0;this.log=[];}
  approve(tx){
    if(!tx.domain)return this._reject(tx,'NO_DOMAIN');
    if(!DOMAIN_PRICING[tx.domain])return this._reject(tx,'UNKNOWN_DOMAIN');
    if(tx.amount<=0)return this._reject(tx,'ZERO_AMOUNT');
    tx.approved=true;tx.approvedAt=Date.now();
    tx.signature=crypto.createHash('sha256').update(JSON.stringify({id:tx.id,domain:tx.domain,amount:tx.amount,ts:tx.approvedAt})).digest('hex').substr(0,24);
    tx.approvedBy='M7-SOVEREIGN';
    this.approved++;
    this.log.push({id:tx.id,status:'APPROVED',signature:tx.signature,ts:tx.approvedAt});
    if(this.log.length>500)this.log.shift();
    return{approved:true,tx};
  }
  _reject(tx,reason){
    this.rejected++;tx.approved=false;tx.rejectedReason=reason;
    this.log.push({id:tx.id,status:'REJECTED',reason,ts:Date.now()});
    if(this.log.length>500)this.log.shift();
    return{approved:false,reason};
  }
  getStats(){
    return{approved:this.approved,rejected:this.rejected,approvalRate:this.approved+this.rejected>0?((this.approved/(this.approved+this.rejected))*100).toFixed(1)+'%':'100%',recentLog:this.log.slice(-10).reverse()};
  }
}

class RevenueEngine extends EventEmitter {
  constructor(treasury){
    super();
    this.treasury=treasury;
    this.approval=new M7ApprovalEngine();
    this.total=0;
    this.premiumTotal=0;
    this.transactions=[];
    this.domainTotals={};
    this.thisMinuteRev=0;
    this.lastMinuteRev=0;
    this.velocityLog=[];
    setInterval(()=>{
      this.lastMinuteRev=this.thisMinuteRev;
      this.thisMinuteRev=0;
      this.velocityLog.push({timestamp:Date.now(),revenue:this.lastMinuteRev});
      if(this.velocityLog.length>60)this.velocityLog.shift();
    },60000);
    console.log('Revenue Engine — events x domain price only, no multipliers');
  }

  recordEvent(event,isPremium=false,isPrediction=false){
    // REVENUE MODEL: events x domain price = revenue. Nothing else.
    const amount = DOMAIN_PRICING[event.domain] || 0.10;

    const tx={
      id:event.id||('tx-'+Date.now()+'-'+Math.random().toString(36).substr(2,6)),
      timestamp:event.timestamp||Date.now(),
      domain:event.domain,
      type:event.type||'EVENT',
      amount:parseFloat(amount.toFixed(4)),
      isPremium,isPrediction,
      status:'PENDING'
    };

    const result=this.approval.approve(tx);
    if(!result.approved)return null;
    tx.status='SETTLED';

    this.total+=amount;
    this.thisMinuteRev+=amount;
    if(isPremium||isPrediction)this.premiumTotal+=amount;

    if(!this.domainTotals[event.domain])
      this.domainTotals[event.domain]={events:0,revenue:0};
    this.domainTotals[event.domain].events++;
    this.domainTotals[event.domain].revenue=parseFloat((this.domainTotals[event.domain].revenue+amount).toFixed(4));

    this.transactions.push(tx);
    if(this.transactions.length>5000)this.transactions.shift();

    if(this.treasury)this.treasury.credit(amount,tx);
    this.emit('revenue',tx);
    return tx;
  }

  getReport(){
    return{
      total:parseFloat(this.total.toFixed(2)),
      premiumTotal:parseFloat(this.premiumTotal.toFixed(2)),
      transactionCount:this.transactions.length,
      domainBreakdown:this.domainTotals,
      velocity:parseFloat(this.lastMinuteRev.toFixed(2)),
      approval:this.approval.getStats(),
      pricing:DOMAIN_PRICING,
      streams:{eventProcessing:parseFloat(this.total.toFixed(2)),premium:parseFloat(this.premiumTotal.toFixed(2))}
    };
  }

  getRecentTransactions(n=20){return this.transactions.slice(-n).reverse();}
}

module.exports={RevenueEngine,DOMAIN_PRICING};
