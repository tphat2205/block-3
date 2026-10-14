const express = require('express');
const { reserve } = require('./common');

const app = express();
app.use(express.json());
app.post('/reservations', async (req, res) => {
  const { sku, quantity } = req.body || {};
  const delayMs = Math.max(0, Number(req.get('x-inventory-delay-ms') || 0));
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'inventory', transport: 'REST', operation: 'POST /reservations', sku, quantity, delayMs }));
  if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
  const result = reserve(sku, quantity);
  res.status(result.error === 'invalid_argument' ? 400 : 200).json({
    reserved: result.reserved,
    reservationId: result.reservationId,
    error: result.error,
    available: result.available
  });
});

const port = Number(process.env.INVENTORY_REST_PORT || 4001);
app.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'inventory', transport: 'REST', event: 'listening', port })));
