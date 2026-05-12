'use strict';
require('dotenv').config();
const { getDB } = require('./m7-database');
const EventEmitter = require('events');
const DOMAIN_PRICING = {
  finance:1.00,government:0.80,healthcare:0.75,health:0.75,ai:0.50,energy:0.40,
  tech:0.20,social:0.10,defense:2.00,cybersecurity:1.80,legal:1.50,realestate:1.20,
  supplychain:1.10,science:0.90,climate:0.60,economy:1.30,emerging:0.70
};
const CLIENT_PROFILES = {
  finance:{type:'Hedge Fund / Trading Firm',urgency:'CRITICAL'},
  government:{type:'Government Contractor / Think Tank',urgency:'HIGH'},
  healthcare:{type:'Pharma / Hospital Network',urgency:'HIGH'},
  ai:{type:'AI Research Lab / Tech Company',urgency:'MEDIUM'},
  energy:{type:'Energy Trader / Utility Company',urgency:'HIGH'},
  tech:{type:'VC Firm / Tech Startup',urgency:'MEDIUM'},
  social:{type:'Marketing Agency / PR Firm',urgency:'LOW'},
  defense:{type:'Defense Contractor / Intelligence Agency',urgency:'CRITICAL'},
  cybersecurity:{type:'CISO / Security Firm',urgency:'CRITICAL'},
  legal:{type:'Law Firm / Compliance Team',urgency:'HIGH'},
  realestate:{type:'Real Estate Fund / Developer',urgency:'MEDIUM'},
  supplychain:{type:'Logistics Company / Manufacturer',urgency:'HIGH'},
  science:{type:'Research Institution / Defense Lab',urgency:'MEDIUM'},
  climate:{type:'ESG Fund / Policy Maker',urgency:'MEDIUM'},
  economy:{type:'Central Bank / Macro Fund',urgency:'HIGH'},
  emerging:{type:'Emerging Market Fund / Development Bank',urgency:'MEDIUM'}
};
async function callClaude(sys,usr,maxTokens=400){
  const apiKey=process.env.ANTHROPIC_API_KEY;
  if(!apiKey||apiKey==='your_key_here')throw new Error('No API key');
  const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:maxTokens,system:sys,messages:[{role:'user',content:usr}]})});
  if(!res.ok)throw new Error('Claude API '+res.status);
  return (await res.json()).content[0].text;
}
class IntelligenceCore{
  constructor(){this.knowledgeBase={};this.patternMemory=[];this.threatLog=[];}
  scoreEvent(event){
    let s=0.5;const t=(event.type||'').toLowerCase();
    if(t.includes('breach')||t.includes('hack'))s+=0.35;
    if(t.includes('threat')||t.includes('vuln'))s+=0.30;
    if(t.includes('sanction')||t.includes('nato'))s+=0.30;
    if(t.includes('fda')||t.includes('clinical'))s+=0.28;
    if(t.includes('federal')||t.includes('regulat'))s+=0.25;
    if(t.includes('trade')||t.includes('btc'))s+=0.20;
    if(t.includes('lawsuit')||t.includes('court'))s+=0.22;
    if(t.includes('ransomware'))s+=0.40;
    if(t.includes('conflict')||t.includes('warfare'))s+=0.35;
    if(t.includes('zero_day'))s+=0.42;
    const b={defense:0.30,cybersecurity:0.28,legal:0.22,finance:0.20,government:0.18,healthcare:0.16,realestate:0.12,supplychain:0.12,energy:0.10,ai:0.08,tech:0.05,social:0.02};
    s+=b[event.domain]||0.05;
    return Math.min(parseFloat(s.toFixed(3)),1.0);
  }
  isPremium(s){return s>=0.80;}
  isPrediction(s){return s>=0.92;}
  isThreat(e){const t=(e.type||'').toLowerCase();return t.includes('breach')||t.includes('ransomware')||t.includes('hack')||t.includes('vuln')||t.includes('warfare')||t.includes('zero_day')||t.includes('conflict');}
  async analyzeEventBatch(events){
    if(!events||events.length===0)return[];
    const summary=events.map(e=>{const r=e.data;const h=r&&(r.title||r.name||(r.selftext||'').slice(0,100)||r.url)||e.type;return'['+e.domain.toUpperCase()+'] '+e.type+': '+String(h).slice(0,120);}).join('\n');
    try{
      const raw=await callClaude('You are M7 intelligence system. Respond ONLY with valid JSON array, no markdown.','Analyze these '+events.length+' signals. Each item: {"domain","type","severity"(1-10),"insight"(1 sentence),"threat"(boolean),"clientAction"(max 10 words)}\n\n'+summary+'\n\nReturn ONLY JSON array.',800);
      const parsed=JSON.parse(raw.replace(/```json|```/g,'').trim());
      return Array.isArray(parsed)?parsed:[];
    }catch(err){console.error('Claude error:',err.message);return[];}
  }
  rememberPattern(event,score){
    const key=event.domain+':'+event.type;
    if(!this.knowledgeBase[key])this.knowledgeBase[key]={count:0,avgScore:score,lastSeen:Date.now()};
    const kb=this.knowledgeBase[key];kb.count++;kb.avgScore=parseFloat(((kb.avgScore+score)/2).toFixed(3));kb.lastSeen=Date.now();
    this.patternMemory.push({key,score,timestamp:Date.now()});
    if(this.patternMemory.length>1000)this.patternMemory.shift();
  }
}
class ClientAcquisitionEngine{
  constructor(){this.opportunities=[];this.urgentLeads=[];this.domainSpikes={};this.pitchesGenerated=0;}
  detectSpike(domain,eventCount){
    if(!this.domainSpikes[domain])this.domainSpikes[domain]={baseline:10,current:0,spiking:false};
    const ds=this.domainSpikes[domain];ds.current=eventCount;const r=ds.current/Math.max(ds.baseline,1);
    ds.spiking=r>2.5;ds.baseline=parseFloat(((ds.baseline*0.9)+(ds.current*0.1)).toFixed(1));
    return{spiking:ds.spiking,ratio:parseFloat(r.toFixed(2))};
  }
  generateOpportunity(domain,spike,revenueRate){
    const profile=CLIENT_PROFILES[domain];if(!profile)return null;
    const opp={id:'opp-'+Date.now(),timestamp:Date.now(),domain,urgency:spike.spiking?'URGENT':profile.urgency,clientType:profile.type,pricing:'$'+(DOMAIN_PRICING[domain]||0.10)+' per 10 events',spikeRatio:spike.ratio,revenueRate:parseFloat(revenueRate.toFixed(2)),action:spike.spiking?'SPIKE — '+domain.toUpperCase()+' is '+spike.ratio+'x above baseline':'Opportunity — '+profile.type+' would benefit from '+domain+' feed.'};
    this.pitchesGenerated++;this.opportunities.push(opp);if(this.opportunities.length>100)this.opportunities.shift();
    if(opp.urgency==='URGENT'||opp.urgency==='CRITICAL'){this.urgentLeads.push(opp);if(this.urgentLeads.length>20)this.urgentLeads.shift();}
    return opp;
  }
  getTopOpportunities(n=5){return this.opportunities.slice(-20).sort((a,b)=>b.spikeRatio-a.spikeRatio).slice(0,n);}
}
class OperationsManager{
  constructor(){this.healthLog=[];this.alerts=[];this.systemStatus='NOMINAL';this.uptimeStart=Date.now();}
  checkHealth(i,r){
    const issues=[];
    if(i.errors>50)issues.push('HIGH_ERROR_RATE');
    if(i.totalEvents===0)issues.push('NO_EVENTS');
    if(r&&r.total===0)issues.push('ZERO_REVENUE');
    this.systemStatus=issues.length===0?'NOMINAL':issues.length<2?'DEGRADED':'CRITICAL';
    const entry={timestamp:Date.now(),status:this.systemStatus,issues,eventsTotal:i.totalEvents,sources:i.sources,revenue:r&&r.total||0};
    this.healthLog.push(entry);if(this.healthLog.length>100)this.healthLog.shift();
    if(issues.length>0){this.alerts.push({timestamp:Date.now(),issues,status:this.systemStatus});if(this.alerts.length>50)this.alerts.shift();}
    return entry;
  }
  getStatus(){return{systemStatus:this.systemStatus,uptime:Math.floor((Date.now()-this.uptimeStart)/1000),recentAlerts:this.alerts.slice(-5).reverse(),lastHealth:this.healthLog[this.healthLog.length-1]||null};}
}
class M7AIBrain extends EventEmitter{
  constructor(){
    super();
    this.intelligence=new IntelligenceCore();this.clientEngine=new ClientAcquisitionEngine();this.operations=new OperationsManager();
    this.isRunning=false;this.loopInterval=3000;this.eventBuffer=[];this.processedCount=0;
    this.decisionLog=[];this.aiInsights=[];this.reports={};this.revenueRef=null;this.ingestionRef=null;
    this.claudeMetrics={totalCalls:0,totalEventsAnalyzed:0,lastCallAt:null,errors:0};
    this.speedMetrics={eventsLast3s:0,currentInterval:3000,accelerations:0};
    console.log('M7 AI Brain v4.0 — Real Claude intelligence active');
  }
  wire(revenueEngine,ingestion){this.revenueRef=revenueEngine;this.ingestionRef=ingestion;console.log('M7 Brain wired');}
  ingestEvent(event){this.eventBuffer.push(event);if(this.eventBuffer.length>1000)this.eventBuffer.shift();}
  _processBurst(){
    const batch=this.eventBuffer.splice(0,50);if(batch.length===0)return;
    this.speedMetrics.eventsLast3s=batch.length;this.processedCount+=batch.length;
    if(batch.length>=50&&this.loopInterval>500){this.loopInterval=Math.max(this.loopInterval-500,500);this.speedMetrics.accelerations++;}
    else if(batch.length<10&&this.loopInterval<3000){this.loopInterval=Math.min(this.loopInterval+500,3000);}
    const premiumEvents=[];const threatEvents=[];
    batch.forEach(event=>{
      const score=this.intelligence.scoreEvent(event);
      this.intelligence.rememberPattern(event,score);
      if(this.intelligence.isPremium(score))premiumEvents.push({event,score});
      if(this.intelligence.isThreat(event))threatEvents.push({event,score});
      if(this.revenueRef)this.revenueRef.recordEvent(event,this.intelligence.isPremium(score),this.intelligence.isPrediction(score));
    });
    const toAnalyze=premiumEvents.length>0?premiumEvents.map(p=>p.event).slice(0,10):threatEvents.length>0?threatEvents.map(t=>t.event).slice(0,10):null;
    if(toAnalyze)this._runClaudeAnalysis(toAnalyze);
    if(threatEvents.length>0){
      const threat={timestamp:Date.now(),type:'THREAT_DETECTED',count:threatEvents.length,detail:threatEvents.length+' threat signals detected',threats:threatEvents.map(t=>({domain:t.event.domain,type:t.event.type,score:t.score}))};
      this.intelligence.threatLog.push(threat);if(this.intelligence.threatLog.length>100)this.intelligence.threatLog.shift();
      this.emit('threat_detected',threat);console.log('THREAT: '+threat.detail);
    }
  }
  async _runClaudeAnalysis(events){
    try{
      this.claudeMetrics.totalCalls++;this.claudeMetrics.lastCallAt=Date.now();
      const insights=await this.intelligence.analyzeEventBatch(events);
      this.claudeMetrics.totalEventsAnalyzed+=events.length;
      if(insights.length>0){
        insights.forEach(i=>{
          this.aiInsights.push(Object.assign({},i,{aiPowered:true,analyzedAt:Date.now()}));
          try { getDB().saveInsight({...i, aiPowered:true}); } catch(e) {}
        });
        if(this.aiInsights.length>200)this.aiInsights.shift();
        const high=insights.filter(i=>i.severity>=7);
        if(high.length>0){console.log('Claude: '+high.length+' high-severity signals');high.forEach(i=>console.log('  ['+i.domain+'] '+i.insight));}
        this.decisionLog.push({timestamp:Date.now(),type:'AI_ANALYSIS_COMPLETE',count:insights.length,highSeverity:high.length});
        this.emit('ai_analysis',{insights});
      }
    }catch(err){this.claudeMetrics.errors++;}
    if(this.decisionLog.length>200)this.decisionLog.shift();
  }
  _runClientLoop(){
    if(!this.ingestionRef)return;
    const stats=this.ingestionRef.getStats();const domainCounts=stats.domainCounts||{};const rev=this.revenueRef?this.revenueRef.getReport():null;
    Object.keys(DOMAIN_PRICING).forEach(domain=>{
      const count=domainCounts[domain]||0;const spike=this.clientEngine.detectSpike(domain,count);
      const rate=rev&&rev.domainBreakdown&&rev.domainBreakdown[domain]?rev.domainBreakdown[domain].revenue:0;
      const opp=this.clientEngine.generateOpportunity(domain,spike,rate);
      if(opp&&(spike.spiking||opp.urgency==='CRITICAL')){console.log('CLIENT: '+opp.action);this.emit('opportunity',opp);}
    });
  }
  _runHealthCheck(){
    const i=this.ingestionRef?this.ingestionRef.getStats():{totalEvents:0,sources:0,errors:0};
    const r=this.revenueRef?this.revenueRef.getReport():null;
    const h=this.operations.checkHealth(i,r);
    if(h.status!=='NOMINAL')console.log('Health: '+h.status+' — '+h.issues.join(', '));
    console.log('Claude: '+this.claudeMetrics.totalCalls+' calls | '+this.claudeMetrics.totalEventsAnalyzed+' analyzed | '+this.claudeMetrics.errors+' errors');
  }
  async _generateReport(){
    const rev=this.revenueRef?this.revenueRef.getReport():null;
    Object.keys(DOMAIN_PRICING).forEach(domain=>{
      const dr=rev&&rev.domainBreakdown&&rev.domainBreakdown[domain]?rev.domainBreakdown[domain]:{events:0,revenue:0};
      const profile=CLIENT_PROFILES[domain];
      this.reports[domain]={domain,generatedAt:Date.now(),eventsTotal:dr.events||0,revenue:parseFloat((dr.revenue||0).toFixed(2)),clientTarget:profile?profile.type:'Enterprise',status:'READY'};
    });
    try{
      const top=Object.entries(this.reports).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,5).map(function(x){return x[0]+': '+x[1].eventsTotal+' events, $'+x[1].revenue+' revenue';}).join('\n');
      const summary=await callClaude('You are M7 intelligence system. Write executive briefings.','Generate 5-bullet executive briefing:\n'+top+'\n\nFormat: {"briefing":["b1","b2","b3","b4","b5"]}',300);
      const parsed=JSON.parse(summary.replace(/```json|```/g,'').trim());
      if(parsed.briefing){this.reports['_executive_briefing']={generatedAt:Date.now(),bullets:parsed.briefing,aiPowered:true};console.log('Briefing ready');parsed.briefing.forEach(function(b){console.log(' - '+b);});}
    }catch(err){console.log('Reports ready');}
    this.emit('reports_ready',this.reports);
  }
  start(){
    this.isRunning=true;
    const key=process.env.ANTHROPIC_API_KEY;
    console.log(key&&key!=='your_key_here'?'Claude API active — full AI ON':'WARNING: No API key — local scoring only');
    const self=this;
    const burstLoop=function(){if(!self.isRunning)return;self._processBurst();setTimeout(burstLoop,self.loopInterval);};
    setTimeout(burstLoop,this.loopInterval);
    setInterval(function(){if(self.isRunning)self._runClientLoop();},10000);
    setInterval(function(){if(self.isRunning)self._runHealthCheck();},120000);
    setInterval(function(){if(self.isRunning)self._generateReport();},3600000);
    setTimeout(function(){self._generateReport();},30000);
    console.log('M7 AI Brain live');
  }
  stop(){this.isRunning=false;}
  getStatus(){
    return{isRunning:this.isRunning,processedCount:this.processedCount,bufferSize:this.eventBuffer.length,loopInterval:this.loopInterval,speedMetrics:this.speedMetrics,knowledgeBase:Object.keys(this.intelligence.knowledgeBase).length,patterns:this.intelligence.patternMemory.length,threats:this.intelligence.threatLog.slice(-5).reverse(),opportunities:this.clientEngine.getTopOpportunities(5),urgentLeads:this.clientEngine.urgentLeads.slice(-5).reverse(),operations:this.operations.getStatus(),recentDecisions:this.decisionLog.slice(-10).reverse(),aiInsights:this.aiInsights.slice(-10).reverse(),claudeMetrics:this.claudeMetrics,reports:Object.keys(this.reports).filter(function(k){return k!=='_executive_briefing';}).map(function(d){return{domain:d,events:this.reports[d].eventsTotal,revenue:this.reports[d].revenue};}.bind(this)),executiveBriefing:this.reports['_executive_briefing']||null};
  }
}
module.exports=M7AIBrain;
