import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const CODE = process.env.SIM_ACCESS_CODE;

test('T1.5 POST /sim/chat without the access code returns 401', async () => {
  const r = await fetch(`${BASE}/sim/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 't', utterance: 'ping' }),
  });
  assert.equal(r.status, 401);
});

test('T1.6 "ping" through the simulator calls the ping tool', { skip: !CODE && 'SIM_ACCESS_CODE not set' }, async () => {
  const r = await fetch(`${BASE}/sim/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sim-code': CODE! },
    body: JSON.stringify({ sessionId: crypto.randomUUID(), utterance: 'ping' }),
  });
  assert.equal(r.status, 200, await r.text());
  const body = await r.json();
  assert.ok(body.toolCalls.some((c: { name: string }) => c.name === 'ping'), JSON.stringify(body));
  assert.match(body.say.toLowerCase(), /concierge online|online/);
});
