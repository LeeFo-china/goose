import { Errors } from "@/errors/error-factory";
import {
  douyinDeployableTemplatesRepository,
  type DouyinDeployableTemplate,
  type DouyinDeployableTemplatesRepository,
} from "@/repositories/douyin-deployable-templates";
import {
  tenantDouyinMiniappWorkspaceRepository,
  type TenantDouyinMiniappWorkspaceInstallation,
  type TenantDouyinMiniappWorkspaceProfile,
  type TenantDouyinMiniappWorkspaceRelease,
} from "@/repositories/tenant-douyin-miniapp-workspace";
import {
  TenantDouyinWorkspaceSchema,
  type TenantDouyinAuthorizationState,
  type TenantDouyinReleaseState,
} from "@/schema/tenant-douyin-miniapp";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const READ_PERMISSION = "douyin_miniapp.read";

type WorkspaceRepositoryPort = Pick<
  typeof tenantDouyinMiniappWorkspaceRepository,
  | "findTenantSummary"
  | "findCurrentInstallation"
  | "findProfile"
  | "getPublicContentCounts"
  | "findLatestRelease"
>;

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;
type TemplateRepositoryPort = Pick<
  DouyinDeployableTemplatesRepository,
  "findCurrent"
>;

type WorkspaceDependencies = {
  readonly repository?: WorkspaceRepositoryPort;
  readonly accessPolicy?: AccessPolicyPort;
  readonly templates?: TemplateRepositoryPort;
};

type WorkspaceBuildInput = {
  readonly tenant: { readonly id: string; readonly name: string };
  readonly installation: TenantDouyinMiniappWorkspaceInstallation | null;
  readonly profile: TenantDouyinMiniappWorkspaceProfile | null;
  readonly counts: {
    readonly cases: number;
    readonly sites: number;
    readonly active_service_areas: number;
  };
  readonly latestRelease: TenantDouyinMiniappWorkspaceRelease | null;
  readonly currentTemplate: DouyinDeployableTemplate | null;
};

export class TenantDouyinMiniappWorkspaceService {
  private readonly repository: WorkspaceRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly templates: TemplateRepositoryPort;

  constructor(dependencies: WorkspaceDependencies = {}) {
    this.repository = dependencies.repository
      ?? tenantDouyinMiniappWorkspaceRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.templates = dependencies.templates
      ?? douyinDeployableTemplatesRepository;
  }

  async getWorkspace(authContext: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    this.accessPolicy.assertPermission(authContext, READ_PERMISSION);

    const installation = await this.repository.findCurrentInstallation(
      tenantId,
    );
    const [tenant, profile, counts, latestRelease, currentTemplate] =
      await Promise.all([
      this.repository.findTenantSummary(tenantId),
      this.repository.findProfile(tenantId),
      this.repository.getPublicContentCounts(tenantId),
      installation
        ? this.repository.findLatestRelease(installation.id)
        : Promise.resolve(null),
      this.templates.findCurrent("default"),
    ]);

    if (!tenant) {
      throw Errors.business(
        404,
        "租户不存在",
        "DOUYIN_TENANT_NOT_FOUND",
      );
    }

    return buildWorkspace({
      tenant,
      installation,
      profile,
      counts,
      latestRelease,
      currentTemplate,
    });
  }
}

export function buildWorkspace(input: WorkspaceBuildInput) {
  return TenantDouyinWorkspaceSchema.parse({
    tenant: input.tenant,
    authorization_state: authorizationState(input.installation),
    release_state: releaseState(input.latestRelease),
    installation: input.installation,
    public_profile: input.profile,
    public_content: input.counts,
    available_template: availableTemplate(
      input.currentTemplate,
      input.latestRelease,
    ),
    latest_release: input.latestRelease,
  });
}

function availableTemplate(
  template: DouyinDeployableTemplate | null,
  release: TenantDouyinMiniappWorkspaceRelease | null,
) {
  if (!template) return null;
  const sameTemplate = release?.template_id === template.template_id;
  return {
    template_id: template.template_id,
    version: template.template_version,
    description: template.description,
    confirmed_at: template.confirmed_at,
    state: !sameTemplate
      ? "new_available" as const
      : release.status === "released"
      ? "up_to_date" as const
      : "in_progress" as const,
  };
}

function authorizationState(
  installation: TenantDouyinMiniappWorkspaceInstallation | null,
): TenantDouyinAuthorizationState {
  return installation?.authorization_status ?? "unbound";
}

function releaseState(
  release: TenantDouyinMiniappWorkspaceRelease | null,
): TenantDouyinReleaseState {
  if (!release) return "not_uploaded";
  return release.status === "failed" ? "sync_error" : release.status;
}

export const tenantDouyinMiniappWorkspaceService =
  new TenantDouyinMiniappWorkspaceService();
