import type { AdminTenantServiceAccess } from "@gooes/domain";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { adminTenantServiceAccessService } from "@/services/admin-tenant-service-access";
import { systemSettingsService } from "@/services/system-settings";
import { wechatOpenLinkService } from "@/services/wechat-open-link";

const PURCHASE_PERMISSION = "billing.service_order.create";
const PURCHASE_PATH =
  "packageEmployees/pages/platformServicePaymentSmoke/index";
const PURCHASE_LINK_TTL_MS = 10 * 60 * 1000;

type MiniProgramEnvVersion = "release" | "trial" | "develop";

export type AdminServicePurchaseLinkInput = {
  tenantId: string;
  permissionCodes: readonly string[];
};

export type AdminServicePurchaseLinkResult = {
  url: string;
  expires_at: string;
};

export type AdminServicePurchaseLinkServiceDependencies = {
  resolveServiceAccess?: (
    input: AdminServicePurchaseLinkInput,
  ) => Promise<AdminTenantServiceAccess>;
  getString?: (key: string, fallback: string) => Promise<string>;
  normalizeEnvVersion?: (value: string) => MiniProgramEnvVersion;
  generateUrlLink?: (input: {
    path: string;
    query: string;
    envVersion: MiniProgramEnvVersion;
    expireAt: Date;
  }) => Promise<string>;
  now?: () => Date;
};

export class AdminServicePurchaseLinkService {
  private readonly resolveServiceAccess: NonNullable<
    AdminServicePurchaseLinkServiceDependencies["resolveServiceAccess"]
  >;
  private readonly getString: NonNullable<
    AdminServicePurchaseLinkServiceDependencies["getString"]
  >;
  private readonly normalizeEnvVersion: NonNullable<
    AdminServicePurchaseLinkServiceDependencies["normalizeEnvVersion"]
  >;
  private readonly generateUrlLink: NonNullable<
    AdminServicePurchaseLinkServiceDependencies["generateUrlLink"]
  >;
  private readonly now: NonNullable<
    AdminServicePurchaseLinkServiceDependencies["now"]
  >;

  constructor(dependencies: AdminServicePurchaseLinkServiceDependencies = {}) {
    this.resolveServiceAccess = dependencies.resolveServiceAccess
      ?? ((input) => adminTenantServiceAccessService.resolve(input));
    this.getString = dependencies.getString
      ?? ((key, fallback) => systemSettingsService.getString(key, fallback));
    this.normalizeEnvVersion = dependencies.normalizeEnvVersion
      ?? ((value) => wechatOpenLinkService.normalizeEnvVersion(value));
    this.generateUrlLink = dependencies.generateUrlLink
      ?? ((input) => wechatOpenLinkService.generateUrlLink(input));
    this.now = dependencies.now ?? (() => new Date());
  }

  async create(
    input: AdminServicePurchaseLinkInput,
  ): Promise<AdminServicePurchaseLinkResult> {
    if (!input.permissionCodes.includes(PURCHASE_PERMISSION)) {
      throw Errors.forbidden();
    }

    const trustedInput = {
      tenantId: input.tenantId,
      permissionCodes: input.permissionCodes,
    };
    const summary = await this.resolveServiceAccess(trustedInput);
    if (!isPurchaseAvailable(summary)) {
      throw Errors.business(
        403,
        "当前服务状态不可发起购买",
        "SERVICE_PURCHASE_UNAVAILABLE",
      );
    }

    const configuredEnvVersion = await this.getString(
      "WECHAT_MINIPROGRAM_ENV_VERSION",
      "release",
    );
    const envVersion = this.normalizeEnvVersion(configuredEnvVersion);
    const expireAt = new Date(this.now().getTime() + PURCHASE_LINK_TTL_MS);
    const query = summary.trialId
      ? new URLSearchParams({ source_trial_id: summary.trialId }).toString()
      : "";

    try {
      const url = await this.generateUrlLink({
        path: PURCHASE_PATH,
        query,
        envVersion,
        expireAt,
      });
      return { url, expires_at: expireAt.toISOString() };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Errors.business(
        502,
        "生成小程序购买链接失败，请稍后重试",
        "SERVICE_PURCHASE_LINK_FAILED",
      );
    }
  }
}

export const adminServicePurchaseLinkService =
  new AdminServicePurchaseLinkService();

function isPurchaseAvailable(summary: AdminTenantServiceAccess): boolean {
  if (summary.accessStatus === "hard_blocked") return false;
  return [summary.primaryAction, summary.secondaryAction]
    .some((action) => action?.key === "purchase_service");
}
