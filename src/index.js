const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/dashboard.html')));
app.get('/api/status', (req, res) => res.json({ status: 'LIVE', system: 'M7-77', owner: 'SECKA', edab: { totalBilled: 0, totalEvents: 0, streams: { eventProcessing:0, intelligenceLicense:0, dataProduct:0 } }, ingestion: { totalEvents: 0, sources: 33 }, recentEvents: [] }));
app.get('/health', (req, res) => res.json({ status: 'LIVE' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('M7-77 LIVE on port ' + port));
