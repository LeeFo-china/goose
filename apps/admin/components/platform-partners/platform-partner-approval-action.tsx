"use client";

import { CheckCircle2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  MutationDialogButton,
  stringField,
} from "@/components/platform-partners/platform-partner-actions";
import type { PlatformPartnerRecord } from "@/components/platform-partners/platform-partner-types";
import { Button } from "@/components/ui/button";

export function ApprovePartnerButton({
  partner,
  canManagePartners,
}: {
  partner: PlatformPartnerRecord;
  canManagePartners: boolean;
}) {
  if (!canManagePartners || partner.status !== "pending") return null;

  const areaByCode = new Map(
    (partner.region_areas ?? []).map((area) => [area.adcode, area]),
  );

  return (
    <MutationDialogButton
      title="审核通过并启用"
      description="请核对合伙人资料和全部运营区县，通过后将启用该合伙人。"
      trigger={
        <Button type="button" size="sm" variant="outline">
          <CheckCircle2 data-icon="inline-start" />审核通过
        </Button>
      }
      submitLabel="审核通过并启用"
      fallbackMessage="审核城市合伙人失败"
      endpoint={`/platform/partners/${partner.id}/status`}
      method="PATCH"
      fields={[{
        name: "reason",
        label: "审核说明",
        type: "textarea",
        required: true,
        maxLength: 300,
        description: "请填写 1–300 字审核说明，审核说明将更新合伙人备注。",
      }]}
      extraFields={
        <div className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto md:col-span-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">合伙人</dt><dd className="break-words">{partner.name}</dd>
            <dt className="text-muted-foreground">联系人</dt><dd>{partner.contact_name}</dd>
            <dt className="text-muted-foreground">联系电话</dt><dd>{partner.phone}</dd>
            <dt className="text-muted-foreground">当前备注</dt><dd className="whitespace-pre-wrap break-words">{partner.remark || "无"}</dd>
            <dt className="text-muted-foreground">运营区县</dt>
            <dd>
              {partner.region_codes.length === 0 ? (
                <StatusAlert tone="warning">未配置运营区县，请先编辑运营区县再审核。</StatusAlert>
              ) : (
                <ul className="flex flex-col gap-2">
                  {partner.region_codes.map((code) => (
                    <li key={code}>
                      <div>{areaByCode.get(code)?.full_name ?? "区域名称暂不可用"}</div>
                      <div className="text-muted-foreground">{code}</div>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        </div>
      }
      submitDisabled={partner.region_codes.length === 0}
      buildPayload={(formData) => ({
        status: "active",
        reason: stringField(formData, "reason"),
      })}
    />
  );
}
