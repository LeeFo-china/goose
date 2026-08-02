import type {
  PlatformVirtualGoodsLifecycleSnapshot,
  PlatformVirtualGoodsPhaseState,
} from "./platform-virtual-payment-settings-types";

const MAX_POLL_ATTEMPTS = 15;

type GoodsPhase = "upload" | "publish";
type GoodsBadgeVariant = "secondary" | "warning" | "success" | "danger";

export function getGoodsPhasePresentation(
  phase: GoodsPhase,
  state: PlatformVirtualGoodsPhaseState,
): { label: string; variant: GoodsBadgeVariant } {
  const verb = phase === "upload" ? "上传" : "发布";
  if (state === "processing") return { label: `${verb}中`, variant: "warning" };
  if (state === "succeeded") return { label: `已${verb}`, variant: "success" };
  if (state === "failed") return { label: `${verb}失败`, variant: "danger" };
  if (state === "mismatch") {
    return { label: `需重新${verb}`, variant: "danger" };
  }
  return { label: `未${verb}`, variant: "secondary" };
}

export function getGoodsActionAvailability(
  snapshot: PlatformVirtualGoodsLifecycleSnapshot | null,
) {
  return {
    upload: snapshot?.next_action === "upload",
    publish: snapshot?.next_action === "publish",
    validate: snapshot?.next_action === "validate",
  };
}

export function nextGoodsPollDelay(input: {
  processing: boolean;
  attempts: number;
  serverDelayMs: 2_000 | null;
}): 2_000 | null {
  if (
    !input.processing || input.attempts >= MAX_POLL_ATTEMPTS ||
    input.serverDelayMs !== 2_000
  ) return null;
  return input.serverDelayMs;
}

export function isGoodsLifecycleProcessing(
  snapshot: PlatformVirtualGoodsLifecycleSnapshot | null,
): boolean {
  return snapshot?.upload.state === "processing" ||
    snapshot?.publish.state === "processing";
}
