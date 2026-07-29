import { Errors } from "@/errors/error-factory";
import {
  type BrandingPlatformFileObjectRecord,
  platformFileObjectRepository,
} from "@/repositories/platform-file-objects";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = {
  data: unknown;
  error: unknown;
};

type BrandingQuery = {
  select(columns: string): BrandingQuery;
  eq(column: string, value: unknown): BrandingQuery;
  is(column: string, value: null): BrandingQuery;
  maybeSingle(): Promise<QueryResult>;
};

type BrandingClient = {
  from(table: string): BrandingQuery;
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<QueryResult>;
};

type BrandingFileRepository = {
  findPlatformBrandLogoForBinding(
    fileId: string,
  ): Promise<BrandingPlatformFileObjectRecord | null>;
  findTenantBrandLogoForBinding(
    fileId: string,
    tenantId: string,
  ): Promise<BrandingPlatformFileObjectRecord | null>;
};

export type BrandProfileScope = "platform" | "tenant";

export type BrandProfileRecord = {
  id: string;
  scope: BrandProfileScope;
  tenant_id: string | null;
  display_name: string;
  logo_file_id: string;
  published_display_name: string | null;
  published_logo_file_id: string | null;
  status: "draft" | "published" | "disabled";
  version: number;
  published_version: number | null;
  published_at: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandingTenantRecord = {
  id: string;
  name: string;
  status: string;
};

type BrandProfileScopeInput =
  | { scope: "platform"; tenantId: null }
  | { scope: "tenant"; tenantId: string };

export type SaveBrandProfileDraftInput = BrandProfileScopeInput & {
  displayName: string;
  logoFileId: string;
  expectedVersion: number;
  actorEmployeeId: string;
};

export type PublishBrandProfileInput = BrandProfileScopeInput & {
  expectedVersion: number;
  actorEmployeeId: string;
};

const BRAND_PROFILE_COLUMNS = [
  "id",
  "scope",
  "tenant_id",
  "display_name",
  "logo_file_id",
  "published_display_name",
  "published_logo_file_id",
  "status",
  "version",
  "published_version",
  "published_at",
  "updated_by_employee_id",
  "created_at",
  "updated_at",
].join(",");

export class BrandingRepository {
  constructor(
    private readonly getAdminClient: () => BrandingClient = () =>
      SupabaseDB.getAdminClient() as unknown as BrandingClient,
    private readonly fileRepository: BrandingFileRepository =
      platformFileObjectRepository,
  ) {}

  async findPlatformProfile() {
    const { data, error } = await this.getAdminClient()
      .from("brand_profiles")
      .select(BRAND_PROFILE_COLUMNS)
      .eq("scope", "platform")
      .is("tenant_id", null)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台品牌资料失败", error);
    return (data as BrandProfileRecord | null) ?? null;
  }

  async findTenantProfile(tenantId: string) {
    const { data, error } = await this.getAdminClient()
      .from("brand_profiles")
      .select(BRAND_PROFILE_COLUMNS)
      .eq("scope", "tenant")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询租户品牌资料失败", error);
    return (data as BrandProfileRecord | null) ?? null;
  }

  async findTenant(tenantId: string) {
    const { data, error } = await this.getAdminClient()
      .from("tenants")
      .select("id,name,status")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询租户失败", error);
    return (data as BrandingTenantRecord | null) ?? null;
  }

  findPlatformBrandLogoForBinding(fileId: string) {
    return this.fileRepository.findPlatformBrandLogoForBinding(fileId);
  }

  findTenantBrandLogoForBinding(fileId: string, tenantId: string) {
    return this.fileRepository.findTenantBrandLogoForBinding(fileId, tenantId);
  }

  async saveDraft(input: SaveBrandProfileDraftInput) {
    const { data, error } = await this.getAdminClient().rpc(
      "save_brand_profile_draft",
      {
        p_scope: input.scope,
        p_tenant_id: input.tenantId,
        p_display_name: input.displayName,
        p_logo_file_id: input.logoFileId,
        p_expected_version: input.expectedVersion,
        p_actor_employee_id: input.actorEmployeeId,
      },
    );
    if (error) throw Errors.dbError("保存品牌草稿失败", error);
    if (!data) throw Errors.dbError("保存品牌草稿失败");
    return data as BrandProfileRecord;
  }

  async publish(input: PublishBrandProfileInput) {
    const { data, error } = await this.getAdminClient().rpc(
      "publish_brand_profile",
      {
        p_scope: input.scope,
        p_tenant_id: input.tenantId,
        p_expected_version: input.expectedVersion,
        p_actor_employee_id: input.actorEmployeeId,
      },
    );
    if (error) throw Errors.dbError("发布品牌资料失败", error);
    if (!data) throw Errors.dbError("发布品牌资料失败");
    return data as BrandProfileRecord;
  }
}

export const brandingRepository = new BrandingRepository();
