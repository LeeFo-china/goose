import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentProfileCode,
} from "@/repositories/platform-payment-configs";
import type {
  WechatPayApplymentEventInsert,
  WechatPayApplymentEventRecord,
  WechatPayApplymentInsert,
  WechatPayApplymentListResult,
  WechatPayApplymentMediaInsert,
  WechatPayApplymentMediaRecord,
  WechatPayApplymentRecord,
  WechatPayApplymentSensitiveRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type {
  WechatPayConfigRecord,
  WechatPayConfigUpsertInput,
  WechatPayConfigUpdate,
} from "@/repositories/wechat-pay-configs";
import type { PlatformWechatPayApplymentListQuery } from "@/schema/wechat-pay-applyments";
import type { AuthContext } from "@/services/authorization";

export type WechatPayApplymentRepositoryPort = {
  findLatestByTenant: (tenantId: string) => Promise<WechatPayApplymentRecord | null>;
  findById: (input: {
    id: string;
    tenantId?: string;
  }) => Promise<WechatPayApplymentRecord | null>;
  findSensitivePayloadById: (input: {
    id: string;
    tenantId?: string;
  }) => Promise<WechatPayApplymentSensitiveRecord | null>;
  createApplyment: (input: WechatPayApplymentInsert) => Promise<WechatPayApplymentRecord>;
  updateApplyment: (input: {
    id: string;
    tenantId?: string;
    expectedStatus?: string;
    expectedUpdatedAt?: string;
    patch: WechatPayApplymentUpdate;
  }) => Promise<WechatPayApplymentRecord>;
  activateConfigAtomically: (input: {
    applymentId: string;
    expectedUpdatedAt: string;
    employeeId: string;
    platformPaymentConfigId: string;
  }) => Promise<WechatPayApplymentRecord>;
  insertEvent: (input: WechatPayApplymentEventInsert) => Promise<WechatPayApplymentEventRecord>;
  findEvents: (input: {
    tenantId: string;
    applymentId: string;
  }) => Promise<WechatPayApplymentEventRecord[]>;
  listApplyments: (input: {
    query: PlatformWechatPayApplymentListQuery;
  }) => Promise<WechatPayApplymentListResult>;
};

export type WechatPayApplymentSubmissionRepositoryPort = Pick<
  WechatPayApplymentRepositoryPort,
  | "findSensitivePayloadById"
  | "updateApplyment"
  | "insertEvent"
  | "findEvents"
> & {
  claimSubmission: (input: {
    applymentId: string;
    employeeId: string;
  }) => Promise<WechatPayApplymentRecord>;
};

export type WechatPayApplymentStatusRepositoryPort = Pick<
  WechatPayApplymentRepositoryPort,
  "findById" | "updateApplyment" | "insertEvent" | "findEvents"
>;

export type WechatPayApplymentMediaRepositoryPort = {
  findMediaByDigest: (input: {
    tenantId: string;
    applymentId: string;
    objectKey: string;
    sha256: string;
  }) => Promise<WechatPayApplymentMediaRecord | null>;
  upsertMedia: (
    input: WechatPayApplymentMediaInsert,
  ) => Promise<WechatPayApplymentMediaRecord>;
};

export type WechatPayConfigRepositoryPort = {
  upsertWechatPayConfig: (
    input: WechatPayConfigUpsertInput,
  ) => Promise<WechatPayConfigRecord>;
  updateWechatPayConfig: (input: {
    id: string;
    patch: WechatPayConfigUpdate;
  }) => Promise<WechatPayConfigRecord>;
};

export type PlatformPaymentConfigRepositoryPort = {
  findWechatPayConfigByProfile: (
    profileCode: PlatformPaymentProfileCode,
  ) => Promise<PlatformPaymentConfigRecord | null>;
};

export type AccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

export type WechatPayApplymentServiceDependencies = {
  repository?: WechatPayApplymentRepositoryPort;
  configRepository?: WechatPayConfigRepositoryPort;
  platformPaymentConfigRepository?: PlatformPaymentConfigRepositoryPort;
  accessPolicyService?: AccessPolicyPort;
  applicationNoFactory?: () => string;
  applymentIdFactory?: () => string;
  encryptionRootSecretFactory?: () => string | null | undefined;
  nowFactory?: () => string;
  submissionService?: WechatPayApplymentSubmissionPort;
  statusService?: WechatPayApplymentStatusPort;
  preflightService?: WechatPayApplymentPreflightPort;
};

export type WechatPayApplymentPreflightBlocker = {
  code: string;
  field?: string;
  category?: string;
};

export type WechatPayApplymentPreflightReport = {
  ready: boolean;
  blockers: WechatPayApplymentPreflightBlocker[];
};

export type WechatPayApplymentSubmissionReadiness =
  WechatPayApplymentPreflightReport & {
    review_ready: boolean;
  };

export type WechatPayApplymentPreflightPort = {
  run: (applymentId: string) => Promise<WechatPayApplymentPreflightReport>;
};

export type WechatPayApplymentAvailableAction = {
  key: string;
  label: string;
  url?: string;
};

export type ApplymentDetailResult = {
  applyment: WechatPayApplymentRecord | null;
  events: WechatPayApplymentEventRecord[];
  can_submit: boolean;
  available_actions: WechatPayApplymentAvailableAction[];
  submission_readiness?: WechatPayApplymentSubmissionReadiness;
};

export type WechatPayApplymentSubmissionPort = {
  submitToWechat: (
    authContext: AuthContext,
    applymentId: string,
  ) => Promise<ApplymentDetailResult>;
};

export type WechatPayApplymentStatusPort = {
  syncWechatStatus: (
    authContext: AuthContext,
    applymentId: string,
  ) => Promise<ApplymentDetailResult>;
};

export const TENANT_READ_PERMISSION = "wechat_pay.applyment.read";
export const TENANT_SUBMIT_PERMISSION = "wechat_pay.applyment.submit";
export const PLATFORM_SUBMIT_PERMISSION =
  "platform.wechat_pay.applyment.submit";
export const PLATFORM_SYNC_PERMISSION = "platform.wechat_pay.applyment.sync";
export const PLATFORM_REPAIR_PERMISSION =
  "platform.wechat_pay.applyment.repair";
