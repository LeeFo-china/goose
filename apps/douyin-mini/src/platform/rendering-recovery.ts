import { normalizeMaterialUuid } from '../api/material-uuid';
import type { RenderingJobRequest } from '../api/rendering-jobs';

const LEGACY_PREFIX = 'gooes_douyin_rendering_recovery_v1_';
const PREFIX = 'gooes_douyin_rendering_recovery_v2_';
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export type RenderingRecoveryIdentity = {
  tenantId: string;
  appId: string;
  installationId: string;
  subjectHash: string;
};

// The server verifies the bearer token. This parser only names local recovery data.
export function recoveryIdentityFromToken(token: string): RenderingRecoveryIdentity | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]
    || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])
    || parts[1].length > 4096) return null;
  try {
    const decoded = decodeBase64UrlAscii(parts[1]);
    if (!decoded) return null;
    const payload: unknown = JSON.parse(decoded);
    if (!isRecord(payload) || payload.token_type !== 'douyin_miniapp'
      || payload.sub !== payload.subject_hash) return null;
    const identity = { tenantId: payload.tenant_id, appId: payload.douyin_app_id,
      installationId: payload.douyin_installation_id, subjectHash: payload.subject_hash };
    return identityKey(identity) ? identity as RenderingRecoveryIdentity : null;
  } catch { return null; }
}

function decodeBase64UrlAscii(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let decoded = '';
  for (let index = 0; index < encoded.length; index += 4) {
    const a = alphabet.indexOf(encoded[index]);
    const b = alphabet.indexOf(encoded[index + 1]);
    const c = encoded[index + 2] ? alphabet.indexOf(encoded[index + 2]) : 0;
    const d = encoded[index + 3] ? alphabet.indexOf(encoded[index + 3]) : 0;
    if (a < 0 || b < 0 || c < 0 || d < 0) return null;
    decoded += String.fromCharCode((a << 2) | (b >> 4));
    if (encoded[index + 2]) decoded += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (encoded[index + 3]) decoded += String.fromCharCode(((c & 3) << 6) | d);
  }
  return decoded;
}

export function identityKey(value: unknown): string | null {
  if (!isRecord(value) || !normalizeMaterialUuid(value.tenantId)
    || !normalizeMaterialUuid(value.installationId)
    || typeof value.appId !== 'string' || value.appId.length < 1 || value.appId.length > 128
    || value.appId.trim() !== value.appId
    || typeof value.subjectHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.subjectHash)) return null;
  return `${value.tenantId}_${encodeURIComponent(value.appId)}_${value.installationId}_${value.subjectHash}`;
}

export type RenderingRecoveryRecord = {
  styleId: string;
  roomIntentId: string | null;
  floorIntentId: string | null;
  roomFileId: string | null;
  floorFileId: string | null;
  jobRequest: RenderingJobRequest | null;
  jobId: string | null;
  savedAt: number;
};

export interface RenderingRecoveryStorage {
  read(key: string): unknown;
  write(key: string, value: unknown): void;
  remove(key: string): void;
}

const douyinStorage: RenderingRecoveryStorage = {
  read: (key) => tt.getStorageSync(key) as unknown,
  write: (key, value) => tt.setStorageSync(key, value),
  remove: (key) => tt.removeStorageSync(key),
};

export function readRenderingRecovery(identity: RenderingRecoveryIdentity, styleId: string,
  storage: RenderingRecoveryStorage = douyinStorage, now = Date.now()): RenderingRecoveryRecord | null {
  const id = normalizeMaterialUuid(styleId);
  if (!id) return null;
  try { storage.remove(`${LEGACY_PREFIX}${id}`); } catch { /* Best effort legacy cleanup. */ }
  const scope = identityKey(identity);
  if (!scope) return null;
  const key = `${PREFIX}${scope}_${id}`;
  try {
    const record = parseRecord(storage.read(key));
    if (record && record.styleId === id && record.savedAt <= now && now - record.savedAt <= MAX_AGE_MS) return record;
    storage.remove(key);
  } catch { /* Storage is optional; never replay an unverified request. */ }
  return null;
}

export function writeRenderingRecovery(identity: RenderingRecoveryIdentity, record: RenderingRecoveryRecord,
  storage: RenderingRecoveryStorage = douyinStorage): boolean {
  const parsed = parseRecord(record);
  const scope = identityKey(identity);
  if (!parsed || !scope) return false;
  try {
    storage.remove(`${LEGACY_PREFIX}${parsed.styleId}`);
    storage.write(`${PREFIX}${scope}_${parsed.styleId}`, parsed);
    return true;
  }
  catch { return false; }
}

export function clearRenderingRecovery(identity: RenderingRecoveryIdentity | null, styleId: string,
  storage: RenderingRecoveryStorage = douyinStorage): void {
  const id = normalizeMaterialUuid(styleId);
  if (!id) return;
  const scope = identityKey(identity);
  try {
    storage.remove(`${LEGACY_PREFIX}${id}`);
    if (scope) storage.remove(`${PREFIX}${scope}_${id}`);
  } catch { /* Best effort local cleanup. */ }
}

function parseRecord(value: unknown): RenderingRecoveryRecord | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['styleId', 'roomIntentId', 'floorIntentId',
    'roomFileId', 'floorFileId', 'jobRequest', 'jobId', 'savedAt'])
    || !normalizeMaterialUuid(value.styleId) || !isNullableId(value.roomIntentId)
    || !isNullableId(value.floorIntentId) || !isNullableId(value.roomFileId)
    || !isNullableId(value.floorFileId) || !isNullableId(value.jobId)
    || typeof value.savedAt !== 'number' || !Number.isSafeInteger(value.savedAt) || value.savedAt < 0) return null;
  const jobRequest = parseJobRequest(value.jobRequest, value.styleId, value.roomFileId, value.floorFileId);
  if (value.jobRequest !== null && !jobRequest || value.jobId !== null && !jobRequest) return null;
  return {
    styleId: value.styleId, roomIntentId: value.roomIntentId, floorIntentId: value.floorIntentId,
    roomFileId: value.roomFileId, floorFileId: value.floorFileId,
    jobRequest, jobId: value.jobId, savedAt: value.savedAt,
  } as RenderingRecoveryRecord;
}

function parseJobRequest(value: unknown, styleId: unknown, roomFileId: unknown,
  floorFileId: unknown): RenderingJobRequest | null {
  if (value === null) return null;
  if (!isRecord(value) || !hasOnlyKeys(value, ['style_asset_id', 'room_file_id',
    'floor_plan_file_id', 'space', 'mode', 'keep_notes', 'idempotency_key'])
    || value.style_asset_id !== styleId || value.room_file_id !== roomFileId
    || !normalizeMaterialUuid(value.room_file_id) || !normalizeMaterialUuid(value.idempotency_key)
    || !(value.floor_plan_file_id === undefined
      || typeof floorFileId === 'string' && value.floor_plan_file_id === floorFileId)
    || !['living_room', 'bedroom'].includes(String(value.space))
    || !['soft_furnishing', 'renovation'].includes(String(value.mode))
    || !(value.keep_notes === undefined || typeof value.keep_notes === 'string'
      && value.keep_notes.length <= 300 && value.keep_notes.trim() === value.keep_notes)) return null;
  return value as RenderingJobRequest;
}

function isNullableId(value: unknown): value is string | null {
  return value === null || Boolean(normalizeMaterialUuid(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
