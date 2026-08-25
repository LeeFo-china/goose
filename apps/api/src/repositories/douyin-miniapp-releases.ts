import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import {
  DOUYIN_MINIAPP_RELEASE_OPERATIONS,
  type ClaimDouyinMiniappReleaseOperationInput,
  type DouyinMiniappReleaseOperationClaim,
} from "./douyin-miniapp-releases-claims";

export * from "./douyin-miniapp-releases-claims";

export const DOUYIN_MINIAPP_RELEASE_STATUSES = [
  "created",
  "uploaded",
  "testing",
  "audit_pending",
  "audit_rejected",
  "audit_approved",
  "released",
  "failed",
] as const;

const RELEASE_SELECT = [
  "id", "installation_id", "template_id", "template_version", "description",
  "channel", "ext_json", "status", "douyin_log_id", "test_qr_url",
  "latest_test_qr_url", "audit_qr_url", "audit_host_names", "audit_note",
  "audit_result", "submitted_at", "audited_at", "released_at",
  "platform_operator_id", "created_at", "updated_at",
].join(",");

const FORBIDDEN_METADATA = /(token|secret|phone|openid)/i;
const TemplateIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const TemplateVersionSchema = z.string()
  .max(64)
  .regex(SEMVER_PATTERN);
const DateTimeSchema = z.iso.datetime({ offset: true });
const NullableDateTimeSchema = DateTimeSchema.nullable();
const NullableSafeIdentifierSchema = z.string()
  .regex(/^[A-Za-z0-9._:-]{1,128}$/)
  .nullable();
const HttpsUrlSchema = z.string().url().max(2048).refine(isSafeHttpsUrl);
const AuditHostNameSchema = z.string()
  .min(1)
  .max(253)
  .regex(/^[A-Za-z0-9.-]+$/)
  .refine((value) => !FORBIDDEN_METADATA.test(value));
const AuditHostNamesSchema = z.array(AuditHostNameSchema).max(20)
  .refine((hostNames) => new Set(hostNames).size === hostNames.length);
const AuditNoteSchema = z.string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => !FORBIDDEN_METADATA.test(value));
const AuditResultSchema = z.strictObject({
  audit_id: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
  status: z.enum(["pending", "approved", "rejected", "failed"]).optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
  error_code: z.string().regex(/^[A-Z0-9_:-]{1,128}$/).optional(),
}).refine((value) => !FORBIDDEN_METADATA.test(JSON.stringify(value)));
const ExtJsonSchema = z.strictObject({
  extEnable: z.literal(true),
  extAppid: z.string().trim().min(1).max(128),
  ext: z.strictObject({
    deployment_key: z.string().trim().min(1).max(128),
  }),
});
const ReleaseSchema = z.strictObject({
  id: z.string().uuid(),
  installation_id: z.string().uuid(),
  template_id: TemplateIdSchema,
  template_version: TemplateVersionSchema,
  description: z.string().trim().min(1).max(200),
  channel: z.enum(["default", "1"]),
  ext_json: ExtJsonSchema,
  status: z.enum(DOUYIN_MINIAPP_RELEASE_STATUSES),
  douyin_log_id: NullableSafeIdentifierSchema,
  test_qr_url: HttpsUrlSchema.nullable(),
  latest_test_qr_url: HttpsUrlSchema.nullable(),
  audit_qr_url: HttpsUrlSchema.nullable(),
  audit_host_names: AuditHostNamesSchema,
  audit_note: AuditNoteSchema.nullable(),
  audit_result: AuditResultSchema.nullable(),
  submitted_at: NullableDateTimeSchema,
  audited_at: NullableDateTimeSchema,
  released_at: NullableDateTimeSchema,
  platform_operator_id: z.string().uuid(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
const OperationNameSchema = z.enum(DOUYIN_MINIAPP_RELEASE_OPERATIONS);
const OperationClaimRowSchema = z.strictObject({
  release_id: z.string().uuid(),
  claim_token: z.string().uuid(),
  claim_expires_at: DateTimeSchema,
  recovery_required: z.boolean(),
});
const ClaimedUploadReleaseSchema = ReleaseSchema.extend({
  operation_name: OperationNameSchema.nullable(),
  operation_claim_token: z.string().uuid().nullable(),
  operation_claim_expires_at: NullableDateTimeSchema,
  recovery_required: z.boolean(),
}).refine((value) => {
  const claim = [
    value.operation_name,
    value.operation_claim_token,
    value.operation_claim_expires_at,
  ];
  return claim.every((item) => item === null) || claim.every((item) => item !== null);
});

export type DouyinMiniappReleaseStatus =
  (typeof DOUYIN_MINIAPP_RELEASE_STATUSES)[number];
export type DouyinMiniappReleaseExtJson = z.infer<typeof ExtJsonSchema>;
export type DouyinMiniappReleaseAuditResult = z.infer<typeof AuditResultSchema>;
export type DouyinMiniappReleaseRecord = z.infer<typeof ReleaseSchema>;
export type DouyinMiniappClaimedUploadRelease = z.infer<typeof ClaimedUploadReleaseSchema>;

export type GetOrCreateAndClaimDouyinMiniappUploadInput = {
  readonly installationId: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly description: string;
  readonly channel: "default" | "1";
  readonly extJson: DouyinMiniappReleaseExtJson;
  readonly platformOperatorId: string;
  readonly claimToken: string;
  readonly claimExpiresAt: string;
};

export type UpdateDouyinMiniappReleaseInput = {
  readonly status?: DouyinMiniappReleaseStatus;
  readonly douyinLogId?: string | null;
  readonly testQrUrl?: string | null;
  readonly latestTestQrUrl?: string | null;
  readonly auditQrUrl?: string | null;
  readonly auditHostNames?: readonly string[];
  readonly auditNote?: string | null;
  readonly auditResult?: DouyinMiniappReleaseAuditResult | null;
  readonly submittedAt?: string | null;
  readonly auditedAt?: string | null;
  readonly releasedAt?: string | null;
  readonly platformOperatorId: string;
};

export type DouyinMiniappReleaseDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

export interface DouyinMiniappReleaseQuery {
  select(columns: string, options?: unknown): DouyinMiniappReleaseQuery;
  update(value: unknown): DouyinMiniappReleaseQuery;
  eq(column: string, value: unknown): DouyinMiniappReleaseQuery;
  order(column: string, options: unknown): DouyinMiniappReleaseQuery;
  range(from: number, to: number): DouyinMiniappReleaseQuery;
  maybeSingle(): Promise<DouyinMiniappReleaseDatabaseResult>;
  then<TResult1 = DouyinMiniappReleaseDatabaseResult, TResult2 = never>(
    onfulfilled?: (
      (value: DouyinMiniappReleaseDatabaseResult) => TResult1 | PromiseLike<TResult1>
    ) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface DouyinMiniappReleaseDatabaseClient {
  from(table: string): DouyinMiniappReleaseQuery;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<DouyinMiniappReleaseDatabaseResult>;
}

export class DouyinMiniappReleasesRepository {
  constructor(
    private readonly client: DouyinMiniappReleaseDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinMiniappReleaseDatabaseClient,
  ) {}

  async listByInstallation(input: {
    readonly installationId: string;
    readonly page: number;
    readonly pageSize: number;
  }): Promise<{ list: DouyinMiniappReleaseRecord[]; total: number }> {
    const query = parseInput(ListInputSchema, input);
    return execute(async () => {
      const from = (query.page - 1) * query.pageSize;
      const result = await this.client
        .from("douyin_miniapp_releases")
        .select(RELEASE_SELECT, { count: "exact" })
        .eq("installation_id", query.installationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + query.pageSize - 1);
      assertSuccess(result);
      const parsed = z.array(ReleaseSchema).safeParse(result.data);
      if (!parsed.success) throw invalidResponse();
      return { list: parsed.data, total: result.count ?? 0 };
    });
  }

  async findById(releaseId: string): Promise<DouyinMiniappReleaseRecord | null> {
    return execute(async () => {
      const result = await this.client
        .from("douyin_miniapp_releases")
        .select(RELEASE_SELECT)
        .eq("id", releaseId)
        .maybeSingle();
      assertSuccess(result);
      return result.data === null ? null : parseRelease(result.data);
    });
  }

  async claimOperation(
    input: ClaimDouyinMiniappReleaseOperationInput,
  ): Promise<DouyinMiniappReleaseOperationClaim | null> {
    const claim = parseInput(ClaimOperationInputSchema, input);
    return execute(async () => {
      const result = await this.client.rpc("claim_douyin_miniapp_release_operation", {
        p_release_id: claim.releaseId,
        p_expected_statuses: claim.expectedStatuses,
        p_operation_name: claim.operationName,
        p_claim_token: claim.claimToken,
        p_claim_expires_at: claim.claimExpiresAt,
        p_operator_id: claim.platformOperatorId,
      });
      assertSuccess(result);
      if (!Array.isArray(result.data) || result.data.length > 1) throw invalidResponse();
      if (result.data.length === 0) return null;
      const parsed = OperationClaimRowSchema.safeParse(result.data[0]);
      if (!parsed.success) throw invalidResponse();
      return {
        releaseId: parsed.data.release_id,
        claimToken: parsed.data.claim_token,
        claimExpiresAt: parsed.data.claim_expires_at,
        recoveryRequired: parsed.data.recovery_required,
      };
    });
  }

  async getOrCreateAndClaimUpload(
    input: GetOrCreateAndClaimDouyinMiniappUploadInput,
  ): Promise<DouyinMiniappClaimedUploadRelease | null> {
    const claim = parseInput(UploadClaimInputSchema, input);
    return execute(async () => {
      const result = await this.client.rpc(
        "get_or_create_and_claim_douyin_miniapp_release_upload",
        {
          p_installation_id: claim.installationId,
          p_template_id: claim.templateId,
          p_template_version: claim.templateVersion,
          p_description: claim.description,
          p_channel: claim.channel,
          p_ext_json: claim.extJson,
          p_claim_token: claim.claimToken,
          p_claim_expires_at: claim.claimExpiresAt,
          p_operator_id: claim.platformOperatorId,
        },
      );
      assertUploadClaimSuccess(result);
      if (!Array.isArray(result.data) || result.data.length > 1) throw invalidResponse();
      if (result.data.length === 0) return null;
      const parsed = ClaimedUploadReleaseSchema.safeParse(result.data[0]);
      if (!parsed.success) throw invalidResponse();
      return parsed.data;
    });
  }

  async updateClaimed(
    releaseId: string,
    claimToken: string,
    input: UpdateDouyinMiniappReleaseInput,
  ): Promise<DouyinMiniappReleaseRecord | null> {
    return this.writeClaimed(releaseId, claimToken, input, true);
  }

  async patchClaimed(
    releaseId: string,
    claimToken: string,
    input: UpdateDouyinMiniappReleaseInput,
  ): Promise<DouyinMiniappReleaseRecord | null> {
    return this.writeClaimed(releaseId, claimToken, input, false);
  }

  private async writeClaimed(
    releaseId: string,
    claimToken: string,
    input: UpdateDouyinMiniappReleaseInput,
    releaseClaim: boolean,
  ): Promise<DouyinMiniappReleaseRecord | null> {
    const identity = parseInput(ClaimIdentitySchema, { releaseId, claimToken });
    const value = parseInput(UpdateRowSchema, compactUpdate(input));
    return execute(async () => {
      const result = await this.client
        .from("douyin_miniapp_releases")
        .update({
          ...value,
          ...(releaseClaim ? {
            operation_name: null,
            operation_claim_token: null,
            operation_claim_expires_at: null,
          } : {}),
        })
        .eq("id", identity.releaseId)
        .eq("operation_claim_token", identity.claimToken)
        .select(RELEASE_SELECT)
        .maybeSingle();
      assertSuccess(result);
      return result.data === null ? null : parseRelease(result.data);
    });
  }
}

const ListInputSchema = z.strictObject({
  installationId: z.string().uuid(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
});

const ClaimOperationInputSchema = z.strictObject({
  releaseId: z.string().uuid(),
  expectedStatuses: z.array(z.enum(DOUYIN_MINIAPP_RELEASE_STATUSES)).min(1).max(8)
    .refine((statuses) => new Set(statuses).size === statuses.length),
  operationName: OperationNameSchema,
  claimToken: z.string().uuid(),
  claimExpiresAt: DateTimeSchema,
  platformOperatorId: z.string().uuid(),
});
const UploadClaimInputSchema = z.strictObject({
  installationId: z.string().uuid(),
  templateId: TemplateIdSchema,
  templateVersion: TemplateVersionSchema,
  description: z.string().trim().min(1).max(200),
  channel: z.enum(["default", "1"]),
  extJson: ExtJsonSchema,
  platformOperatorId: z.string().uuid(),
  claimToken: z.string().uuid(),
  claimExpiresAt: DateTimeSchema,
});
const ClaimIdentitySchema = z.strictObject({
  releaseId: z.string().uuid(),
  claimToken: z.string().uuid(),
});

const UpdateRowSchema = z.strictObject({
  status: z.enum(DOUYIN_MINIAPP_RELEASE_STATUSES).optional(),
  douyin_log_id: NullableSafeIdentifierSchema.optional(),
  test_qr_url: HttpsUrlSchema.nullable().optional(),
  latest_test_qr_url: HttpsUrlSchema.nullable().optional(),
  audit_qr_url: HttpsUrlSchema.nullable().optional(),
  audit_host_names: AuditHostNamesSchema.optional(),
  audit_note: AuditNoteSchema.nullable().optional(),
  audit_result: AuditResultSchema.nullable().optional(),
  submitted_at: NullableDateTimeSchema.optional(),
  audited_at: NullableDateTimeSchema.optional(),
  released_at: NullableDateTimeSchema.optional(),
  platform_operator_id: z.string().uuid(),
});

function compactUpdate(input: UpdateDouyinMiniappReleaseInput): Record<string, unknown> {
  return {
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.douyinLogId !== undefined ? { douyin_log_id: input.douyinLogId } : {}),
    ...(input.testQrUrl !== undefined ? { test_qr_url: input.testQrUrl } : {}),
    ...(input.latestTestQrUrl !== undefined
      ? { latest_test_qr_url: input.latestTestQrUrl }
      : {}),
    ...(input.auditQrUrl !== undefined ? { audit_qr_url: input.auditQrUrl } : {}),
    ...(input.auditHostNames !== undefined
      ? { audit_host_names: [...input.auditHostNames] }
      : {}),
    ...(input.auditNote !== undefined ? { audit_note: input.auditNote } : {}),
    ...(input.auditResult !== undefined ? { audit_result: input.auditResult } : {}),
    ...(input.submittedAt !== undefined ? { submitted_at: input.submittedAt } : {}),
    ...(input.auditedAt !== undefined ? { audited_at: input.auditedAt } : {}),
    ...(input.releasedAt !== undefined ? { released_at: input.releasedAt } : {}),
    platform_operator_id: input.platformOperatorId,
  };
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

async function execute<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw repositoryError();
  }
}

function assertSuccess(result: DouyinMiniappReleaseDatabaseResult): void {
  if (!result.error) return;
  if (hasUnfinishedReleaseConstraint(result.error)) {
    throw unfinishedReleaseError();
  }
  throw repositoryError();
}

function assertUploadClaimSuccess(result: DouyinMiniappReleaseDatabaseResult): void {
  if (!result.error) return;
  const message = databaseErrorMessage(result.error);
  if (message === "DOUYIN_MINIAPP_RELEASE_DELIVERY_CONFLICT") {
    throw Errors.business(
      409,
      "抖音小程序同版本发布参数冲突",
      message,
    );
  }
  if (message === "DOUYIN_TENANT_RELEASE_IN_PROGRESS") {
    throw Errors.business(
      409,
      "当前版本尚未结束，不能生成新版体验版",
      message,
    );
  }
  if (
    hasUnfinishedReleaseConstraint(result.error)
  ) {
    throw unfinishedReleaseError();
  }
  throw repositoryError();
}

function databaseErrorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

function databaseErrorConstraint(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("constraint" in error)) {
    return undefined;
  }
  return typeof error.constraint === "string" ? error.constraint : undefined;
}

function hasUnfinishedReleaseConstraint(error: unknown): boolean {
  const constraint = "douyin_miniapp_releases_one_unfinished_installation_idx";
  return databaseErrorConstraint(error) === constraint
    || databaseErrorMessage(error)?.includes(`\"${constraint}\"`) === true;
}

function unfinishedReleaseError(): AppError {
  return Errors.business(
    409,
    "当前版本尚未结束，不能生成新版体验版",
    "DOUYIN_TENANT_RELEASE_IN_PROGRESS",
  );
}

function parseRelease(data: unknown): DouyinMiniappReleaseRecord {
  const parsed = ReleaseSchema.safeParse(data);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

function parseInput<Output>(schema: z.ZodType<Output>, data: unknown): Output {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw invalidInput();
  return parsed.data;
}

function invalidInput(): AppError {
  return Errors.business(
    500,
    "抖音小程序发布存储参数无效",
    "DOUYIN_MINIAPP_RELEASE_REPOSITORY_INPUT_INVALID",
  );
}

function invalidResponse(): AppError {
  return Errors.business(
    500,
    "抖音小程序发布存储响应格式无效",
    "DOUYIN_MINIAPP_RELEASE_REPOSITORY_RESPONSE_INVALID",
  );
}

function repositoryError(): AppError {
  return Errors.business(
    500,
    "抖音小程序发布存储失败",
    "DOUYIN_MINIAPP_RELEASE_REPOSITORY_ERROR",
  );
}

export const douyinMiniappReleasesRepository = new DouyinMiniappReleasesRepository();
