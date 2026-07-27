import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type PlatformFileProvider = "tencent_cos" | "supabase_storage";
export type PlatformFileVisibility = "public" | "private" | "signed";

export type PlatformFileObjectRecord = {
  id: string;
  tenant_id: string | null;
  owner_type: string;
  owner_id: string | null;
  owner_visitor_id: string | null;
  scene: string;
  provider: PlatformFileProvider;
  bucket: string;
  region: string | null;
  object_key: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  visibility: PlatformFileVisibility;
  public_url: string | null;
  legacy_url: string | null;
  legacy_path: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_by_auth_user_id: string | null;
  created_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreatePlatformFileObjectInput = {
  tenant_id?: string | null;
  owner_type: string;
  owner_id?: string | null;
  owner_visitor_id?: string | null;
  scene: string;
  provider: PlatformFileProvider;
  bucket: string;
  region?: string | null;
  object_key: string;
  original_name?: string | null;
  mime_type: string;
  size_bytes: number;
  width?: number | null;
  height?: number | null;
  checksum?: string | null;
  visibility?: PlatformFileVisibility;
  public_url?: string | null;
  legacy_url?: string | null;
  legacy_path?: string | null;
  metadata?: Record<string, unknown>;
  created_by_auth_user_id?: string | null;
  created_by_employee_id?: string | null;
};

export type OcrPlatformFileObjectRecord = Pick<
  PlatformFileObjectRecord,
  | "id"
  | "tenant_id"
  | "owner_type"
  | "owner_id"
  | "scene"
  | "provider"
  | "bucket"
  | "region"
  | "object_key"
  | "mime_type"
  | "size_bytes"
  | "checksum"
  | "visibility"
  | "status"
  | "deleted_at"
  | "created_by_employee_id"
>;

export type SupplierBusinessLicensePreviewFileRecord = Pick<
  PlatformFileObjectRecord,
  | "id"
  | "tenant_id"
  | "owner_type"
  | "owner_id"
  | "scene"
  | "provider"
  | "object_key"
  | "mime_type"
  | "size_bytes"
  | "checksum"
  | "visibility"
  | "status"
  | "deleted_at"
  | "created_by_employee_id"
>;

export type BrandingPlatformFileObjectRecord = Pick<
  PlatformFileObjectRecord,
  | "id"
  | "tenant_id"
  | "owner_type"
  | "owner_id"
  | "scene"
  | "provider"
  | "bucket"
  | "region"
  | "object_key"
  | "mime_type"
  | "size_bytes"
  | "width"
  | "height"
  | "checksum"
  | "visibility"
  | "public_url"
  | "status"
  | "deleted_at"
>;

const OCR_FILE_OBJECT_COLUMNS = [
  "id",
  "tenant_id",
  "owner_type",
  "owner_id",
  "scene",
  "provider",
  "bucket",
  "region",
  "object_key",
  "mime_type",
  "size_bytes",
  "checksum",
  "visibility",
  "status",
  "deleted_at",
  "created_by_employee_id",
].join(",");
const SUPPLIER_LICENSE_PREVIEW_COLUMNS = [
  "id",
  "tenant_id",
  "owner_type",
  "owner_id",
  "scene",
  "provider",
  "object_key",
  "mime_type",
  "size_bytes",
  "checksum",
  "visibility",
  "status",
  "deleted_at",
  "created_by_employee_id",
].join(",");
const BRANDING_FILE_OBJECT_COLUMNS = [
  "id",
  "tenant_id",
  "owner_type",
  "owner_id",
  "scene",
  "provider",
  "bucket",
  "region",
  "object_key",
  "mime_type",
  "size_bytes",
  "width",
  "height",
  "checksum",
  "visibility",
  "public_url",
  "status",
  "deleted_at",
].join(",");

type BrandingFileObjectQueryResult = {
  data: unknown;
  error: unknown;
};

type BrandingFileObjectQuery = {
  select(columns: string): BrandingFileObjectQuery;
  eq(column: string, value: unknown): BrandingFileObjectQuery;
  is(column: string, value: null): BrandingFileObjectQuery;
  maybeSingle(): Promise<BrandingFileObjectQueryResult>;
};

type BrandingFileObjectClient = {
  from(table: string): BrandingFileObjectQuery;
};

export class PlatformFileObjectRepository {
  constructor(
    private readonly getBrandingAdminClient: () => BrandingFileObjectClient =
      () => SupabaseDB.getAdminClient() as unknown as BrandingFileObjectClient,
  ) {}

  private toInsertPayload(input: CreatePlatformFileObjectInput) {
    return {
      tenant_id: input.tenant_id ?? null,
      owner_type: input.owner_type,
      owner_id: input.owner_id ?? null,
      owner_visitor_id: input.owner_visitor_id ?? null,
      scene: input.scene,
      provider: input.provider,
      bucket: input.bucket,
      region: input.region ?? null,
      object_key: input.object_key,
      original_name: input.original_name ?? null,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      width: input.width ?? null,
      height: input.height ?? null,
      checksum: input.checksum ?? null,
      visibility: input.visibility ?? "public",
      public_url: input.public_url ?? null,
      legacy_url: input.legacy_url ?? null,
      legacy_path: input.legacy_path ?? null,
      metadata: input.metadata ?? {},
      created_by_auth_user_id: input.created_by_auth_user_id ?? null,
      created_by_employee_id: input.created_by_employee_id ?? null,
    };
  }

  async create(input: CreatePlatformFileObjectInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .insert(this.toInsertPayload(input))
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("记录文件对象失败", error);
    }

    if (!data) {
      throw Errors.badRequest("记录文件对象失败");
    }

    return data as PlatformFileObjectRecord;
  }

  async createOrFindByObjectKey(input: CreatePlatformFileObjectInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .insert(this.toInsertPayload(input))
      .select("*")
      .maybeSingle();

    if (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === "23505") {
        const isPrivateVisitorObject = input.owner_type === "visitor" &&
          Boolean(input.owner_visitor_id) &&
          (input.visibility ?? "public") === "private";
        const existing = isPrivateVisitorObject
          ? await this.findPrivateVisitorConflict({
            provider: input.provider,
            bucket: input.bucket,
            objectKey: input.object_key,
          })
          : await this.findActiveByObjectKey({
            provider: input.provider,
            bucket: input.bucket,
            objectKey: input.object_key,
          });
        if (existing) {
          this.assertExistingVisitorOwnership(existing, input);
          return existing;
        }
      }

      throw Errors.dbError("记录文件对象失败", error);
    }

    if (!data) {
      throw Errors.badRequest("记录文件对象失败");
    }

    return data as PlatformFileObjectRecord;
  }

  async findActiveByObjectKey(input: {
    provider?: PlatformFileProvider;
    bucket?: string;
    objectKey: string;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select("*")
      .eq("object_key", input.objectKey)
      .is("deleted_at", null)
      .eq("status", "active");

    if (input.provider) {
      query = query.eq("provider", input.provider);
    }

    if (input.bucket) {
      query = query.eq("bucket", input.bucket);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询文件对象失败", error);
    }

    return (data as PlatformFileObjectRecord | null) ?? null;
  }

  async findActiveById(input: { id: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select(OCR_FILE_OBJECT_COLUMNS)
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询OCR文件对象失败", error);
    }

    return (data as OcrPlatformFileObjectRecord | null) ?? null;
  }

  async findActiveByIds(input: {
    ids: string[];
    tenantId: string;
    limit: number;
  }): Promise<OcrPlatformFileObjectRecord[]> {
    if (input.ids.length === 0) return [];
    const limit = Math.min(input.limit, 20);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select(OCR_FILE_OBJECT_COLUMNS)
      .in("id", input.ids.slice(0, limit))
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(limit);

    if (error) {
      throw Errors.dbError("批量查询进件附件文件对象失败", error);
    }
    return (data as unknown as OcrPlatformFileObjectRecord[] | null) ?? [];
  }

  async findActiveByIdForPlatform(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select(OCR_FILE_OBJECT_COLUMNS)
      .eq("id", id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询文件对象失败", error);
    }
    return (data as OcrPlatformFileObjectRecord | null) ?? null;
  }

  async findSupplierBusinessLicensePreviewById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select(SUPPLIER_LICENSE_PREVIEW_COLUMNS)
      .eq("id", id)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询供应商营业执照文件失败", error);
    }
    return (data as SupplierBusinessLicensePreviewFileRecord | null) ?? null;
  }

  async findActiveBrandLogoForOwner(
    fileId: string,
    ownerTenantId: string | null,
  ) {
    let query = this.getBrandingAdminClient()
      .from("platform_file_objects")
      .select(BRANDING_FILE_OBJECT_COLUMNS)
      .eq("id", fileId)
      .eq("scene", "brand_logo")
      .eq("status", "active")
      .eq("visibility", "public")
      .is("deleted_at", null);

    query = ownerTenantId === null
      ? query.is("tenant_id", null)
      : query.eq("tenant_id", ownerTenantId);

    const { data, error } = await query.maybeSingle();
    if (error) throw Errors.dbError("查询品牌 Logo 文件失败", error);
    return (data as BrandingPlatformFileObjectRecord | null) ?? null;
  }

  private async findPrivateVisitorConflict(input: {
    provider: PlatformFileProvider;
    bucket: string;
    objectKey: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select("*")
      .eq("provider", input.provider)
      .eq("bucket", input.bucket)
      .eq("object_key", input.objectKey)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询文件对象失败", error);
    }

    return (data as PlatformFileObjectRecord | null) ?? null;
  }

  private assertExistingVisitorOwnership(
    existing: PlatformFileObjectRecord,
    input: CreatePlatformFileObjectInput,
  ) {
    if (
      input.owner_type !== "visitor" ||
      !input.owner_visitor_id ||
      (input.visibility ?? "public") !== "private"
    ) return;
    if (
      existing.owner_type !== "visitor" ||
      existing.owner_visitor_id !== input.owner_visitor_id
    ) {
      throw Errors.forbidden();
    }
    if (
      existing.scene !== input.scene ||
      existing.provider !== input.provider ||
      existing.bucket !== input.bucket ||
      existing.object_key !== input.object_key ||
      existing.mime_type !== input.mime_type ||
      existing.size_bytes !== input.size_bytes ||
      normalizeChecksum(existing.checksum) !== normalizeChecksum(input.checksum) ||
      existing.visibility !== (input.visibility ?? "public") ||
      existing.public_url !== (input.public_url ?? null) ||
      existing.status !== "active" ||
      existing.deleted_at !== null
    ) {
      throw Errors.business(
        400,
        "重复文件对象完整性校验失败",
        ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
      );
    }
  }

}

export const platformFileObjectRepository = new PlatformFileObjectRepository();

function normalizeChecksum(value: string | null | undefined) {
  return value?.trim().replace(/^"+|"+$/g, "") || null;
}
