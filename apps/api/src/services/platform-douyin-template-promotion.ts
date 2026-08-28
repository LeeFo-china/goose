import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type {
  DouyinCodeTemplate,
  DouyinTemplateManagementGateway,
} from "@/gateways/douyin-open-platform/template-client";
import type {
  DouyinDeployableTemplate,
  DouyinDeployableTemplatesRepository,
} from "@/repositories/douyin-deployable-templates";
import type { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import type { DouyinMiniappAccessTokenService } from "@/services/douyin-miniapp/access-tokens";
import {
  parseRequest,
  UploadInputSchema,
} from "./platform-douyin-miniapp-releases/support";

const MANAGE_PERMISSION = "platform.douyin_miniapp.manage";
const FIXED_TEMPLATE_APP_ID = "tt0d647bd99301341b01";

const PromotionInputSchema = z.strictObject({
  channel: z.enum(["default", "1"]),
});
const TemplateAppIdSchema = z.literal(FIXED_TEMPLATE_APP_ID);

type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AccessTokenPort = Pick<DouyinMiniappAccessTokenService, "getComponentAccessToken">;
type TemplateRepositoryPort = Pick<
  DouyinDeployableTemplatesRepository,
  "findCurrent" | "confirm"
>;

type ReadyDraft = {
  readonly draftId: string;
  readonly version: string;
  readonly description: string;
  readonly createdAt: number;
};

export type PlatformDouyinTemplatePromotionInput = z.input<typeof PromotionInputSchema>;

export type PlatformDouyinTemplatePromotionDependencies = {
  readonly accessPolicy: AccessPolicyPort;
  readonly accessTokens: AccessTokenPort;
  readonly gateway: DouyinTemplateManagementGateway;
  readonly templates: TemplateRepositoryPort;
  readonly templateAppId: string;
};

export class PlatformDouyinTemplatePromotionService {
  constructor(
    private readonly dependencies: PlatformDouyinTemplatePromotionDependencies,
  ) {}

  async getStatus(
    authContext: AuthContext,
    input: PlatformDouyinTemplatePromotionInput,
  ) {
    this.assertCanManage(authContext);
    const parsed = parseRequest(PromotionInputSchema, input);
    const templateAppId = parseRequest(
      TemplateAppIdSchema,
      this.dependencies.templateAppId,
    );
    const [draft, currentTemplate] = await Promise.all([
      this.getLatestDraft(templateAppId, false),
      this.dependencies.templates.findCurrent(parsed.channel),
    ]);
    return {
      template_app_id: templateAppId,
      latest_draft: draft
        ? {
          version: draft.version,
          description: draft.description,
          created_at: draft.createdAt,
        }
        : null,
      current_template: currentTemplate,
      is_latest_confirmed: Boolean(
        draft && currentTemplate?.source_draft_id === draft.draftId,
      ),
    };
  }

  async confirmLatest(
    authContext: AuthContext,
    input: PlatformDouyinTemplatePromotionInput,
  ): Promise<DouyinDeployableTemplate> {
    const actorEmployeeId = this.assertCanManage(authContext);
    const parsed = parseRequest(PromotionInputSchema, input);
    const templateAppId = parseRequest(
      TemplateAppIdSchema,
      this.dependencies.templateAppId,
    );
    const draft = await this.getLatestDraft(templateAppId, true);
    const currentTemplate = await this.dependencies.templates.findCurrent(
      parsed.channel,
    );
    if (currentTemplate?.source_draft_id === draft.draftId) {
      return currentTemplate;
    }
    const componentAccessToken = await this.dependencies.accessTokens
      .getComponentAccessToken();
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
    return this.dependencies.templates.confirm({
      templateAppId,
      sourceDraftId: draft.draftId,
      templateId: template.templateId,
      templateVersion: uploadInput.template_version,
      description: uploadInput.description,
      channel: uploadInput.channel,
      actorEmployeeId,
    });
  }

  private async getLatestDraft(
    templateAppId: string,
    required: true,
  ): Promise<ReadyDraft>;
  private async getLatestDraft(
    templateAppId: string,
    required: false,
  ): Promise<ReadyDraft | null>;
  private async getLatestDraft(
    templateAppId: string,
    required: boolean,
  ): Promise<ReadyDraft | null> {
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
      if (!required) return null;
      throw Errors.business(
        409,
        "模板开发小程序暂无可用上传草稿",
        "DOUYIN_TEMPLATE_DRAFT_NOT_READY",
      );
    }
    return {
      draftId: draft.draftId,
      version: draft.version,
      description: draft.description,
      createdAt: draft.createdAt,
    };
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
    const existing = this.findTemplateByDraftIdentity(
      before.items,
      draftId,
      version,
      description,
      draftCreatedAt,
    );
    if (existing) return existing;
    const templateIdsBefore = new Set(
      before.items.map((template) => template.templateId),
    );

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
    const recovered = this.findTemplateByDraftIdentity(
      after.items,
      draftId,
      version,
      description,
      draftCreatedAt,
    );
    if (recovered) return recovered;
    const promoted = this.requireUniqueExactTemplate(
      after.items.filter(
        (template) => !templateIdsBefore.has(template.templateId),
      ),
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

  private findTemplateByDraftIdentity(
    templates: readonly DouyinCodeTemplate[],
    draftId: string,
    version: string,
    description: string,
    draftCreatedAt: number,
  ): DouyinCodeTemplate | undefined {
    const identityMatches = templates.filter(
      (template) => template.templateId === draftId,
    );
    if (identityMatches.length === 0) return undefined;

    const exactMatches = identityMatches.filter(
      (template) => template.version === version
        && template.description === description
        && template.createdAt === draftCreatedAt,
    );
    if (identityMatches.length !== 1 || exactMatches.length !== 1) {
      throw Errors.business(
        409,
        "抖音模板身份与最新草稿信息冲突",
        "DOUYIN_TEMPLATE_IDENTITY_CONFLICT",
      );
    }
    return exactMatches[0];
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

  private assertCanManage(authContext: AuthContext): string {
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
    return authContext.employeeId;
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
