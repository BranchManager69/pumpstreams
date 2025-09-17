import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentlyLive,
  getLivestreamSnapshot,
  getJoinToken,
  getLivekitRegions,
  decodeJwt,
} from '../lib/livestream-api.js';

const TEST_LIMIT = Number(process.env.PUMPSTREAMS_TEST_LIMIT || '3');
const STREAM_TIMEOUT = Number(process.env.PUMPSTREAMS_TEST_TIMEOUT || '60000');

function assertIsNonEmptyString(value, name) {
  assert.equal(typeof value, 'string', `${name} should be a string`);
  assert.ok(value.length > 0, `${name} should not be empty`);
}

const liveRosterTest = test('live roster endpoint returns data', { timeout: STREAM_TIMEOUT }, async (t) => {
  const roster = await getCurrentlyLive({ limit: TEST_LIMIT });
  t.diagnostic(`Fetched ${roster.length} entries`);
  assert.ok(Array.isArray(roster));
  if (roster.length > 0) {
    const first = roster[0];
    assertIsNonEmptyString(first.mint, 'mint');
    assert.ok(typeof first.num_participants === 'number' || first.num_participants === null || first.num_participants === undefined);
  }
});

await liveRosterTest;

const roster = await getCurrentlyLive({ limit: TEST_LIMIT });

if (roster.length === 0) {
  test('livestream snapshot skipped (no live streams)', () => {
    throw new test.SkipTest('No live streams available to validate snapshot.');
  });
  test('join token skipped (no live streams)', () => {
    throw new test.SkipTest('No live streams available to validate join token.');
  });
  test('LiveKit regions skipped (no live streams)', () => {
    throw new test.SkipTest('No live streams available to validate regions.');
  });
} else {
  const target = roster[0];
  const mintId = target.mint;

  test('livestream snapshot provides metadata and optional clips', { timeout: STREAM_TIMEOUT }, async (t) => {
    const snapshot = await getLivestreamSnapshot(mintId, {
      includeClips: true,
      includeToken: true,
    });

    assert.equal(snapshot.mintId, mintId);
    assert.ok(snapshot.livestream, 'Expected livestream metadata');
    assert.equal(snapshot.livestream.mintId, mintId);
    assert.ok(typeof snapshot.isApprovedCreator === 'boolean');

    if (Array.isArray(snapshot.clips)) {
      t.diagnostic(`Clips returned: ${snapshot.clips.length}`);
    }

    assert.ok(snapshot.join?.token, 'Expected LiveKit token inside snapshot');
  });

  test('join token decodes and matches LiveKit room', { timeout: STREAM_TIMEOUT }, async () => {
    const payload = await getJoinToken(mintId);
    assertIsNonEmptyString(payload.token, 'token');
    assert.equal(payload.role, 'viewer');

    const decoded = decodeJwt(payload.token);
    assert.ok(decoded, 'Decoded JWT payload');
    assert.ok(decoded.video?.room?.includes(mintId), 'LiveKit room should reference mint');
  });

  test('LiveKit regions available for viewer token', { timeout: STREAM_TIMEOUT }, async () => {
    const { token } = await getJoinToken(mintId);
    const regions = await getLivekitRegions(token);
    assert.ok(Array.isArray(regions));
    assert.ok(regions.length > 0, 'Expected at least one LiveKit region');
  });
}
