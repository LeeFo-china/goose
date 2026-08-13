import { Errors } from "@/errors/error-factory";
import type {
  DouyinCodeTemplate,
  DouyinTemplateManagementGateway,
} from "@/gateways/douyin-open-platform/template-client";
import type { DouyinMiniappReleaseRecord } from "@/repositories/douyin-miniapp-releases";
import type { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import type { DouyinMiniappAccessTokenService } from "@/services/douyin-miniapp/access-tokens";
import type { PlatformDouyinMiniappReleasesService } from "./platform-douyin-miniapp-releases";
import {
  parseRequest,
  UploadInputSchema,
} from "./platform-douyin-miniapp-releases/support";
import { z } from "zod";

const MANAGE_PERMISSION = "platform.douyin_miniapp.manage";

const PromotionInputSchema = z.strictObject({
  channel: z.enum(["default", "1"]),
});
const TemplateAppIdSchema = z.string().trim().regex(/^tt[A-Za-z0-9]{1,126}$/);

type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AccessTokenPort = Pick<DouyinMiniappAccessTokenService, "getComponentAccessToken">;
type ReleaseServicePort = Pick<PlatformDouyinMiniappReleasesService, "upload" | "getTestQr">;

export type PlatformDouyinTemplatePromotionInput = z.input<typeof PromotionInputSchema>;

export type PlatformDouyinTemplatePromotionDependencies = {
  readonly accessPolicy: AccessPolicyPort;
  readonly accessTokens: AccessTokenPort;
  readonly gateway: DouyinTemplateManagementGateway;
  readonly releases: ReleaseServicePort;
  readonly templateAppId: string;
};

export class PlatformDouyinTemplatePromotionService {
  constructor(
    private readonly dependencies: PlatformDouyinTemplatePromotionDependencies,
  ) {}

  async promoteLatest(
    authContext: AuthContext,
    installationId: string,
    input: PlatformDouyinTemplatePromotionInput,
  ): Promise<DouyinMiniappReleaseRecord> {
    this.assertCanManage(authContext);
    const parsed = parseRequest(PromotionInputSchema, input);
    const templateAppId = parseRequest(
      TemplateAppIdSchema,
      this.dependencies.templateAppId,
    );
    const componentAccessToken = await this.dependencies.accessTokens
      .getComponentAccessToken();
    const apps = await this.dependencies.gateway.listTemplateApps({
      componentAccessToken,
    });
    const matchingApps = apps.items.filter(
      (app) => app.templateAppId === templateAppId,
    );
    if (matchingApps.length === 0) {
      throw Errors.business(
        404,
        "未找到指定的抖音模板开发小程序",
        "DOUYIN_TEMPLATE_APP_NOT_FOUND",
      );
    }
    if (matchingApps.length !== 1) {
      throw Errors.business(
        409,
        "抖音模板开发小程序匹配结果不唯一",
        "DOUYIN_TEMPLATE_APP_AMBIGUOUS",
      );
    }

    const draft = matchingApps[0];
    if (
      !draft
      || draft.draftId === undefined
      || draft.version === undefined
      || draft.description === undefined
      || draft.createdAt === undefined
    ) {
      throw Errors.business(
        409,
        "模板开发小程序暂无可用上传草稿",
        "DOUYIN_TEMPLATE_DRAFT_NOT_READY",
      );
    }

    const uploadInput = parseRequest(UploadInputSchema, {
      template_id: "1",
      template_version: draft.version,
      description: draft.description,
      channel: parsed.channel,
    });
    const template = await this.requireTemplate(
      componentAccessToken,
      draft.draftId,
      uploadInput.template_version,
      uploadInput.description,
      draft.createdAt,
    );
    const release = await this.dependencies.releases.upload(
      authContext,
      installationId,
      {
        ...uploadInput,
        template_id: template.templateId,
      },
    );
    return this.dependencies.releases.getTestQr(
      authContext,
      installationId,
      release.id,
    );
  }

  private async requireTemplate(
    componentAccessToken: string,
    draftId: string,
    version: string,
    description: string,
    draftCreatedAt: number,
  ): Promise<DouyinCodeTemplate> {
    const request = { componentAccessToken };
    const before = await this.dependencies.gateway.listTemplates(request);
    const existing = this.requireUniqueExactTemplate(
      before.items,
      version,
      description,
      draftCreatedAt,
    );
    if (existing) return existing;

    let addError: unknown;
    try {
      await this.dependencies.gateway.addTemplate({
        componentAccessToken,
        draftId,
      });
    } catch (error: unknown) {
      addError = error;
    }

    let after;
    try {
      after = await this.dependencies.gateway.listTemplates(request);
    } catch (error: unknown) {
      if (addError !== undefined) throw addError;
      throw error;
    }
    const promoted = this.requireUniqueExactTemplate(
      after.items,
      version,
      description,
      draftCreatedAt,
    );
    if (promoted) return promoted;
    if (addError !== undefined) throw addError;
    throw Errors.business(
      502,
      "抖音模板已添加但暂未出现在模板库",
      "DOUYIN_TEMPLATE_PROMOTION_NOT_VISIBLE",
    );
  }

  private requireUniqueExactTemplate(
    templates: readonly DouyinCodeTemplate[],
    version: string,
    description: string,
    draftCreatedAt: number,
  ): DouyinCodeTemplate | undefined {
    const matches = templates.filter(
      (item) => item.version === version
        && item.description === description
        && item.createdAt > draftCreatedAt,
    );
    if (matches.length > 1) {
      throw Errors.business(
        409,
        "模板库中存在多个相同版本和描述的模板",
        "DOUYIN_TEMPLATE_MATCH_AMBIGUOUS",
      );
    }
    return matches[0];
  }

  private assertCanManage(authContext: AuthContext): void {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (
      authContext.tenantId !== null
      || !isPlatformIdentity
      || !authContext.employeeId
      || this.dependencies.accessPolicy.assertPermission(
        authContext,
        MANAGE_PERMISSION,
      ) !== "all"
    ) {
      throw Errors.forbidden();
    }
  }
}

let defaultServicePromise: Promise<PlatformDouyinTemplatePromotionService> | undefined;

export function getPlatformDouyinTemplatePromotionService(): Promise<
  PlatformDouyinTemplatePromotionService
> {
  return defaultServicePromise ??= import(
    "./platform-douyin-template-promotion/default-service"
  ).then(({ createDefaultTemplatePromotionDependencies }) =>
    new PlatformDouyinTemplatePromotionService(
      createDefaultTemplatePromotionDependencies(),
    )
  ).catch((error: unknown) => {
    defaultServicePromise = undefined;
    throw error;
  });
}
