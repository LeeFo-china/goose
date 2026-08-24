import { beforeAll, describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let SocialVideoTranscriptionRepository: typeof import("./social-video-transcriptions")
  .SocialVideoTranscriptionRepository;
let SocialVideoScriptRepository: typeof import("./social-video-scripts")
  .SocialVideoScriptRepository;

beforeAll(async () => {
  ({ SocialVideoTranscriptionRepository } = await import(
    "./social-video-transcriptions"
  ));
  ({ SocialVideoScriptRepository } = await import("./social-video-scripts"));
});

type QueryResult = { data: unknown; error: unknown; count?: number | null };

function clientWith(result: QueryResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  class Query implements PromiseLike<QueryResult> {
    private chain(method: string, args: unknown[]) {
      calls.push({ method, args });
      return this;
    }

    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    in(...args: unknown[]) { return this.chain("in", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    range(...args: unknown[]) { return this.chain("range", args); }

    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
  }

  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        return new Query();
      },
    },
  };
}

describe("SocialVideoTranscriptionRepository.listRecentByUser", () => {
  test("uses tenant, current auth user, status, platform and bounded range without large text fields", async () => {
    const context = clientWith({
      data: [{
        id: "task-1",
        tenant_id: "tenant-1",
        platform: "douyin",
        source_url: "https://v.douyin.com/a/",
        normalized_url: "https://www.douyin.com/video/1",
        status: "completed",
        progress: 100,
        title: "视频标题",
        text: "列表摘要文本",
        audio_duration_seconds: 63,
        billable: true,
        billing_duration_seconds: 63,
        billing_minutes: 2,
        billing_source: "asr",
        billed_at: "2026-08-24T08:00:00.000Z",
        billing_frozen_credits: 0,
        billing_correlation_id: null,
        billing_event_id: null,
        billing_charged: true,
        billing_charged_at: "2026-08-24T08:00:00.000Z",
        created_at: "2026-08-24T07:58:00.000Z",
        updated_at: "2026-08-24T08:00:00.000Z",
        completed_at: "2026-08-24T08:00:00.000Z",
      }],
      error: null,
      count: 1,
    });

    const result = await new SocialVideoTranscriptionRepository(
      context.client as never,
    ).listRecentByUser({
      tenantId: "tenant-1",
      authUserId: "auth-user-1",
      page: 2,
      pageSize: 5,
      platform: "douyin",
      status: "completed",
    });

    const select = context.calls.find((call) => call.method === "select");
    expect(select?.args[0]).toContain("text");
    expect(select?.args[0]).not.toContain("segments");
    expect(select?.args[0]).not.toContain("raw_payload");
    expect(context.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", "tenant-1"],
    });
    expect(context.calls).toContainEqual({
      method: "eq",
      args: ["created_by_auth_user_id", "auth-user-1"],
    });
    expect(context.calls).toContainEqual({
      method: "eq",
      args: ["platform", "douyin"],
    });
    expect(context.calls).toContainEqual({
      method: "eq",
      args: ["status", "completed"],
    });
    expect(context.calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(context.calls).toContainEqual({ method: "range", args: [5, 9] });
    expect(result).toEqual({
      items: expect.any(Array),
      total: 1,
    });
  });
});

describe("SocialVideoScriptRepository.listSummariesByTranscriptionIds", () => {
  test("loads script summaries for the current page in one tenant-scoped query", async () => {
    const context = clientWith({
      data: [
        {
          id: "script-2",
          transcription_id: "task-1",
          title: "最近脚本",
          target_platform: "douyin",
          style: "practical",
          status: "completed",
          created_at: "2026-08-24T08:10:00.000Z",
        },
        {
          id: "script-1",
          transcription_id: "task-1",
          title: "旧脚本",
          target_platform: "douyin",
          style: "practical",
          status: "completed",
          created_at: "2026-08-24T08:00:00.000Z",
        },
      ],
      error: null,
    });

    const result = await new SocialVideoScriptRepository(
      context.client as never,
    ).listSummariesByTranscriptionIds({
      tenantId: "tenant-1",
      transcriptionIds: ["task-1", "task-2"],
    });

    const select = context.calls.find((call) => call.method === "select");
    expect(select?.args[0]).toBe(
      "id, transcription_id, title, target_platform, style, status, created_at",
    );
    expect(context.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", "tenant-1"],
    });
    expect(context.calls).toContainEqual({
      method: "in",
      args: ["transcription_id", ["task-1", "task-2"]],
    });
    expect(context.calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(context.calls).toContainEqual({
      method: "limit",
      args: [200],
    });
    expect(result).toEqual([
      {
        id: "script-2",
        transcription_id: "task-1",
        title: "最近脚本",
        target_platform: "douyin",
        style: "practical",
        status: "completed",
        created_at: "2026-08-24T08:10:00.000Z",
      },
      {
        id: "script-1",
        transcription_id: "task-1",
        title: "旧脚本",
        target_platform: "douyin",
        style: "practical",
        status: "completed",
        created_at: "2026-08-24T08:00:00.000Z",
      },
    ]);
  });

  test("skips Supabase when the page has no transcription ids", async () => {
    const context = clientWith({ data: [], error: null });

    const result = await new SocialVideoScriptRepository(
      context.client as never,
    ).listSummariesByTranscriptionIds({
      tenantId: "tenant-1",
      transcriptionIds: [],
    });

    expect(result).toEqual([]);
    expect(context.calls).toEqual([]);
  });
});
