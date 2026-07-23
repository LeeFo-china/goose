import {
  ApplymentDraftSaveCancelledError,
  type ApplymentDraftSavePayload,
  type ApplymentDraftSaveQueue,
} from "./finance-wechat-pay-applyment-autosave";

const DEFAULT_AUTOSAVE_DELAY_MS = 800;

type RequestInit = {
  method?: "POST" | "PUT";
  body?: string;
  fallbackMessage?: string;
};

type ApplymentDetail<Draft> = {
  applyment: Draft | null;
};

export class ApplymentDraftAutosaveCoordinator {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scheduledPayload: ApplymentDraftSavePayload | null = null;
  private latestPayload: ApplymentDraftSavePayload | null = null;
  private disposed = false;

  constructor(
    private readonly queue: ApplymentDraftSaveQueue,
    private readonly delayMs = DEFAULT_AUTOSAVE_DELAY_MS,
  ) {}

  get lastPayload(): ApplymentDraftSavePayload | null {
    return this.latestPayload;
  }

  schedule(payload: ApplymentDraftSavePayload): void {
    if (this.disposed) return;
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
    if (this.disposed) {
      return Promise.reject(new ApplymentDraftSaveCancelledError());
    }
    this.clearTimer();
    this.scheduledPayload = null;
    this.latestPayload = payload;
    return this.queue.enqueue(payload);
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
}

export async function saveApplymentDraftWithCreateRecovery<
  Draft extends { id: string },
>(input: {
  getCurrent: () => Draft | null;
  payload: ApplymentDraftSavePayload;
  isCurrent: () => boolean;
  commitCurrent: (draft: Draft) => void;
  request: (
    path: string,
    init?: RequestInit,
  ) => Promise<ApplymentDetail<Draft>>;
}): Promise<ApplymentDetail<Draft>> {
  const current = input.getCurrent();
  let detail: ApplymentDetail<Draft>;

  try {
    detail = await requestDraftSave(input, current);
  } catch (error) {
    if (current || getErrorCode(error) !== "WECHAT_PAY_APPLYMENT_EXISTS") {
      throw error;
    }
    const existing = await input.request(
      "/finance/wechat-pay/applyment/current",
    );
    if (!existing.applyment) throw error;
    assertCurrent(input.isCurrent);
    input.commitCurrent(existing.applyment);
    detail = await requestDraftSave(input, existing.applyment);
  }

  assertCurrent(input.isCurrent);
  if (detail.applyment) input.commitCurrent(detail.applyment);
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

function requestDraftSave<Draft extends { id: string }>(
  input: {
    payload: ApplymentDraftSavePayload;
    request: (
      path: string,
      init?: RequestInit,
    ) => Promise<ApplymentDetail<Draft>>;
  },
  current: Draft | null,
): Promise<ApplymentDetail<Draft>> {
  return input.request(
    current
      ? `/finance/wechat-pay/applyments/${current.id}`
      : "/finance/wechat-pay/applyments",
    {
      method: current ? "PUT" : "POST",
      body: JSON.stringify(input.payload),
      fallbackMessage: "微信支付开通申请保存失败",
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
