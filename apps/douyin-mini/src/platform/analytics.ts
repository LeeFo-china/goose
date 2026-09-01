import { isApiRequestErrorCode, type ApiClient } from "../api/request";
import {
  DOUYIN_ENTRY_PATH_VALUES,
  DOUYIN_SOURCE_TYPES,
  type LaunchContext,
} from "../models";
import { isMaterialUuid } from "../api/material-uuid";

const ANALYTICS_STORAGE_KEY = "gooes_douyin_analytics_v1";
const DEFAULT_DEBOUNCE_MS = 1_500;
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_ENTITY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CLIENT_ANALYTICS_EVENT_NAMES = [
  "app_launch",
  "page_view",
  "case_view",
  "site_view",
  "lead_cta_click",
  "phone_call_click",
  "material_preview",
  "material_copy",
  "material_budget_click",
  "material_lead_click",
] as const;

export type ClientAnalyticsEventName =
  (typeof CLIENT_ANALYTICS_EVENT_NAMES)[number];

const CLIENT_MATERIAL_ANALYTICS_EVENT_NAMES = new Set<ClientAnalyticsEventName>([
  "material_preview",
  "material_copy",
  "material_budget_click",
  "material_lead_click",
]);

export type AnalyticsEventInput = {
  event_id: string;
  event_name: ClientAnalyticsEventName;
  attribution: LaunchContext;
  entity_id?: string;
};

type StoredAnalyticsEvent = AnalyticsEventInput & { occurred_at: string };
type AnalyticsSnapshot = { version: 1; events: StoredAnalyticsEvent[] };

type AnalyticsRequestEvent = Omit<StoredAnalyticsEvent, "event_id">;

export type AnalyticsRecordResult = {
  status: "queued" | "duplicate" | "rejected" | "failed";
  queue_size: number;
};

export type AnalyticsFlushResult = {
  status: "empty" | "sent" | "failed";
  sent_count: number;
  queue_size: number;
};

export type AnalyticsScheduleResult = { status: "scheduled" | "failed" };

export interface AnalyticsStorage {
  read(): unknown;
  write(value: unknown): void;
}

export interface AnalyticsScheduler {
  schedule(callback: () => void, delayMs: number): () => void;
}

export type AnalyticsQueueOptions = {
  storage?: AnalyticsStorage;
  now?: () => number;
  scheduler?: AnalyticsScheduler;
  debounceMs?: number;
};

export class AnalyticsQueue {
  private readonly storage: AnalyticsStorage;
  private readonly now: () => number;
  private readonly scheduler: AnalyticsScheduler;
  private readonly debounceMs: number;
  private cancelScheduledFlush: (() => void) | null = null;
  private flushFlight: Promise<AnalyticsFlushResult> | null = null;

  constructor(
    private readonly client: Pick<ApiClient, "request">,
    options: AnalyticsQueueOptions = {},
  ) {
    this.storage = options.storage ?? douyinAnalyticsStorage;
    this.now = options.now ?? Date.now;
    this.scheduler = options.scheduler ?? timeoutScheduler;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  record(input: AnalyticsEventInput): AnalyticsRecordResult {
    let event: StoredAnalyticsEvent | null;
    try {
      event = parseEventInput(input, this.now());
    } catch {
      return { status: "failed", queue_size: this.readQueue().length };
    }
    if (!event) return { status: "rejected", queue_size: this.readQueue().length };

    const events = this.readQueue();
    if (events.some((item) => item.event_id === event.event_id)) {
      return { status: "duplicate", queue_size: events.length };
    }

    const next = [...events, event].slice(-100);
    try {
      this.storage.write({ version: 1, events: next } satisfies AnalyticsSnapshot);
    } catch {
      return { status: "failed", queue_size: events.length };
    }
    if (next.length >= 20) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
    return { status: "queued", queue_size: next.length };
  }

  scheduleFlush(): AnalyticsScheduleResult {
    this.cancelDebounce();
    try {
      this.cancelScheduledFlush = this.scheduler.schedule(() => {
        this.cancelScheduledFlush = null;
        void this.flush();
      }, this.debounceMs);
      return { status: "scheduled" };
    } catch {
      this.cancelScheduledFlush = null;
      return { status: "failed" };
    }
  }

  flush(): Promise<AnalyticsFlushResult> {
    if (this.flushFlight) return this.flushFlight;
    const flight = this.flushOneBatch();
    this.flushFlight = flight;
    void flight.finally(() => {
      if (this.flushFlight === flight) this.flushFlight = null;
    });
    return flight;
  }

  handleAppHide(): Promise<AnalyticsFlushResult> {
    this.cancelDebounce();
    return this.flush();
  }

  private async flushOneBatch(
    canIsolateMaterialPoison = true,
  ): Promise<AnalyticsFlushResult> {
    this.cancelDebounce();
    const stored = this.readQueue();
    const now = this.now();
    const queued = stored.filter((event) => {
      const occurredAt = Date.parse(event.occurred_at);
      return occurredAt >= now - MAX_EVENT_AGE_MS
        && occurredAt <= now + MAX_FUTURE_SKEW_MS;
    });
    if (queued.length !== stored.length) {
      try {
        this.storage.write({ version: 1, events: queued } satisfies AnalyticsSnapshot);
      } catch {
        return { status: "failed", sent_count: 0, queue_size: stored.length };
      }
    }
    if (queued.length === 0) {
      return { status: "empty", sent_count: 0, queue_size: 0 };
    }
    const batch = queued.slice(0, 20);
    try {
      const response = await this.client.request<unknown>({
        path: "/douyin-mini/events",
        method: "POST",
        data: { events: batch.map(toRequestEvent) },
      });
      if (!isRecord(response)
        || !Number.isInteger(response.accepted)
        || response.accepted !== batch.length) {
        return {
          status: "failed",
          sent_count: 0,
          queue_size: this.readQueue().length,
        };
      }
      const sentIds = new Set(batch.map((event) => event.event_id));
      const remaining = this.readQueue().filter((event) => !sentIds.has(event.event_id));
      this.storage.write({ version: 1, events: remaining } satisfies AnalyticsSnapshot);
      if (remaining.length > 0) this.scheduleFlush();
      return {
        status: "sent",
        sent_count: batch.length,
        queue_size: remaining.length,
      };
    } catch (error) {
      if (canIsolateMaterialPoison
        && isApiRequestErrorCode(error, "DOUYIN_MATERIAL_EVENT_ENTITY_INVALID")
        && error.statusCode === 400) {
        const poisonIds = new Set(batch
          .filter((event) => CLIENT_MATERIAL_ANALYTICS_EVENT_NAMES.has(event.event_name))
          .map((event) => event.event_id));
        if (poisonIds.size > 0) {
          const remaining = this.readQueue().filter((event) => !poisonIds.has(event.event_id));
          try {
            this.storage.write({ version: 1, events: remaining } satisfies AnalyticsSnapshot);
          } catch {
            return {
              status: "failed",
              sent_count: 0,
              queue_size: this.readQueue().length,
            };
          }
          if (remaining.length === 0) {
            return { status: "empty", sent_count: 0, queue_size: 0 };
          }
          return await this.flushOneBatch(false);
        }
      }
      return {
        status: "failed",
        sent_count: 0,
        queue_size: this.readQueue().length,
      };
    }
  }

  private cancelDebounce(): void {
    try {
      this.cancelScheduledFlush?.();
    } catch {
      // Analytics lifecycle cleanup must never interrupt the host business flow.
    }
    this.cancelScheduledFlush = null;
  }

  private readQueue(): StoredAnalyticsEvent[] {
    try {
      return parseSnapshot(this.storage.read())?.events ?? [];
    } catch {
      return [];
    }
  }
}

function toRequestEvent(event: StoredAnalyticsEvent): AnalyticsRequestEvent {
  return {
    event_name: event.event_name,
    occurred_at: event.occurred_at,
    attribution: event.attribution,
    ...(event.entity_id ? { entity_id: event.entity_id } : {}),
  };
}

const douyinAnalyticsStorage: AnalyticsStorage = {
  read(): unknown {
    const value: unknown = tt.getStorageSync(ANALYTICS_STORAGE_KEY);
    return value;
  },
  write(value: unknown): void {
    tt.setStorageSync(ANALYTICS_STORAGE_KEY, value);
  },
};

const timeoutScheduler: AnalyticsScheduler = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

function parseEventInput(value: unknown, now: number): StoredAnalyticsEvent | null {
  if (!isRecord(value) || !hasOnlyKeys(
    value,
    ["event_id", "event_name", "attribution", "entity_id"],
  )) return null;
  if (!isEventId(value.event_id) || !isClientEventName(value.event_name)) return null;
  const parsedAttribution = parseAttribution(value.attribution);
  if (!parsedAttribution) return null;
  const isMaterialEvent = CLIENT_MATERIAL_ANALYTICS_EVENT_NAMES.has(value.event_name);
  if (isMaterialEvent) {
    if (!isMaterialUuid(value.entity_id)) return null;
  } else if (value.entity_id !== undefined && !isLegacyEntityId(value.entity_id)) {
    return null;
  }
  return {
    event_id: value.event_id,
    event_name: value.event_name,
    occurred_at: new Date(now).toISOString(),
    attribution: parsedAttribution,
    ...(typeof value.entity_id === "string" ? { entity_id: value.entity_id } : {}),
  };
}

function parseSnapshot(value: unknown): AnalyticsSnapshot | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "events"])) return null;
  if (value.version !== 1 || !Array.isArray(value.events)) return null;
  const events = value.events.map(parseStoredEvent);
  return events.every((event): event is StoredAnalyticsEvent => event !== null)
    ? { version: 1, events }
    : null;
}

function parseStoredEvent(value: unknown): StoredAnalyticsEvent | null {
  if (!isRecord(value) || !hasOnlyKeys(
    value,
    ["event_id", "event_name", "occurred_at", "attribution", "entity_id"],
  )) return null;
  const base = parseEventInput({
    event_id: value.event_id,
    event_name: value.event_name,
    attribution: value.attribution,
    ...(value.entity_id === undefined ? {} : { entity_id: value.entity_id }),
  }, 0);
  if (!base || typeof value.occurred_at !== "string") return null;
  const occurredAt = Date.parse(value.occurred_at);
  if (!Number.isFinite(occurredAt)) return null;
  return { ...base, occurred_at: new Date(occurredAt).toISOString() };
}

function parseAttribution(value: unknown): LaunchContext | null {
  if (!isRecord(value) || !hasOnlyKeys(
    value,
    ["entry_path", "scene", "source_type", "campaign_code", "content_id"],
  )) return null;
  if (typeof value.entry_path !== "string"
    || !DOUYIN_ENTRY_PATH_VALUES.includes(value.entry_path as LaunchContext["entry_path"])
    || typeof value.scene !== "string"
    || !/^[0-9]{1,20}$/.test(value.scene)
    || typeof value.source_type !== "string"
    || !DOUYIN_SOURCE_TYPES.includes(value.source_type as LaunchContext["source_type"])
    || !isOptionalAttributionCode(value.campaign_code)
    || !isOptionalAttributionCode(value.content_id)) return null;
  return {
    entry_path: value.entry_path as LaunchContext["entry_path"],
    scene: value.scene,
    source_type: value.source_type as LaunchContext["source_type"],
    ...(typeof value.campaign_code === "string"
      ? { campaign_code: value.campaign_code }
      : {}),
    ...(typeof value.content_id === "string" ? { content_id: value.content_id } : {}),
  };
}

function isClientEventName(value: unknown): value is ClientAnalyticsEventName {
  return typeof value === "string"
    && CLIENT_ANALYTICS_EVENT_NAMES.includes(value as ClientAnalyticsEventName);
}

function isOptionalAttributionCode(value: unknown): boolean {
  return value === undefined
    || typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function isEventId(value: unknown): value is string {
  return typeof value === "string" && EVENT_ID_PATTERN.test(value);
}

function isLegacyEntityId(value: unknown): value is string {
  return typeof value === "string" && LEGACY_ENTITY_ID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
