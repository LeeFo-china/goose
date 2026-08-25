import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DouyinReleaseReadiness } from "@gooes/domain";

import { TenantDouyinMiniappWorkspace } from "./workspace";
import type { TenantDouyinWorkspace } from "./workspace-types";

const workspace: TenantDouyinWorkspace = {
  tenant: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "好店装修内部租户",
  },
  authorization_state: "active",
  release_state: "testing",
  installation: {
    id: "00000000-0000-4000-8000-000000000002",
    authorizer_appid: "ttd033a68e4e56ccd301",
    installation_kind: "merchant",
    authorization_status: "active",
    permission_snapshot: [],
    runtime_config: {
      brand: { logo_url: null, qualifications: [] },
      theme: {
        primary_color: "#F5B900",
        navigation_text_color: "black",
      },
      features: {
        cases: true,
        sites: true,
        sms_lead: true,
        douyin_phone: false,
        phone_capture_mode: "sms",
      },
      home_banners: [],
      trust_metrics: [],
      privacy_policy_version: "2026-07",
    },
    template_version: "0.1.2",
    template_release_id: "00000000-0000-4000-8000-000000000003",
    created_at: "2026-07-26T08:00:00.000Z",
    updated_at: "2026-07-26T09:00:00.000Z",
  },
  public_profile: {
    public_name: "好店装修服务",
    introduction: "专注施工档案与透明装修服务",
    public_phone: "0371-12345678",
    status: "published",
    version: 2,
    submitted_at: "2026-07-25T08:00:00.000Z",
    reviewed_at: "2026-07-25T09:00:00.000Z",
    review_remark: null,
    published_at: "2026-07-25T10:00:00.000Z",
    updated_at: "2026-07-25T10:00:00.000Z",
  },
  public_content: {
    cases: 6,
    sites: 3,
    active_service_areas: 2,
  },
  available_template: null,
  latest_release: {
    id: "00000000-0000-4000-8000-000000000003",
    installation_id: "00000000-0000-4000-8000-000000000002",
    template_id: "77595",
    template_version: "0.1.2",
    description: "租户品牌、案例、工地与免费咨询联调版本",
    status: "testing",
    test_qr_url: "https://example.com/qr.png",
    latest_test_qr_url: "https://example.com/qr.png",
    audit_qr_url: null,
    audit_note: null,
    audit_result: null,
    submitted_at: null,
    audited_at: null,
    released_at: null,
    created_at: "2026-07-26T08:00:00.000Z",
    updated_at: "2026-07-26T09:00:00.000Z",
  },
};
const blockedReadiness: DouyinReleaseReadiness = {
  ready: false,
  checked_at: "2026-08-20T10:00:00.000+08:00",
  tenant: workspace.tenant,
  blockers: [
    {
      severity: "blocker",
      code: "BUDGET_PRICING_MISSING",
      message: "预算报价版本未启用",
      details: {},
    },
  ],
  warnings: [],
  metrics: {
    published_project_count: 6,
    active_service_area_count: 2,
  },
};

describe("TenantDouyinMiniappWorkspace", () => {
  test("constrains the workspace to the shell height for internal scrolling", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        loadError={null}
        workspace={workspace}
      />,
    );

    expect(html).toContain("h-full");
    expect(html).toContain("[scrollbar-gutter:stable]");
    expect(html).toContain("overflow-y-auto");
  });

  test("separates internal tenant identity from the public miniapp brand", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        loadError={null}
        workspace={workspace}
      />,
    );

    expect(html).toContain("租户内部名称");
    expect(html).toContain("好店装修内部租户");
    expect(html).toContain("小程序公开品牌");
    expect(html).toContain("好店装修服务");
    expect(html).toContain("公开资料展示中");
    expect(html).toContain("6 个");
    expect(html).toContain("3 个");
    expect(html).toContain("2 个");
    expect(html).toContain('href="/settings/service-provider"');
    expect(html).toContain('href="/projects"');
  });

  test("renders authorization and release states without exposing credentials", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        loadError={null}
        workspace={workspace}
      />,
    );

    expect(html).toContain("已授权");
    expect(html).toContain("体验测试中");
    expect(html).toContain("测试版二维码");
    expect(html).toContain("提交审核");
    expect(html).not.toMatch(/appsecret|component_access_token|template_app_secret/i);
  });

  test("keeps test QR visible after audit submit and offers the audit QR", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        canManage
        loadError={null}
        workspace={{
          ...workspace,
          release_state: "audit_pending",
          latest_release: workspace.latest_release
            ? {
              ...workspace.latest_release,
              status: "audit_pending",
              latest_test_qr_url: "https://example.com/latest.png",
              audit_qr_url: null,
              submitted_at: "2026-08-25T09:30:00.000Z",
            }
            : null,
        }}
      />,
    );

    expect(html).toContain("测试版二维码");
    expect(html).toContain("https://example.com/latest.png");
    expect(html).toContain("获取审核版二维码");
    expect(html).not.toContain("体验二维码已就绪");
  });

  test("disables local audit submission when readiness has blockers", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        canManage
        canSubmitAudit
        loadError={null}
        readiness={blockedReadiness}
        workspace={workspace}
      />,
    );

    expect(html).toContain("提审就绪检查");
    expect(html).toContain("预算报价版本未启用");
    expect(html).toContain("当前仍有 1 项提审阻断");
    expect(html).toContain("提交审核");
    expect(html).toContain('disabled=""');
  });

  test("renders explicit permission and loading error states", () => {
    const forbiddenHtml = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead={false}
        loadError={null}
        workspace={null}
      />,
    );
    const errorHtml = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        loadError="工作台加载失败"
        workspace={null}
      />,
    );

    expect(forbiddenHtml).toContain("无权访问抖音小程序工作台");
    expect(errorHtml).toContain("工作台加载失败");
  });

  test("lets authorized operators start tenant authorization", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        canManage
        canSubmitAudit
        loadError={null}
        workspace={{
          ...workspace,
          authorization_state: "unbound",
          release_state: "not_uploaded",
          installation: null,
          latest_release: null,
        }}
      />,
    );

    expect(html).toContain("未授权");
    expect(html).toContain("授权抖音小程序");
    expect(html).not.toContain("下一阶段开放");
    expect(html).not.toContain('disabled=""');
  });

  test("renders a permission-gated tenant publish action after audit approval", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        canManage
        canPublish
        canSubmitAudit
        loadError={null}
        workspace={{
          ...workspace,
          release_state: "audit_approved",
          latest_release: workspace.latest_release
            ? { ...workspace.latest_release, status: "audit_approved" }
            : null,
        }}
      />,
    );

    expect(html).toContain("正式发布");
    expect(html).not.toContain("缺少执行该操作的权限");
  });

  test("keeps a confirmed platform template visible until the tenant starts it", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        canManage
        canSubmitAudit
        loadError={null}
        workspace={{
          ...workspace,
          available_template: {
            template_id: "77612",
            version: "0.1.4",
            description: "优化工地卡片和图片展示",
            confirmed_at: "2026-08-13T04:00:00.000Z",
            state: "new_available",
          },
          release_state: "released",
          latest_release: workspace.latest_release
            ? {
              ...workspace.latest_release,
              status: "released",
              released_at: "2026-08-13T03:00:00.000Z",
            }
            : null,
        }}
      />,
    );

    expect(html).toContain("发现可用新版 0.1.4");
    expect(html).toContain("优化工地卡片和图片展示");
    expect(html).toContain("生成新版体验版");
  });

  test("keeps status sync visible beside a rejected release with a newer template", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        canManage
        canSubmitAudit
        loadError={null}
        workspace={{
          ...workspace,
          available_template: {
            template_id: "77612",
            version: "0.1.4",
            description: "优化工地卡片和图片展示",
            confirmed_at: "2026-08-13T04:00:00.000Z",
            state: "new_available",
          },
          release_state: "audit_rejected",
          latest_release: workspace.latest_release
            ? {
              ...workspace.latest_release,
              status: "audit_rejected",
              audit_result: {
                status: "rejected",
                reason: "小程序功能不完整且可用性低",
              },
            }
            : null,
        }}
      />,
    );

    expect(html).toContain("同步审核状态");
    expect(html).toContain("生成新版体验版");
    expect(html).toContain("审核驳回原因");
    expect(html).toContain("小程序功能不完整且可用性低");
  });

  test("surfaces a stale platform template without offering test version creation", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        canManage
        canSubmitAudit
        loadError={null}
        workspace={{
          ...workspace,
          available_template: {
            template_id: "78149",
            version: "0.1.2",
            description: "旧模板误设为当前",
            confirmed_at: "2026-08-13T04:00:00.000Z",
            state: "stale_version",
          },
          release_state: "audit_rejected",
          latest_release: workspace.latest_release
            ? {
              ...workspace.latest_release,
              status: "audit_rejected",
              template_id: "77595",
              template_version: "0.1.3",
            }
            : null,
        }}
      />,
    );

    expect(html).toContain("当前可发布模板版本异常 0.1.2");
    expect(html).toContain("请先在平台确认新的抖音模板版本");
    expect(html).not.toContain("生成新版体验版");
  });

  test("surfaces a pending public profile instead of implying it is live", () => {
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        loadError={null}
        workspace={{
          ...workspace,
          public_profile: workspace.public_profile
            ? { ...workspace.public_profile, status: "pending_review" }
            : null,
        }}
      />,
    );

    expect(html).toContain("公开资料待审核");
    expect(html).not.toContain("公开资料展示中");
  });

  test("keeps long public names and rejected releases readable in one flat card", () => {
    const longPublicName = "河南好店透明施工档案与装修服务中心".repeat(6);
    const html = renderToStaticMarkup(
      <TenantDouyinMiniappWorkspace
        canRead
        loadError={null}
        workspace={{
          ...workspace,
          release_state: "audit_rejected",
          public_profile: workspace.public_profile
            ? { ...workspace.public_profile, public_name: longPublicName }
            : null,
          latest_release: workspace.latest_release
            ? { ...workspace.latest_release, status: "audit_rejected" }
            : null,
        }}
      />,
    );

    expect(html).toContain(longPublicName);
    expect(html).toContain("审核驳回");
    expect(html).toContain("break-words");
    expect(html).toContain("overflow-y-auto");
    expect(
      html.match(/rounded-lg border border-border bg-card/g),
    ).toHaveLength(1);
  });
});
