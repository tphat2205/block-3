const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const protobuf = require('protobufjs');

const root = path.resolve(__dirname, '..');
const proto = path.join(root, 'proto/v1/inventory.proto');
const out = path.join(root, 'generated/v1/inventory-descriptor.json');
const descriptor = `${JSON.stringify(protobuf.loadSync(proto).toJSON(), null, 2)}\n`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, descriptor);
const sha256 = crypto.createHash('sha256').update(descriptor).digest('hex');
console.log(`Built frozen v1 descriptor: generated/v1/inventory-descriptor.json (sha256 ${sha256})`);
