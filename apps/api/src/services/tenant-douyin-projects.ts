import { Errors } from "@/errors/error-factory";
import { tenantDouyinProjectsRepository } from
  "@/repositories/tenant-douyin-projects";
import {
  TenantDouyinProjectImageReferenceSchema,
  TenantDouyinProjectImagesQuerySchema,
  TenantDouyinProjectListQuerySchema,
  TenantDouyinProjectParamsSchema,
  TenantDouyinProjectPublicationSchema,
  parseTenantProjectLogImageReference,
  type TenantDouyinProjectImagesQuery,
  type TenantDouyinProjectListQuery,
  type TenantDouyinProjectPublicationInput,
} from "@/schema/tenant-douyin-projects";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import {
  ensurePlatformCosAccessConfigCache,
  resolveStoredFileUrl,
} from "@/services/files/file-url-resolver";

const MANAGE_PERMISSION = "douyin_miniapp.manage";
const ATTACHED_IMAGE_LOG_LIMIT = 100;
const ATTACHED_IMAGES_PER_LOG_LIMIT = 30;
const ATTACHED_IMAGE_REFERENCE_LIMIT = 300;

type ProjectRow = {
  readonly id: string;
  readonly [key: string]: unknown;
};
type ProjectOwnershipRow = {
  readonly id: string;
  readonly tenant_id: string;
};
type AttachedImageRow = { readonly images: unknown };
type SavedProfile = TenantDouyinProjectPublicationInput & {
  readonly id: string;
  readonly tenant_id: string;
  readonly project_id: string;
  readonly created_at: string;
  readonly updated_at: string;
};
type ProfileCommandResult =
  | { readonly ok: true; readonly data: SavedProfile }
  | {
    readonly ok: false;
    readonly error: {
      readonly status_code: number;
      readonly code: string;
      readonly message: string;
    };
  };
type RepositoryPort = {
  listProjects(input: TenantDouyinProjectListQuery & { tenantId: string }):
    Promise<{ rows: readonly ProjectRow[]; total: number }>;
  findProject(input: { tenantId: string; projectId: string }):
    Promise<ProjectOwnershipRow | null>;
  listAttachedImageRows(input: {
    tenantId: string;
    projectId: string;
    limit: number;
  }): Promise<readonly AttachedImageRow[]>;
  publishProfileAtomic(input: {
    tenantId: string;
    projectId: string;
    profile: TenantDouyinProjectPublicationInput;
  }): Promise<ProfileCommandResult>;
};
type AccessPolicyPort = {
  assertTenantContext(authContext: AuthContext): string;
  assertPermission(authContext: AuthContext, permission: string): unknown;
};

export class TenantDouyinProjectsService {
  constructor(private readonly dependencies: {
    readonly repository: RepositoryPort;
    readonly accessPolicy: AccessPolicyPort;
    readonly prepareImageUrls?: () => Promise<void>;
    readonly resolveImageReference?: (reference: string) => string | null;
  }) {}

  async list(authContext: AuthContext, input: TenantDouyinProjectListQuery) {
    const tenantId = this.requireTenant(authContext);
    const query = parseRequest(TenantDouyinProjectListQuerySchema, input);
    const result = await this.dependencies.repository.listProjects({
      tenantId,
      ...query,
    });
    if (!Number.isInteger(result.total) || result.total < 0) {
      throw Errors.business(
        500,
        "租户抖音项目数据无效",
        "DOUYIN_TENANT_PROJECTS_RESPONSE_INVALID",
      );
    }
    return {
      list: [...result.rows],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: result.total === 0
          ? 0
          : Math.ceil(result.total / query.pageSize),
      },
    };
  }

  async updatePublication(
    authContext: AuthContext,
    projectId: string,
    input: TenantDouyinProjectPublicationInput,
  ) {
    const tenantId = this.requireTenant(authContext);
    const params = parseRequest(TenantDouyinProjectParamsSchema, { projectId });
    const profile = parseRequest(TenantDouyinProjectPublicationSchema, input);
    const result = await this.dependencies.repository.publishProfileAtomic({
      tenantId,
      projectId: params.projectId,
      profile,
    });
    if (!result.ok) {
      throwPublicationCommandError(result.error);
    }
    if (
      result.data.tenant_id !== tenantId
      || result.data.project_id !== params.projectId
    ) throwInvalidResponse();
    return result.data;
  }

  async listAttachedImages(
    authContext: AuthContext,
    projectId: string,
    input: TenantDouyinProjectImagesQuery,
  ) {
    const tenantId = this.requireTenant(authContext);
    const params = parseRequest(TenantDouyinProjectParamsSchema, { projectId });
    const query = parseRequest(TenantDouyinProjectImagesQuerySchema, input);
    await this.requireOwnedProject(tenantId, params.projectId);
    const imageRows = await this.dependencies.repository.listAttachedImageRows({
      tenantId,
      projectId: params.projectId,
      limit: ATTACHED_IMAGE_LOG_LIMIT,
    });
    const references = [...collectAttachedImageReferences(
      imageRows,
      (reference) => isSelectableAttachedImageReference(
        reference,
        tenantId,
        params.projectId,
      ),
    )];
    const from = (query.page - 1) * query.pageSize;
    const selected = references.slice(from, from + query.pageSize);
    if (selected.length > 0) {
      await (this.dependencies.prepareImageUrls
        ?? ensurePlatformCosAccessConfigCache)();
    }
    const resolveImageReference = this.dependencies.resolveImageReference
      ?? resolveStoredFileUrl;
    return {
      items: selected.map((reference) => ({
        reference,
        preview_url: httpsPreview(resolveImageReference(reference)),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: references.length,
        totalPages: references.length === 0
          ? 0
          : Math.ceil(references.length / query.pageSize),
      },
    };
  }

  private requireTenant(authContext: AuthContext): string {
    const tenantId = this.dependencies.accessPolicy.assertTenantContext(authContext);
    this.dependencies.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    return tenantId;
  }

  private async requireOwnedProject(
    tenantId: string,
    projectId: string,
  ): Promise<ProjectOwnershipRow> {
    const project = await this.dependencies.repository.findProject({
      tenantId,
      projectId,
    });
    if (
      !project
      || project.id !== projectId
      || project.tenant_id !== tenantId
    ) {
      throw Errors.business(
        404,
        "项目不存在",
        "DOUYIN_PROJECT_NOT_FOUND",
      );
    }
    return project;
  }
}

function collectAttachedImageReferences(
  rows: readonly AttachedImageRow[],
  isEligible: (reference: string) => boolean = () => true,
): ReadonlySet<string> {
  const references = new Set<string>();
  for (const row of rows.slice(0, ATTACHED_IMAGE_LOG_LIMIT)) {
    for (const value of normalizeImageList(row.images)
      .slice(0, ATTACHED_IMAGES_PER_LOG_LIMIT)) {
      if (!isEligible(value)) continue;
      references.add(value);
      if (references.size >= ATTACHED_IMAGE_REFERENCE_LIMIT) return references;
    }
  }
  return references;
}

function normalizeImageList(value: unknown): string[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (typeof item !== "string") return [];
    const reference = item.trim();
    return reference ? [reference] : [];
  });
}

function isSelectableAttachedImageReference(
  reference: string,
  tenantId: string,
  projectId: string,
): boolean {
  if (!TenantDouyinProjectImageReferenceSchema.safeParse(reference).success) {
    return false;
  }
  const scope = parseTenantProjectLogImageReference(reference);
  return !scope || (scope.tenantId === tenantId && scope.projectId === projectId);
}

function httpsPreview(value: string | null): string | null {
  if (!value || /\s/.test(value)) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

const PUBLICATION_COMMAND_ERROR_STATUS: Readonly<Record<string, number>> = {
  DOUYIN_PROJECT_PUBLICATION_INVALID: 400,
  DOUYIN_PROJECT_NOT_FOUND: 404,
  DOUYIN_PROJECT_IMAGE_REFERENCE_SCOPE_MISMATCH: 400,
  DOUYIN_PROJECT_IMAGE_NOT_ATTACHED: 400,
  DOUYIN_PROJECT_PUBLICATION_IMAGES_REQUIRED: 400,
};

function throwPublicationCommandError(error: {
  readonly status_code: number;
  readonly code: string;
  readonly message: string;
}): never {
  if (PUBLICATION_COMMAND_ERROR_STATUS[error.code] !== error.status_code) {
    throwInvalidResponse();
  }
  throw Errors.business(error.status_code, error.message, error.code);
}

function throwInvalidResponse(): never {
  throw Errors.business(
    500,
    "租户抖音项目数据无效",
    "DOUYIN_TENANT_PROJECTS_RESPONSE_INVALID",
  );
}

function parseRequest<T>(schema: { safeParse(value: unknown):
  { success: true; data: T } | { success: false; error: Parameters<typeof Errors.fromZod>[0] } },
value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

export const tenantDouyinProjectsService = new TenantDouyinProjectsService({
  repository: tenantDouyinProjectsRepository,
  accessPolicy: accessPolicyService,
});
