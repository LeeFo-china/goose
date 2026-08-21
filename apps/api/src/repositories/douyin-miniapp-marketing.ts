import { z } from "zod";
import {
  DOUYIN_MARKETING_EVENT_VALUES,
  DOUYIN_VISIT_PERIOD_VALUES,
  type DouyinMarketingEventName,
  type DouyinVisitPeriod,
} from "@gooes/domain";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { Database } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

const MIN_EVENT_COUNT = 1;
const MAX_EVENT_COUNT = 20;

const AppointmentResultSchema = z.strictObject({
  lead_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  appointment_no: z.string().regex(/^DYLF-[0-9]{8}-[0-9]{6}$/),
  status: z.literal("pending_confirmation"),
  already_submitted: z.boolean(),
  updated_existing: z.boolean(),
  existing_customer_linked: z.boolean(),
  recent_pending_appointment_exists: z.boolean(),
});

const MEASUREMENT_COMMAND_ERROR_CODES = [
  "DOUYIN_MEASUREMENT_COMMAND_INVALID",
  "DOUYIN_MEASUREMENT_ATTRIBUTION_INVALID",
  "DOUYIN_MEASUREMENT_INSTALLATION_UNSUPPORTED",
  "DOUYIN_MEASUREMENT_PRIVACY_VERSION_MISMATCH",
  "DOUYIN_MEASUREMENT_IDEMPOTENCY_CONFLICT",
  "DOUYIN_MEASUREMENT_SMS_INVALID",
  "DOUYIN_MEASUREMENT_SMS_EXPIRED",
  "DOUYIN_MEASUREMENT_ESTIMATE_NOT_FOUND",
  "DOUYIN_MEASUREMENT_SNAPSHOT_TOO_LARGE",
  "DOUYIN_MEASUREMENT_NUMBER_EXHAUSTED",
  "DOUYIN_MEASUREMENT_SMS_CONSUME_CONFLICT",
] as const;

const AppointmentCommandErrorSchema = z.strictObject({
  status_code: z.number().int(),
  code: z.enum(MEASUREMENT_COMMAND_ERROR_CODES),
});

const AppointmentCommandEnvelopeSchema = z.union([
  z.strictObject({ data: AppointmentResultSchema }),
  z.strictObject({ error: AppointmentCommandErrorSchema }),
]);

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

export type SubmitDouyinMeasurementAppointmentInput = {
  readonly installationId: string;
  readonly tenantId: string;
  readonly phone: string;
  readonly name: string;
  readonly community: string;
  readonly preferredVisitDate: string;
  readonly preferredVisitPeriod: DouyinVisitPeriod;
  readonly budgetEstimateId: string | null;
  readonly demand: string | null;
  readonly smsCode: string;
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

type GeneratedAppointmentArgs = Database["public"]["Functions"][
  "submit_douyin_measurement_appointment"
]["Args"];
type AppointmentRpcArgs = Omit<GeneratedAppointmentArgs,
  | "p_budget_estimate_id" | "p_demand" | "p_request_ip" | "p_user_agent"> & {
  readonly p_budget_estimate_id: string | null;
  readonly p_demand: string | null;
  readonly p_request_ip: string | null;
  readonly p_user_agent: string | null;
};

export class DouyinMiniappMarketingRepository {
  constructor(
    private readonly client: DouyinMiniappMarketingDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinMiniappMarketingDatabaseClient,
  ) {}

  async submitMeasurementAppointment(input: SubmitDouyinMeasurementAppointmentInput) {
    return executeDatabaseOperation("提交抖音小程序预约失败", async () => {
      const args = {
        p_douyin_miniapp_installation_id: input.installationId,
        p_tenant_id: input.tenantId,
        p_phone: input.phone,
        p_name: input.name,
        p_community: input.community,
        p_preferred_visit_date: input.preferredVisitDate,
        p_preferred_visit_period: input.preferredVisitPeriod,
        p_budget_estimate_id: input.budgetEstimateId,
        p_demand: input.demand,
        p_sms_code: input.smsCode,
        p_idempotency_key: input.idempotencyKey,
        p_subject_hash: input.subjectHash,
        p_request_ip: input.requestIp,
        p_user_agent: input.userAgent,
        p_privacy_policy_version: input.privacyPolicyVersion,
        p_consented_at: input.consentedAt,
        p_attribution: copyAttribution(input.attribution),
      } satisfies AppointmentRpcArgs;
      const result = await this.client.rpc(
        "submit_douyin_measurement_appointment",
        args,
      );
      assertDatabaseSuccess(result, "提交抖音小程序预约失败");
      const parsed = AppointmentCommandEnvelopeSchema.safeParse(result.data);
      if (!parsed.success) throw invalidResponse();
      if ("data" in parsed.data) return parsed.data.data;
      throwMeasurementCommandError(parsed.data.error);
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
  throw Errors.dbError(message);
}

const MEASUREMENT_COMMAND_ERRORS: Readonly<Record<
  (typeof MEASUREMENT_COMMAND_ERROR_CODES)[number], {
  readonly statusCode: number;
  readonly message: string;
}>> = {
  DOUYIN_MEASUREMENT_COMMAND_INVALID: {
    statusCode: 400, message: "预约信息格式无效",
  },
  DOUYIN_MEASUREMENT_ATTRIBUTION_INVALID: {
    statusCode: 400, message: "来源信息格式无效",
  },
  DOUYIN_MEASUREMENT_INSTALLATION_UNSUPPORTED: {
    statusCode: 409, message: "小程序服务暂不可用",
  },
  DOUYIN_MEASUREMENT_PRIVACY_VERSION_MISMATCH: {
    statusCode: 409,
    message: "隐私政策版本已更新，请重新确认",
  },
  DOUYIN_MEASUREMENT_IDEMPOTENCY_CONFLICT: {
    statusCode: 409, message: "请勿重复提交不同内容",
  },
  DOUYIN_MEASUREMENT_SMS_INVALID: { statusCode: 400, message: "验证码错误" },
  DOUYIN_MEASUREMENT_SMS_EXPIRED: { statusCode: 400, message: "验证码已过期" },
  DOUYIN_MEASUREMENT_ESTIMATE_NOT_FOUND: {
    statusCode: 404, message: "预算结果不存在或不可用",
  },
  DOUYIN_MEASUREMENT_SNAPSHOT_TOO_LARGE: {
    statusCode: 400, message: "预约信息过大",
  },
  DOUYIN_MEASUREMENT_NUMBER_EXHAUSTED: {
    statusCode: 409, message: "今日预约已满，请稍后再试",
  },
  DOUYIN_MEASUREMENT_SMS_CONSUME_CONFLICT: {
    statusCode: 409, message: "验证码已被使用，请重新获取",
  },
};

function throwMeasurementCommandError(
  error: z.infer<typeof AppointmentCommandErrorSchema>,
): never {
  const mapped = MEASUREMENT_COMMAND_ERRORS[error.code];
  if (error.status_code !== mapped.statusCode) throw invalidResponse();
  throw Errors.business(mapped.statusCode, mapped.message, error.code);
}

function copyAttribution(input: DouyinMarketingAttribution): Record<string, string> {
  const output: Record<string, string> = {};
  if (input.source_type !== undefined) output.source_type = input.source_type;
  if (input.entry_path !== undefined) output.entry_path = input.entry_path;
  if (input.scene !== undefined) output.scene = input.scene;
  if (input.campaign_code !== undefined) output.campaign_code = input.campaign_code;
  if (input.content_id !== undefined) output.content_id = input.content_id;
  return output;
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
