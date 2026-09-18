import { randomBytes } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import {
  tenantOnboardingShareLinksRepository,
  type TenantOnboardingShareLinksRepository,
} from "@/repositories/tenant-onboarding-share-links";
import type { AuthContext } from "@/services/authorization";

const SHARE_TITLE = "好店智装云邀你入驻";
const SHARE_PATH = "/packageVisitor/pages/tenant-onboarding/index";
const SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

type Dependencies = {
  repository?: Pick<
    TenantOnboardingShareLinksRepository,
    "createOrFind" | "recordOpen" | "list" | "findOwnedById" | "listApplications"
  >;
  tokenGenerator?: () => string;
  clock?: () => Date;
};

export class TenantOnboardingShareLinksService {
  private readonly repository;
  private readonly tokenGenerator;
  private readonly clock;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? tenantOnboardingShareLinksRepository;
    this.tokenGenerator = dependencies.tokenGenerator ??
      (() => `tnob_${randomBytes(32).toString("base64url")}`);
    this.clock = dependencies.clock ?? (() => new Date());
  }

  async create(input: {
    authContext: AuthContext;
    openid: string | null;
    idempotencyKey: string;
  }) {
    this.assertEmployee(input.authContext);
    const now = this.clock();
    const link = await this.repository.createOrFind({
      shareToken: this.tokenGenerator(),
      sharerUserId: input.authContext.authUserId,
      sharerEmployeeId: input.authContext.employeeId,
      sharerOpenid: input.openid?.trim() || null,
      sharerDisplayName: input.authContext.employeeName?.trim() || null,
      idempotencyKey: input.idempotencyKey,
      expiresAt: new Date(now.getTime() + SHARE_LIFETIME_MS).toISOString(),
      now: now.toISOString(),
    });
    return {
      share_token: link.share_token,
      path: `${SHARE_PATH}?source=local_services&share_token=${encodeURIComponent(link.share_token)}`,
      title: SHARE_TITLE,
      expires_at: link.expires_at,
      sharer: {
        user_id: link.sharer_user_id,
        display_name: link.sharer_display_name,
      },
    };
  }

  async recordOpen(input: { token: string | null; visitorId: string }) {
    if (!input.token) {
      return {
        valid: false,
        share_token: null,
        sharer_display_name: null,
      };
    }
    const result = await this.repository.recordOpen({
      token: input.token,
      visitorId: input.visitorId,
      now: this.clock().toISOString(),
    });
    return {
      valid: result.valid,
      share_token: result.valid ? input.token : null,
      sharer_display_name: result.sharer_display_name,
    };
  }

  list(input: {
    authContext: AuthContext;
    page: number;
    pageSize: number;
  }) {
    this.assertEmployee(input.authContext);
    return this.repository.list({
      sharerUserId: input.authContext.authUserId,
      page: input.page,
      pageSize: input.pageSize,
    });
  }

  async listApplications(input: {
    authContext: AuthContext;
    shareLinkId: string;
    page: number;
    pageSize: number;
  }) {
    this.assertEmployee(input.authContext);
    const owned = await this.repository.findOwnedById(
      input.shareLinkId,
      input.authContext.authUserId,
    );
    if (!owned) throw Errors.notFound("装企入驻分享链接不存在");
    return this.repository.listApplications({
      shareLinkId: input.shareLinkId,
      page: input.page,
      pageSize: input.pageSize,
    });
  }

  private assertEmployee(
    context: AuthContext,
  ): asserts context is AuthContext & { employeeId: string } {
    if (!context.employeeId) throw Errors.forbidden();
  }
}

export const tenantOnboardingShareLinksService =
  new TenantOnboardingShareLinksService();
