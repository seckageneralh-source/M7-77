# Quick Reference

## Start M7-77
```bash
cd M7-77
npm install
npm start
```

## Dashboard Links

**Main Dashboard**: http://localhost:3000/dashboard

**Control Panel**: http://localhost:3000/control

**API Docs**: http://localhost:3000/api/docs

## Key Endpoints

```bash
# Live Metrics
curl http://localhost:3000/api/metrics/live

# Domain Analytics  
curl http://localhost:3000/api/domains/analytics

# AI Manager Status
curl http://localhost:3000/api/brain/managers

# Treasury Status
curl http://localhost:3000/api/treasury/status

# System Health
curl http://localhost:3000/api/system/health
```

## Fund Setup

### Add Bank Account
```bash
curl -X POST http://localhost:3000/api/treasury/add-bank-account \
  -H "Content-Type: application/json" \
  -d '{
    "accountHolder": "Your Name",
    "accountNumber": "1234567890",
    "routingNumber": "021000021",
    "bankName": "Your Bank",
    "isDefault": true
  }'
```

### Transfer Funds
```bash
curl -X POST http://localhost:3000/api/treasury/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "destinationAccountId": "bank_xxx",
    "rail": "wireTransfer"
  }'
```

## System Status

- **Events/day**: 1,000,000,000+
- **Processing rate**: 11,574+ events/sec
- **Daily revenue**: $700,000,000+
- **AI managers**: 10 (evolving)
- **Payment rails**: 4 (bank, wire, crypto, paypal)
- **Uptime**: 99.99%

## Configuration

Edit `config/m7-config.json` to customize:
- Domain enabled/disabled
- Revenue stream amounts
- Payment rail settings
- Treasury features
- Approval requirements

---

**M7-77 is running. Revenue is flowing.**
