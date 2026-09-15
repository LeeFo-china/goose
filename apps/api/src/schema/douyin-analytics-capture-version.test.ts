import { expect, test } from "bun:test";

import { DouyinAnalyticsRequestSchema } from "./douyin-miniapp";

test("accepts only the fixed source capture version on client events", () => {
  const event = {
    event_name: "app_launch",
    occurred_at: "2026-09-15T08:00:00.000Z",
    attribution: { entry_path: "pages/home/index", scene: "021001",
      source_type: "direct" },
    capture_version: 2,
  };
  expect(DouyinAnalyticsRequestSchema.safeParse({ events: [event] }).success)
    .toBe(true);
  expect(DouyinAnalyticsRequestSchema.safeParse({ events: [{ ...event,
    capture_version: 3 }] }).success).toBe(false);
});
