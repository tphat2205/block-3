const express = require('express');
const crypto = require('node:crypto');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('node:path');

const mode = process.argv[2] || 'grpc';
if (!['rest', 'grpc'].includes(mode)) throw new Error('Usage: node src/order-api.js rest|grpc');
const deadlineMs = Number(process.env.GRPC_DEADLINE_MS || 500);
const restTarget = process.env.INVENTORY_REST_URL || 'http://127.0.0.1:4001';
const grpcTarget = process.env.INVENTORY_GRPC_TARGET || '127.0.0.1:50051';
let inventoryClient;
if (mode === 'grpc') {
  const definition = protoLoader.loadSync(path.resolve(__dirname, '../proto/v2/inventory.proto'), {
    keepCase: false, longs: String, enums: String, defaults: true, oneofs: true
  });
  const { inventory: { Inventory } } = grpc.loadPackageDefinition(definition);
  inventoryClient = new Inventory(grpcTarget, grpc.credentials.createInsecure());
}

function reserveGrpc(sku, quantity, delayMs) {
  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    if (delayMs) metadata.set('x-inventory-delay-ms', String(delayMs));
    inventoryClient.Reserve({ sku, quantity }, metadata, { deadline: Date.now() + deadlineMs }, (error, reply) => {
      if (error) reject(error); else resolve(reply);
    });
  });
}

async function reserveRest(sku, quantity, delayMs) {
  const response = await fetch(`${restTarget}/reservations`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-inventory-delay-ms': String(delayMs) },
    body: JSON.stringify({ sku, quantity }), signal: AbortSignal.timeout(deadlineMs)
  });
  if (!response.ok) throw Object.assign(new Error(`Inventory HTTP ${response.status}`), { code: response.status === 400 ? 'INVALID_ARGUMENT' : 'UNAVAILABLE' });
  return response.json();
}

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../public')));
app.post('/orders', async (req, res) => {
  const startedAt = new Date().toISOString();
  const { sku, quantity } = req.body || {};
  if (typeof sku !== 'string' || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'invalid_argument' });
  }
  const delayMs = Math.max(0, Number(req.get('x-inventory-delay-ms') || 0));
  console.log(JSON.stringify({ timestamp: startedAt, service: 'order-api', transport: mode === 'grpc' ? 'gRPC' : 'REST', operation: 'Reserve', sku, quantity, deadlineMs: mode === 'grpc' ? deadlineMs : null }));
  try {
    const result = mode === 'grpc'
      ? await reserveGrpc(sku, quantity, delayMs)
      : await reserveRest(sku, quantity, delayMs);
    if (!result.reserved) {
      return res.status(409).json({ error: 'out_of_stock' });
    }
    return res.status(201).json({ orderId: `ord-${crypto.randomUUID()}`, reservationId: result.reservationId });
  } catch (error) {
    const code = error.code;
    const status = code === grpc.status.DEADLINE_EXCEEDED || error.name === 'TimeoutError' ? 504
      : code === grpc.status.UNAVAILABLE || code === 'UNAVAILABLE' ? 503
      : code === grpc.status.INVALID_ARGUMENT || code === 'INVALID_ARGUMENT' ? 400 : 502;
    const body = { error: status === 504 ? 'inventory_timeout' : status === 503 ? 'inventory_unavailable' : status === 400 ? 'invalid_argument' : 'inventory_error' };
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'order-api', event: 'inventory_error', grpcCode: typeof code === 'number' ? grpc.status[code] : code, httpStatus: status }));
    return res.status(status).json(body);
  }
});

const port = Number(process.env.ORDER_PORT || 3000);
app.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'order-api', transport: mode === 'grpc' ? 'gRPC' : 'REST', event: 'listening', port, deadlineMs })));
