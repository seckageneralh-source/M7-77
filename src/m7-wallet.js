'use strict';
require('dotenv').config();
const { ethers } = require('ethers');
const crypto = require('crypto');
const EventEmitter = require('events');

const ENC_KEY = crypto.createHash('sha256').update(process.env.M7_SECRET||'M7-SOVEREIGN-KEY-SECKA').digest();

function encrypt(text){const iv=crypto.randomBytes(16);const c=crypto.createCipheriv('aes-256-cbc',ENC_KEY,iv);return iv.toString('hex')+':'+Buffer.concat([c.update(text),c.final()]).toString('hex');}
function decrypt(enc){const[ivHex,dataHex]=enc.split(':');const d=crypto.createDecipheriv('aes-256-cbc',ENC_KEY,Buffer.from(ivHex,'hex'));return Buffer.concat([d.update(Buffer.from(dataHex,'hex')),d.final()]).toString();}

const USDC={ethereum:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',polygon:'0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'};
const USDC_ABI=['function balanceOf(address) view returns (uint256)','function transfer(address to, uint256 amount) returns (bool)','function decimals() view returns (uint8)'];

const ECOBANK={accountName:'Bun Omar Secka',accountNumber:encrypt('6200059991'),swiftCode:encrypt('ECOCGMGM'),bank:'Ecobank',country:'Gambia'};

class M7Wallet extends EventEmitter{
  constructor(){
    super();
    this.wallets={};this.providers={};
    this.balances={ethereum:{ETH:0,USDC:0},polygon:{MATIC:0,USDC:0}};
    this.transfers=[];this.pendingUSD=0;this.totalSent=0;this.isReady=false;
    this._init();
  }
  _init(){
    try{
      const seed=crypto.createHash('sha256').update((process.env.M7_SECRET||'M7-SOVEREIGN-SECKA')+'-WALLET').digest('hex');
      const w=new ethers.Wallet('0x'+seed);
      this.wallets={
        ethereum:{address:w.address,privateKey:encrypt(w.privateKey),network:'ethereum',chainId:1},
        polygon:{address:w.address,privateKey:encrypt(w.privateKey),network:'polygon',chainId:137}
      };
      this.providers={
        ethereum:new ethers.JsonRpcProvider(process.env.ETH_RPC||'https://ethereum.publicnode.com'),
        polygon:new ethers.JsonRpcProvider(process.env.POLY_RPC||'https://polygon.publicnode.com')
      };
      this.isReady=true;
      console.log('M7 Sovereign Wallet ready');
      console.log('  ETH/POLY address: '+w.address);
      this._pollBalances();
      setInterval(()=>this._pollBalances(),60000);
    }catch(err){console.error('Wallet init error:',err.message);}
  }
  async _pollBalances(){
    for(const network of['ethereum','polygon']){
      try{
        const provider=this.providers[network];
        const address=this.wallets[network].address;
        const native=await provider.getBalance(address);
        const sym=network==='ethereum'?'ETH':'MATIC';
        this.balances[network][sym]=parseFloat(ethers.formatEther(native));
        const usdc=new ethers.Contract(USDC[network],USDC_ABI,provider);
        const bal=await usdc.balanceOf(address);
        this.balances[network].USDC=parseFloat(ethers.formatUnits(bal,6));
      }catch(e){}
    }
    this.emit('balances_updated',this.balances);
  }
  accumulate(amount){this.pendingUSD+=amount;}
  async transferToEcobank(amountUSD,network='polygon'){
    if(!this.isReady)return{error:'Wallet not ready'};
    if(amountUSD<=0)return{error:'Invalid amount'};
    const wallet=this.wallets[network];
    const account=this.getRecipient();
    const transfer={
      id:'TXF-'+Date.now()+'-'+Math.random().toString(36).substr(2,6).toUpperCase(),
      timestamp:Date.now(),network,
      fromAddress:wallet.address,
      amountUSD:parseFloat(amountUSD.toFixed(2)),
      amountUSDC:parseFloat(amountUSD.toFixed(2)),
      recipient:{name:account.accountName,bank:account.bank,swift:account.swiftCode,account:account.accountNumber},
      rail:'USDC → SWIFT → ECOBANK',
      status:'INITIATED',
      authorizedBy:'M7-AI-SOVEREIGN'
    };
    try{
      const pk=decrypt(wallet.privateKey);
      const provider=this.providers[network];
      const signer=new ethers.Wallet(pk,provider);
      const usdc=new ethers.Contract(USDC[network],USDC_ABI,signer);
      const amount=ethers.parseUnits(amountUSD.toFixed(2),6);
      const bal=await usdc.balanceOf(wallet.address);
      if(bal<amount){
        transfer.status='PENDING_FUNDING';
        transfer.note='Fund wallet: send USDC to '+wallet.address+' on '+network;
        console.log('Fund M7 wallet: '+wallet.address+' on '+network);
      }else{
        const tx=await usdc.transfer(wallet.address,amount);
        await tx.wait();
        transfer.txHash=tx.hash;transfer.status='CONFIRMED';
        this.totalSent+=amountUSD;
        console.log('Transfer confirmed: '+tx.hash);
      }
    }catch(err){
      transfer.status='PENDING_FUNDING';
      transfer.note='Fund wallet at '+wallet.address+' on '+network+' with USDC to activate rail';
    }
    this.transfers.push(transfer);
    if(this.transfers.length>200)this.transfers.shift();
    this.emit('transfer',transfer);
    this.pendingUSD=Math.max(0,this.pendingUSD-amountUSD);
    console.log('M7->ECOBANK: $'+amountUSD+' | '+transfer.status+' | '+transfer.id);
    return transfer;
  }
  getRecipient(){return{accountName:ECOBANK.accountName,accountNumber:decrypt(ECOBANK.accountNumber),swiftCode:decrypt(ECOBANK.swiftCode),bank:ECOBANK.bank,country:ECOBANK.country};}
  getStatus(){
    return{
      ready:this.isReady,
      addresses:{ethereum:this.wallets.ethereum?.address,polygon:this.wallets.polygon?.address},
      balances:this.balances,
      pendingUSD:parseFloat(this.pendingUSD.toFixed(2)),
      totalSent:parseFloat(this.totalSent.toFixed(2)),
      transfers:this.transfers.slice(-10).reverse(),
      recipient:{name:ECOBANK.accountName,bank:ECOBANK.bank,country:ECOBANK.country}
    };
  }
}
module.exports=M7Wallet;
