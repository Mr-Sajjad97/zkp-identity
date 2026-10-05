const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');

async function getFreePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    listener.once('listening', resolve);
    listener.once('error', reject);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

test('relay never reports an unverified proof as accepted', async (t) => {
  const port = await getFreePort();
  const backendDir = path.resolve(__dirname, '..');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(port), SERVER_URL: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(3000),
    ]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Relay exited before startup: ${stderr}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The child has not started listening yet.
    }
    await delay(100);
  }
  assert.equal(ready, true, `Relay did not become ready: ${stderr}`);

  const created = await fetch(`${baseUrl}/api/start-session?domain=example.com&claim=is_human`);
  assert.equal(created.status, 200);
  const session = await created.json();

  const missingFields = await fetch(`${baseUrl}/zkauth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(missingFields.status, 400);
  assert.equal((await missingFields.json()).error_code, 'MISSING_PROOF');

  const verify = await fetch(`${baseUrl}/zkauth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: session.session_id,
      compressed_proof: 'not-a-real-proof',
      nullifier: 'attacker-chosen-nullifier',
      challenge: session.challenge,
      claim_type: 'is_human',
      input_mode: 'NFC_PASSPORT',
      trust_level: 'MAXIMUM',
    }),
  });
  assert.equal(verify.status, 503);
  assert.deepEqual(await verify.json(), {
    success: false,
    verified: false,
    error: 'Cryptographic proof verification is not configured',
    error_code: 'VERIFIER_UNAVAILABLE',
    message: 'No identity claim is accepted until a server-side Plonky2 verifier is configured.',
  });

  const polled = await fetch(`${baseUrl}/api/poll-status/${session.session_id}`);
  assert.equal((await polled.json()).status, 'pending');

  const legacy = await fetch(`${baseUrl}/api/upload-proof`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: session.session_id,
      proof: 'not-a-real-proof',
      claim_type: 'is_human',
    }),
  });
  assert.equal(legacy.status, 410);
  assert.equal((await legacy.json()).verified, false);

  const stillPending = await fetch(`${baseUrl}/api/poll-status/${session.session_id}`);
  assert.equal((await stillPending.json()).status, 'pending');
});
