const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const version = process.argv[2];
if (!['v1', 'v2'].includes(version)) {
  console.error('Usage: node scripts/generate.js v1|v2');
  process.exit(2);
}

const root = path.resolve(__dirname, '..');
const protoDir = path.join(root, 'proto', version);
const proto = path.join(protoDir, 'inventory.proto');
const out = path.join(root, 'generated', version);
fs.mkdirSync(out, { recursive: true });
const generator = require.resolve('@grpc/proto-loader/build/bin/proto-loader-gen-types.js');
execFileSync(process.execPath, [
  generator, '--grpcLib', '@grpc/grpc-js', '--outDir', out,
  '--defaults', '--oneofs', path.relative(root, proto)
], { cwd: root, stdio: 'inherit' });
console.log(`Generated ${version} gRPC client/server TypeScript contracts in generated/${version}`);
