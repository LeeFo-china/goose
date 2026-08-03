import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { DouyinCredentialEnvelope } from "@/services/douyin-miniapp/credential-envelope";
import { SupabaseDB } from "@/utils/supabase";

export type DouyinAuthorizationEventDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
};

export interface DouyinAuthorizationEventDatabaseClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<DouyinAuthorizationEventDatabaseResult>;
}

export type DouyinAuthorizationEventClaim =
  | { readonly state: "claimed" | "reclaimed"; readonly claimToken: string; readonly claimExpiresAt: string }
  | { readonly state: "completed" | "busy" };

export type ExpiringCredentialEnvelope = DouyinCredentialEnvelope & {
  readonly expiresAt: string;
};

const ClaimedSchema = z.object({
  claim_state: z.enum(["claimed", "reclaimed"]),
  claim_token: z.string().uuid(),
  claim_expires_at: z.iso.datetime({ offset: true }),
});
const UnclaimedSchema = z.object({
  claim_state: z.enum(["completed", "busy"]),
  claim_token: z.null(),
  claim_expires_at: z.null(),
});
const ClaimRowSchema = z.discriminatedUnion("claim_state", [ClaimedSchema, UnclaimedSchema]);
const EventStateSchema = z.enum(["processing", "completed"]).nullable();

export interface DouyinAuthorizationEventRepository {
  claimEvent(input: {
    readonly eventKey: string;
    readonly componentAppId: string;
    readonly eventName: string;
    readonly authorizerAppId: string | null;
    readonly occurredAt: string;
  }): Promise<DouyinAuthorizationEventClaim>;
  attachAuthorizationCodeDigest(input: {
    readonly eventKey: string;
    readonly authorizationCodeDigest: string;
  }): Promise<boolean>;
  findEventState(eventKey: string): Promise<"processing" | "completed" | null>;
  completeTicketEvent(input: {
    readonly eventKey: string;
    readonly claimToken: string;
    readonly componentAppId: string;
    readonly ticket: DouyinCredentialEnvelope;
    readonly receivedAt: string;
  }): Promise<boolean>;
  completeAuthorizationEvent(input: {
    readonly eventKey: string;
    readonly claimToken: string;
    readonly componentAppId: string;
    readonly authorizerAppId: string;
    readonly eventName: "AUTHORIZED" | "UPDATE_AUTHORIZED";
    readonly occurredAt: string;
    readonly accessToken: ExpiringCredentialEnvelope;
    readonly refreshToken: ExpiringCredentialEnvelope;
    readonly permissions: readonly unknown[];
  }): Promise<boolean>;
  completeRevocationEvent(input: {
    readonly eventKey: string;
    readonly claimToken: string;
    readonly componentAppId: string;
    readonly authorizerAppId: string;
    readonly occurredAt: string;
  }): Promise<boolean>;
  completeUnsupportedEvent(input: {
    readonly eventKey: string;
    readonly claimToken: string;
  }): Promise<boolean>;
}

export class DouyinAuthorizationEventsRepository
implements DouyinAuthorizationEventRepository {
  constructor(
    private readonly client: DouyinAuthorizationEventDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinAuthorizationEventDatabaseClient,
  ) {}

  async claimEvent(input: Parameters<DouyinAuthorizationEventRepository["claimEvent"]>[0]) {
    const result = await this.execute(async () => {
      const response = await this.client.rpc("claim_douyin_authorization_event", {
        p_event_key: input.eventKey,
        p_component_appid: input.componentAppId,
        p_event_name: input.eventName,
        p_authorizer_appid: input.authorizerAppId,
        p_occurred_at: input.occurredAt,
      });
      assertClaimSuccess(response);
      return response;
    });
    const rows = Array.isArray(result.data) ? result.data : [];
    const parsed = rows.length === 1 ? ClaimRowSchema.safeParse(rows[0]) : null;
    if (!parsed?.success) throw invalidResponseError();
    if (parsed.data.claim_state === "claimed" || parsed.data.claim_state === "reclaimed") {
      return {
        state: parsed.data.claim_state,
        claimToken: parsed.data.claim_token,
        claimExpiresAt: parsed.data.claim_expires_at,
      };
    }
    return { state: parsed.data.claim_state };
  }

  async findEventState(eventKey: string) {
    const result = await this.execute(() =>
      this.client.rpc("get_douyin_authorization_event_state", { p_event_key: eventKey }));
    const parsed = EventStateSchema.safeParse(result.data);
    if (!parsed.success) throw invalidResponseError();
    return parsed.data;
  }

  async attachAuthorizationCodeDigest(input: {
    readonly eventKey: string;
    readonly authorizationCodeDigest: string;
  }): Promise<boolean> {
    return this.complete("attach_douyin_authorization_event_code_digest", {
      p_event_key: input.eventKey,
      p_authorization_code_digest: input.authorizationCodeDigest,
    });
  }

  async completeTicketEvent(
    input: Parameters<DouyinAuthorizationEventRepository["completeTicketEvent"]>[0],
  ) {
    return this.complete("complete_douyin_ticket_event", {
      p_event_key: input.eventKey,
      p_claim_token: input.claimToken,
      p_component_appid: input.componentAppId,
      p_ticket_ciphertext: input.ticket.ciphertext,
      p_ticket_iv: input.ticket.iv,
      p_ticket_tag: input.ticket.tag,
      p_ticket_key_version: input.ticket.keyVersion,
      p_received_at: input.receivedAt,
    });
  }

  async completeAuthorizationEvent(
    input: Parameters<DouyinAuthorizationEventRepository["completeAuthorizationEvent"]>[0],
  ) {
    return this.complete("complete_douyin_authorization_event", {
      p_event_key: input.eventKey,
      p_claim_token: input.claimToken,
      p_component_appid: input.componentAppId,
      p_authorizer_appid: input.authorizerAppId,
      p_event_name: input.eventName,
      p_occurred_at: input.occurredAt,
      p_access_token_ciphertext: input.accessToken.ciphertext,
      p_access_token_iv: input.accessToken.iv,
      p_access_token_tag: input.accessToken.tag,
      p_access_token_key_version: input.accessToken.keyVersion,
      p_access_token_expires_at: input.accessToken.expiresAt,
      p_refresh_token_ciphertext: input.refreshToken.ciphertext,
      p_refresh_token_iv: input.refreshToken.iv,
      p_refresh_token_tag: input.refreshToken.tag,
      p_refresh_token_key_version: input.refreshToken.keyVersion,
      p_refresh_token_expires_at: input.refreshToken.expiresAt,
      p_permissions: input.permissions,
    });
  }

  async completeRevocationEvent(
    input: Parameters<DouyinAuthorizationEventRepository["completeRevocationEvent"]>[0],
  ) {
    return this.complete("complete_douyin_revocation_event", {
      p_event_key: input.eventKey,
      p_claim_token: input.claimToken,
      p_component_appid: input.componentAppId,
      p_authorizer_appid: input.authorizerAppId,
      p_occurred_at: input.occurredAt,
    });
  }

  async completeUnsupportedEvent(
    input: Parameters<DouyinAuthorizationEventRepository["completeUnsupportedEvent"]>[0],
  ) {
    return this.complete("complete_douyin_unsupported_event", {
      p_event_key: input.eventKey,
      p_claim_token: input.claimToken,
    });
  }

  private async complete(name: string, args: Record<string, unknown>): Promise<boolean> {
    const result = await this.execute(() => this.client.rpc(name, args));
    if (typeof result.data !== "boolean") throw invalidResponseError();
    return result.data;
  }

  private async execute(
    operation: () => PromiseLike<DouyinAuthorizationEventDatabaseResult>,
  ): Promise<DouyinAuthorizationEventDatabaseResult> {
    try {
      const result = await operation();
      if (result.error) throw repositoryError();
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw repositoryError();
    }
  }
}

function assertClaimSuccess(result: DouyinAuthorizationEventDatabaseResult): void {
  if (!result.error) return;
  if (databaseErrorMessage(result.error) === "DOUYIN_COMPONENT_NOT_ACTIVE") {
    throw Errors.business(
      503,
      "抖音第三方组件未启用",
      "DOUYIN_COMPONENT_NOT_ACTIVE",
    );
  }
  throw repositoryError();
}

function databaseErrorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

function invalidResponseError(): AppError {
  return Errors.business(
    500,
    "抖音授权事件存储响应格式无效",
    "DOUYIN_AUTHORIZATION_EVENT_REPOSITORY_RESPONSE_INVALID",
  );
}

function repositoryError(): AppError {
  return Errors.business(
    500,
    "抖音授权事件存储失败",
    "DOUYIN_AUTHORIZATION_EVENT_REPOSITORY_ERROR",
  );
}
