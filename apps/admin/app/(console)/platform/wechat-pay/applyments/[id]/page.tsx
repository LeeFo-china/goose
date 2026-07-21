import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, FileCheck2, Paperclip } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  buildWechatPayApplymentAttachmentPreviewUrl,
  formatWechatPayApplymentAttachmentSize,
  formatWechatPayApplymentTime,
  getWechatPayApplymentAttachmentCategoryLabel,
  getWechatPayApplymentStatusMeta,
  type WechatPayApplymentAttachment,
} from "@/components/finance/finance-wechat-pay-applyment-shared";
import { PlatformWechatPayApplymentActions } from "@/components/platform-wechat-pay/platform-wechat-pay-applyment-actions";
import { PlatformWechatPayApplymentProgress } from "@/components/platform-wechat-pay/platform-wechat-pay-applyment-progress";
import { PlatformWechatPayApplymentReadiness } from "@/components/platform-wechat-pay/platform-wechat-pay-applyment-readiness";
import { fetchPlatformWechatPayApplymentDetail } from "@/components/platform-wechat-pay/platform-wechat-pay-applyment-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";

type RouteParams = {
  id: string;
};

export default async function PlatformWechatPayApplymentDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const hasPlatformAccess = session.roles.includes("platform_admin");
  const { id } = await params;
  const data = hasPlatformAccess
    ? await fetchPlatformWechatPayApplymentDetail(id)
    : {
      applyment: null,
      events: [],
      can_submit: false,
      available_actions: [],
      submission_readiness: null,
      error: "当前账号不是平台超管，无法访问支付进件申请",
    };
  const applyment = data.applyment;
  const statusMeta = getWechatPayApplymentStatusMeta(applyment?.status);

  return (
    <div className="flex min-h-0 flex-col gap-5 overflow-visible lg:h-[calc(100vh-6.5625rem)] lg:overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <FileCheck2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">支付进件详情</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              审核租户资料、提交微信正式进件、同步官方状态并激活收款。
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/platform/wechat-pay/applyments">
            <ArrowLeft data-icon="inline-start" />
            返回列表
          </Link>
        </Button>
      </div>

      {data.error ? <StatusAlert>{data.error}</StatusAlert> : null}
      {!applyment ? null : (
        <div
          data-testid="platform-applyment-workspace"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto"
        >
          <PlatformWechatPayApplymentProgress applyment={applyment} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <Card className="shadow-none">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{applyment.merchant_short_name}</CardTitle>
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    <Badge variant="outline">{applyment.application_no}</Badge>
                  </div>
                  <CardDescription>
                    {applyment.tenant?.name || applyment.tenant_id}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <InfoSection title="主体与证照">
                    <InfoItem
                      label="主体类型"
                      value={formatSubjectType(applyment.subject_type)}
                    />
                    <InfoItem label="主体名称" value={applyment.license_name} />
                    <InfoItem
                      label="统一社会信用代码"
                      value={applyment.license_code}
                    />
                    <InfoItem
                      label="营业执照注册地址"
                      value={applyment.license_address}
                    />
                    <InfoItem
                      label="营业执照有效期"
                      value={formatPeriod(
                        applyment.license_period_begin,
                        applyment.license_period_end,
                      )}
                    />
                  </InfoSection>

                  <InfoSection title="法人和超级管理员">
                    <InfoItem
                      label="法人"
                      value={applyment.legal_representative_name}
                    />
                    <InfoItem
                      label="法人证件类型"
                      value={formatIdentityType(applyment.identity_doc_type)}
                    />
                    <InfoItem
                      label="法人证件地址摘要"
                      value={applyment.identity_address_masked}
                    />
                    <InfoItem
                      label="法人证件有效期"
                      value={formatPeriod(
                        applyment.identity_period_begin,
                        applyment.identity_period_end,
                      )}
                    />
                    <InfoItem
                      label="超级管理员类型"
                      value={formatContactType(applyment.contact_type)}
                    />
                    <InfoItem
                      label="超级管理员"
                      value={`${applyment.super_admin_name || "-"} / ${applyment.super_admin_phone_masked || "-"}`}
                    />
                    <InfoItem
                      label="超级管理员邮箱"
                      value={applyment.super_admin_email}
                    />
                    {applyment.contact_type === "SUPER" ? (
                      <>
                        <InfoItem
                          label="经办人证件类型"
                          value={formatIdentityType(
                            applyment.contact_identity_doc_type,
                          )}
                        />
                        <InfoItem
                          label="经办人证件有效期"
                          value={formatPeriod(
                            applyment.contact_identity_period_begin,
                            applyment.contact_identity_period_end,
                          )}
                        />
                      </>
                    ) : null}
                  </InfoSection>

                  <InfoSection title="经营与结算">
                    <InfoItem label="客服电话" value={applyment.service_phone} />
                    <InfoItem label="联系地址" value={applyment.contact_address} />
                    <InfoItem
                      label="经营场景"
                      value={applyment.business_scene_description}
                    />
                    <InfoItem
                      label="账户类型"
                      value={formatSettlementAccountType(
                        applyment.settlement_account_type,
                      )}
                    />
                    <InfoItem
                      label="结算账户开户名"
                      value={applyment.settlement_account_name}
                    />
                    <InfoItem
                      label="银行账号"
                      value={applyment.settlement_account_number_masked}
                    />
                    <InfoItem label="开户银行" value={applyment.settlement_bank_name} />
                    <InfoItem
                      label="开户银行全称"
                      value={applyment.settlement_bank_full_name}
                    />
                    <InfoItem
                      label="联行号"
                      value={applyment.settlement_bank_branch_id}
                    />
                    <InfoItem
                      label="结算账户摘要"
                      value={applyment.settlement_account_summary}
                    />
                    <InfoItem label="结算规则" value={applyment.settlement_id} />
                    <InfoItem
                      label="所属行业"
                      value={applyment.qualification_type}
                    />
                  </InfoSection>

                  <InfoSection title="平台关联">
                    <InfoItem
                      label="小程序接入"
                      value={
                        applyment.appid_binding_message ||
                        "平台统一小程序 AppID"
                      }
                    />
                    <InfoItem
                      label="提交时间"
                      value={formatWechatPayApplymentTime(applyment.submitted_at)}
                    />
                    <InfoItem
                      label="激活时间"
                      value={formatWechatPayApplymentTime(applyment.activated_at)}
                    />
                    <InfoItem label="申请备注" value={applyment.remark} />
                  </InfoSection>
                </CardContent>
              </Card>

              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>申请附件</CardTitle>
                  <CardDescription>
                    租户提交的营业执照、法人证件和经营资料。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WechatPayApplymentAttachmentList
                    attachments={applyment.attachments || []}
                  />
                </CardContent>
              </Card>

              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>处理记录</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {data.events.length > 0 ? data.events.map((event) => (
                    <div key={event.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{event.event_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatWechatPayApplymentTime(event.created_at)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">{event.message || "-"}</p>
                    </div>
                  )) : (
                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      暂无处理记录
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card
              data-testid="platform-applyment-action-rail"
              className="order-first h-fit shadow-none xl:sticky xl:top-0 xl:order-none"
            >
              <CardHeader>
                <CardTitle>平台操作</CardTitle>
                <CardDescription>
                  仅显示当前账号与申请状态允许执行的后端动作。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <PlatformWechatPayApplymentReadiness
                  status={applyment.status}
                  readiness={data.submission_readiness}
                />
                <PlatformWechatPayApplymentActions
                  applyment={applyment}
                  availableActions={data.available_actions}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function WechatPayApplymentAttachmentList({
  attachments,
}: {
  attachments: WechatPayApplymentAttachment[];
}) {
  if (attachments.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        暂无申请附件
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {attachments.map((attachment) => {
        const previewUrl = buildWechatPayApplymentAttachmentPreviewUrl(attachment.object_key);
        return (
          <div key={`${attachment.category || "attachment"}:${attachment.object_key}`} className="rounded-md border p-3">
            <div className="flex min-w-0 gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                <Paperclip aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {getWechatPayApplymentAttachmentCategoryLabel(attachment.category)}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {attachment.file_name || attachment.object_key}
                </div>
                {attachment.size ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatWechatPayApplymentAttachmentSize(attachment.size)}
                  </div>
                ) : null}
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <a href={previewUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                查看附件
              </a>
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function InfoItem({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm">{value || "-"}</div>
    </div>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function formatSubjectType(value?: string | null) {
  if (value === "SUBJECT_TYPE_ENTERPRISE") return "企业";
  if (value === "SUBJECT_TYPE_INDIVIDUAL") return "个体工商户";
  return value || "-";
}

function formatIdentityType(value?: string | null) {
  if (value === "IDENTIFICATION_TYPE_IDCARD") return "中国大陆居民身份证";
  return value || "-";
}

function formatContactType(value?: string | null) {
  if (value === "LEGAL") return "法人或经营者本人";
  if (value === "SUPER") return "经办人";
  return value || "-";
}

function formatPeriod(begin?: string | null, end?: string | null) {
  if (!begin && !end) return "-";
  return `${begin || "-"} 至 ${end || "-"}`;
}

function formatSettlementAccountType(value?: string | null) {
  if (value === "BANK_ACCOUNT_TYPE_CORPORATE") return "对公银行账户";
  if (value === "BANK_ACCOUNT_TYPE_PERSONAL") return "经营者个人银行卡";
  return value || "-";
}
