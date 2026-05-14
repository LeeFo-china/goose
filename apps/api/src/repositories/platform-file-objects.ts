import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type PlatformFileProvider = "tencent_cos" | "supabase_storage";
export type PlatformFileVisibility = "public" | "private" | "signed";

export type PlatformFileObjectRecord = {
  id: string;
  tenant_id: string | null;
  owner_type: string;
  owner_id: string | null;
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

class PlatformFileObjectRepository {
  private toInsertPayload(input: CreatePlatformFileObjectInput) {
    return {
      tenant_id: input.tenant_id ?? null,
      owner_type: input.owner_type,
      owner_id: input.owner_id ?? null,
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
        const existing = await this.findActiveByObjectKey({
          provider: input.provider,
          bucket: input.bucket,
          objectKey: input.object_key,
        });
        if (existing) {
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
}

export const platformFileObjectRepository = new PlatformFileObjectRepository();
