const grpc = require('@grpc/grpc-js');
const protobuf = require('protobufjs');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Frozen compatibility client: runtime reads only the v1 build artifact.
const CLIENT_VERSION = 'order-client-proto-v1';
const descriptorPath = path.resolve(__dirname, '../generated/v1/inventory-descriptor.json');
const descriptorBytes = fs.readFileSync(descriptorPath);
const artifactSha256 = crypto.createHash('sha256').update(descriptorBytes).digest('hex');
const root = protobuf.Root.fromJSON(JSON.parse(descriptorBytes.toString('utf8')));
const requestType = root.lookupType('inventory.ReserveRequest');
const replyType = root.lookupType('inventory.ReserveReply');
const Inventory = grpc.makeGenericClientConstructor({
  Reserve: {
    path: '/inventory.Inventory/Reserve',
    requestStream: false,
    responseStream: false,
    requestSerialize: value => Buffer.from(requestType.encode(requestType.fromObject(value)).finish()),
    requestDeserialize: bytes => requestType.toObject(requestType.decode(bytes), { defaults: true }),
    responseSerialize: value => Buffer.from(replyType.encode(replyType.fromObject(value)).finish()),
    responseDeserialize: bytes => replyType.toObject(replyType.decode(bytes), { defaults: true })
  }
}, 'Inventory');
const client = new Inventory(process.env.INVENTORY_GRPC_TARGET || '127.0.0.1:50051', grpc.credentials.createInsecure());
const metadata = new grpc.Metadata();
client.Reserve({ sku: 'SKU-AVAILABLE', quantity: 2 }, metadata, { deadline: Date.now() + 1000 }, (error, reply) => {
  if (error) {
    console.error(JSON.stringify({ clientVersion: CLIENT_VERSION, artifactSha256, error: error.message, code: grpc.status[error.code] }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ clientVersion: CLIENT_VERSION, artifactSha256, result: reply }));
  }
  client.close();
});
