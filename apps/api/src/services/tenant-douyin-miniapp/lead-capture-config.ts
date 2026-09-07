import { Errors } from "@/errors/error-factory";
import {
  tenantDouyinMiniappLeadCaptureRepository,
  type TenantDouyinMiniappLeadCaptureRepository,
} from "@/repositories/tenant-douyin-miniapp-lead-capture";
import { tenantDouyinMiniappWorkspaceRepository } from
  "@/repositories/tenant-douyin-miniapp-workspace";
import type { TenantDouyinLeadCaptureConfigUpdate } from
  "@/schema/tenant-douyin-miniapp";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const MANAGE_PERMISSION = "douyin_miniapp.manage";

type RepositoryPort = Pick<TenantDouyinMiniappLeadCaptureRepository, "update">;
type WorkspacePort = {
  findCurrentInstallation(tenantId: string): Promise<{
    readonly id: string;
    readonly authorizer_appid: string;
    readonly authorization_status: "active" | "disabled" | "revoked";
  } | null>;
};
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;

type Dependencies = {
  readonly repository?: RepositoryPort;
  readonly workspace?: WorkspacePort;
  readonly accessPolicy?: AccessPolicyPort;
};

export class TenantDouyinMiniappLeadCaptureConfigService {
  private readonly repository: RepositoryPort;
  private readonly workspace: WorkspacePort;
  private readonly accessPolicy: AccessPolicyPort;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository
      ?? tenantDouyinMiniappLeadCaptureRepository;
    this.workspace = dependencies.workspace
      ?? tenantDouyinMiniappWorkspaceRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
  }

  async update(
    authContext: AuthContext,
    input: TenantDouyinLeadCaptureConfigUpdate,
  ) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    this.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    const installation = await this.workspace.findCurrentInstallation(tenantId);
    if (!installation) {
      throw Errors.business(
        404,
        "当前已授权小程序不存在",
        "DOUYIN_ACTIVE_INSTALLATION_NOT_FOUND",
      );
    }
    if (installation.authorization_status !== "active"
      || installation.authorizer_appid !== input.authorizer_appid) {
      throw Errors.business(
        409,
        "当前小程序授权状态或 AppID 已变化，请刷新后重试",
        "DOUYIN_LEAD_CAPTURE_INSTALLATION_CONFLICT",
      );
    }
    return this.repository.update({
      tenantId,
      installationId: installation.id,
      authorizerAppId: input.authorizer_appid,
      expectedUpdatedAt: input.expected_updated_at,
      enabled: input.enabled,
      clueComponentId: input.clue_component_id,
    });
  }
}

export const tenantDouyinMiniappLeadCaptureConfigService =
  new TenantDouyinMiniappLeadCaptureConfigService();
