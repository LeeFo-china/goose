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
              审核租户资料、回填微信进件状态，并在满足条件后激活支付配置。
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
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto xl:grid-cols-[minmax(0,1fr)_28rem]">
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
              <CardContent className="grid gap-4 md:grid-cols-2">
                <InfoItem label="主体名称" value={applyment.license_name} />
                <InfoItem label="统一社会信用代码" value={applyment.license_code} />
                <InfoItem label="法人" value={applyment.legal_representative_name} />
                <InfoItem label="超级管理员" value={`${applyment.super_admin_name || "-"} / ${applyment.super_admin_phone_masked || "-"}`} />
                <InfoItem label="结算账户" value={applyment.settlement_account_summary} />
                <InfoItem label="开户银行" value={applyment.settlement_bank_name} />
                <InfoItem label="进件业务编号" value={applyment.applyment_business_code} />
                <InfoItem label="微信申请单号" value={applyment.applyment_id} />
                <InfoItem label="子商户号" value={applyment.sub_mchid} />
                <InfoItem label="子商户 AppID" value={applyment.sub_appid} />
                <InfoItem label="提交时间" value={formatWechatPayApplymentTime(applyment.submitted_at)} />
                <InfoItem label="激活时间" value={formatWechatPayApplymentTime(applyment.activated_at)} />
                <InfoItem label="经营场景" value={applyment.business_scene_description} className="md:col-span-2" />
                <InfoItem label="联系地址" value={applyment.contact_address} className="md:col-span-2" />
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
                <WechatPayApplymentAttachmentList attachments={applyment.attachments || []} />
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

          <Card className="h-fit shadow-none">
            <CardHeader>
              <CardTitle>平台操作</CardTitle>
              <CardDescription>
                进件 API 未接入前，由平台运营按线下结果回填状态。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlatformWechatPayApplymentActions applyment={applyment} />
            </CardContent>
          </Card>
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
