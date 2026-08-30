import { z } from "zod";
import { Errors } from "@/errors/error-factory";

const TEMPLATE_UPLOAD_URL = "https://open.douyin.com/api/apps/v1/package_version/upload/";
const TEST_QR_CODE_URL = "https://open.douyin.com/api/apps/v2/basic_info/get_qr_code/";
const AVAILABLE_AUDIT_HOSTS_URL =
  "https://open.douyin.com/api/apps/v1/package_version/get_audit_hosts/";
const VERSION_AUDIT_URL = "https://open.douyin.com/api/apps/v2/package_version/audit/";
const VERSION_LIST_URL = "https://open.douyin.com/api/apps/v1/package_version/versions/";
const VERSION_RELEASE_URL = "https://open.douyin.com/api/apps/v1/package_version/release/";
const TEMPLATE_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const SENSITIVE_EXT_JSON_KEY_PATTERN = /token|secret|phone|openid/i;
const MAX_AUDIT_HOSTS = 20;

export const SafeDouyinLogIdSchema = z.string()
  .regex(/^[A-Za-z0-9._:-]{1,128}$/)
  .refine((value) => !SENSITIVE_EXT_JSON_KEY_PATTERN.test(value));

const BooleanFlagSchema = z.union([z.literal(0), z.literal(1), z.boolean()])
  .transform((value) => value === true || value === 1);
const SafeQrCodeUrlSchema = z.string().url().max(2048).refine(isSafeQrCodeUrl);

const TemplateExtJsonSchema = z.strictObject({
  extEnable: z.literal(true),
  extAppid: z.string().min(1).max(128),
  ext: z.strictObject({
    deployment_key: z.string().min(1).max(128),
    deployment_environment: z.enum(["development", "production"]),
  }),
});
const TemplateUploadSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: SafeDouyinLogIdSchema,
});
const TestQrCodeSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: SafeDouyinLogIdSchema,
  data: z.looseObject({ qr_code_url: SafeQrCodeUrlSchema }),
});
const AuditHostNamesSchema = z.array(z.string().min(1).max(64)).min(1).max(MAX_AUDIT_HOSTS)
  .refine((hostNames) => new Set(hostNames).size === hostNames.length);
const AvailableAuditHostsSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: SafeDouyinLogIdSchema,
  data: z.looseObject({
    host_names: AuditHostNamesSchema,
    released_host_names: z.array(z.string().min(1).max(64)).max(MAX_AUDIT_HOSTS)
      .refine((hostNames) => new Set(hostNames).size === hostNames.length),
  }),
});
const ReleaseOperationSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: SafeDouyinLogIdSchema,
});
const VersionStageSchema = z.looseObject({
  version: z.string().min(1),
  summary: z.string().optional(),
  status: z.union([z.string(), z.number()]).optional(),
  has_audit: BooleanFlagSchema.optional(),
  has_publish: BooleanFlagSchema.optional(),
  ctime: z.union([z.string(), z.number()]).optional(),
  reason: z.string().optional(),
});
const VersionListSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: SafeDouyinLogIdSchema,
  data: z.looseObject({
    audit: VersionStageSchema.optional(),
    current: VersionStageSchema.optional(),
    latest: VersionStageSchema.optional(),
    gray: VersionStageSchema.optional(),
  }),
});

export type AuthorizerRequestInput = {
  readonly authorizerAccessToken: string;
  readonly appId: string;
};
export type DouyinQrCodeVersion = "latest" | "audit";

export type DouyinTemplateExtJson = {
  readonly extEnable: true;
  readonly extAppid: string;
  readonly ext: {
    readonly deployment_key: string;
    readonly deployment_environment: "development" | "production";
  };
};

export type UploadTemplateVersionInput = AuthorizerRequestInput & {
  readonly templateId: string;
  readonly extJson: DouyinTemplateExtJson;
  readonly userDescription: string;
  readonly userVersion: string;
  readonly tag?: "" | "1";
};

export type UploadTemplateVersionResult = { readonly logId: string };
export type QrCodeInput = AuthorizerRequestInput & {
  readonly version?: DouyinQrCodeVersion;
};
export type TestQrCodeResult = { readonly qrCodeUrl: string; readonly logId: string };
export type AvailableAuditHostsResult = {
  readonly hostNames: readonly string[];
  readonly releasedHostNames: readonly string[];
  readonly logId: string;
};
export type SubmitVersionAuditInput = AuthorizerRequestInput & {
  readonly hostNames: readonly string[];
  readonly auditNote: string;
  readonly auditWay?: 1;
};
export type SafeDouyinVersionStage = {
  readonly version: string;
  readonly summary?: string;
  readonly status?: string | number;
  readonly hasAudit?: boolean;
  readonly hasPublish?: boolean;
  readonly createdAt?: string | number;
  readonly reason?: string;
};
export type DouyinVersionListResult = {
  readonly audit?: SafeDouyinVersionStage;
  readonly current?: SafeDouyinVersionStage;
  readonly latest?: SafeDouyinVersionStage;
  readonly gray?: SafeDouyinVersionStage;
  readonly logId: string;
};
export type ReleaseOperationResult = { readonly logId: string };

export interface DouyinMiniappReleaseGateway {
  uploadTemplateVersion(input: UploadTemplateVersionInput): Promise<UploadTemplateVersionResult>;
  getTestQrCode(input: QrCodeInput): Promise<TestQrCodeResult>;
  getAvailableAuditHosts(input: AuthorizerRequestInput): Promise<AvailableAuditHostsResult>;
  submitVersionAudit(input: SubmitVersionAuditInput): Promise<ReleaseOperationResult>;
  getVersionList(input: AuthorizerRequestInput): Promise<DouyinVersionListResult>;
  releaseVersion(input: AuthorizerRequestInput): Promise<ReleaseOperationResult>;
}

export type DouyinReleaseTransport = {
  readonly request: (
    url: string,
    init: RequestInit,
  ) => Promise<Record<string, unknown>>;
  readonly executeWithAuthorizerToken: <Result>(
    input: AuthorizerRequestInput,
    operation: (accessToken: string) => Promise<Result>,
  ) => Promise<Result>;
  readonly assertSuccess: (body: Record<string, unknown>) => void;
  readonly invalidResponse: (body: Record<string, unknown>) => never;
};

export class DouyinMiniappReleaseClient implements DouyinMiniappReleaseGateway {
  constructor(private readonly transport: DouyinReleaseTransport) {}

  async uploadTemplateVersion(
    input: UploadTemplateVersionInput,
  ): Promise<UploadTemplateVersionResult> {
    const requestBody = serializeTemplateUploadBody(input);
    return this.transport.executeWithAuthorizerToken(input, async (accessToken) => {
      const body = await this.transport.request(TEMPLATE_UPLOAD_URL, {
        method: "POST",
        headers: { "access-token": accessToken, "content-type": "application/json" },
        body: requestBody,
      });
      const parsed = this.parseSuccess(body, TemplateUploadSuccessSchema);
      return { logId: parsed.log_id };
    });
  }

  async getTestQrCode(input: QrCodeInput): Promise<TestQrCodeResult> {
    return this.transport.executeWithAuthorizerToken(input, async (accessToken) => {
      const version = input.version ?? "latest";
      const body = await this.transport.request(TEST_QR_CODE_URL, {
        method: "POST",
        headers: { "access-token": accessToken, "content-type": "application/json" },
        body: JSON.stringify({ version, path: "pages/home/index" }),
      });
      const parsed = this.parseSuccess(body, TestQrCodeSuccessSchema);
      return { qrCodeUrl: parsed.data.qr_code_url, logId: parsed.log_id };
    });
  }

  async getAvailableAuditHosts(
    input: AuthorizerRequestInput,
  ): Promise<AvailableAuditHostsResult> {
    return this.transport.executeWithAuthorizerToken(input, async (accessToken) => {
      const body = await this.transport.request(AVAILABLE_AUDIT_HOSTS_URL, {
        method: "GET",
        headers: { "access-token": accessToken, "content-type": "application/json" },
      });
      const parsed = this.parseSuccess(body, AvailableAuditHostsSuccessSchema);
      return {
        hostNames: parsed.data.host_names,
        releasedHostNames: parsed.data.released_host_names,
        logId: parsed.log_id,
      };
    });
  }

  async submitVersionAudit(input: SubmitVersionAuditInput): Promise<ReleaseOperationResult> {
    const hostNames = AuditHostNamesSchema.safeParse(input.hostNames);
    if (!hostNames.success) {
      throw Errors.business(400, "抖音审核宿主列表格式无效", "DOUYIN_AUDIT_HOSTS_INVALID");
    }
    return this.transport.executeWithAuthorizerToken(input, async (accessToken) => {
      const body = await this.transport.request(VERSION_AUDIT_URL, {
        method: "POST",
        headers: { "access-token": accessToken, "content-type": "application/json" },
        body: JSON.stringify({
          host_names: hostNames.data,
          audit_note: input.auditNote,
          ...(input.auditWay === 1 ? { audit_way: 1 } : {}),
        }),
      });
      const parsed = this.parseSuccess(body, ReleaseOperationSuccessSchema);
      return { logId: parsed.log_id };
    });
  }

  async getVersionList(input: AuthorizerRequestInput): Promise<DouyinVersionListResult> {
    return this.transport.executeWithAuthorizerToken(input, async (accessToken) => {
      const body = await this.transport.request(VERSION_LIST_URL, {
        method: "GET",
        headers: { "access-token": accessToken, "content-type": "application/json" },
      });
      const parsed = this.parseSuccess(body, VersionListSuccessSchema);
      return {
        ...(parsed.data.audit ? { audit: mapSafeVersionStage(parsed.data.audit) } : {}),
        ...(parsed.data.current ? { current: mapSafeVersionStage(parsed.data.current) } : {}),
        ...(parsed.data.latest ? { latest: mapSafeVersionStage(parsed.data.latest) } : {}),
        ...(parsed.data.gray ? { gray: mapSafeVersionStage(parsed.data.gray) } : {}),
        logId: parsed.log_id,
      };
    });
  }

  async releaseVersion(input: AuthorizerRequestInput): Promise<ReleaseOperationResult> {
    return this.transport.executeWithAuthorizerToken(input, async (accessToken) => {
      const body = await this.transport.request(VERSION_RELEASE_URL, {
        method: "POST",
        headers: { "access-token": accessToken, "content-type": "application/json" },
      });
      const parsed = this.parseSuccess(body, ReleaseOperationSuccessSchema);
      return { logId: parsed.log_id };
    });
  }

  private parseSuccess<Output>(
    body: Record<string, unknown>,
    schema: z.ZodType<Output>,
  ): Output {
    this.transport.assertSuccess(body);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return this.transport.invalidResponse(body);
    return parsed.data;
  }
}

function serializeTemplateUploadBody(input: UploadTemplateVersionInput): string {
  if (!TEMPLATE_ID_PATTERN.test(input.templateId)) {
    throw Errors.business(400, "抖音模板 ID 格式无效", "DOUYIN_TEMPLATE_ID_INVALID");
  }
  if (input.tag !== undefined && input.tag !== "" && input.tag !== "1") {
    throw Errors.business(400, "抖音模板上传标签格式无效", "DOUYIN_TEMPLATE_UPLOAD_INPUT_INVALID");
  }
  const extJson = TemplateExtJsonSchema.safeParse(input.extJson);
  if (hasSensitiveJsonKey(input.extJson) || !extJson.success || extJson.data.extAppid !== input.appId) {
    throw Errors.business(400, "抖音模板扩展配置格式无效", "DOUYIN_TEMPLATE_EXT_JSON_INVALID");
  }
  const fields = [
    `"ext_json":${JSON.stringify(JSON.stringify(extJson.data))}`,
    `"template_id":${input.templateId}`,
    `"user_desc":${JSON.stringify(input.userDescription)}`,
    `"user_version":${JSON.stringify(input.userVersion)}`,
  ];
  if (input.tag !== undefined) fields.push(`"tag":${JSON.stringify(input.tag)}`);
  return `{${fields.join(",")}}`;
}

function hasSensitiveJsonKey(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.entries(value).some(([key, nestedValue]) =>
    SENSITIVE_EXT_JSON_KEY_PATTERN.test(key) || hasSensitiveJsonKey(nestedValue, seen));
}

function isSafeQrCodeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function mapSafeVersionStage(stage: z.infer<typeof VersionStageSchema>): SafeDouyinVersionStage {
  return {
    version: stage.version,
    ...(stage.summary !== undefined ? { summary: stage.summary } : {}),
    ...(stage.status !== undefined ? { status: stage.status } : {}),
    ...(stage.has_audit !== undefined ? { hasAudit: stage.has_audit } : {}),
    ...(stage.has_publish !== undefined ? { hasPublish: stage.has_publish } : {}),
    ...(stage.ctime !== undefined ? { createdAt: stage.ctime } : {}),
    ...(stage.reason !== undefined ? { reason: stage.reason } : {}),
  };
}
