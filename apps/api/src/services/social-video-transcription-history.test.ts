import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "./authorization";

const assertPermission = mock((_authContext: AuthContext, _permission: string) => undefined);
const findById = mock(async () => null);
const listRecentByUser = mock(async () => ({
  items: [{
    id: "task-1",
    tenant_id: "tenant-1",
    platform: "douyin",
    source_url: "https://v.douyin.com/a/",
    normalized_url: "https://www.douyin.com/video/1",
    input_hash: "hash-1",
    status: "completed",
    progress: 100,
    provider: "tencent_asr",
    provider_actor_id: null,
    provider_run_id: null,
    provider_dataset_id: null,
    resolved_video_url: null,
    resolved_audio_url: null,
    asr_task_id: "asr-1",
    media_file_size_bytes: null,
    audio_file_size_bytes: null,
    audio_duration_seconds: 63,
    billable: true,
    billing_duration_seconds: 63,
    billing_minutes: 2,
    billing_source: "asr",
    billed_at: "2026-08-24T08:00:00.000Z",
    billing_frozen_credits: 0,
    billing_correlation_id: null,
    billing_event_id: "event-1",
    billing_charged: true,
    billing_charged_at: "2026-08-24T08:00:00.000Z",
    title: "视频标题",
    text: "识".repeat(90),
    segments: [],
    raw_payload: null,
    error_code: null,
    error_message: null,
    created_by_auth_user_id: "auth-user-1",
    created_at: "2026-08-24T07:58:00.000Z",
    updated_at: "2026-08-24T08:00:00.000Z",
    completed_at: "2026-08-24T08:00:00.000Z",
  }],
  total: 1,
}));
const listSummariesByTranscriptionIds = mock(async () => [
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

mock.module("./social-video-transcriptions/legacy/shared", () => ({
  Errors: {
    dbError(message: string, error: unknown) {
      return Object.assign(new Error(message), { error });
    },
    notFound(message: string) {
      return Object.assign(new Error(message), { statusCode: 404 });
    },
    forbidden() {
      return Object.assign(new Error("Forbidden"), { statusCode: 403 });
    },
    badRequest(message: string) {
      return Object.assign(new Error(message), { statusCode: 400 });
    },
    business(statusCode: number, message: string, code: string) {
      return Object.assign(new Error(message), { statusCode, code });
    },
  },
  SupabaseDB: {},
  accessPolicyService: {
    assertPermission,
  },
  billingService: {},
  APIFY_POLL_INTERVAL_MS: 1500,
  calculateBilling: () => ({}),
  createInputHash: () => "hash",
  extractTranscriptItem: () => ({}),
  extractAudioWithFfmpeg: async () => ({}),
  extractDouyinUrl: (value: string) => value,
  downloadMediaToFile: async () => ({}),
  getApifyApiBaseUrl: () => "https://api.apify.com/v2",
  getErrorMessage: () => "error",
  getSinceByHours: () => "2026-08-24T00:00:00.000Z",
  normalizeActorIdForPath: (value: string) => value,
  getTodayStartIso: () => "2026-08-24T00:00:00.000Z",
  isSocialVideoChargeEnabled: () => false,
  normalizeTranscriptText: (value: string) => value,
  normalizeUrlForHash: (value: string) => value,
  normalizeSegments: (value: unknown) => value,
  readNumber: () => null,
  readString: () => null,
  serializeRecord(record: Record<string, unknown>) {
    return record;
  },
  serializeRecordSummary(input: {
    record: Record<string, unknown>;
    scripts: Array<Record<string, unknown>>;
  }) {
    const text = typeof input.record.text === "string" ? input.record.text : "";
    const latestScript = input.scripts[0] ?? null;
    return {
      id: input.record.id,
      platform: input.record.platform,
      source_url: input.record.source_url,
      normalized_url: input.record.normalized_url,
      status: input.record.status,
      progress: input.record.progress,
      title: input.record.title,
      text_preview: text.slice(0, 80),
      text_length: text.length,
      audio_duration_seconds: input.record.audio_duration_seconds,
      cached: input.record.billing_source === "cache",
      billing: {
        billable: input.record.billable,
        duration_seconds: input.record.billing_duration_seconds
          ?? input.record.audio_duration_seconds,
        minutes: input.record.billing_minutes,
        source: input.record.billing_source,
        cached: input.record.billing_source === "cache",
        billed_at: input.record.billed_at,
        frozen_credits: input.record.billing_frozen_credits,
        correlation_id: input.record.billing_correlation_id,
        event_id: input.record.billing_event_id,
        charged: input.record.billing_charged,
        charged_at: input.record.billing_charged_at,
      },
      script_count: input.scripts.length,
      latest_script: latestScript
        ? {
          id: latestScript.id,
          title: latestScript.title,
          target_platform: latestScript.target_platform,
          style: latestScript.style,
          status: latestScript.status,
          created_at: latestScript.created_at,
        }
        : null,
      created_at: input.record.created_at,
      updated_at: input.record.updated_at,
      completed_at: input.record.completed_at,
    };
  },
  socialVideoTranscriptionRepository: {
    findById,
    listRecentByUser,
  },
  socialVideoScriptRepository: {
    listSummariesByTranscriptionIds,
  },
  systemSettingsService: {},
  tencentAsrGateway: {},
}));

const authContext = {
  authUserId: "auth-user-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
  roleCodes: [],
  permissions: [],
} as unknown as AuthContext;

describe("social video transcription listTasks", () => {
  beforeEach(() => {
    assertPermission.mockClear();
    findById.mockClear();
    listRecentByUser.mockClear();
    listSummariesByTranscriptionIds.mockClear();
  });

  test("returns current employee transcription summaries without full text or segments", async () => {
    const { listTasks } = await import("./social-video-transcriptions/legacy/tasks");
    const context = {
      assertEnabled: mock(async () => undefined),
      resolveTenantId: mock(async () => "tenant-1"),
    };

    const result = await listTasks.call(context, {
      page: 1,
      pageSize: 5,
      platform: "douyin",
    }, authContext);

    expect(context.assertEnabled).toHaveBeenCalled();
    expect(assertPermission).toHaveBeenCalledWith(
      authContext,
      "social_video_transcription.create",
    );
    expect(listRecentByUser).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      authUserId: "auth-user-1",
      page: 1,
      pageSize: 5,
      platform: "douyin",
      status: undefined,
    });
    expect(listSummariesByTranscriptionIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      transcriptionIds: ["task-1"],
    });
    expect(result).toEqual({
      items: [{
        id: "task-1",
        platform: "douyin",
        source_url: "https://v.douyin.com/a/",
        normalized_url: "https://www.douyin.com/video/1",
        status: "completed",
        progress: 100,
        title: "视频标题",
        text_preview: "识".repeat(80),
        text_length: 90,
        audio_duration_seconds: 63,
        cached: false,
        billing: {
          billable: true,
          duration_seconds: 63,
          minutes: 2,
          source: "asr",
          cached: false,
          billed_at: "2026-08-24T08:00:00.000Z",
          frozen_credits: 0,
          correlation_id: null,
          event_id: "event-1",
          charged: true,
          charged_at: "2026-08-24T08:00:00.000Z",
        },
        script_count: 2,
        latest_script: {
          id: "script-2",
          title: "最近脚本",
          target_platform: "douyin",
          style: "practical",
          status: "completed",
          created_at: "2026-08-24T08:10:00.000Z",
        },
        created_at: "2026-08-24T07:58:00.000Z",
        updated_at: "2026-08-24T08:00:00.000Z",
        completed_at: "2026-08-24T08:00:00.000Z",
      }],
      total: 1,
      page: 1,
      pageSize: 5,
    });
    expect(result.items[0]).not.toHaveProperty("text");
    expect(result.items[0]).not.toHaveProperty("segments");
  });
});
