import { expect, test } from 'bun:test';
import { clearRenderingRecovery, readRenderingRecovery, writeRenderingRecovery, recoveryIdentityFromToken,
  type RenderingRecoveryStorage } from './rendering-recovery';

const STYLE = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';
const KEY = '33333333-3333-4333-8333-333333333333';
const OWNER = { tenantId: STYLE, appId: 'tt-app', installationId: ROOM, subjectHash: 'a'.repeat(64) };
const OTHER = { ...OWNER, subjectHash: 'b'.repeat(64) };

test('persists opaque upload IDs and the exact job idempotency request for re-entry', () => {
  const values = new Map<string, unknown>();
  const storage: RenderingRecoveryStorage = {
    read: (key) => values.get(key), write: (key, value) => { values.set(key, value); },
    remove: (key) => { values.delete(key); },
  };
  const record = { styleId: STYLE, roomIntentId: ROOM, floorIntentId: null,
    roomFileId: ROOM, floorFileId: null, jobId: null, savedAt: 1_000,
    jobRequest: { style_asset_id: STYLE, room_file_id: ROOM, space: 'living_room' as const,
      mode: 'soft_furnishing' as const, idempotency_key: KEY } };
  expect(writeRenderingRecovery(OWNER, record, storage)).toBe(true);
  expect(readRenderingRecovery(OWNER, STYLE, storage, 1_001)).toEqual(record);
  expect(readRenderingRecovery(OTHER, STYLE, storage, 1_001)).toBeNull();
  expect(readRenderingRecovery({ ...OWNER, appId: 'tt-other' }, STYLE, storage, 1_001)).toBeNull();
  expect(readRenderingRecovery({ ...OWNER, installationId: KEY }, STYLE, storage, 1_001)).toBeNull();
  expect(readRenderingRecovery({ ...OWNER, tenantId: KEY }, STYLE, storage, 1_001)).toBeNull();
  expect(JSON.stringify([...values.values()])).not.toContain('upload_url');
});

test('rejects expired or malformed state before replaying a paid request', () => {
  const values = new Map<string, unknown>();
  const storage: RenderingRecoveryStorage = {
    read: (key) => values.get(key), write: (key, value) => { values.set(key, value); },
    remove: (key) => { values.delete(key); },
  };
  const record = { styleId: STYLE, roomIntentId: null, floorIntentId: null,
    roomFileId: ROOM, floorFileId: null, jobId: null, savedAt: 1_000,
    jobRequest: { style_asset_id: STYLE, room_file_id: ROOM, space: 'living_room' as const,
      mode: 'soft_furnishing' as const, idempotency_key: KEY } };
  writeRenderingRecovery(OWNER, record, storage);
  expect(readRenderingRecovery(OWNER, STYLE, storage, 1_000 + 8 * 24 * 60 * 60_000)).toBeNull();
  values.set(`gooes_douyin_rendering_recovery_v1_${STYLE}`, { ...record,
    jobRequest: { ...record.jobRequest, room_file_id: 'bad' } });
  expect(readRenderingRecovery(OWNER, STYLE, storage, 1_001)).toBeNull();
  expect(values.has(`gooes_douyin_rendering_recovery_v1_${STYLE}`)).toBe(false);
});

test('stable identity survives token rotation and rejects missing owner claims', () => {
  const payload = { token_type: 'douyin_miniapp', sub: 'a'.repeat(64), tenant_id: STYLE, douyin_app_id: 'tt-app',
    douyin_installation_id: ROOM, subject_hash: 'a'.repeat(64) };
  const token = (claims: object, signature: string) => `header.${btoa(JSON.stringify(claims))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.${signature}`;
  expect(recoveryIdentityFromToken(token({ ...payload, iat: 1 }, 'one'))).toEqual(OWNER);
  expect(recoveryIdentityFromToken(token({ ...payload, iat: 2 }, 'two'))).toEqual(OWNER);
  expect(recoveryIdentityFromToken(token({ ...payload, subject_hash: undefined }, 'two'))).toBeNull();
  expect(recoveryIdentityFromToken(token(payload, ''))).toBeNull();
});

test('decodes JWT scope without browser atob support', () => {
  const payload = { token_type: 'douyin_miniapp', sub: OWNER.subjectHash,
    tenant_id: OWNER.tenantId, douyin_app_id: OWNER.appId,
    douyin_installation_id: OWNER.installationId, subject_hash: OWNER.subjectHash };
  const token = `header.${btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
  const originalAtob = globalThis.atob;
  try {
    globalThis.atob = undefined as never;
    expect(recoveryIdentityFromToken(token)).toEqual(OWNER);
  } finally { globalThis.atob = originalAtob; }
});

test('clears legacy unscoped state even when identity cannot be confirmed', () => {
  const values = new Map<string, unknown>([[`gooes_douyin_rendering_recovery_v1_${STYLE}`, { private: true }]]);
  const storage: RenderingRecoveryStorage = { read: (key) => values.get(key),
    write: (key, value) => { values.set(key, value); }, remove: (key) => { values.delete(key); } };
  clearRenderingRecovery(null, STYLE, storage);
  expect(values.size).toBe(0);
});
