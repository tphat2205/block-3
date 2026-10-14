const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
const processes = [];
const logs = { baseline: { inventory: '', order: '' }, grpc: { inventory: '', order: '' } };

function launch(label, relativeScript, args = [], env = {}) {
  const child = spawn(process.execPath, [path.join(root, relativeScript), ...args], {
    cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe']
  });
  processes.push(child);
  const ready = new Promise((resolve, reject) => {
    let buffer = '';
    const onData = chunk => {
      const value = chunk.toString();
      logs[label][relativeScript.includes('inventory') ? 'inventory' : 'order'] += value;
      buffer += value;
      if (buffer.includes('"event":"listening"')) resolve();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { logs[label][relativeScript.includes('inventory') ? 'inventory' : 'order'] += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`${relativeScript} exited early (${code})`)));
    setTimeout(() => reject(new Error(`${relativeScript} did not start within 15 seconds; output: ${buffer}`)), 15000).unref();
  });
  return { child, ready };
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1000)]);
}

async function requestOrder(label, body, headers = {}) {
  const started = new Date().toISOString();
  const start = performance.now();
  const response = await fetch('http://127.0.0.1:3000/orders', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(1800)
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { label, timestamp: started, elapsedMs: Math.round(performance.now() - start), status: response.status, body: parsed };
}

function normalize(result) {
  const body = structuredClone(result.body);
  if (body && typeof body === 'object') {
    if (body.orderId) body.orderId = '<ORDER_ID>';
    if (body.reservationId) body.reservationId = '<RESERVATION_ID>';
  }
  return { status: result.status, body };
}

function summarizeTimings(runs) {
  const values = runs.map(run => run.elapsedMs).sort((a, b) => a - b);
  return { count: values.length, medianMs: values[Math.floor(values.length / 2)], minMs: values[0], maxMs: values[values.length - 1] };
}

async function runClient(relativeScript) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, relativeScript)], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk.toString());
    child.stderr.on('data', chunk => stderr += chunk.toString());
    child.once('exit', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `${relativeScript} exited ${code}`)));
  });
}

(async () => {
  const result = { decision: 'Fixture stock is deterministic and does not decrement between requests.', baseline: {}, grpc: {}, payload: {} };
  let inventory, order;
  try {
    inventory = launch('baseline', 'src/inventory-rest.js'); await inventory.ready;
    order = launch('baseline', 'src/order-api.js', ['rest']); await order.ready;
    result.baseline.success = await requestOrder('available', { sku: 'SKU-AVAILABLE', quantity: 2 });
    result.baseline.shortage = await requestOrder('out-of-stock', { sku: 'SKU-LIMITED', quantity: 2 });
    await stop(order.child); await stop(inventory.child);

    inventory = launch('grpc', 'src/inventory-grpc.js'); await inventory.ready;
    order = launch('grpc', 'src/order-api.js', ['grpc']); await order.ready;
    const page = await fetch('http://127.0.0.1:3000/');
    result.browserPage = { status: page.status, htmlTitlePresent: (await page.text()).includes('Đặt hàng | REST và gRPC') };
    result.grpc.success = await requestOrder('available', { sku: 'SKU-AVAILABLE', quantity: 2 });
    result.grpc.shortage = await requestOrder('out-of-stock', { sku: 'SKU-LIMITED', quantity: 2 });
    result.grpc.slowInventoryRuns = [];
    for (let i = 0; i < 5; i++) result.grpc.slowInventoryRuns.push(await requestOrder('slow-inventory', { sku: 'SKU-AVAILABLE', quantity: 2 }, { 'x-inventory-delay-ms': '900' }));
    result.grpc.slowInventoryTiming = summarizeTimings(result.grpc.slowInventoryRuns);
    result.grpc.legacyClient = JSON.parse(await runClient('clients/legacy-client.js'));
    result.grpc.currentClient = JSON.parse(await runClient('clients/current-client.js'));
    await stop(order.child);
    order = launch('grpc', 'src/order-api.js', ['grpc'], { INVENTORY_GRPC_TARGET: '127.0.0.1:59999' }); await order.ready;
    result.grpc.inventoryUnavailableRuns = [];
    for (let i = 0; i < 5; i++) result.grpc.inventoryUnavailableRuns.push(await requestOrder('inventory-unavailable', { sku: 'SKU-AVAILABLE', quantity: 2 }));
    result.grpc.inventoryUnavailableTiming = summarizeTimings(result.grpc.inventoryUnavailableRuns);
    await stop(order.child);
    await stop(inventory.child);
    inventory = launch('grpc', 'src/inventory-grpc.js', [], { INVENTORY_PROTO_VERSION: 'v1' }); await inventory.ready;
    result.grpc.currentClientAgainstOldServer = JSON.parse(await runClient('clients/current-client.js'));

    result.snapshots = {
      baseline: { success: normalize(result.baseline.success), shortage: normalize(result.baseline.shortage) },
      grpc: { success: normalize(result.grpc.success), shortage: normalize(result.grpc.shortage) }
    };
    const protobuf = require('protobufjs');
    const protoRoot = protobuf.loadSync(path.join(root, 'proto/v2/inventory.proto'));
    const RequestMessage = protoRoot.lookupType('inventory.ReserveRequest');
    const logical = { sku: 'SKU-AVAILABLE', quantity: 2 };
    const jsonPayload = Buffer.from(JSON.stringify(logical), 'utf8');
    const protobufPayload = RequestMessage.encode(RequestMessage.create(logical)).finish();
    result.payload = {
      definition: 'Serialized application message bytes; excludes transport framing, headers, and network overhead.',
      request: logical,
      restJsonUtf8Bytes: jsonPayload.length,
      grpcProtobufSerializedBytes: protobufPayload.length,
      grpcProtobufHex: Buffer.from(protobufPayload).toString('hex')
    };
    result.capturedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidenceDir, 'demo-run.json'), `${JSON.stringify(result, null, 2)}\n`);
    for (const [label, groups] of Object.entries(logs)) for (const [service, content] of Object.entries(groups)) {
      fs.writeFileSync(path.join(evidenceDir, `${label}-${service}.log`), content);
    }
    console.log(JSON.stringify({ evidence: 'evidence/demo-run.json', snapshotsMatch: JSON.stringify(result.snapshots.baseline) === JSON.stringify(result.snapshots.grpc), results: { success: result.grpc.success, shortage: result.grpc.shortage, slowInventoryTiming: result.grpc.slowInventoryTiming, legacyClient: result.grpc.legacyClient, currentClient: result.grpc.currentClient, inventoryUnavailableTiming: result.grpc.inventoryUnavailableTiming, currentClientAgainstOldServer: result.grpc.currentClientAgainstOldServer } }, null, 2));
  } finally {
    for (const child of processes.reverse()) await stop(child);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
