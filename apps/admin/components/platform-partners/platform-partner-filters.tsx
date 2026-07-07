import Link from "next/link";
import { RotateCcw, Search } from "lucide-react";
import { FilterSelect } from "@/components/admin/filter-select";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
  PlatformPartnerApplicationStatus,
  PlatformPartnerRecord,
  PlatformPartnerMemberRebindStatus,
  PlatformPartnerStatus,
} from "@/components/platform-partners/platform-partner-types";
import {
  applicationStatusOptions,
  commissionStatusOptions,
  partnerMemberRebindStatusOptions,
  partnerStatusOptions,
  revenueStatusOptions,
  revenueTypeOptions,
  settlementStatusOptions,
} from "@/components/platform-partners/platform-partner-types";

export type PartnerPageTab =
  | "applications"
  | "partners"
  | "members"
  | "bindings"
  | "revenue"
  | "commissions"
  | "settlements"
  | "rebindRequests";

export const PARTNER_TABS: ReadonlyArray<{ value: PartnerPageTab; label: string }> = [
  { value: "applications", label: "申请线索" },
  { value: "partners", label: "合伙人" },
  { value: "members", label: "登录成员" },
  { value: "bindings", label: "装企绑定" },
  { value: "revenue", label: "平台收入" },
  { value: "commissions", label: "分佣台账" },
  { value: "settlements", label: "月结批次" },
  { value: "rebindRequests", label: "换绑审核" },
];

export function normalizePartnerTab(value: string | undefined): PartnerPageTab {
  return PARTNER_TABS.some((tab) => tab.value === value)
    ? value as PartnerPageTab
    : "applications";
}

export function normalizeApplicationStatus(
  value: string | undefined,
): PlatformPartnerApplicationStatus | "" {
  return applicationStatusOptions.some((option) => option.value === value)
    ? value as PlatformPartnerApplicationStatus
    : "";
}

export function normalizePartnerStatus(
  value: string | undefined,
): PlatformPartnerStatus | "" {
  return partnerStatusOptions.some((option) => option.value === value)
    ? value as PlatformPartnerStatus
    : "";
}

export function normalizePartnerMemberRebindStatus(
  value: string | undefined,
): PlatformPartnerMemberRebindStatus | "" {
  return partnerMemberRebindStatusOptions.some((option) => option.value === value)
    ? value as PlatformPartnerMemberRebindStatus
    : "";
}

export function buildPartnerHref(input: {
  tab?: PartnerPageTab;
  pageSize?: number;
  partnerPageSize?: number;
  memberPageSize?: number;
  bindingPageSize?: number;
  revenuePageSize?: number;
  commissionPageSize?: number;
  settlementPageSize?: number;
  rebindPageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input.tab && input.tab !== "applications") params.set("tab", input.tab);
  if (input.partnerPageSize) params.set("partnerPageSize", String(input.partnerPageSize));
  if (input.memberPageSize) params.set("memberPageSize", String(input.memberPageSize));
  if (input.bindingPageSize) params.set("bindingPageSize", String(input.bindingPageSize));
  if (input.revenuePageSize) params.set("revenuePageSize", String(input.revenuePageSize));
  if (input.commissionPageSize) params.set("commissionPageSize", String(input.commissionPageSize));
  if (input.settlementPageSize) params.set("settlementPageSize", String(input.settlementPageSize));
  if (input.rebindPageSize) params.set("rebindPageSize", String(input.rebindPageSize));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return query ? `/platform/partners?${query}` : "/platform/partners";
}

export function PlatformPartnerFilters({
  tab,
  applicationStatus,
  partnerStatus,
  keyword,
  regionCode,
  partnerId,
  tenantId,
  revenueType,
  revenueStatus,
  commissionStatus,
  settlementStatus,
  rebindStatus,
  partners,
}: {
  tab: PartnerPageTab;
  applicationStatus: string;
  partnerStatus: string;
  keyword: string;
  regionCode: string;
  partnerId: string;
  tenantId: string;
  revenueType: string;
  revenueStatus: string;
  commissionStatus: string;
  settlementStatus: string;
  rebindStatus: string;
  partners: PlatformPartnerRecord[];
}) {
  const partnerOptions = partners.map((partner) => ({
    value: partner.id,
    label: partner.name,
  }));

  return (
    <form
      action="/platform/partners"
      className="flex flex-wrap items-end gap-3"
    >
      {tab !== "applications" ? <input type="hidden" name="tab" value={tab} /> : null}
      {tab === "applications" ? (
        <>
          <TextFilter name="keyword" label="关键词" placeholder="申请主体、联系人、手机号" defaultValue={keyword} />
          <FilterSelect
            label="状态"
            name="application_status"
            defaultValue={applicationStatus}
            options={[...applicationStatusOptions]}
          />
          <TextFilter name="region_code" label="区域编码" placeholder="如 411500" defaultValue={regionCode} />
        </>
      ) : null}
      {tab === "partners" ? (
        <>
          <TextFilter name="keyword" label="关键词" placeholder="合伙人、联系人、手机号" defaultValue={keyword} />
          <FilterSelect
            label="状态"
            name="status"
            defaultValue={partnerStatus}
            options={[...partnerStatusOptions]}
          />
        </>
      ) : null}
      {tab === "bindings" ? (
        <>
          <FilterSelect
            label="合伙人"
            name="partner_id"
            defaultValue={partnerId}
            options={partnerOptions}
          />
          <TextFilter name="tenant_id" label="租户 ID" placeholder="租户 UUID" defaultValue={tenantId} />
        </>
      ) : null}
      {tab === "members" ? (
        <FilterSelect
          label="合伙人"
          name="partner_id"
          defaultValue={partnerId}
          options={partnerOptions}
        />
      ) : null}
      {tab === "revenue" ? (
        <>
          <FilterSelect
            label="合伙人"
            name="partner_id"
            defaultValue={partnerId}
            options={partnerOptions}
          />
          <FilterSelect
            label="收入类型"
            name="revenue_type"
            defaultValue={revenueType}
            options={[...revenueTypeOptions]}
          />
          <FilterSelect
            label="状态"
            name="revenue_status"
            defaultValue={revenueStatus}
            options={[...revenueStatusOptions]}
          />
          <TextFilter name="tenant_id" label="租户 ID" placeholder="租户 UUID" defaultValue={tenantId} />
          <TextFilter name="keyword" label="关键词" placeholder="来源 ID" defaultValue={keyword} />
        </>
      ) : null}
      {tab === "commissions" ? (
        <>
          <FilterSelect
            label="合伙人"
            name="partner_id"
            defaultValue={partnerId}
            options={partnerOptions}
          />
          <FilterSelect
            label="收入类型"
            name="revenue_type"
            defaultValue={revenueType}
            options={[...revenueTypeOptions]}
          />
          <FilterSelect
            label="状态"
            name="commission_status"
            defaultValue={commissionStatus}
            options={[...commissionStatusOptions]}
          />
        </>
      ) : null}
      {tab === "settlements" ? (
        <>
          <FilterSelect
            label="合伙人"
            name="partner_id"
            defaultValue={partnerId}
            options={partnerOptions}
          />
          <FilterSelect
            label="状态"
            name="settlement_status"
            defaultValue={settlementStatus}
            options={[...settlementStatusOptions]}
          />
        </>
      ) : null}
      {tab === "rebindRequests" ? (
        <>
          <FilterSelect
            label="合伙人"
            name="partner_id"
            defaultValue={partnerId}
            options={partnerOptions}
          />
          <FilterSelect
            label="状态"
            name="rebind_status"
            defaultValue={rebindStatus}
            options={[...partnerMemberRebindStatusOptions]}
          />
          <TextFilter name="keyword" label="关键词" placeholder="手机号、申请人、原因" defaultValue={keyword} />
        </>
      ) : null}
      <div className="ml-auto flex gap-2">
        <Button type="button" asChild variant="outline">
          <Link href={buildPartnerHref({ tab })}>
            <RotateCcw data-icon="inline-start" />
            重置
          </Link>
        </Button>
        <Button type="submit">
          <Search data-icon="inline-start" />
          筛选
        </Button>
      </div>
    </form>
  );
}

function TextFilter({
  name,
  label,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue: string;
}) {
  return (
    <Field className="min-w-[220px] flex-1 gap-1 md:max-w-72">
      <FieldLabel htmlFor={`partner-filter-${name}`} className="text-sm">
        {label}
      </FieldLabel>
      <Input
        id={`partner-filter-${name}`}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-9"
      />
    </Field>
  );
}
