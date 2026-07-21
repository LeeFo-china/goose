import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  Settings2,
} from "lucide-react";
import {
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentPreflightBlocker,
  type WechatPayApplymentSubmissionReadiness,
} from "@/components/finance/finance-wechat-pay-applyment-shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PREFLIGHT_VISIBLE_STATUSES = new Set([
  "submitted",
  "approved",
  "wechat_editing",
]);

const HIDDEN_STATUS_BLOCKERS = new Set([
  "APPLYMENT_STATUS_NOT_SUBMITTABLE",
]);

const FIELD_LABELS: Record<string, string> = {
  subject_type: "主体类型",
  merchant_short_name: "商户简称",
  license_name: "主体名称",
  license_code: "统一社会信用代码",
  legal_representative_name: "法人姓名",
  identity_doc_type: "法人证件类型",
  identity_period_begin: "法人证件生效日期",
  identity_period_end: "法人证件失效日期",
  identity_address: "法人证件地址",
  contact_type: "超级管理员类型",
  super_admin_name: "超级管理员姓名",
  super_admin_phone_masked: "超级管理员手机号",
  super_admin_email: "超级管理员邮箱",
  contact_identity_doc_type: "经办人证件类型",
  contact_identity_period_begin: "经办人证件生效日期",
  contact_identity_period_end: "经办人证件失效日期",
  service_phone: "客服电话",
  settlement_account_type: "结算账户类型",
  settlement_account_name: "结算账户开户名",
  settlement_bank_name: "开户银行",
  settlement_account_number_masked: "结算银行账号",
  settlement_account_summary: "结算账户摘要",
  settlement_id: "结算规则",
  qualification_type: "所属行业",
  business_scene_description: "经营场景说明",
  contact_address: "联系地址",
};

const BLOCKER_MESSAGES: Record<string, string> = {
  APPLYMENT_SENSITIVE_PAYLOAD_MISSING: "敏感申请资料缺失，请退回租户重新填写",
  APPLYMENT_SENSITIVE_PAYLOAD_VERSION_MISMATCH: "敏感申请资料版本不一致，请退回租户重新保存",
  APPLYMENT_SENSITIVE_PAYLOAD_UNREADABLE: "敏感申请资料无法解密，请联系平台技术人员处理",
  APPLYMENT_MEDIA_METADATA_INVALID: "附件元数据异常，请退回租户重新上传",
  APPLYMENT_MEDIA_CATEGORY_INVALID: "附件分类异常，请退回租户重新上传",
  APPLYMENT_MEDIA_CATEGORY_DUPLICATE: "同类附件重复，请退回租户整理后重提",
  APPLYMENT_OBJECT_KEY_INVALID: "附件归属校验失败，请退回租户重新上传",
  APPLYMENT_MEDIA_TYPE_UNSUPPORTED: "附件格式不受支持，请退回租户重新上传",
  APPLYMENT_MEDIA_SIZE_INVALID: "附件大小异常，请退回租户重新上传",
  APPLYMENT_MEDIA_TOO_LARGE: "附件超过 2MB，请退回租户压缩后上传",
  APPLYMENT_SUBMISSION_LEASE_INVALID: "正式进件任务状态异常，请联系平台技术人员处理",
  APPLYMENT_SUBMISSION_IN_PROGRESS: "已有正式进件请求正在处理中",
  APPLYMENT_NOT_FOUND: "申请记录已不存在，请返回列表刷新",
  PREFLIGHT_DATA_ACCESS_FAILED: "读取进件资料失败，请稍后重试",
  PREFLIGHT_INTERNAL_ERROR: "进件前置检查暂不可用，请稍后重试",
  PLATFORM_PAYMENT_CONFIG_MISSING: "平台服务商支付配置尚未保存",
  PLATFORM_PAYMENT_CONFIG_INACTIVE: "平台服务商支付配置尚未启用",
  PLATFORM_PAYMENT_CONFIG_NOT_VALIDATED: "平台服务商支付配置尚未验证通过",
  PLATFORM_PAYMENT_MERCHANT_MODE_MISMATCH: "平台支付配置不是服务商模式",
  PLATFORM_PAYMENT_MERCHANT_ID_MISSING: "平台服务商商户号未配置",
  PLATFORM_PAYMENT_APP_ID_MISSING: "平台小程序 AppID 未配置",
  PLATFORM_PAYMENT_SECRET_REF_MISSING: "平台支付密钥引用未配置",
  PLATFORM_PAYMENT_SECRET_BUNDLE_REVISION_MISSING: "平台支付密钥包尚未生效",
  PLATFORM_PAYMENT_SERIAL_NO_MISSING: "平台商户 API 证书序列号未配置",
  PLATFORM_PAYMENT_CALLBACK_URL_MISSING: "平台支付回调地址未配置",
  PLATFORM_PAYMENT_CALLBACK_URL_INVALID: "平台支付回调地址格式无效",
  PLATFORM_PAYMENT_REQUIRED_CHANNELS_MISSING: "平台支付配置未启用正式进件渠道",
};

export function PlatformWechatPayApplymentReadiness({
  status,
  readiness,
}: {
  status: string;
  readiness?: WechatPayApplymentSubmissionReadiness | null;
}) {
  if (!readiness || !PREFLIGHT_VISIBLE_STATUSES.has(status)) return null;

  const blockers = readiness.blockers.filter(
    (blocker) => !HIDDEN_STATUS_BLOCKERS.has(blocker.code),
  );
  const hasPlatformBlocker = blockers.some((blocker) =>
    blocker.code.startsWith("PLATFORM_PAYMENT_"),
  );
  const presentation = getReadinessPresentation(status, readiness);
  const Icon = presentation.icon;

  return (
    <section data-testid="platform-applyment-readiness" className="flex flex-col gap-3">
      <Alert variant={presentation.variant}>
        <Icon aria-hidden="true" className="size-4" />
        <AlertTitle>{presentation.title}</AlertTitle>
        <AlertDescription>{presentation.description}</AlertDescription>
      </Alert>

      {blockers.length > 0 ? (
        <div className="overflow-hidden rounded-md border">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium">待处理项</span>
            <Badge variant="outline">{blockers.length} 项</Badge>
          </div>
          <ul className="divide-y">
            {blockers.map((blocker, index) => (
              <li
                key={`${blocker.code}:${blocker.field || blocker.category || index}`}
                className="flex gap-2 px-3 py-2.5 text-xs text-muted-foreground"
              >
                <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>{getPreflightBlockerMessage(blocker)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasPlatformBlocker ? (
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/settings?group=payment">
            <Settings2 data-icon="inline-start" />
            前往支付配置
          </Link>
        </Button>
      ) : null}
    </section>
  );
}

export function getPreflightBlockerMessage(
  blocker: WechatPayApplymentPreflightBlocker,
): string {
  if (blocker.code === "APPLYMENT_REQUIRED_FIELD_MISSING") {
    return `缺少${FIELD_LABELS[blocker.field || ""] || "必填申请资料"}`;
  }
  if (blocker.code === "APPLYMENT_REQUIRED_ATTACHMENT_MISSING") {
    return `缺少${getWechatPayApplymentAttachmentCategoryLabel(blocker.category)}`;
  }
  const category = blocker.category
    ? `（${getWechatPayApplymentAttachmentCategoryLabel(blocker.category)}）`
    : "";
  return `${BLOCKER_MESSAGES[blocker.code] || "进件前置条件未满足"}${category}`;
}

function getReadinessPresentation(
  status: string,
  readiness: WechatPayApplymentSubmissionReadiness,
) {
  if (readiness.ready) {
    return {
      title: "可以提交微信审核",
      description: "申请资料和平台服务商配置均已通过前置检查。",
      variant: "default" as const,
      icon: CheckCircle2,
    };
  }
  if (!readiness.review_ready) {
    return {
      title: "资料未满足审核条件",
      description: "请核对待处理项并驳回租户修改，不能直接审核通过。",
      variant: "destructive" as const,
      icon: AlertCircle,
    };
  }
  if (status === "submitted") {
    return {
      title: "租户资料可以审核",
      description: "平台配置问题不影响资料审核，但必须处理后才能提交微信。",
      variant: "default" as const,
      icon: CheckCircle2,
    };
  }
  return {
    title: "尚不能提交微信审核",
    description: "租户资料已通过审核，请先处理剩余前置条件。",
    variant: "default" as const,
    icon: CircleAlert,
  };
}
