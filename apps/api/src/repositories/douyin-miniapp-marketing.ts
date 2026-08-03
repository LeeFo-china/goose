import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  DOUYIN_MARKETING_EVENT_VALUES,
  type DouyinMarketingEventName,
} from "@gooes/domain";
import { SupabaseDB } from "@/utils/supabase";

const LEAD_SUCCESS_MESSAGE = "你已提交预约，我们将尽快联系你";
const MIN_EVENT_COUNT = 1;
const MAX_EVENT_COUNT = 20;

const LeadResultSchema = z.strictObject({
  lead_id: z.string().uuid(),
  already_submitted: z.boolean(),
  updated_existing: z.boolean(),
  message: z.literal(LEAD_SUCCESS_MESSAGE),
});

const InsertedEventSchema = z.strictObject({
  id: z.string().uuid(),
  event_name: z.enum(DOUYIN_MARKETING_EVENT_VALUES),
  created_at: z.iso.datetime({ offset: true }),
});

export type DouyinMarketingAttribution = {
  readonly source_type?: string;
  readonly entry_path?: string;
  readonly scene?: string;
  readonly campaign_code?: string;
  readonly content_id?: string;
};

export type SubmitDouyinMiniappLeadInput = {
  readonly installationId: string;
  readonly tenantId: string;
  readonly phone: string;
  readonly name: string | null;
  readonly community: string | null;
  readonly area: number | null;
  readonly budget: string | null;
  readonly startTime: string | null;
  readonly demand: string | null;
  readonly smsCode: string;
  readonly requestDigest: string;
  readonly idempotencyKey: string;
  readonly subjectHash: string;
  readonly requestIp: string | null;
  readonly userAgent: string | null;
  readonly privacyPolicyVersion: string;
  readonly consentedAt: string;
  readonly attribution: DouyinMarketingAttribution;
};

export type InsertDouyinMiniappEventsInput = {
  readonly tenantId: string;
  readonly installationId: string;
  readonly subjectHash: string;
  readonly requestIp: string | null;
  readonly userAgent: string | null;
  readonly events: ReadonlyArray<{
    readonly eventName: DouyinMarketingEventName;
    readonly occurredAt: string;
    readonly attribution: DouyinMarketingAttribution;
    readonly entityId?: string | null;
  }>;
};

export type DouyinMiniappMarketingDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
};

export interface DouyinMiniappMarketingQuery {
  insert(rows: readonly Record<string, unknown>[]): DouyinMiniappMarketingQuery;
  select(columns: string): DouyinMiniappMarketingQuery;
  then<TResult1 = DouyinMiniappMarketingDatabaseResult, TResult2 = never>(
    onfulfilled?: (
      (value: DouyinMiniappMarketingDatabaseResult) => TResult1 | PromiseLike<TResult1>
    ) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface DouyinMiniappMarketingDatabaseClient {
  from(table: string): DouyinMiniappMarketingQuery;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<DouyinMiniappMarketingDatabaseResult>;
}

export class DouyinMiniappMarketingRepository {
  constructor(
    private readonly client: DouyinMiniappMarketingDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinMiniappMarketingDatabaseClient,
  ) {}

  async submitLead(input: SubmitDouyinMiniappLeadInput) {
    return executeDatabaseOperation("提交抖音小程序预约失败", async () => {
      const result = await this.client.rpc("submit_douyin_miniapp_lead", {
        p_douyin_miniapp_installation_id: input.installationId,
        p_tenant_id: input.tenantId,
        p_phone: input.phone,
        p_name: input.name,
        p_community: input.community,
        p_area: input.area,
        p_budget: input.budget,
        p_start_time: input.startTime,
        p_demand: input.demand,
        p_sms_code: input.smsCode,
        p_request_digest: input.requestDigest,
        p_idempotency_key: input.idempotencyKey,
        p_subject_hash: input.subjectHash,
        p_request_ip: input.requestIp,
        p_user_agent: input.userAgent,
        p_privacy_policy_version: input.privacyPolicyVersion,
        p_consented_at: input.consentedAt,
        p_attribution: copyAttribution(input.attribution),
      });
      assertDatabaseSuccess(result, "提交抖音小程序预约失败");
      if (!Array.isArray(result.data) || result.data.length !== 1) {
        throw invalidResponse();
      }
      const parsed = LeadResultSchema.safeParse(result.data[0]);
      if (!parsed.success || (parsed.data.updated_existing && !parsed.data.already_submitted)) {
        throw invalidResponse();
      }
      return parsed.data;
    });
  }

  async insertEvents(input: InsertDouyinMiniappEventsInput) {
    if (
      input.events.length < MIN_EVENT_COUNT
      || input.events.length > MAX_EVENT_COUNT
    ) {
      throw Errors.business(
        400,
        "抖音营销事件批次必须包含 1 至 20 条记录",
        "DOUYIN_MARKETING_EVENT_BATCH_INVALID",
      );
    }

    return executeDatabaseOperation("记录抖音小程序营销事件失败", async () => {
      const rows = input.events.map((event) => ({
        tenant_id: input.tenantId,
        douyin_miniapp_installation_id: input.installationId,
        source: "douyin_miniapp",
        subject_hash: input.subjectHash,
        event_name: event.eventName,
        payload: {
          ...copyAttribution(event.attribution),
          ...(event.entityId ? { entity_id: event.entityId } : {}),
          occurred_at: event.occurredAt,
        },
        request_ip: input.requestIp,
        user_agent: input.userAgent,
      }));
      const result = await this.client
        .from("marketing_events")
        .insert(rows)
        .select("id,event_name,created_at");
      assertDatabaseSuccess(result, "记录抖音小程序营销事件失败");
      if (!Array.isArray(result.data) || result.data.length !== rows.length) {
        throw invalidResponse();
      }
      const parsed = z.array(InsertedEventSchema).safeParse(result.data);
      if (!parsed.success) throw invalidResponse();
      return parsed.data;
    });
  }
}

async function executeDatabaseOperation<Result>(
  message: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.dbError(message);
  }
}

function assertDatabaseSuccess(
  result: DouyinMiniappMarketingDatabaseResult,
  message: string,
): void {
  if (!result.error) return;
  const marker = databaseErrorMessage(result.error);
  const mapped = marker !== null
    && Object.prototype.hasOwnProperty.call(BUSINESS_ERRORS, marker)
    ? BUSINESS_ERRORS[marker]
    : undefined;
  if (marker !== null && mapped) {
    throw Errors.business(mapped.statusCode, mapped.message, marker);
  }
  throw Errors.dbError(message);
}

const BUSINESS_ERRORS: Readonly<Record<string, {
  readonly statusCode: number;
  readonly message: string;
}>> = {
  SMS_CODE_INVALID: { statusCode: 400, message: "验证码错误" },
  SMS_CODE_EXPIRED: { statusCode: 400, message: "验证码已过期" },
  DOUYIN_IDEMPOTENCY_CONFLICT: { statusCode: 409, message: "请勿重复提交不同内容" },
  DOUYIN_INSTALLATION_DISABLED: { statusCode: 409, message: "小程序服务暂不可用" },
  DOUYIN_TENANT_NOT_ACTIVE: { statusCode: 409, message: "装修公司服务暂不可用" },
  DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH: {
    statusCode: 409,
    message: "隐私政策版本已更新，请重新确认",
  },
  DOUYIN_LEAD_INVALID_INPUT: { statusCode: 400, message: "预约信息格式无效" },
  DOUYIN_ATTRIBUTION_INVALID: { statusCode: 400, message: "来源信息格式无效" },
};

function copyAttribution(input: DouyinMarketingAttribution): Record<string, string> {
  const output: Record<string, string> = {};
  if (input.source_type !== undefined) output.source_type = input.source_type;
  if (input.entry_path !== undefined) output.entry_path = input.entry_path;
  if (input.scene !== undefined) output.scene = input.scene;
  if (input.campaign_code !== undefined) output.campaign_code = input.campaign_code;
  if (input.content_id !== undefined) output.content_id = input.content_id;
  return output;
}

function databaseErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  return typeof error.message === "string" ? error.message : null;
}

function invalidResponse() {
  return Errors.business(
    500,
    "抖音营销数据响应格式无效",
    "DOUYIN_MARKETING_REPOSITORY_RESPONSE_INVALID",
  );
}

export const douyinMiniappMarketingRepository =
  new DouyinMiniappMarketingRepository();
