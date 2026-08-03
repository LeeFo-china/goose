import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const SESSION_INSTALLATION_SELECT = [
  "id",
  "tenant_id",
  "authorizer_appid",
  "deployment_key",
  "installation_kind",
  "authorization_status",
  "template_version",
  "tenant:tenants(id,status)",
].join(",");

const SessionInstallationSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().nullable(),
  authorizer_appid: z.string().min(1),
  deployment_key: z.string().nullable(),
  installation_kind: z.enum(["merchant", "template_development"]),
  authorization_status: z.enum([
    "authorized_unbound",
    "active",
    "disabled",
    "revoked",
  ]),
  template_version: z.string().nullable(),
  tenant: z.object({
    id: z.string().uuid(),
    status: z.enum(["active", "suspended", "archived"]),
  }).nullable(),
});

export type DouyinMiniappSessionRecord = z.infer<typeof SessionInstallationSchema>;
export type DouyinMiniappSessionDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
};
export interface DouyinMiniappSessionQuery {
  select(columns: string): DouyinMiniappSessionQuery;
  eq(column: string, value: unknown): DouyinMiniappSessionQuery;
  maybeSingle(): Promise<DouyinMiniappSessionDatabaseResult>;
}
export interface DouyinMiniappSessionDatabaseClient {
  from(table: string): DouyinMiniappSessionQuery;
}

export class DouyinMiniappSessionsRepository {
  constructor(
    private readonly client: DouyinMiniappSessionDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinMiniappSessionDatabaseClient,
  ) {}

  async findByAppId(appId: string): Promise<DouyinMiniappSessionRecord | null> {
    return execute(async () => {
      const result = await this.client
        .from("douyin_miniapp_installations")
        .select(SESSION_INSTALLATION_SELECT)
        .eq("authorizer_appid", appId)
        .maybeSingle();
      if (result.error) throw repositoryError();
      if (result.data === null) return null;
      const parsed = SessionInstallationSchema.safeParse(result.data);
      if (!parsed.success) throw invalidResponseError();
      return parsed.data;
    });
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

function repositoryError() {
  return Errors.business(
    500,
    "查询抖音小程序会话安装失败",
    "DOUYIN_SESSION_REPOSITORY_ERROR",
  );
}

function invalidResponseError() {
  return Errors.business(
    500,
    "抖音小程序会话安装数据无效",
    "DOUYIN_SESSION_REPOSITORY_RESPONSE_INVALID",
  );
}

export const douyinMiniappSessionsRepository = new DouyinMiniappSessionsRepository();
