import {
  ApplymentDraftSaveCancelledError,
  type ApplymentDraftSavePayload,
  type ApplymentDraftSaveQueue,
} from "./finance-wechat-pay-applyment-autosave";

const DEFAULT_AUTOSAVE_DELAY_MS = 800;
const MAX_KEEPALIVE_BODY_BYTES = 60 * 1024;

type RequestInit = {
  method?: "POST" | "PUT";
  body?: string;
  fallbackMessage?: string;
  keepalive?: boolean;
};

type ApplymentDetail<Draft> = {
  applyment: Draft | null;
  can_edit?: boolean;
  can_submit?: boolean;
};

export class ApplymentDraftRevisionAllocator {
  private revision: number;

  constructor(serverRevision = 0) {
    this.revision = normalizeDraftRevision(serverRevision);
  }

  allocate(
    payload: ApplymentDraftSavePayload,
  ): ApplymentDraftSavePayload {
    this.revision += 1;
    return {
      ...payload,
      draft_revision: this.revision,
    };
  }

  preserve(
    payload: ApplymentDraftSavePayload,
  ): ApplymentDraftSavePayload {
    return payload;
  }

  absorb(serverRevision: number | null | undefined): void {
    this.revision = Math.max(
      this.revision,
      normalizeDraftRevision(serverRevision),
    );
  }

  reset(serverRevision = 0): void {
    this.revision = normalizeDraftRevision(serverRevision);
  }
}

export class ApplymentDraftAutosaveCoordinator {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scheduledPayload: ApplymentDraftSavePayload | null = null;
  private latestPayload: ApplymentDraftSavePayload | null = null;
  private disposed = false;
  private detaching = false;
  private detachPromise: Promise<void> | null = null;

  constructor(
    private readonly queue: ApplymentDraftSaveQueue,
    private readonly delayMs = DEFAULT_AUTOSAVE_DELAY_MS,
  ) {}

  get lastPayload(): ApplymentDraftSavePayload | null {
    return this.latestPayload;
  }

  get isDetaching(): boolean {
    return this.detaching;
  }

  isLatestPayload(payload: ApplymentDraftSavePayload): boolean {
    return this.latestPayload === payload;
  }

  schedule(payload: ApplymentDraftSavePayload): void {
    if (this.disposed || this.detaching) return;
    this.latestPayload = payload;
    this.scheduledPayload = payload;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      const scheduled = this.takeScheduledPayload();
      if (scheduled) void this.queue.enqueue(scheduled).catch(() => undefined);
    }, this.delayMs);
  }

  checkpoint(payload: ApplymentDraftSavePayload): Promise<void> {
    if (this.disposed || this.detaching) {
      return Promise.reject(new ApplymentDraftSaveCancelledError());
    }
    this.clearTimer();
    this.scheduledPayload = null;
    this.latestPayload = payload;
    return this.queue.enqueue(payload);
  }

  retry(failedPayload: ApplymentDraftSavePayload): Promise<void> {
    if (this.disposed || this.detaching) {
      return Promise.reject(new ApplymentDraftSaveCancelledError());
    }
    return this.queue.enqueue(this.takeLatestForRetry(failedPayload));
  }

  async flush(): Promise<void> {
    this.clearTimer();
    const scheduled = this.takeScheduledPayload();
    if (scheduled) await this.queue.enqueue(scheduled);
    await this.queue.flush();
  }

  reset(): void {
    this.clearTimer();
    this.scheduledPayload = null;
    this.latestPayload = null;
    this.queue.reset();
  }

  detach(): Promise<void> {
    if (this.detachPromise) return this.detachPromise;
    if (this.disposed) return Promise.resolve();
    this.detaching = true;
    this.detachPromise = this.flush().finally(() => this.dispose());
    return this.detachPromise;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.scheduledPayload = null;
    this.latestPayload = null;
    this.queue.dispose();
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private takeScheduledPayload(): ApplymentDraftSavePayload | null {
    const payload = this.scheduledPayload;
    this.scheduledPayload = null;
    return payload;
  }

  private takeLatestForRetry(
    failedPayload: ApplymentDraftSavePayload,
  ): ApplymentDraftSavePayload {
    this.clearTimer();
    const payload = this.takeScheduledPayload() ??
      this.latestPayload ??
      failedPayload;
    this.latestPayload = payload;
    return payload;
  }
}

export async function saveApplymentDraftWithCreateRecovery<
  Draft extends { id: string },
  Detail extends ApplymentDetail<Draft> = ApplymentDetail<Draft>,
>(input: {
  getCurrent: () => Draft | null;
  payload: ApplymentDraftSavePayload;
  isCurrent: () => boolean;
  commitCurrent: (draft: Draft) => void;
  shouldCommitDetail?: () => boolean;
  commitDetail?: (detail: Detail) => void;
  request: (
    path: string,
    init?: RequestInit,
  ) => Promise<Detail>;
}): Promise<Detail> {
  const current = input.getCurrent();
  let detail: Detail;

  try {
    detail = await requestDraftSave(input, current);
  } catch (error) {
    if (current || getErrorCode(error) !== "WECHAT_PAY_APPLYMENT_EXISTS") {
      throw error;
    }
    const existing = await input.request(
      "/finance/wechat-pay/applyment/current",
      { keepalive: true },
    );
    if (!existing.applyment) throw error;
    assertCurrent(input.isCurrent);
    input.commitCurrent(existing.applyment);
    detail = await requestDraftSave(input, existing.applyment);
  }

  assertCurrent(input.isCurrent);
  if (detail.applyment) input.commitCurrent(detail.applyment);
  if (input.shouldCommitDetail?.() !== false) {
    input.commitDetail?.(detail);
  }
  return detail;
}

export function submitApplymentAfterDraftFlush(input: {
  validate: () => boolean;
  buildPayload: () => ApplymentDraftSavePayload;
  save: (payload: ApplymentDraftSavePayload) => Promise<void>;
  flush: () => Promise<void>;
  getCurrent: () => { id: string } | null;
  submit: (
    id: string,
    body: { idempotency_key: string; remark: unknown },
  ) => Promise<void>;
}): false | Promise<true> {
  if (!input.validate()) return false;
  return submitValidatedApplyment(input);
}

async function submitValidatedApplyment(input: {
  buildPayload: () => ApplymentDraftSavePayload;
  save: (payload: ApplymentDraftSavePayload) => Promise<void>;
  flush: () => Promise<void>;
  getCurrent: () => { id: string } | null;
  submit: (
    id: string,
    body: { idempotency_key: string; remark: unknown },
  ) => Promise<void>;
}): Promise<true> {
  const payload: ApplymentDraftSavePayload = {
    ...input.buildPayload(),
    draft_update_source: "manual_save",
  };
  await input.save(payload);
  await input.flush();

  const target = input.getCurrent();
  if (!target) throw new Error("微信支付开通申请草稿尚未创建");
  await input.submit(target.id, {
    idempotency_key: target.id,
    remark: payload["remark"] ?? null,
  });
  return true;
}

function requestDraftSave<
  Draft extends { id: string },
  Detail extends ApplymentDetail<Draft>,
>(
  input: {
    payload: ApplymentDraftSavePayload;
    request: (
      path: string,
      init?: RequestInit,
    ) => Promise<Detail>;
  },
  current: Draft | null,
): Promise<Detail> {
  const body = JSON.stringify(input.payload);
  if (new TextEncoder().encode(body).byteLength > MAX_KEEPALIVE_BODY_BYTES) {
    throw new Error("微信支付申请草稿超过离页保存上限");
  }

  return input.request(
    current
      ? `/finance/wechat-pay/applyments/${current.id}`
      : "/finance/wechat-pay/applyments",
    {
      method: current ? "PUT" : "POST",
      body,
      fallbackMessage: "微信支付开通申请保存失败",
      keepalive: true,
    },
  );
}

function getErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String(error.code ?? "")
    : "";
}

function assertCurrent(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new ApplymentDraftSaveCancelledError();
}

function normalizeDraftRevision(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return 0;
  }
  return value;
}
