import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Platform partner operation page", () => {
  test("wires partner approval into the table using the server session permission", () => {
    const pageSource = readSource("../../app/(console)/platform/partners/page.tsx");
    const tableSource = readSource("./platform-partner-tables.tsx");

    expect(tableSource).toContain("<ApprovePartnerButton");
    expect(tableSource).toContain("partner={row.original} canManagePartners={canManagePartners}");
    expect(pageSource).toMatch(/const canManagePartners = session\.permissions\.some\(/);
    expect(pageSource).toContain('permission.code === "platform.partner.manage"');
    expect(pageSource).toContain("canManagePartners={canManagePartners}");
  });

  test("offers pending partner approval with explicit region and remark review", () => {
    const actionUrl = new URL("./platform-partner-approval-action.tsx", import.meta.url);
    expect(existsSync(actionUrl)).toBe(true);
    const source = readFileSync(actionUrl, "utf8");

    expect(source).toContain('!canManagePartners || partner.status !== "pending"');
    expect(source).toContain('title="审核通过并启用"');
    expect(source).toContain('submitLabel="审核通过并启用"');
    expect(source).toContain('method="PATCH"');
    expect(source).toContain('/platform/partners/${partner.id}/status');
    expect(source).not.toContain("/partner-applications/");
    expect(source).toContain('status: "active"');
    expect(source).toContain('reason: stringField(formData, "reason")');
    expect(source).toContain('name: "reason"');
    expect(source).toContain("required: true");
    expect(source).toContain("maxLength: 300");
    expect(source).toContain("审核说明将更新合伙人备注");
    for (const field of ["partner.name", "partner.contact_name", "partner.phone", "partner.remark", "partner.region_codes.map", "full_name"]) {
      expect(source).toContain(field);
    }
    expect(source).toContain("submitDisabled={partner.region_codes.length === 0}");
    expect(source).toContain("请先编辑运营区县");
    expect(source).not.toContain(".slice(0, 3)");
  });

  test("guards duplicate and disabled submissions synchronously and releases the lock", () => {
    const source = readSource("./platform-partner-actions.tsx");
    const submitSource = source.slice(source.indexOf("export function MutationDialogButton"), source.indexOf("function DialogField"));

    expect(submitSource).toContain("const submittingRef = useRef(false)");
    expect(submitSource).toContain("if (submittingRef.current || pending || submitDisabled) return");
    expect(submitSource.indexOf("submittingRef.current = true")).toBeLessThan(submitSource.indexOf("startTransition(async"));
    expect(submitSource).toMatch(/finally\s*\{\s*submittingRef\.current = false/);
    expect(submitSource).toContain("setOpen(false)");
    expect(submitSource).toContain("refreshAfterDialogClose(router)");
    expect(submitSource).toContain("setError(submitError instanceof Error ? submitError.message : fallbackMessage)");
  });

  test("passes the field length limit to the shared textarea", () => {
    const source = readSource("./platform-partner-actions.tsx");
    expect(source).toMatch(/<Textarea\s[^>]*maxLength=\{field\.maxLength\}/);
  });

  test("registers the platform partner entry in platform navigation", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('href: "/platform/partners"');
    expect(source).toContain('label: "城市合伙人"');
  });

  test("uses the fixed platform list workspace with standard shadcn tabs", () => {
    const pageUrl = new URL(
      "../../app/(console)/platform/partners/page.tsx",
      import.meta.url,
    );
    expect(existsSync(pageUrl)).toBe(true);

    const source = readFileSync(pageUrl, "utf8");
    const tabsSource = `${source}\n${readSource("./platform-partner-filters.tsx")}`;
    expect(source).toContain("PlatformListPageShell");
    expect(source).toContain("h-[calc(100vh-6.5625rem)]");
    expect(source).toContain("TabsList");
    expect(source).toContain("TabsTrigger");
    expect(source).toContain("TabsContent");
    expect(tabsSource).toContain("申请线索");
    expect(tabsSource).toContain("合伙人");
    expect(tabsSource).toContain("登录成员");
    expect(tabsSource).toContain("装企绑定");
    expect(tabsSource).toContain("平台收入");
    expect(tabsSource).toContain("分佣台账");
    expect(tabsSource).toContain("月结批次");
    expect(tabsSource).toContain("换绑审核");
    expect(source).not.toContain("listHeader=");
    expect(source).not.toContain("当前筛选：");
  });

  test("keeps all partner filter labels aligned on the left", () => {
    const source = readSource("./platform-partner-filters.tsx");
    const filterSelectSource = readSource("../admin/filter-select.tsx");
    const textFilterSource = source.slice(
      source.indexOf("function TextFilter"),
      source.length,
    );

    expect(textFilterSource).toContain('className="min-w-[220px] flex-1 flex-row items-center gap-2 md:max-w-72"');
    expect(textFilterSource).toContain('className="shrink-0 text-sm font-medium text-foreground"');
    expect(textFilterSource).toContain('className="h-9 min-w-0 flex-1"');
    expect(filterSelectSource).toContain('className="min-w-fit flex-row items-center gap-2"');
  });

  test("exposes the MVP operation actions through backend endpoints", () => {
    const source = `${readSource("./platform-partner-actions.tsx")}\n${
      readSource("./platform-partner-application-actions.tsx")
    }\n${
      readSource("./platform-partner-member-actions.tsx")
    }\n${
      readSource("./platform-partner-member-rebind-table.tsx")
    }`;

    expect(source).toContain("/platform/partner-applications/${application.id}/approve");
    expect(source).toContain("/platform/partner-applications/${application.id}/status");
    expect(source).toContain("/platform/partners");
    expect(source).toContain("/platform/partners/${partner.id}/members");
    expect(source).toContain("/platform/partner-members/${member.id}/status");
    expect(source).toContain("/platform/partner-bindings");
    expect(source).toContain("/platform/partner-revenue/lead-service-fees");
    expect(source).toContain("/platform/partner-revenue/recharge-events/sync");
    expect(source).toContain("/platform/partner-settlements/monthly-batches");
    expect(source).toContain("/platform/partner-settlements/${batch.id}/mark-paid");
    expect(source).toContain("/platform/partner-member-rebind-requests/${request.id}/approve");
    expect(source).toContain("/platform/partner-member-rebind-requests/${request.id}/reject");
  });

  test("generates partner invite codes without manual campaign code input", () => {
    const source = readSource("./platform-partner-invite-actions.tsx");
    const inviteCodeSection = source.slice(
      source.indexOf("export function CreateInviteCodeButton"),
      source.indexOf("function stringField"),
    );

    expect(inviteCodeSection).toContain("生成专属邀请码");
    expect(inviteCodeSection).toContain("region_code");
    expect(inviteCodeSection).toContain("expires_at");
    expect(inviteCodeSection).toContain("/api/backend/platform/partner-invite-codes/");
    expect(inviteCodeSection).toContain("<img");
    expect(inviteCodeSection).not.toContain("活动编码");
    expect(inviteCodeSection).not.toContain("campaign_code");
  });

  test("adds partner member tab fetch, actions, and required table columns", () => {
    const pageSource = readSource("../../app/(console)/platform/partners/page.tsx");
    const tableSource = readSource("./platform-partner-tables.tsx");
    const actionSource = `${readSource("./platform-partner-actions.tsx")}\n${
      readSource("./platform-partner-member-actions.tsx")
    }`;

    expect(pageSource).toContain("tab === \"members\"");
    expect(pageSource).toContain("/platform/partners/${memberPartnerId}/members");
    expect(pageSource).toContain("PlatformPartnerMembersTable");
    expect(actionSource).toContain("CreatePartnerMemberButton");
    expect(actionSource).toContain("UpdatePartnerMemberStatusButton");
    for (const column of ["合伙人", "姓名", "手机号", "角色", "绑定状态", "微信绑定", "创建时间", "操作"]) {
      expect(tableSource).toContain(column);
    }
  });

  test("adds partner member rebind review tab fetch, actions, and columns", () => {
    const pageSource = readSource("../../app/(console)/platform/partners/page.tsx");
    const tableSource = readSource("./platform-partner-member-rebind-table.tsx");

    expect(pageSource).toContain("tab === \"rebindRequests\"");
    expect(pageSource).toContain("/platform/partner-member-rebind-requests?");
    expect(pageSource).toContain("PlatformPartnerMemberRebindTable");
    for (const column of ["合伙人", "成员", "申请人", "状态", "提交时间", "操作"]) {
      expect(tableSource).toContain(column);
    }
  });
});
