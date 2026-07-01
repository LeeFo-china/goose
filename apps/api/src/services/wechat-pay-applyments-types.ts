import type {
  WechatPayApplymentEventInsert,
  WechatPayApplymentEventRecord,
  WechatPayApplymentInsert,
  WechatPayApplymentListResult,
  WechatPayApplymentRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type {
  WechatPayConfigRecord,
  WechatPayConfigUpsertInput,
} from "@/repositories/wechat-pay-configs";
import type { PlatformWechatPayApplymentListQuery } from "@/schema/wechat-pay-applyments";
import type { AuthContext } from "@/services/authorization";

export type WechatPayApplymentRepositoryPort = {
  findLatestByTenant: (tenantId: string) => Promise<WechatPayApplymentRecord | null>;
  findById: (input: {
    id: string;
    tenantId?: string;
  }) => Promise<WechatPayApplymentRecord | null>;
  createApplyment: (input: WechatPayApplymentInsert) => Promise<WechatPayApplymentRecord>;
  updateApplyment: (input: {
    id: string;
    tenantId?: string;
    patch: WechatPayApplymentUpdate;
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

export type WechatPayConfigRepositoryPort = {
  upsertWechatPayConfig: (
    input: WechatPayConfigUpsertInput,
  ) => Promise<WechatPayConfigRecord>;
};

export type AccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

export type WechatPayApplymentServiceDependencies = {
  repository?: WechatPayApplymentRepositoryPort;
  configRepository?: WechatPayConfigRepositoryPort;
  accessPolicyService?: AccessPolicyPort;
  applicationNoFactory?: () => string;
  nowFactory?: () => string;
};

export type ApplymentDetailResult = {
  applyment: WechatPayApplymentRecord | null;
  events: WechatPayApplymentEventRecord[];
  can_submit: boolean;
};

export const TENANT_READ_PERMISSION = "wechat_pay.applyment.read";
export const TENANT_SUBMIT_PERMISSION = "wechat_pay.applyment.submit";
