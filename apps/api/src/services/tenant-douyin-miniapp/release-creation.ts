import { Errors } from "@/errors/error-factory";
import type { DouyinMiniappReleaseTarget } from
  "@/repositories/douyin-miniapp-installations";
import type { DouyinMiniappReleaseGateway } from
  "@/gateways/douyin-open-platform/client";
import type { DouyinMiniappReleasesRepository } from
  "@/repositories/douyin-miniapp-releases";
import type { DouyinDeployableTemplatesRepository } from
  "@/repositories/douyin-deployable-templates";
import type { tenantDouyinMiniappWorkspaceRepository } from
  "@/repositories/tenant-douyin-miniapp-workspace";
import type { TenantDouyinCreateReleaseInput } from
  "@/schema/tenant-douyin-miniapp";
import type { PlatformDouyinMiniappReleaseOperations } from
  "@/services/platform-douyin-miniapp-releases/operation-service";
import type { DouyinMiniappAccessTokenService } from
  "@/services/douyin-miniapp/access-tokens";
import { releaseNotFound } from
  "@/services/platform-douyin-miniapp-releases/support";
import { compareDouyinTemplateVersion } from "./template-version";

type Dependencies = {
  workspace: Pick<typeof tenantDouyinMiniappWorkspaceRepository, "findLatestRelease">;
  releases: Pick<DouyinMiniappReleasesRepository, "findById">;
  templates: Pick<DouyinDeployableTemplatesRepository,
    "findCurrent" | "findSelectableById">;
  operations: Pick<PlatformDouyinMiniappReleaseOperations, "upload" | "getTestQr">;
  accessTokens: Pick<DouyinMiniappAccessTokenService, "getAuthorizerAccessToken">;
  gateway: Pick<DouyinMiniappReleaseGateway, "getVersionList">;
};
type Context = {
  operatorId: string;
  installation: DouyinMiniappReleaseTarget & { deployment_key: string };
};
type Template = NonNullable<Awaited<ReturnType<Dependencies["templates"]["findCurrent"]>>>;
type LatestRelease = Awaited<ReturnType<Dependencies["workspace"]["findLatestRelease"]>>;

export class TenantDouyinTemplateReleaseCreator {
  constructor(private readonly dependencies: Dependencies) {}

  async createCurrent(context: Context, input: TenantDouyinCreateReleaseInput) {
    const [latestRelease, template] = await Promise.all([
      this.dependencies.workspace.findLatestRelease(context.installation.id),
      this.dependencies.templates.findCurrent("default"),
    ]);
    if (!template) {
      throw Errors.business(409, "平台尚未确认可发布的抖音模板",
        "DOUYIN_DEPLOYABLE_TEMPLATE_NOT_FOUND");
    }
    if (template.id !== input.expected_template_record_id
      || template.template_id !== input.expected_template_id) {
      throw Errors.business(409, "平台当前模板已更新，请刷新版本列表后重试",
        "DOUYIN_DEPLOYABLE_TEMPLATE_CHANGED");
    }
    return this.createResolved(context, latestRelease, template, true);
  }

  async createSelected(context: Context, input: TenantDouyinCreateReleaseInput) {
    const [latestRelease, template] = await Promise.all([
      this.dependencies.workspace.findLatestRelease(context.installation.id),
      this.dependencies.templates.findSelectableById(
        input.expected_template_record_id, "default",
      ),
    ]);
    if (!template) {
      throw Errors.business(409, "所选抖音模板已不可用，请刷新版本列表后重试",
        "DOUYIN_DEPLOYABLE_TEMPLATE_UNAVAILABLE");
    }
    if (template.template_id !== input.expected_template_id) {
      throw Errors.business(409, "所选抖音模板已更新，请刷新版本列表后重试",
        "DOUYIN_DEPLOYABLE_TEMPLATE_CHANGED");
    }
    await this.assertNotCurrentOnline(context, template);
    return this.createResolved(context, latestRelease, template, false);
  }

  private async assertNotCurrentOnline(context: Context, template: Template) {
    const authorizerAccessToken = await this.dependencies.accessTokens.getAuthorizerAccessToken({
      authorizerAppId: context.installation.authorizer_appid,
      deploymentKey: context.installation.deployment_key,
    });
    const versions = await this.dependencies.gateway.getVersionList({
      authorizerAccessToken,
      appId: context.installation.authorizer_appid,
    });
    if (versions.current?.version === template.template_version
      && versions.current.summary?.startsWith(`[#${template.template_id}]`) === true) {
      throw Errors.business(409, "所选模板已经是当前线上版本",
        "DOUYIN_DEPLOYABLE_TEMPLATE_ALREADY_CURRENT");
    }
  }

  private async createResolved(
    context: Context,
    latestRelease: LatestRelease,
    template: Template,
    requireNewer: boolean,
  ) {
    const delivery = latestRelease?.status === "created"
      ? await this.recoveryDelivery(context, latestRelease.id, template)
      : this.templateDelivery(template, latestRelease, requireNewer);
    const uploaded = await this.dependencies.operations.upload(
      context.installation, context.installation.id, context.operatorId, delivery,
    );
    return this.dependencies.operations.getTestQr(
      context.installation, uploaded, context.operatorId,
    );
  }

  private async recoveryDelivery(context: Context, releaseId: string, template: Template) {
    const persisted = await this.dependencies.releases.findById(releaseId);
    if (!persisted || persisted.installation_id !== context.installation.id) {
      throw releaseNotFound();
    }
    if (!["created", "uploaded", "testing"].includes(persisted.status)
      || persisted.template_id !== template.template_id
      || persisted.template_version !== template.template_version) {
      throw releaseInProgress();
    }
    return {
      deployable_template_id: persisted.deployable_template_id ?? template.id,
      template_id: persisted.template_id,
      template_version: persisted.template_version,
      description: persisted.description,
      channel: persisted.channel,
    };
  }

  private templateDelivery(template: Template, latest: LatestRelease, requireNewer: boolean) {
    if (latest && ["audit_pending", "audit_approved"].includes(latest.status)) {
      throw releaseInProgress();
    }
    if (requireNewer && latest) {
      const compared = compareDouyinTemplateVersion(
        template.template_version, latest.template_version,
      );
      if (compared === null || compared < 0
        || (compared === 0 && template.template_id === latest.template_id)) {
        throw Errors.business(409,
          "平台当前可发布模板不是新版，请先确认新的抖音模板版本",
          "DOUYIN_DEPLOYABLE_TEMPLATE_VERSION_NOT_NEW");
      }
    }
    return {
      deployable_template_id: template.id,
      template_id: template.template_id,
      template_version: template.template_version,
      description: template.description,
      channel: template.channel,
    };
  }
}

function releaseInProgress() {
  return Errors.business(409, "当前版本正在审核或等待发布，请完成后再生成新版体验版",
    "DOUYIN_TENANT_RELEASE_IN_PROGRESS");
}
