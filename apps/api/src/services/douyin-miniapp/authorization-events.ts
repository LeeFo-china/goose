import { createHmac } from "node:crypto";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  DouyinOpenPlatformClient,
  type AuthorizerTokenResult,
  type DouyinOpenPlatformGateway,
} from "@/gateways/douyin-open-platform/client";
import {
  type DouyinAuthorizationEventClaim,
  type DouyinAuthorizationEventRepository,
  DouyinAuthorizationEventsRepository,
} from "@/repositories/douyin-authorization-events";
import { DouyinMiniappInstallationsRepository } from "@/repositories/douyin-miniapp-installations";
import { DouyinThirdPartyComponentsRepository } from "@/repositories/douyin-third-party-components";
import {
  type DouyinAuthorizationLifecycleEvent,
  type DouyinCallbackWrapper,
  type DouyinDecryptedEvent,
  type DouyinTicketEvent,
  type DouyinUnauthorizedEvent,
  type DouyinUnsupportedEvent,
  parseDouyinDecryptedEvent,
} from "@/schema/douyin-third-party-events";
import { assertAuthorizerAppId, hasLeaseHeadroom } from "./access-token-support";
import { DouyinMiniappAccessTokenService } from "./access-tokens";
import { decryptDouyinCallback, verifyDouyinCallbackSignature } from "./callback-crypto";
import { loadDouyinMiniappConfig } from "./config";
import {
  sealDouyinCredential,
  type DouyinCredentialKeyring,
} from "./credential-envelope";

const CALLBACK_WINDOW_MS = 300_000;
const BUSY_POLL_ATTEMPTS = 10;
const BUSY_POLL_INTERVAL_MS = 100;
const CLAIMED_START_HEADROOM_MS = 22_000;
const RECLAIMED_START_HEADROOM_MS = 32_000;
const RETRIEVE_HEADROOM_MS = 22_000;
const EXCHANGE_HEADROOM_MS = 12_000;
const EVENT_KEY_DOMAIN = "gooes:douyin:authorization-event:v1";

type ComponentRegistrationRepository = {
  findActive(componentAppId: string): Promise<{ readonly component_appid: string } | null>;
};
type ComponentAccessTokens = { getComponentAccessToken(): Promise<string> };
type AuthorizationGateway = Pick<
  DouyinOpenPlatformGateway,
  "retrieveAuthorizationCode" | "exchangeAuthorizationCode"
>;
type EventLogger = {
  info(metadata: { readonly eventName: string }, message: string): void;
};

export type DouyinAuthorizationEventsServiceOptions = {
  readonly componentAppId: string;
  readonly componentMessageToken: string;
  readonly componentMessageAesKey: string;
  readonly credentialKeyring: DouyinCredentialKeyring;
  readonly subjectHashKey: string;
  readonly eventRepository: DouyinAuthorizationEventRepository;
  readonly componentRepository: ComponentRegistrationRepository;
  readonly accessTokens: ComponentAccessTokens;
  readonly openPlatform: AuthorizationGateway;
  readonly log: EventLogger;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};

type ActiveClaim = Extract<
  DouyinAuthorizationEventClaim,
  { readonly state: "claimed" | "reclaimed" }
>;

export class DouyinAuthorizationEventsService {
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: DouyinAuthorizationEventsServiceOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? sleepWithTimer;
  }

  async handleCallback(wrapper: DouyinCallbackWrapper): Promise<void> {
    try {
      this.assertFreshTimestamp(wrapper.TimeStamp);
      this.assertSignature(wrapper);
      const message = this.decryptAndParse(wrapper);
      this.assertMessageComponent(message);
      await this.assertRegisteredComponent();
      await this.dispatch(message, wrapper.TimeStamp);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Errors.business(
        500,
        "抖音授权事件处理失败",
        "DOUYIN_AUTHORIZATION_EVENT_PROCESSING_FAILED",
      );
    }
  }

  private assertFreshTimestamp(timestamp: string): void {
    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isSafeInteger(timestampMs) ||
      Math.abs(this.now() - timestampMs) > CALLBACK_WINDOW_MS) {
      throw Errors.business(
        400,
        "抖音回调时间戳无效",
        "DOUYIN_CALLBACK_TIMESTAMP_INVALID",
      );
    }
  }

  private assertSignature(wrapper: DouyinCallbackWrapper): void {
    const valid = verifyDouyinCallbackSignature({
      token: this.options.componentMessageToken,
      timestamp: wrapper.TimeStamp,
      nonce: wrapper.Nonce,
      encrypted: wrapper.Encrypt,
      signature: wrapper.MsgSignature,
    });
    if (!valid) {
      throw Errors.business(
        403,
        "抖音回调签名无效",
        "DOUYIN_CALLBACK_SIGNATURE_INVALID",
      );
    }
  }

  private decryptAndParse(wrapper: DouyinCallbackWrapper): DouyinDecryptedEvent {
    const decrypted = decryptDouyinCallback({
      encrypted: wrapper.Encrypt,
      encodingAesKey: this.options.componentMessageAesKey,
      expectedComponentAppId: this.options.componentAppId,
    });
    const parsed = parseDouyinDecryptedEvent(decrypted);
    if (parsed) return parsed;
    throw Errors.business(
      400,
      "抖音回调消息格式无效",
      "DOUYIN_CALLBACK_MESSAGE_INVALID",
    );
  }

  private assertMessageComponent(message: DouyinDecryptedEvent): void {
    if ("TpAppId" in message &&
      message.TpAppId !== undefined &&
      message.TpAppId !== this.options.componentAppId) {
      throw Errors.business(
        403,
        "抖音回调组件 AppID 不匹配",
        "DOUYIN_CALLBACK_COMPONENT_APP_ID_MISMATCH",
      );
    }
  }

  private async assertRegisteredComponent(): Promise<void> {
    const component = await this.options.componentRepository.findActive(
      this.options.componentAppId,
    );
    if (!component || component.component_appid !== this.options.componentAppId) {
      throw Errors.business(
        503,
        "抖音第三方组件未启用",
        "DOUYIN_COMPONENT_NOT_ACTIVE",
      );
    }
  }

  private async dispatch(message: DouyinDecryptedEvent, wrapperTime: string): Promise<void> {
    if (message.Event === "PUSH" && "Ticket" in message) {
      await this.handleTicket(message, wrapperTime);
      return;
    }
    if ((message.Event === "AUTHORIZED" || message.Event === "UPDATE_AUTHORIZED") &&
      "AuthorizationCode" in message) {
      await this.handleAuthorization(message, wrapperTime);
      return;
    }
    if (message.Event === "UNAUTHORIZED" &&
      typeof message.AppId === "string" &&
      typeof message.TpAppId === "string") {
      await this.handleRevocation({
        AppId: message.AppId,
        TpAppId: message.TpAppId,
        Event: "UNAUTHORIZED",
        EventTime: message.EventTime,
        CreateTime: message.CreateTime,
      }, wrapperTime);
      return;
    }
    await this.handleUnsupported(message, wrapperTime);
  }

  private async handleTicket(message: DouyinTicketEvent, wrapperTime: string): Promise<void> {
    const occurredAt = eventOccurredAt(message, wrapperTime);
    const ticket = sealDouyinCredential(message.Ticket, this.options.credentialKeyring);
    const eventKey = this.createEventKey("PUSH", null, occurredAt, [message.Ticket]);
    const claim = await this.claimEvent(eventKey, "PUSH", null, occurredAt);
    if (!claim) return;
    const completed = await this.options.eventRepository.completeTicketEvent({
      eventKey,
      claimToken: claim.claimToken,
      componentAppId: this.options.componentAppId,
      ticket,
      receivedAt: occurredAt,
    });
    this.assertCompleted(completed);
  }

  private async handleAuthorization(
    message: DouyinAuthorizationLifecycleEvent,
    wrapperTime: string,
  ): Promise<void> {
    const occurredAt = eventOccurredAt(message, wrapperTime);
    const eventKey = this.createEventKey(message.Event, message.AppId, occurredAt);
    const claim = await this.claimEvent(eventKey, message.Event, message.AppId, occurredAt);
    if (!claim) return;
    this.assertLeaseHeadroom(
      claim,
      claim.state === "reclaimed"
        ? RECLAIMED_START_HEADROOM_MS
        : CLAIMED_START_HEADROOM_MS,
    );
    const componentAccessToken = await this.options.accessTokens.getComponentAccessToken();
    let authorizationCode = message.AuthorizationCode;
    if (claim.state === "reclaimed") {
      this.assertLeaseHeadroom(claim, RETRIEVE_HEADROOM_MS);
      authorizationCode = await this.options.openPlatform.retrieveAuthorizationCode({
        componentAccessToken,
        authorizationAppId: message.AppId,
      });
    }
    this.assertLeaseHeadroom(claim, EXCHANGE_HEADROOM_MS);
    const tokens = await this.options.openPlatform.exchangeAuthorizationCode({
      componentAccessToken,
      authorizationCode,
    });
    assertAuthorizerAppId(tokens, message.AppId);
    const completed = await this.completeAuthorization(
      message,
      claim,
      eventKey,
      occurredAt,
      tokens,
    );
    this.assertCompleted(completed);
  }

  private completeAuthorization(
    message: DouyinAuthorizationLifecycleEvent,
    claim: ActiveClaim,
    eventKey: string,
    occurredAt: string,
    tokens: AuthorizerTokenResult,
  ): Promise<boolean> {
    const accessToken = sealDouyinCredential(tokens.accessToken, this.options.credentialKeyring);
    const refreshToken = sealDouyinCredential(tokens.refreshToken, this.options.credentialKeyring);
    const completedAt = this.now();
    return this.options.eventRepository.completeAuthorizationEvent({
      eventKey,
      claimToken: claim.claimToken,
      componentAppId: this.options.componentAppId,
      authorizerAppId: message.AppId,
      eventName: message.Event,
      occurredAt,
      accessToken: {
        ...accessToken,
        expiresAt: expiryFromSeconds(completedAt, tokens.expiresIn),
      },
      refreshToken: {
        ...refreshToken,
        expiresAt: expiryFromSeconds(completedAt, tokens.refreshExpiresIn),
      },
      permissions: tokens.permissions,
    });
  }

  private async handleRevocation(
    message: DouyinUnauthorizedEvent,
    wrapperTime: string,
  ): Promise<void> {
    const occurredAt = eventOccurredAt(message, wrapperTime);
    const eventKey = this.createEventKey(message.Event, message.AppId, occurredAt);
    const claim = await this.claimEvent(eventKey, message.Event, message.AppId, occurredAt);
    if (!claim) return;
    const completed = await this.options.eventRepository.completeRevocationEvent({
      eventKey,
      claimToken: claim.claimToken,
      componentAppId: this.options.componentAppId,
      authorizerAppId: message.AppId,
      occurredAt,
    });
    this.assertCompleted(completed);
  }

  private async handleUnsupported(
    message: DouyinUnsupportedEvent,
    wrapperTime: string,
  ): Promise<void> {
    this.options.log.info(
      { eventName: message.Event },
      "ignored trusted Douyin callback event",
    );
    const occurredAt = eventOccurredAt(message, wrapperTime);
    const authorizerAppId = message.AppId ?? null;
    const eventKey = this.createEventKey(message.Event, authorizerAppId, occurredAt);
    const claim = await this.claimEvent(
      eventKey,
      message.Event,
      authorizerAppId,
      occurredAt,
    );
    if (!claim) return;
    const completed = await this.options.eventRepository.completeUnsupportedEvent({
      eventKey,
      claimToken: claim.claimToken,
    });
    this.assertCompleted(completed);
  }

  private async claimEvent(
    eventKey: string,
    eventName: string,
    authorizerAppId: string | null,
    occurredAt: string,
  ): Promise<ActiveClaim | null> {
    const claim = await this.options.eventRepository.claimEvent({
      eventKey,
      componentAppId: this.options.componentAppId,
      eventName,
      authorizerAppId,
      occurredAt,
    });
    if ("claimToken" in claim) return claim;
    if (claim.state === "completed") return null;
    if (claim.state === "busy") {
      await this.pollBusyEvent(eventKey);
      return null;
    }
    return null;
  }

  private async pollBusyEvent(eventKey: string): Promise<void> {
    for (let attempt = 0; attempt < BUSY_POLL_ATTEMPTS; attempt += 1) {
      await this.sleep(BUSY_POLL_INTERVAL_MS);
      const state = await this.options.eventRepository.findEventState(eventKey);
      if (state === "completed") return;
      if (state === null) break;
    }
    throw Errors.business(
      503,
      "抖音授权事件正在处理中，请重试",
      "DOUYIN_AUTHORIZATION_EVENT_BUSY",
    );
  }

  private assertLeaseHeadroom(claim: ActiveClaim, milliseconds: number): void {
    if (hasLeaseHeadroom(claim.claimExpiresAt, this.now(), milliseconds)) return;
    throw Errors.business(
      503,
      "抖音授权事件租约剩余时间不足",
      "DOUYIN_AUTHORIZATION_EVENT_LEASE_INSUFFICIENT",
    );
  }

  private assertCompleted(completed: boolean): void {
    if (completed) return;
    throw Errors.business(
      503,
      "抖音授权事件暂未完成，请重试",
      "DOUYIN_AUTHORIZATION_EVENT_COMPLETION_REJECTED",
    );
  }

  private createEventKey(
    eventName: string,
    authorizerAppId: string | null,
    occurredAt: string,
    additionalIdentity: readonly string[] = [],
  ): string {
    const hmac = createHmac("sha256", this.options.subjectHashKey);
    for (const value of [
      EVENT_KEY_DOMAIN,
      this.options.componentAppId,
      eventName,
      authorizerAppId ?? "",
      occurredAt,
      ...additionalIdentity,
    ]) {
      const bytes = Buffer.from(value, "utf8");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      hmac.update(length).update(bytes);
    }
    return hmac.digest("hex");
  }
}

let defaultService: DouyinAuthorizationEventsService | undefined;

export function getDouyinAuthorizationEventsService(): DouyinAuthorizationEventsService {
  if (defaultService) return defaultService;
  const config = loadDouyinMiniappConfig();
  const componentRepository = new DouyinThirdPartyComponentsRepository();
  const installationRepository = new DouyinMiniappInstallationsRepository();
  const openPlatform = new DouyinOpenPlatformClient();
  const accessTokens = new DouyinMiniappAccessTokenService({
    componentAppId: config.componentAppId,
    componentAppSecret: config.componentAppSecret,
    credentialKeyring: config.credentialKeyring,
    componentRepository,
    installationRepository,
    openPlatform,
  });
  defaultService = new DouyinAuthorizationEventsService({
    componentAppId: config.componentAppId,
    componentMessageToken: config.componentMessageToken,
    componentMessageAesKey: config.componentMessageAesKey,
    credentialKeyring: config.credentialKeyring,
    subjectHashKey: config.subjectHashKey,
    eventRepository: new DouyinAuthorizationEventsRepository(),
    componentRepository,
    accessTokens,
    openPlatform,
    log: {
      info: (metadata, message) => console.info(metadata, message),
    },
  });
  return defaultService;
}

function eventOccurredAt(
  event: { readonly EventTime?: string; readonly CreateTime?: string },
  wrapperTime: string,
): string {
  return event.EventTime ?? event.CreateTime ??
    new Date(Number(wrapperTime) * 1000).toISOString();
}

function expiryFromSeconds(now: number, expiresIn: number): string {
  return new Date(now + expiresIn * 1000).toISOString();
}

function sleepWithTimer(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
