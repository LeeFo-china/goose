import { createHash } from 'node:crypto';

import type {
  QueryVirtualGoodsPublishResult,
  QueryVirtualGoodsUploadResult,
} from './wechat-virtual-payment-gateway-contracts';

const POLL_AFTER_MS = 2_000;
const MAX_SECRET_LENGTH = 4_096;

export type VirtualGoodsUploadItemSnapshot = {
  id: string;
  name: string;
  price: number;
  remark: string;
  itemUrl: string;
};

export type VirtualGoodsEvidence = {
  state: 'processing' | 'succeeded' | 'failed' | 'unknown';
  requestId: string | null;
  normalizedResult: Record<string, unknown>;
  failureCode: string | null;
  failureSummary: string | null;
};

export function evaluateUploadEvidence(
  result: QueryVirtualGoodsUploadResult,
  itemSnapshot: VirtualGoodsUploadItemSnapshot,
): VirtualGoodsEvidence {
  const item = result.items.find(
    (candidate) => candidate.id === itemSnapshot.id,
  );
  const normalized = {
    phase: 'upload',
    task_status: result.status,
    item_status: item?.uploadStatus ?? null,
    provider_product_id: item?.id ?? null,
    request_id: result.requestId,
    poll_after_ms: result.status === 1 ? POLL_AFTER_MS : null,
  };

  if (result.status === 1) return processing(result.requestId, normalized);
  if (result.status === 2) {
    return failed(
      result.requestId,
      normalized,
      'VIRTUAL_PRODUCT_WECHAT_UPLOAD_FAILED',
    );
  }
  if (
    result.status === 3 &&
    item &&
    item.uploadStatus === 2 &&
    item.name === itemSnapshot.name &&
    item.price === itemSnapshot.price &&
    item.remark === itemSnapshot.remark &&
    item.itemUrl === itemSnapshot.itemUrl
  ) {
    return succeeded(result.requestId, normalized);
  }
  return unknown(result.requestId, normalized);
}

export function evaluatePublishEvidence(
  result: QueryVirtualGoodsPublishResult,
  itemSnapshot: Pick<VirtualGoodsUploadItemSnapshot, 'id'>,
): VirtualGoodsEvidence {
  const item = result.items.find(
    (candidate) => candidate.id === itemSnapshot.id,
  );
  const normalized = {
    phase: 'publish',
    task_status: result.status,
    item_status: item?.publishStatus ?? null,
    provider_product_id: item?.id ?? null,
    request_id: result.requestId,
    poll_after_ms: result.status === 1 ? POLL_AFTER_MS : null,
  };

  if (result.status === 1) return processing(result.requestId, normalized);
  if (result.status === 2) {
    return failed(
      result.requestId,
      normalized,
      'VIRTUAL_PRODUCT_WECHAT_PUBLISH_FAILED',
    );
  }
  if (result.status === 3 && item && item.publishStatus === 2) {
    return succeeded(result.requestId, normalized);
  }
  return unknown(result.requestId, normalized);
}

export function hashVirtualGoodsSnapshot(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

export function parseWechatVirtualPaymentSecretBundle(value: string): {
  appKey: string;
  revision: number;
} | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    const keys = Object.keys(parsed);
    if (
      keys.length !== 2 ||
      !keys.includes('appKey') ||
      !keys.includes('revision')
    ) {
      return null;
    }
    if (
      typeof parsed.appKey !== 'string' ||
      !parsed.appKey.trim() ||
      parsed.appKey.length > MAX_SECRET_LENGTH ||
      !Number.isSafeInteger(parsed.revision) ||
      Number(parsed.revision) <= 0
    ) {
      return null;
    }
    return { appKey: parsed.appKey, revision: Number(parsed.revision) };
  } catch {
    return null;
  }
}

function processing(
  requestId: string | null,
  normalizedResult: Record<string, unknown>,
): VirtualGoodsEvidence {
  return {
    state: 'processing',
    requestId,
    normalizedResult,
    failureCode: null,
    failureSummary: null,
  };
}

function succeeded(
  requestId: string | null,
  normalizedResult: Record<string, unknown>,
): VirtualGoodsEvidence {
  return {
    state: 'succeeded',
    requestId,
    normalizedResult,
    failureCode: null,
    failureSummary: null,
  };
}

function failed(
  requestId: string | null,
  normalizedResult: Record<string, unknown>,
  failureCode: string,
): VirtualGoodsEvidence {
  return {
    state: 'failed',
    requestId,
    normalizedResult,
    failureCode,
    failureSummary: '微信商品操作失败',
  };
}

function unknown(
  requestId: string | null,
  normalizedResult: Record<string, unknown>,
): VirtualGoodsEvidence {
  return {
    state: 'unknown',
    requestId,
    normalizedResult,
    failureCode: 'VIRTUAL_PRODUCT_REMOTE_GOODS_MISMATCH',
    failureSummary: '微信返回的商品任务与本地商品不一致',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
