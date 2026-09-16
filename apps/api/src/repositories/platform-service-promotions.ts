import { Errors } from "@/errors/error-factory";
import type {
  PlatformServicePromotionCreateInput,
  PlatformServicePromotionUpdateInput,
} from "@/schema/platform-service-promotions";
import { SupabaseDB } from "@/utils/supabase";

import {
  parsePlatformServicePromotionCommandResult,
  parsePlatformServicePromotionListPage,
  type PlatformServicePromotionCommandResult,
  type PlatformServicePromotionListPage,
} from "./platform-service-promotion-records";

type PromotionRpcName =
  | "platform_service_list_promotions"
  | "platform_service_create_promotion_draft"
  | "platform_service_save_promotion_draft"
  | "platform_service_publish_promotion"
  | "platform_service_stop_promotion";

type PromotionRpcResult = {
  readonly data: unknown;
  readonly error: unknown;
};

export interface PlatformServicePromotionClient {
  rpc(
    name: PromotionRpcName,
    params: Record<string, unknown>,
  ): PromiseLike<PromotionRpcResult>;
}

export type PlatformServicePromotionActor = {
  employeeId: string;
  authUserId: string;
};

export class PlatformServicePromotionRepository {
  constructor(
    private readonly client: PlatformServicePromotionClient =
      SupabaseDB.getAdminClient() as unknown as PlatformServicePromotionClient,
  ) {}

  async list(input: {
    page: number;
    pageSize: number;
  }): Promise<PlatformServicePromotionListPage> {
    const { page, pageSize } = normalizePagination(input.page, input.pageSize);
    const { data, error } = await this.client.rpc(
      "platform_service_list_promotions",
      { p_page: page, p_page_size: pageSize },
    );
    if (error) throw Errors.dbError("查询平台技术服务限时活动失败", error);
    const parsed = parsePlatformServicePromotionListPage(data);
    if (!parsed.success) {
      throw Errors.dbError("解析平台技术服务限时活动列表失败", parsed.error);
    }
    return parsed.data;
  }

  async createDraft(
    input: {
      code: string;
      draft: PlatformServicePromotionCreateInput;
    },
    actor: PlatformServicePromotionActor,
  ): Promise<PlatformServicePromotionCommandResult> {
    const result = await this.client.rpc(
      "platform_service_create_promotion_draft",
      {
        p_code: input.code,
        p_draft: input.draft,
        p_actor_employee_id: actor.employeeId,
        p_actor_user_id: actor.authUserId,
      },
    );
    return commandResultOrThrow(
      result,
      "创建平台技术服务限时活动草稿失败",
      "解析平台技术服务限时活动草稿创建结果失败",
    );
  }

  async saveDraft(
    promotionId: string,
    input: PlatformServicePromotionUpdateInput,
    actor: PlatformServicePromotionActor,
  ): Promise<PlatformServicePromotionCommandResult> {
    const { expected_version, ...draft } = input;
    const result = await this.client.rpc(
      "platform_service_save_promotion_draft",
      {
        p_promotion_id: promotionId,
        p_expected_version: expected_version,
        p_draft: draft,
        p_actor_employee_id: actor.employeeId,
        p_actor_user_id: actor.authUserId,
      },
    );
    return commandResultOrThrow(
      result,
      "保存平台技术服务限时活动草稿失败",
      "解析平台技术服务限时活动草稿保存结果失败",
    );
  }

  async publish(input: {
    promotionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    actorEmployeeId: string;
    actorUserId: string;
  }): Promise<PlatformServicePromotionCommandResult> {
    const result = await this.client.rpc(
      "platform_service_publish_promotion",
      {
        p_promotion_id: input.promotionId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_actor_employee_id: input.actorEmployeeId,
        p_actor_user_id: input.actorUserId,
      },
    );
    return commandResultOrThrow(
      result,
      "发布平台技术服务限时活动失败",
      "解析平台技术服务限时活动发布结果失败",
    );
  }

  async stop(input: {
    promotionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason: string;
    actorEmployeeId: string;
    actorUserId: string;
  }): Promise<PlatformServicePromotionCommandResult> {
    const result = await this.client.rpc(
      "platform_service_stop_promotion",
      {
        p_promotion_id: input.promotionId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_reason: input.reason,
        p_actor_employee_id: input.actorEmployeeId,
        p_actor_user_id: input.actorUserId,
      },
    );
    return commandResultOrThrow(
      result,
      "停止平台技术服务限时活动失败",
      "解析平台技术服务限时活动停止结果失败",
    );
  }
}

function commandResultOrThrow(
  result: PromotionRpcResult,
  context: string,
  parseContext: string,
): PlatformServicePromotionCommandResult {
  if (result.error) throw Errors.dbError(context, result.error);
  const parsed = parsePlatformServicePromotionCommandResult(result.data);
  if (!parsed.success) {
    throw Errors.dbError(parseContext, parsed.error);
  }
  return parsed.data;
}

function normalizePagination(page: number, pageSize: number) {
  const normalizedPage = Number.isFinite(page)
    ? Math.max(1, Math.floor(page))
    : 1;
  const normalizedPageSize = Number.isFinite(pageSize)
    ? Math.min(100, Math.max(1, Math.floor(pageSize)))
    : 20;
  return { page: normalizedPage, pageSize: normalizedPageSize };
}

export const platformServicePromotionRepository =
  new PlatformServicePromotionRepository();
