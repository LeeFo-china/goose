import { describe, expect, test } from "bun:test";

import {
  ListSocialVideoTranscriptionsQuerySchema,
} from "./social-video";

describe("social video transcription history query schema", () => {
  test("defaults to the mini-program recent history page size", () => {
    const result = ListSocialVideoTranscriptionsQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      page: 1,
      pageSize: 5,
      platform: "douyin",
    });
  });

  test("coerces pagination and supports status filter", () => {
    const result = ListSocialVideoTranscriptionsQuerySchema.safeParse({
      page: "2",
      pageSize: "20",
      status: "completed",
      platform: "douyin",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      page: 2,
      pageSize: 20,
      status: "completed",
      platform: "douyin",
    });
  });

  test("caps page size at 20 for the lightweight history endpoint", () => {
    const result = ListSocialVideoTranscriptionsQuerySchema.safeParse({
      pageSize: "21",
    });

    expect(result.success).toBe(false);
  });
});
