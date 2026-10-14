const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('node:path');
const { reserve } = require('./common');

const protoVersion = process.env.INVENTORY_PROTO_VERSION === 'v1' ? 'v1' : 'v2';
const protoPath = path.resolve(__dirname, `../proto/${protoVersion}/inventory.proto`);
const definition = protoLoader.loadSync(protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true });
const { inventory: { Inventory } } = grpc.loadPackageDefinition(definition);

function Reserve(call, callback) {
  const { sku, quantity } = call.request;
  const delayMs = Math.max(0, Number(call.metadata.get('x-inventory-delay-ms')[0] || 0));
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'inventory', transport: 'gRPC', operation: 'Inventory.Reserve', sku, quantity, delayMs }));
  setTimeout(() => {
    const result = reserve(sku, quantity);
    callback(null, {
      reserved: result.reserved,
      reservationId: result.reservationId,
      available: result.available
    });
  }, delayMs);
}

const server = new grpc.Server();
server.addService(Inventory.service, { Reserve });
const port = Number(process.env.INVENTORY_GRPC_PORT || 50051);
server.bindAsync(`127.0.0.1:${port}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
  if (error) throw error;
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'inventory', transport: 'gRPC', event: 'listening', port: boundPort, schema: protoVersion }));
});
