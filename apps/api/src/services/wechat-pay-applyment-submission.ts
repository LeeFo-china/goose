import { Errors } from "@/errors/error-factory";
import { ocrRecognitionRepository } from "@/repositories/ocr-recognitions";
import { platformPaymentConfigRepository } from "@/repositories/platform-payment-configs";
import {
  wechatPayApplymentRepository,
  type WechatPayApplymentEventInsert,
  type WechatPayApplymentRecord,
  type WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { sanitizeApplymentRecord } from "@/services/wechat-pay-applyment-draft";
import {
  assertApplymentSubmissionContentValid,
  loadCompleteApplymentSensitivePayload,
} from "@/services/wechat-pay-applyment-content-validation";
import {
  wechatPayApplymentGateway,
  type WechatPayApplymentGatewayPort,
  type WechatPayApplymentGatewayProfile,
  type WechatPayApplymentQueryResult,
} from "@/services/wechat-pay-applyment-gateway";
import { WechatPayApplymentMediaService } from "@/services/wechat-pay-applyment-media";
import { assertApplymentSubmitReady } from "@/services/wechat-pay-applyment-readiness";
import {
  buildWechatPayApplymentSubmitRequest,
  type WechatPayApplymentMediaIds,
} from "@/services/wechat-pay-applyment-request-builder";
import {
  applymentSubmissionEventMessage,
  canResubmitWechatApplyment,
  hasText,
  isKnownWechatApplymentSubmitRejection,
  isUncertainApplymentSubmitError,
  loadApplymentRuntimeProfile,
  optionalApplymentMedia,
  parseApplymentAttachments,
  queryWechatApplymentIfExists,
  requiredApplymentMedia,
  sanitizedApplymentErrorMetadata,
  submitWechatApplymentWithRecovery,
  toApplymentRequestSource,
  type ApplymentRuntimeProfile,
  type ApplymentSecretBundleServicePort,
} from "@/services/wechat-pay-applyment-submission-support";
import {
  buildWechatApplymentOfficialStatePatch,
  getWechatPayApplymentAvailableActions,
} from "@/services/wechat-pay-applyment-status";
import type { ApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";
import type {
  AccessPolicyPort,
  ApplymentDetailResult,
  PlatformPaymentConfigRepositoryPort,
  WechatPayApplymentOcrRecognitionRepositoryPort,
  WechatPayApplymentMediaRepositoryPort,
  WechatPayApplymentSubmissionPort,
  WechatPayApplymentSubmissionRepositoryPort,
} from "@/services/wechat-pay-applyments-types";
import { PLATFORM_SUBMIT_PERMISSION } from "@/services/wechat-pay-applyments-types";
import type {
  WechatPaySettlementRuleService,
} from "@/services/wechat-pay-settlement-rules";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";

type SubmissionGatewayPort = Pick<
  WechatPayApplymentGatewayPort,
  "submit" | "queryByBusinessCode"
>;
type MediaServicePort = Pick<WechatPayApplymentMediaService, "resolveMedia">;
type SubmissionAccessPolicyPort = Pick<AccessPolicyPort, "hasPermission">;
type SettlementRuleValidationPort = Pick<
  WechatPaySettlementRuleService,
  "assertActiveRule"
>;

type SubmissionDependencies = {
  repository?: WechatPayApplymentSubmissionRepositoryPort;
  mediaRepository?: WechatPayApplymentMediaRepositoryPort;
  platformPaymentConfigRepository?: PlatformPaymentConfigRepositoryPort;
  accessPolicyService?: SubmissionAccessPolicyPort;
  secretBundleService?: ApplymentSecretBundleServicePort;
  mediaService?: MediaServicePort;
  gateway?: SubmissionGatewayPort;
  encryptionRootSecretFactory?: () => string | null | undefined;
  businessCodeFactory?: (input: {
    merchantId: string;
    applicationNo: string;
  }) => string;
  nowFactory?: () => string;
  ocrRecognitionRepository?: WechatPayApplymentOcrRecognitionRepositoryPort;
  settlementRuleService?: SettlementRuleValidationPort;
};

export class WechatPayApplymentSubmissionService
  implements WechatPayApplymentSubmissionPort {
  private readonly repository: WechatPayApplymentSubmissionRepositoryPort;
  private readonly platformPaymentConfigRepository:
    PlatformPaymentConfigRepositoryPort;
  private readonly accessPolicyService: SubmissionAccessPolicyPort;
  private readonly secretBundleService: ApplymentSecretBundleServicePort;
  private readonly mediaService: MediaServicePort;
  private readonly gateway: SubmissionGatewayPort;
  private readonly encryptionRootSecretFactory:
    () => string | null | undefined;
  private readonly businessCodeFactory: SubmissionDependencies["businessCodeFactory"];
  private readonly nowFactory: () => string;
  private readonly ocrRecognitionRepository:
    WechatPayApplymentOcrRecognitionRepositoryPort;
  private readonly settlementRuleService:
    SettlementRuleValidationPort | undefined;

  constructor(dependencies: SubmissionDependencies = {}) {
    this.repository = dependencies.repository ?? wechatPayApplymentRepository;
    this.platformPaymentConfigRepository =
      dependencies.platformPaymentConfigRepository ??
        platformPaymentConfigRepository;
    this.accessPolicyService = dependencies.accessPolicyService ??
      accessPolicyService;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.gateway = dependencies.gateway ?? wechatPayApplymentGateway;
    this.mediaService = dependencies.mediaService ??
      new WechatPayApplymentMediaService({
        repository: dependencies.mediaRepository ??
          wechatPayApplymentRepository,
        gateway: wechatPayApplymentGateway,
      });
    this.encryptionRootSecretFactory =
      dependencies.encryptionRootSecretFactory ??
        (() => process.env.APP_CONFIG_ENCRYPTION_KEY);
    this.businessCodeFactory = dependencies.businessCodeFactory ??
      ((input) => `${input.merchantId}_${input.applicationNo}`);
    this.nowFactory = dependencies.nowFactory ?? (() => new Date().toISOString());
    this.ocrRecognitionRepository = dependencies.ocrRecognitionRepository ??
      ocrRecognitionRepository;
    this.settlementRuleService = dependencies.settlementRuleService;
  }

  async submitToWechat(
    authContext: AuthContext,
    applymentId: string,
  ): Promise<ApplymentDetailResult> {
    this.assertPermission(authContext);
    const employeeId = this.requireEmployee(authContext);
    let claimed: WechatPayApplymentRecord | null = null;
    let officialStatePersisted = false;

    try {
      claimed = await this.repository.claimSubmission({
        applymentId,
        employeeId,
      });
      const runtimeProfile = await loadApplymentRuntimeProfile({
        repository: this.platformPaymentConfigRepository,
        secretBundleService: this.secretBundleService,
      });
      assertApplymentSubmitReady(claimed);
      const sensitive = await loadCompleteApplymentSensitivePayload({
        applyment: claimed,
        repository: this.repository,
        rootSecret: this.encryptionRootSecretFactory(),
      });
      await assertApplymentSubmissionContentValid({
        applyment: claimed,
        ocrRecognitionRepository: this.ocrRecognitionRepository,
        settlementRuleService: this.settlementRuleService,
      });
      let current = claimed;
      const hadBusinessCode = hasText(current.applyment_business_code);
      const businessCode = current.applyment_business_code ??
        this.businessCodeFactory?.({
          merchantId: runtimeProfile.gatewayProfile.merchantId,
          applicationNo: current.application_no,
        });
      if (!hasText(businessCode)) {
        throw Errors.business(
          500,
          "微信支付正式进件业务编号生成失败",
          "WECHAT_PAY_APPLYMENT_BUSINESS_CODE_INVALID",
        );
      }
      if (!hadBusinessCode) {
        current = await this.repository.updateApplyment({
          id: current.id,
          patch: {
            applyment_business_code: businessCode,
            updated_by_employee_id: employeeId,
          },
        });
      }

      let officialResult: WechatPayApplymentQueryResult | null = null;
      let fallbackRequestId: string | null = null;
      let eventType = "wechat_applyment_submitted";
      if (hadBusinessCode) {
        const existing = await queryWechatApplymentIfExists({
          gateway: this.gateway,
          profile: runtimeProfile.gatewayProfile,
          businessCode,
        });
        if (existing && !canResubmitWechatApplyment(existing)) {
          officialResult = existing;
          eventType = "wechat_applyment_recovered";
        }
      }

      if (!officialResult) {
        const request = await this.buildRequest({
          applyment: current,
          businessCode,
          runtimeProfile,
          sensitive,
        });
        const submitted = await submitWechatApplymentWithRecovery({
          gateway: this.gateway,
          profile: runtimeProfile.gatewayProfile,
          businessCode,
          submit: () => this.submitAndPersistAcknowledgement({
            applyment: current,
            employeeId,
            runtimeProfile,
            request,
          }),
        });
        officialResult = submitted.result;
        fallbackRequestId = submitted.fallbackRequestId;
        eventType = submitted.recovered
          ? "wechat_applyment_recovered"
          : eventType;
      }

      const updated = await this.persistOfficialState({
        applyment: current,
        employeeId,
        result: officialResult,
        fallbackRequestId,
      });
      officialStatePersisted = true;
      await this.recordEvent({
        applyment: updated,
        eventType,
        fromStatus: claimed.status,
        toStatus: updated.status,
        operatorEmployeeId: employeeId,
        metadata: {
          business_code: officialResult.businessCode,
          applyment_id: officialResult.applymentId,
          wechat_state: officialResult.applymentState,
          request_id: officialResult.requestId ?? fallbackRequestId,
        },
      });
      return this.toDetail(authContext, updated);
    } catch (error) {
      if (claimed && !officialStatePersisted) {
        await this.persistFailure({ applyment: claimed, employeeId, error });
      }
      throw error;
    }
  }

  private async buildRequest(input: {
    applyment: WechatPayApplymentRecord;
    businessCode: string;
    runtimeProfile: ApplymentRuntimeProfile;
    sensitive: ApplymentSensitivePayload;
  }) {
    const media = await this.resolveMediaIds(
      input.applyment,
      input.runtimeProfile.gatewayProfile,
    );
    return buildWechatPayApplymentSubmitRequest({
      businessCode: input.businessCode,
      serviceProviderAppId: input.runtimeProfile.appId,
      publicKeyPem: input.runtimeProfile.gatewayProfile.wechatPayPublicKeyPem,
      source: toApplymentRequestSource(input.applyment),
      sensitive: input.sensitive,
      media,
    });
  }

  private async resolveMediaIds(
    applyment: WechatPayApplymentRecord,
    profile: WechatPayApplymentGatewayProfile,
  ): Promise<WechatPayApplymentMediaIds> {
    const resolved = new Map<string, string[]>();
    for (const attachment of parseApplymentAttachments(applyment.attachments)) {
      const { mediaId } = await this.mediaService.resolveMedia({
        tenantId: applyment.tenant_id,
        applymentId: applyment.id,
        profile,
        attachment,
      });
      resolved.set(attachment.category, [
        ...(resolved.get(attachment.category) ?? []),
        mediaId,
      ]);
    }
    return {
      license_copy: requiredApplymentMedia(resolved, "license_copy"),
      legal_representative_id_card_front: requiredApplymentMedia(
        resolved,
        "legal_representative_id_card_front",
      ),
      legal_representative_id_card_back: requiredApplymentMedia(
        resolved,
        "legal_representative_id_card_back",
      ),
      contact_id_card_front: optionalApplymentMedia(
        resolved,
        "contact_id_card_front",
      ),
      contact_id_card_back: optionalApplymentMedia(
        resolved,
        "contact_id_card_back",
      ),
      business_scene_material: resolved.get("business_scene_material") ?? [],
    };
  }

  private async submitAndPersistAcknowledgement(input: {
    applyment: WechatPayApplymentRecord;
    employeeId: string;
    runtimeProfile: ApplymentRuntimeProfile;
    request: ReturnType<typeof buildWechatPayApplymentSubmitRequest>;
  }) {
    const acknowledgement = await this.gateway.submit({
      profile: input.runtimeProfile.gatewayProfile,
      request: input.request,
    });
    await this.repository.updateApplyment({
      id: input.applyment.id,
      patch: {
        applyment_id: acknowledgement.applymentId,
        last_wechat_request_id: acknowledgement.requestId,
        updated_by_employee_id: input.employeeId,
      },
    });
    return acknowledgement.requestId;
  }

  private async persistOfficialState(input: {
    applyment: WechatPayApplymentRecord;
    employeeId: string;
    result: WechatPayApplymentQueryResult;
    fallbackRequestId: string | null;
  }) {
    const now = this.nowFactory();
    return this.repository.updateApplyment({
      id: input.applyment.id,
      patch: buildWechatApplymentOfficialStatePatch({
        current: input.applyment,
        result: input.result,
        employeeId: input.employeeId,
        now,
        fallbackRequestId: input.fallbackRequestId,
      }),
    });
  }

  private async persistFailure(input: {
    applyment: WechatPayApplymentRecord;
    employeeId: string;
    error: unknown;
  }) {
    const status = isKnownWechatApplymentSubmitRejection(input.error)
      ? "wechat_editing"
      : input.applyment.applyment_business_code
      ? "applying"
      : "approved";
    const updated = await this.repository.updateApplyment({
      id: input.applyment.id,
      patch: {
        status,
        submission_claimed_at: null,
        updated_by_employee_id: input.employeeId,
      },
    });
    await this.recordEvent({
      applyment: updated,
      eventType: "wechat_applyment_submission_failed",
      fromStatus: "applying",
      toStatus: status,
      operatorEmployeeId: input.employeeId,
      metadata: sanitizedApplymentErrorMetadata(input.error),
    });
  }

  private async toDetail(
    authContext: AuthContext,
    applyment: WechatPayApplymentRecord,
  ): Promise<ApplymentDetailResult> {
    return {
      applyment: sanitizeApplymentRecord(applyment),
      events: await this.repository.findEvents({
        tenantId: applyment.tenant_id,
        applymentId: applyment.id,
      }),
      can_edit: false,
      can_submit: false,
      available_actions: getWechatPayApplymentAvailableActions({
        authContext,
        applyment,
        accessPolicyService: this.accessPolicyService,
      }),
    };
  }

  private async recordEvent(input: {
    applyment: WechatPayApplymentRecord;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    operatorEmployeeId: string;
    metadata: Record<string, unknown>;
  }) {
    await this.repository.insertEvent({
      tenant_id: input.applyment.tenant_id,
      applyment_id: input.applyment.id,
      event_type: input.eventType,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      message: applymentSubmissionEventMessage(input.eventType),
      operator_employee_id: input.operatorEmployeeId,
      metadata: input.metadata as WechatPayApplymentEventInsert["metadata"],
    });
  }

  private assertPermission(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin ||
      !this.accessPolicyService.hasPermission(
        authContext,
        PLATFORM_SUBMIT_PERMISSION,
      )
    ) {
      throw Errors.forbidden();
    }
  }

  private requireEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) throw Errors.forbidden();
    return authContext.employeeId;
  }
}

export const wechatPayApplymentSubmissionService =
  new WechatPayApplymentSubmissionService();
