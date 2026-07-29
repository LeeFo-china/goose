import { Errors } from "@/errors/error-factory";
import type {
  PlatformFileObjectRecord,
} from "@/repositories/platform-file-objects";
import { SupabaseDB } from "@/utils/supabase";

export type VisitorOcrPlatformFileObjectRecord = Pick<
  PlatformFileObjectRecord,
  | "id"
  | "tenant_id"
  | "owner_type"
  | "owner_visitor_id"
  | "scene"
  | "provider"
  | "bucket"
  | "region"
  | "object_key"
  | "mime_type"
  | "size_bytes"
  | "checksum"
  | "visibility"
  | "public_url"
  | "status"
  | "deleted_at"
>;

const VISITOR_OCR_FILE_OBJECT_COLUMNS = [
  "id",
  "tenant_id",
  "owner_type",
  "owner_visitor_id",
  "scene",
  "provider",
  "bucket",
  "region",
  "object_key",
  "mime_type",
  "size_bytes",
  "checksum",
  "visibility",
  "public_url",
  "status",
  "deleted_at",
].join(",");

class VisitorOnboardingFileObjectsRepository {
  async findActiveLicenseById(input: {
    id: string;
    visitorId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select(VISITOR_OCR_FILE_OBJECT_COLUMNS)
      .eq("id", input.id)
      .is("tenant_id", null)
      .eq("owner_type", "visitor")
      .eq("owner_visitor_id", input.visitorId)
      .eq("scene", "tenant_onboarding_license")
      .eq("provider", "tencent_cos")
      .eq("visibility", "private")
      .is("public_url", null)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询装企入驻营业执照文件失败", error);
    }
    return (data as VisitorOcrPlatformFileObjectRecord | null) ?? null;
  }
}

export const visitorOnboardingFileObjectsRepository =
  new VisitorOnboardingFileObjectsRepository();
