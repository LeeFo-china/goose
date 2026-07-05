"use client";

import { ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type FieldConfig,
  MutationDialogButton,
  stringField,
} from "@/components/platform-partners/platform-partner-actions";
import type {
  PlatformPartnerMemberRecord,
  PlatformPartnerRecord,
} from "@/components/platform-partners/platform-partner-types";
import {
  optionLabel,
  partnerMemberRoleOptions,
  partnerMemberStatusOptions,
} from "@/components/platform-partners/platform-partner-types";

export function CreatePartnerMemberButton({
  partner,
}: {
  partner: PlatformPartnerRecord;
}) {
  const fields: FieldConfig[] = [
    { name: "name", label: "姓名", required: true },
    { name: "phone", label: "手机号", required: true },
    {
      name: "role",
      label: "角色",
      type: "select",
      required: true,
      options: [...partnerMemberRoleOptions],
    },
  ];

  return (
    <MutationDialogButton
      title="新增登录成员"
      description={`为「${partner.name}」添加小程序登录成员，成员首次绑定微信后可进入合伙人门户。`}
      trigger={<Button><UserPlus data-icon="inline-start" />新增成员</Button>}
      submitLabel="创建"
      fallbackMessage="创建合伙人成员失败"
      endpoint={`/platform/partners/${partner.id}/members`}
      fields={fields}
      buildPayload={(formData) => ({
        name: stringField(formData, "name"),
        phone: stringField(formData, "phone"),
        role: stringField(formData, "role"),
      })}
    />
  );
}

export function UpdatePartnerMemberStatusButton({
  member,
}: {
  member: PlatformPartnerMemberRecord;
}) {
  const fields: FieldConfig[] = [
    {
      name: "status",
      label: "绑定状态",
      type: "select",
      required: true,
      defaultValue: member.status,
      options: [...partnerMemberStatusOptions],
    },
    { name: "reason", label: "变更原因", type: "textarea", required: true },
  ];

  return (
    <MutationDialogButton
      title="调整成员状态"
      description={`当前成员「${member.name}」状态为 ${optionLabel(partnerMemberStatusOptions, member.status)}。`}
      trigger={<Button type="button" size="sm" variant="outline"><ShieldCheck data-icon="inline-start" />状态</Button>}
      submitLabel="保存"
      fallbackMessage="更新合伙人成员状态失败"
      endpoint={`/platform/partner-members/${member.id}/status`}
      method="PATCH"
      fields={fields}
      buildPayload={(formData) => ({
        status: stringField(formData, "status"),
        reason: stringField(formData, "reason"),
      })}
    />
  );
}
