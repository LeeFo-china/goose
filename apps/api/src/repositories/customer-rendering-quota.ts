import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type DatabaseResult = { data: unknown; error: unknown };

export interface CustomerRenderingQuotaRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<DatabaseResult>;
}

export type CustomerRenderingChannel = "wechat" | "douyin";

export type CustomerRenderingQuotaIdentity = {
  tenantId: string;
  channel: CustomerRenderingChannel;
  subjectKeyVersion: number;
  subjectDigest: string;
  applicationId: string | null;
  installationId: string | null;
};

export type CustomerRenderingPhoneIdentity = {
  phoneKeyVersion: number | null;
  phoneDigest: string | null;
};

const SnapshotFields = {
  account_id: z.uuid().nullable(),
  phone_verified: z.boolean(),
  consumed: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  active_job_id: z.uuid().nullable(),
  reservation_status: z.enum(["reserved", "consumed", "released"]).nullable(),
};

const ReadResultSchema = z.strictObject({
  decision: z.literal("ok"),
  ...SnapshotFields,
});

const BindResultSchema = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.enum(["bound", "existing"]), ...SnapshotFields }),
  z.strictObject({ decision: z.literal("idempotency_conflict") }),
]);

const ReserveResultSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    decision: z.enum([
      "reserved",
      "existing",
      "phone_required",
      "quota_exhausted",
      "job_active",
    ]),
    ...SnapshotFields,
  }),
  z.strictObject({ decision: z.literal("idempotency_conflict") }),
]);

const SettleResultSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    decision: z.enum(["consume", "release", "existing", "invalid_state"]),
    ...SnapshotFields,
  }),
  z.strictObject({ decision: z.literal("not_found") }),
]);

export type CustomerRenderingQuotaReadResult = z.infer<typeof ReadResultSchema>;
export type CustomerRenderingQuotaBindResult = z.infer<typeof BindResultSchema>;
export type CustomerRenderingQuotaReserveResult = z.infer<typeof ReserveResultSchema>;
export type CustomerRenderingQuotaSettleResult = z.infer<typeof SettleResultSchema>;

type IdentityRpcParams = CustomerRenderingQuotaIdentity & CustomerRenderingPhoneIdentity;

function identityParams(input: IdentityRpcParams) {
  return {
    p_tenant_id: input.tenantId,
    p_channel: input.channel,
    p_subject_key_version: input.subjectKeyVersion,
    p_subject_digest: input.subjectDigest,
    p_application_id: input.applicationId,
    p_installation_id: input.installationId,
    p_phone_key_version: input.phoneKeyVersion,
    p_phone_digest: input.phoneDigest,
  };
}

export class CustomerRenderingQuotaRepository {
  constructor(private readonly configuredClient?: CustomerRenderingQuotaRpcClient) {}

  private get client(): CustomerRenderingQuotaRpcClient {
    return this.configuredClient
      ?? SupabaseDB.getAdminClient() as unknown as CustomerRenderingQuotaRpcClient;
  }

  async read(input: IdentityRpcParams) {
    const { p_application_id: _applicationId, p_installation_id: _installationId, ...params } =
      identityParams(input);
    return this.call(
      "get_customer_rendering_quota",
      params,
      ReadResultSchema,
      "读取客户生图额度失败",
    );
  }

  async bindPhone(input: IdentityRpcParams & {
    phoneKeyVersion: number;
    phoneDigest: string;
    idempotencyKey: string;
    requestHash: string;
  }) {
    return this.call(
      "bind_customer_rendering_phone",
      {
        ...identityParams(input),
        p_idempotency_key: input.idempotencyKey,
        p_request_hash: input.requestHash,
      },
      BindResultSchema,
      "绑定客户生图手机号失败",
    );
  }

  async reserve(input: IdentityRpcParams & {
    jobId: string;
    idempotencyKey: string;
    requestHash: string;
  }) {
    return this.call(
      "reserve_customer_rendering_quota",
      {
        ...identityParams(input),
        p_job_id: input.jobId,
        p_idempotency_key: input.idempotencyKey,
        p_request_hash: input.requestHash,
      },
      ReserveResultSchema,
      "预占客户生图额度失败",
    );
  }

  async settle(input: {
    tenantId: string;
    jobId: string;
    outcome: "consume" | "release";
  }) {
    return this.call(
      "settle_customer_rendering_quota",
      {
        p_tenant_id: input.tenantId,
        p_job_id: input.jobId,
        p_outcome: input.outcome,
      },
      SettleResultSchema,
      "结算客户生图额度失败",
    );
  }

  private async call<T>(
    name: string,
    params: Record<string, unknown>,
    schema: z.ZodType<T>,
    failureMessage: string,
  ): Promise<T> {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throw Errors.dbError(failureMessage, error);
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError(`${failureMessage}：返回格式异常`, parsed.error.issues);
    }
    return parsed.data;
  }
}

export const customerRenderingQuotaRepository = new CustomerRenderingQuotaRepository();
