import { createHash } from "node:crypto";
import { projectRenderingQuota, type RenderingQuota } from "@gooes/domain";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  customerRenderingQuotaRepository,
  type CustomerRenderingQuotaBindResult,
  type CustomerRenderingQuotaIdentity,
  type CustomerRenderingQuotaReadResult,
  type CustomerRenderingQuotaRepository,
} from "@/repositories/customer-rendering-quota";
import type { JwtPayload } from "@/utils/jwt";
import {
  customerRenderingContextService,
  type CustomerRenderingActor,
  type CustomerRenderingContextService,
} from "./context";
import {
  getCustomerRenderingIdentityDigestService,
  type CustomerRenderingIdentityDigestService,
} from "./identity-digest";

type Channel = CustomerRenderingActor["channel"];
type ContextService = Pick<CustomerRenderingContextService, "resolveWechat" | "resolveDouyin">;
type DigestService = Pick<CustomerRenderingIdentityDigestService, "subject" | "phone">;
type QuotaRepository = Pick<CustomerRenderingQuotaRepository, "read" | "bindPhone">;
type PublicSnapshot = CustomerRenderingQuotaReadResult | Exclude<
  CustomerRenderingQuotaBindResult,
  { decision: "idempotency_conflict" }
>;

export class CustomerRenderingQuotaService {
  private readonly contextService: ContextService;
  private readonly digestService: DigestService;
  private readonly quotaRepository: QuotaRepository;

  constructor(dependencies: {
    readonly contextService?: ContextService;
    readonly digestService?: DigestService;
    readonly quotaRepository?: QuotaRepository;
  } = {}) {
    this.contextService = dependencies.contextService ?? customerRenderingContextService;
    this.digestService = dependencies.digestService
      ?? getCustomerRenderingIdentityDigestService();
    this.quotaRepository = dependencies.quotaRepository ?? customerRenderingQuotaRepository;
  }

  async getQuota(user: JwtPayload | undefined, channel: Channel): Promise<RenderingQuota> {
    const actor = await this.resolveActor(user, channel);
    const identity = this.digestIdentity(actor);
    if (!actor.verifiedPhone) {
      return project(await this.quotaRepository.read({
        ...identity,
        phoneKeyVersion: null,
        phoneDigest: null,
      }));
    }

    const phone = this.digestService.phone({
      tenantId: actor.tenantId,
      phone: actor.verifiedPhone,
    });
    const idempotencyKey = deterministicUuid([
      "customer-rendering-phone-sync-v1",
      identity.subjectDigest,
      phone.digest,
    ]);
    const result = await this.quotaRepository.bindPhone({
      ...identity,
      phoneKeyVersion: phone.keyVersion,
      phoneDigest: phone.digest,
      idempotencyKey,
      requestHash: commandHash(identity, phone, idempotencyKey),
    });
    return projectBindResult(result);
  }

  async bindPhone(
    user: JwtPayload | undefined,
    channel: Channel,
    command: { readonly idempotency_key: string },
  ): Promise<RenderingQuota> {
    const actor = await this.resolveActor(user, channel);
    if (!actor.verifiedPhone) {
      throw Errors.business(
        409,
        "请先授权手机号后再继续生成",
        ErrorCodes.RENDERING_PHONE_REQUIRED,
      );
    }
    const identity = this.digestIdentity(actor);
    const phone = this.digestService.phone({
      tenantId: actor.tenantId,
      phone: actor.verifiedPhone,
    });
    const result = await this.quotaRepository.bindPhone({
      ...identity,
      phoneKeyVersion: phone.keyVersion,
      phoneDigest: phone.digest,
      idempotencyKey: command.idempotency_key,
      requestHash: commandHash(identity, phone, command.idempotency_key),
    });
    return projectBindResult(result);
  }

  private async resolveActor(user: JwtPayload | undefined, channel: Channel) {
    return channel === "wechat"
      ? this.contextService.resolveWechat(user)
      : this.contextService.resolveDouyin(user);
  }

  private digestIdentity(actor: CustomerRenderingActor): CustomerRenderingQuotaIdentity {
    const subject = this.digestService.subject(actor);
    return {
      tenantId: actor.tenantId,
      channel: actor.channel,
      subjectKeyVersion: subject.keyVersion,
      subjectDigest: subject.digest,
      applicationId: actor.applicationId,
      installationId: actor.installationId,
    };
  }
}

function projectBindResult(result: CustomerRenderingQuotaBindResult) {
  if (result.decision === "idempotency_conflict") {
    throw Errors.business(
      409,
      "幂等键已用于其他手机号绑定请求",
      ErrorCodes.RENDERING_IDEMPOTENCY_CONFLICT,
    );
  }
  return project(result);
}

function project(snapshot: PublicSnapshot) {
  return projectRenderingQuota({
    phoneVerified: snapshot.phone_verified,
    consumed: snapshot.consumed,
    reserved: snapshot.reserved,
    activeJobId: snapshot.active_job_id,
  });
}

function commandHash(
  identity: CustomerRenderingQuotaIdentity,
  phone: { readonly keyVersion: number; readonly digest: string },
  idempotencyKey: string,
) {
  return hashParts([
    "customer-rendering-phone-bind-v1",
    identity.tenantId,
    identity.channel,
    String(identity.subjectKeyVersion),
    identity.subjectDigest,
    identity.applicationId ?? "-",
    identity.installationId ?? "-",
    String(phone.keyVersion),
    phone.digest,
    idempotencyKey,
  ]);
}

function deterministicUuid(parts: readonly string[]) {
  const hex = hashParts(parts).slice(0, 32).split("");
  hex[12] = "5";
  const variant = Number.parseInt(hex[16] ?? "0", 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function hashParts(parts: readonly string[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function createCustomerRenderingQuotaService() {
  return new CustomerRenderingQuotaService();
}
