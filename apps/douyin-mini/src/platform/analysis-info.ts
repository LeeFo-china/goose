import type { LaunchContext, OfficialAnalysisInfo } from "../models";

type AnalysisReader = () => Promise<OfficialAnalysisInfo | null>;

export function parseAnalysisInfo(raw: unknown): OfficialAnalysisInfo | null {
  if (!isRecord(raw)) return null;
  const uniqueId = boundedId(raw.uniqueId);
  if (raw.type === 1) {
    const itemId = boundedId(raw.itemId);
    if (!itemId) return null;
    const postId = boundedId(raw.postId);
    return { type: 1, video_item_id: itemId,
      ...(uniqueId ? { unique_id: uniqueId } : {}),
      ...(postId ? { author_open_id: postId } : {}) };
  }
  if (raw.type === 2) {
    const roomId = boundedId(raw.roomId);
    if (!roomId) return null;
    const anchorId = boundedId(raw.anchorId);
    return { type: 2, live_room_id: roomId,
      ...(uniqueId ? { unique_id: uniqueId } : {}),
      ...(anchorId ? { anchor_open_id: anchorId } : {}) };
  }
  if ((raw.type === 3 || raw.type === 4) && uniqueId) {
    return { type: raw.type, unique_id: uniqueId };
  }
  return null;
}

export function readOfficialAnalysisInfo(): Promise<OfficialAnalysisInfo | null> {
  if (typeof tt.getAnalysisInfo !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      tt.getAnalysisInfo({
        success: (result) => resolve(parseAnalysisInfo(result)),
        fail: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}

export class EntryAttribution {
  private generation = 0;
  private sealed = false;
  private context: LaunchContext = { entry_path: "pages/home/index", scene: "0",
    source_type: "direct" };
  private flight: Promise<void> = Promise.resolve();

  constructor(private readonly read: AnalysisReader = readOfficialAnalysisInfo) {}

  get current(): LaunchContext {
    return this.context;
  }

  get version(): number { return this.generation; }

  start(base: LaunchContext): void {
    const generation = ++this.generation;
    this.sealed = false;
    this.context = base;
    this.flight = this.read().then((official) => {
      if (generation !== this.generation || this.sealed || !official) return;
      this.context = { ...base, source_type: sourceType(official), analysis_info: official };
    }).catch(() => undefined);
  }

  async ready(timeoutMs = 500): Promise<LaunchContext> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.flight, new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      })]);
      this.sealed = true;
      return this.current;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function sourceType(info: OfficialAnalysisInfo): LaunchContext["source_type"] {
  return info.type === 1 ? "short_video" : info.type === 2 ? "live" : "profile";
}

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 256 && !/[\x00-\x1f\x7f]/.test(trimmed)
    ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
