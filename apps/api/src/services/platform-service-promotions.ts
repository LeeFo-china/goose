import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";
import {
  platformServicePromotionRepository,
  type PlatformServicePromotionRepository,
} from "@/repositories/platform-service-promotions";
import type {
  PlatformServicePromotionCreateInput,
  PlatformServicePromotionListQuery,
  PlatformServicePromotionPublishInput,
  PlatformServicePromotionStopInput,
  PlatformServicePromotionUpdateInput,
} from "@/schema/platform-service-promotions";
import type { AuthContext } from "@/services/authorization";
import { platformAuthorizationService } from "@/services/platform-authorization";

type RepositoryPort = Pick<
  PlatformServicePromotionRepository,
  "list" | "createDraft" | "saveDraft" | "publish" | "stop"
>;

type PlatformServicePromotionServiceDependencies = {
  repository?: RepositoryPort;
};

type PromotionActor = {
  employeeId: string;
  authUserId: string;
};

const MANAGE_PERMISSION = "platform.service_product.manage";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const PROMOTION_CODE_PREFIX = "platform_service_promotion_";

const PROMOTION_ERRORS = {
  SERVICE_PROMOTION_NOT_FOUND: [404, "限时活动不存在"],
  SERVICE_PROMOTION_VERSION_CONFLICT: [409, "限时活动已被更新，请刷新后重试"],
  SERVICE_PROMOTION_TIME_INVALID: [422, "活动时间无效"],
  SERVICE_PROMOTION_OVERLAP: [409, "活动时间与已发布活动重叠"],
  SERVICE_PROMOTION_PRICE_NOT_LOWER: [422, "活动价必须低于三档套餐的日常价"],
  SERVICE_PROMOTION_PRODUCT_UNAVAILABLE: [409, "三档正式套餐尚未全部发布"],
  SERVICE_PROMOTION_INVALID_STATE: [409, "当前活动状态不允许执行此操作"],
} as const;

export class PlatformServicePromotionService {
  private readonly repository: RepositoryPort;

  constructor(dependencies: PlatformServicePromotionServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformServicePromotionRepository;
  }

  async listPromotions(
    authContext: AuthContext,
    query: Partial<PlatformServicePromotionListQuery> = {},
  ) {
    this.requireActor(authContext);
    return this.execute(() => this.repository.list({
      page: normalizePositiveInteger(query.page, DEFAULT_PAGE),
      pageSize: normalizePageSize(query.pageSize),
    }));
  }

  async createDraft(
    authContext: AuthContext,
    draft: PlatformServicePromotionCreateInput,
  ) {
    const actor = this.requireActor(authContext);
    return this.execute(() => this.repository.createDraft({
      code: `${PROMOTION_CODE_PREFIX}${crypto.randomUUID()}`,
      draft,
    }, actor));
  }

  async saveDraft(
    authContext: AuthContext,
    promotionId: string,
    input: PlatformServicePromotionUpdateInput,
  ) {
    const actor = this.requireActor(authContext);
    return this.execute(() =>
      this.repository.saveDraft(promotionId, input, actor)
    );
  }

  async publish(
    authContext: AuthContext,
    promotionId: string,
    input: PlatformServicePromotionPublishInput,
  ) {
    const actor = this.requireActor(authContext);
    return this.execute(() => this.repository.publish({
      promotionId,
      expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key,
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
    }));
  }

  async stop(
    authContext: AuthContext,
    promotionId: string,
    input: PlatformServicePromotionStopInput,
  ) {
    const actor = this.requireActor(authContext);
    return this.execute(() => this.repository.stop({
      promotionId,
      expectedVersion: input.expected_version,
      idempotencyKey: input.idempotency_key,
      reason: input.reason,
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
    }));
  }

  private requireActor(authContext: AuthContext): PromotionActor {
    if (
      authContext.tenantId !== null ||
      (
        !authContext.isPlatformStaff &&
        !authContext.isPlatformAdmin &&
        !authContext.isPlatformSuperAdmin
      ) ||
      !authContext.employeeId ||
      !authContext.authUserId
    ) {
      throw Errors.forbidden();
    }
    platformAuthorizationService.assertPermission(
      authContext,
      MANAGE_PERMISSION,
    );
    return {
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }

  private async execute<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      throwPromotionError(error);
    }
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizePageSize(value: number | undefined) {
  return Math.min(
    normalizePositiveInteger(value, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
}

function throwPromotionError(error: unknown): never {
  for (const [code, [statusCode, message]] of Object.entries(PROMOTION_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(statusCode, message, code);
    }
  }
  throw error;
}

export const platformServicePromotionService =
  new PlatformServicePromotionService();
