import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Platform partner operation page", () => {
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
