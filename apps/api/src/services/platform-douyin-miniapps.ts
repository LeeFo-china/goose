import { randomBytes } from "node:crypto";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { DouyinMiniappInstallationsRepository } from "@/repositories/douyin-miniapp-installations";
import { platformTenantRepository } from "@/repositories/platform-tenants";
import {
  PlatformDouyinMiniappSafeRecordSchema,
  type BindPlatformDouyinMiniappInput,
  type CreateTemplateDevelopmentInstallationInput,
  type PlatformDouyinMiniappListQuery,
  type PlatformDouyinMiniappSafeRecord,
  type UpdatePlatformDouyinMiniappConfigInput,
} from "@/schema/platform-douyin-miniapps";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { loadDouyinMiniappConfig } from "@/services/douyin-miniapp/config";

const MANAGE_PERMISSION = "platform.douyin_miniapp.manage";

type InstallationRepositoryPort = Pick<
  DouyinMiniappInstallationsRepository,
  | "listForPlatform"
  | "findForPlatformById"
  | "findForPlatformByAuthorizerAppId"
  | "bindActiveTenant"
  | "createTemplateDevelopment"
  | "updateRuntimeConfig"
  | "rotateDeploymentKey"
  | "transitionAuthorizationStatus"
>;

type TenantRepositoryPort = Pick<typeof platformTenantRepository, "findById">;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type PlatformDouyinConfig = {
  readonly componentAppId: string;
  readonly templateAppId: string;
};

type Dependencies = {
  readonly repository?: InstallationRepositoryPort;
  readonly tenantRepository?: TenantRepositoryPort;
  readonly accessPolicy?: AccessPolicyPort;
  readonly configProvider?: () => PlatformDouyinConfig;
  readonly deploymentKeyGenerator?: () => string;
};

export class PlatformDouyinMiniappsService {
  private readonly repository: InstallationRepositoryPort;
  private readonly tenantRepository: TenantRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly configProvider: () => PlatformDouyinConfig;
  private readonly deploymentKeyGenerator: () => string;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? new DouyinMiniappInstallationsRepository();
    this.tenantRepository = dependencies.tenantRepository ?? platformTenantRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.configProvider = dependencies.configProvider ?? (() => {
      const config = loadDouyinMiniappConfig();
      return { componentAppId: config.componentAppId, templateAppId: config.templateAppId };
    });
    this.deploymentKeyGenerator = dependencies.deploymentKeyGenerator
      ?? (() => randomBytes(32).toString("base64url"));
  }

  async list(authContext: AuthContext, query: PlatformDouyinMiniappListQuery) {
    this.assertCanManage(authContext);
    const result = await this.repository.listForPlatform(query);
    if (!Number.isInteger(result.total) || result.total < 0) {
      throw invalidRepositoryResponse();
    }
    return {
      list: result.list.map(sanitizeInstallation),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: result.total ? Math.ceil(result.total / query.pageSize) : 0,
      },
    };
  }

  async get(authContext: AuthContext, installationId: string) {
    this.assertCanManage(authContext);
    return sanitizeInstallation(await this.requireInstallation(installationId));
  }

  async bind(
    authContext: AuthContext,
    installationId: string,
    input: BindPlatformDouyinMiniappInput,
  ) {
    this.assertCanManage(authContext);
    const installation = await this.requireInstallation(installationId);
    this.assertInstallationState(installation, "authorized_unbound", "merchant");
    await this.requireActiveTenant(input.tenant_id);

    await this.repository.bindActiveTenant({
      authorizerAppId: installation.authorizer_appid,
      tenantId: input.tenant_id,
      deploymentKey: this.createDeploymentKey(),
      runtimeConfig: input.runtime_config,
    });
    return sanitizeInstallation(await this.requireInstallation(installationId));
  }

  async createTemplateDevelopment(
    authContext: AuthContext,
    input: CreateTemplateDevelopmentInstallationInput,
  ) {
    this.assertCanManage(authContext);
    await this.requireActiveTenant(input.tenant_id);
    const config = this.configProvider();
    const existing = await this.repository.findForPlatformByAuthorizerAppId(
      config.templateAppId,
    );
    if (existing) {
      return this.requireMatchingTemplate(existing, input.tenant_id);
    }

    try {
      const created = await this.repository.createTemplateDevelopment({
        componentAppId: config.componentAppId,
        authorizerAppId: config.templateAppId,
        tenantId: input.tenant_id,
        runtimeConfig: input.runtime_config,
      });
      return sanitizeInstallation(created);
    } catch (error) {
      if (
        !(error instanceof AppError)
        || error.code !== "DOUYIN_TEMPLATE_INSTALLATION_CONFLICT"
      ) {
        throw error;
      }
      const concurrent = await this.repository.findForPlatformByAuthorizerAppId(
        config.templateAppId,
      );
      if (!concurrent) throw error;
      return this.requireMatchingTemplate(concurrent, input.tenant_id);
    }
  }

  async updateConfig(
    authContext: AuthContext,
    installationId: string,
    input: UpdatePlatformDouyinMiniappConfigInput,
  ) {
    this.assertCanManage(authContext);
    const installation = await this.requireInstallation(installationId);
    if (!["active", "disabled"].includes(installation.authorization_status)) {
      throw stateConflict();
    }
    const updated = await this.repository.updateRuntimeConfig(
      installationId,
      input.runtime_config,
    );
    if (!updated) throw stateConflict();
    return sanitizeInstallation(updated);
  }

  async rotateDeploymentKey(authContext: AuthContext, installationId: string) {
    this.assertCanManage(authContext);
    const installation = await this.requireInstallation(installationId);
    this.assertInstallationState(installation, "active", "merchant");
    const updated = await this.repository.rotateDeploymentKey(
      installationId,
      this.createDeploymentKey(),
    );
    if (!updated) throw stateConflict();
    return { ...sanitizeInstallation(updated), requires_rebuild: true as const };
  }

  async disable(authContext: AuthContext, installationId: string) {
    this.assertCanManage(authContext);
    const installation = await this.requireInstallation(installationId);
    this.assertInstallationState(installation, "active");
    const updated = await this.repository.transitionAuthorizationStatus(
      installationId,
      "active",
      "disabled",
    );
    if (!updated) throw stateConflict();
    return sanitizeInstallation(updated);
  }

  async enable(authContext: AuthContext, installationId: string) {
    this.assertCanManage(authContext);
    const installation = await this.requireInstallation(installationId);
    this.assertInstallationState(installation, "disabled");
    if (!installation.tenant_id) throw stateConflict();
    await this.requireActiveTenant(installation.tenant_id);
    const updated = await this.repository.transitionAuthorizationStatus(
      installationId,
      "disabled",
      "active",
    );
    if (!updated) throw stateConflict();
    return sanitizeInstallation(updated);
  }

  private assertCanManage(authContext: AuthContext): void {
    if (!authContext.isPlatformAdmin) throw Errors.forbidden();
    const scope = this.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    if (scope !== "all") throw Errors.forbidden();
  }

  private requireMatchingTemplate(
    installation: PlatformDouyinMiniappSafeRecord,
    tenantId: string,
  ): PlatformDouyinMiniappSafeRecord {
    if (
      installation.installation_kind !== "template_development"
      || installation.tenant_id !== tenantId
    ) {
      throw Errors.business(
        409,
        "模板开发小程序已绑定其他租户",
        "DOUYIN_TEMPLATE_INSTALLATION_TENANT_CONFLICT",
      );
    }
    return sanitizeInstallation(installation);
  }

  private async requireInstallation(
    installationId: string,
  ): Promise<PlatformDouyinMiniappSafeRecord> {
    const installation = await this.repository.findForPlatformById(installationId);
    if (!installation) {
      throw Errors.business(404, "抖音小程序安装不存在", "DOUYIN_INSTALLATION_NOT_FOUND");
    }
    return sanitizeInstallation(installation);
  }

  private async requireActiveTenant(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant || tenant.status !== "active") {
      throw Errors.business(409, "租户不存在或未启用", "DOUYIN_TENANT_NOT_ACTIVE");
    }
  }

  private assertInstallationState(
    installation: PlatformDouyinMiniappSafeRecord,
    status: PlatformDouyinMiniappSafeRecord["authorization_status"],
    kind?: PlatformDouyinMiniappSafeRecord["installation_kind"],
  ): void {
    if (
      installation.authorization_status !== status
      || (kind !== undefined && installation.installation_kind !== kind)
    ) {
      throw stateConflict();
    }
  }

  private createDeploymentKey(): string {
    const deploymentKey = this.deploymentKeyGenerator();
    if (Buffer.from(deploymentKey, "base64url").byteLength < 16) {
      throw Errors.business(
        500,
        "抖音小程序部署标识生成失败",
        "DOUYIN_DEPLOYMENT_KEY_GENERATION_FAILED",
      );
    }
    return deploymentKey;
  }
}

function sanitizeInstallation(value: unknown): PlatformDouyinMiniappSafeRecord {
  const result = PlatformDouyinMiniappSafeRecordSchema.safeParse(value);
  if (!result.success) throw invalidRepositoryResponse();
  return result.data;
}

function invalidRepositoryResponse() {
  return Errors.business(
    500,
    "抖音小程序安装数据格式无效",
    "DOUYIN_INSTALLATION_REPOSITORY_RESPONSE_INVALID",
  );
}

function stateConflict() {
  return Errors.business(
    409,
    "抖音小程序安装当前状态不允许此操作",
    "DOUYIN_INSTALLATION_STATE_CONFLICT",
  );
}

export const platformDouyinMiniappsService = new PlatformDouyinMiniappsService();
