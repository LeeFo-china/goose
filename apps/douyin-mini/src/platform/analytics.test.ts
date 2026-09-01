import { describe, expect, mock, test } from "bun:test";
import { DOUYIN_ENTRY_PATH_VALUES as CANONICAL_ENTRY_PATHS } from
  "../../../../packages/domain/src/douyin-miniapp";
import type { ApiClient, ApiRequestInput } from "../api/request";
import {
  AnalyticsQueue,
  CLIENT_ANALYTICS_EVENT_NAMES,
  type AnalyticsStorage,
} from "./analytics";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-07-20T08:00:00.000Z");
const attribution = {
  entry_path: "pages/case-detail/index" as const,
  scene: "021001",
  source_type: "short_video" as const,
  campaign_code: "summer-2026",
  content_id: "video-100",
};

function harness(initialValue: unknown = null) {
  let stored: unknown = initialValue;
  const storage: AnalyticsStorage = {
    read: mock(() => stored),
    write: mock((value: unknown) => { stored = value; }),
  };
  const request = mock(async (input: ApiRequestInput) => ({
    accepted: Array.isArray(input.data?.events) ? input.data.events.length : 0,
  }));
  const analytics = new AnalyticsQueue(
    { request } as Pick<ApiClient, "request">,
    {
      storage,
      now: () => NOW,
      scheduler: { schedule: mock(() => () => undefined) },
    },
  );
  return { analytics, getStored: () => stored, request, storage };
}

describe("AnalyticsQueue", () => {
  test("persists a strict client event once for one event id", () => {
    const { analytics, getStored } = harness();

    expect(analytics.record({
      event_id: EVENT_ID,
      event_name: "case_view",
      attribution,
      entity_id: ENTITY_ID,
    })).toEqual({ status: "queued", queue_size: 1 });
    expect(analytics.record({
      event_id: EVENT_ID,
      event_name: "case_view",
      attribution,
      entity_id: ENTITY_ID,
    })).toEqual({ status: "duplicate", queue_size: 1 });

    expect(getStored()).toEqual({
      version: 1,
      events: [{
        event_id: EVENT_ID,
        event_name: "case_view",
        occurred_at: "2026-07-20T08:00:00.000Z",
        attribution,
        entity_id: ENTITY_ID,
      }],
    });
  });

  test("stores and flushes every canonical entry path without drift", async () => {
    const { analytics, getStored, request } = harness();
    for (const [index, entryPath] of CANONICAL_ENTRY_PATHS.entries()) {
      expect(analytics.record({
        event_id: eventId(index + 1),
        event_name: "page_view",
        attribution: { ...attribution, entry_path: entryPath },
      }).status).toBe("queued");
    }
    const stored = getStored() as {
      events: Array<{ attribution: { entry_path: string } }>;
    };
    expect(stored.events.map((event) => event.attribution.entry_path))
      .toEqual([...CANONICAL_ENTRY_PATHS]);

    await expect(analytics.flush()).resolves.toMatchObject({
      status: "sent",
      sent_count: CANONICAL_ENTRY_PATHS.length,
    });
    const requestEvents = request.mock.calls[0]?.[0]?.data?.events as
      Array<{ attribution: { entry_path: string } }>;
    expect(requestEvents.map((event) => event.attribution.entry_path))
      .toEqual([...CANONICAL_ENTRY_PATHS]);
  });

  test("rejects an unknown entry path instead of storing it", () => {
    const { analytics, getStored } = harness();
    expect(analytics.record({
      event_id: EVENT_ID,
      event_name: "page_view",
      attribution: { ...attribution, entry_path: "pages/admin/index" as never },
    })).toEqual({ status: "rejected", queue_size: 0 });
    expect(getStored()).toBeNull();
  });

  test("exposes the ten client-writable events without material claim", () => {
    expect(CLIENT_ANALYTICS_EVENT_NAMES).toEqual([
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
    ]);
  });

  test("accepts material interaction events with a material UUID and rejects client claims", () => {
    const { analytics, getStored } = harness();
    for (const [index, eventName] of ([
      "material_preview",
      "material_copy",
      "material_budget_click",
      "material_lead_click",
    ] as const).entries()) {
      expect(analytics.record({
        event_id: eventId(index + 1),
        event_name: eventName,
        attribution,
        entity_id: ENTITY_ID,
      }).status).toBe("queued");
    }
    expect(analytics.record({
      event_id: eventId(10),
      event_name: "material_claim" as never,
      attribution,
      entity_id: ENTITY_ID,
    })).toEqual({ status: "rejected", queue_size: 4 });
    expect(analytics.record({
      event_id: eventId(11),
      event_name: "material_copy",
      attribution,
      entity_id: "not-a-material-uuid",
    })).toEqual({ status: "rejected", queue_size: 4 });
    expect(analytics.record({
      event_id: eventId(12),
      event_name: "material_preview",
      attribution,
    })).toEqual({ status: "rejected", queue_size: 4 });
    const snapshot = getStored() as { events: Array<{ event_name: string }> };
    expect(snapshot.events.map((event) => event.event_name)).not.toContain("material_claim");
  });

  test("rejects arbitrary launch query and extra event fields", () => {
    const { analytics, getStored } = harness();
    const unsafeAttribution = {
      ...attribution,
      query: { openid: "must-not-be-stored", keyword: "private" },
    };
    const unsafeEvent = {
      event_id: EVENT_ID,
      event_name: "app_launch" as const,
      attribution: unsafeAttribution,
      raw_query: { phone: "13800000000" },
    };

    expect(analytics.record(unsafeEvent)).toEqual({
      status: "rejected",
      queue_size: 0,
    });
    expect(getStored()).toBeNull();
  });

  test("caps the persistent queue at the newest one hundred events", () => {
    const { analytics, getStored } = harness();

    for (let index = 1; index <= 101; index += 1) {
      analytics.record({
        event_id: eventId(index),
        event_name: "page_view",
        attribution,
      });
    }

    const snapshot = getStored() as {
      version: number;
      events: Array<{ event_id: string }>;
    };
    expect(snapshot.version).toBe(1);
    expect(snapshot.events).toHaveLength(100);
    expect(snapshot.events[0]?.event_id).toBe(eventId(2));
    expect(snapshot.events[99]?.event_id).toBe(eventId(101));
  });

  test("flushes immediately when one full server batch is queued", async () => {
    const { analytics, request } = harness(snapshot(19));

    analytics.record({
      event_id: eventId(20),
      event_name: "page_view",
      attribution,
    });
    await Bun.sleep(0);

    expect(request).toHaveBeenCalledTimes(1);
  });

  test("sends at most twenty events and removes only the successful batch", async () => {
    const { analytics, getStored, request } = harness(snapshot(25));

    await expect(analytics.flush()).resolves.toEqual({
      status: "sent",
      sent_count: 20,
      queue_size: 5,
    });
    expect(request).toHaveBeenCalledTimes(1);
    const requestInput = request.mock.calls[0]?.[0] as {
      path: string;
      method: string;
      data: { events: Array<Record<string, unknown>> };
    };
    expect(requestInput.path).toBe("/douyin-mini/events");
    expect(requestInput.method).toBe("POST");
    expect(requestInput.data.events).toHaveLength(20);
    expect(requestInput.data.events[0]).not.toHaveProperty("event_id");
    expect(requestInput.data.events[0]).toMatchObject({
      event_name: "page_view",
      occurred_at: "2026-07-20T08:00:00.000Z",
      attribution,
    });
    const remaining = getStored() as { events: Array<{ event_id: string }> };
    expect(remaining.events.map((event) => event.event_id)).toEqual(
      Array.from({ length: 5 }, (_, index) => eventId(index + 21)),
    );
  });

  test("retains the original batch when analytics delivery fails", async () => {
    const initial = snapshot(3);
    const { analytics, getStored, request } = harness(initial);
    request.mockImplementation(async () => { throw new Error("offline"); });

    await expect(analytics.flush()).resolves.toEqual({
      status: "failed",
      sent_count: 0,
      queue_size: 3,
    });
    expect(getStored()).toEqual(initial);
  });

  test("retains the batch when the server acknowledgement is malformed", async () => {
    const initial = snapshot(3);
    const { analytics, getStored, request } = harness(initial);
    request.mockImplementation(async () => ({ accepted: 2 }));

    await expect(analytics.flush()).resolves.toEqual({
      status: "failed",
      sent_count: 0,
      queue_size: 3,
    });
    expect(getStored()).toEqual(initial);
  });

  test("drops stored events that the server can no longer accept", async () => {
    const stale = snapshot(1);
    stale.events[0]!.occurred_at = "2026-07-12T07:59:59.000Z";
    const { analytics, getStored, request } = harness(stale);

    await expect(analytics.flush()).resolves.toEqual({
      status: "empty",
      sent_count: 0,
      queue_size: 0,
    });
    expect(request).not.toHaveBeenCalled();
    expect(getStored()).toEqual({ version: 1, events: [] });
  });

  test("shares one in-flight flush across concurrent callers", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { analytics, request } = harness(snapshot(1));
    request.mockImplementation(async () => { await gate; return { accepted: 1 }; });

    const first = analytics.flush();
    const second = analytics.flush();
    await Bun.sleep(0);
    expect(request).toHaveBeenCalledTimes(1);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "sent", sent_count: 1, queue_size: 0 },
      { status: "sent", sent_count: 1, queue_size: 0 },
    ]);
  });

  test("cancels the debounce and flushes safely when the app hides", async () => {
    let scheduled: (() => void) | null = null;
    const cancel = mock(() => undefined);
    const base = harness();
    const analytics = new AnalyticsQueue(
      { request: base.request } as Pick<ApiClient, "request">,
      {
        storage: base.storage,
        now: () => NOW,
        scheduler: {
          schedule: mock((callback: () => void) => {
            scheduled = callback;
            return cancel;
          }),
        },
      },
    );
    analytics.record({
      event_id: EVENT_ID,
      event_name: "page_view",
      attribution,
    });
    expect(scheduled).not.toBeNull();

    await expect(analytics.handleAppHide()).resolves.toEqual({
      status: "sent",
      sent_count: 1,
      queue_size: 0,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(base.request).toHaveBeenCalledTimes(1);
  });

  test("flushes from the debounce callback without exposing failures", async () => {
    let scheduled: (() => void) | null = null;
    const base = harness();
    const analytics = new AnalyticsQueue(
      { request: base.request } as Pick<ApiClient, "request">,
      {
        storage: base.storage,
        now: () => NOW,
        debounceMs: 250,
        scheduler: {
          schedule: mock((callback: () => void, delayMs: number) => {
            expect(delayMs).toBe(250);
            scheduled = callback;
            return () => undefined;
          }),
        },
      },
    );
    analytics.record({
      event_id: EVENT_ID,
      event_name: "app_launch",
      attribution,
    });

    const runScheduled = scheduled as (() => void) | null;
    expect(runScheduled).not.toBeNull();
    runScheduled?.();
    await Bun.sleep(0);

    expect(base.request).toHaveBeenCalledTimes(1);
    expect(base.getStored()).toEqual({ version: 1, events: [] });
  });

  test("contains storage and scheduler failures as return statuses", () => {
    const writeFailure = harness();
    writeFailure.storage.write = mock(() => { throw new Error("storage full"); });
    expect(() => writeFailure.analytics.record({
      event_id: EVENT_ID,
      event_name: "page_view",
      attribution,
    })).not.toThrow();
    expect(writeFailure.analytics.record({
      event_id: EVENT_ID,
      event_name: "page_view",
      attribution,
    })).toEqual({ status: "failed", queue_size: 0 });

    const schedulerBase = harness();
    const schedulerFailure = new AnalyticsQueue(
      { request: schedulerBase.request } as Pick<ApiClient, "request">,
      {
        storage: {
          read: () => null,
          write: () => undefined,
        },
        now: () => NOW,
        scheduler: {
          schedule: () => { throw new Error("timer unavailable"); },
        },
      },
    );
    expect(() => schedulerFailure.record({
      event_id: EVENT_ID,
      event_name: "page_view",
      attribution,
    })).not.toThrow();
    expect(schedulerFailure.scheduleFlush()).toEqual({ status: "failed" });
  });
});

function eventId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function snapshot(count: number) {
  return {
    version: 1,
    events: Array.from({ length: count }, (_, index) => ({
      event_id: eventId(index + 1),
      event_name: "page_view",
      occurred_at: "2026-07-20T08:00:00.000Z",
      attribution,
    })),
  };
}
