import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { lamportsFrom, formatSol, lamportsToNumber } from '../lib/token-math.js';
import { buildJsonFileName, resolveOutputTarget, sanitizeLabel, writeJsonFile, toJson } from '../lib/io-utils.js';

const fixtureUrl = new URL('../fixtures/trade-sample.json', import.meta.url);

function almostEqual(a, b, tolerance = 1e-9) {
  return Math.abs(a - b) <= tolerance;
}

test('token math utilities preserve precision for recorded trade', async () => {
  const sample = JSON.parse(await fs.readFile(fixtureUrl, 'utf8'));
  const lamports = lamportsFrom(sample.sol_amount);

  assert.equal(typeof lamports, 'bigint');
  assert.equal(lamports, BigInt(sample.sol_amount));

  const formatted = formatSol(lamports, { decimals: 6 });
  assert.equal(formatted, '3.456789');

  const numeric = lamportsToNumber(lamports);
  assert.ok(almostEqual(numeric, 3.456789012), 'lamportsToNumber should preserve SOL precision for comparison');

  const decimalInput = lamportsFrom('1.250000001');
  assert.equal(decimalInput, 1_250_000_001n);
});

test('I/O helpers generate predictable filenames and write JSON', async (t) => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pumpstreams-'));
  t.after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const label = sanitizeLabel('Mint!@#', { fallback: 'mint', maxLength: 12 });
  assert.equal(label, 'Mint');

  const fileName = buildJsonFileName({
    prefix: 'snapshot',
    label,
    fallbackLabel: 'mint',
    timestamp: '2025-01-01T00:00:00.000Z',
  });

  assert.equal(fileName.startsWith('snapshot-'), true);
  assert.ok(fileName.endsWith('.json'));

  const targetDir = path.join(tmpRoot, 'snapshots');
  const targetPath = await resolveOutputTarget(targetDir + path.sep, fileName);
  assert.equal(targetPath, path.join(targetDir, fileName));

  const payload = { hello: 'world', when: '2025-01-01T00:00:00.000Z' };
  const json = await writeJsonFile(targetPath, payload);
  assert.equal(json, toJson(payload));

  const disk = JSON.parse(await fs.readFile(targetPath, 'utf8'));
  assert.deepEqual(disk, payload);
});
