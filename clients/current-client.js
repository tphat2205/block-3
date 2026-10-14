const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('node:path');

const definition = protoLoader.loadSync(path.resolve(__dirname, '../proto/v2/inventory.proto'), {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true
});
const { inventory: { Inventory } } = grpc.loadPackageDefinition(definition);
const client = new Inventory(process.env.INVENTORY_GRPC_TARGET || '127.0.0.1:50051', grpc.credentials.createInsecure());
client.Reserve({ sku: 'SKU-AVAILABLE', quantity: 2 }, { deadline: Date.now() + 1000 }, (error, reply) => {
  if (error) {
    console.error(error);
    process.exitCode = 1;
  } else {
    const availablePresent = reply._available === 'available';
    console.log(JSON.stringify({ clientVersion: 'order-client-proto-v2', reserved: reply.reserved, available: availablePresent ? reply.available : null, availableState: availablePresent ? 'present' : 'absent' }));
  }
  client.close();
});
