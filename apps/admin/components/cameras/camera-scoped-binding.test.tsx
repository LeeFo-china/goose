import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CameraRowActions, CreateCameraButton } from "./camera-mutations";
import type { CameraRecord } from "./camera-types";
import { CameraProjectDeviceFields } from "./camera-project-device-fields";
import { buildDefaults, type CameraFormValues } from "./camera-mutation-shared";

function Fields({ locked = true, loading = false, error = "" }: { locked?: boolean; loading?: boolean; error?: string }) {
  const form = useForm<CameraFormValues>({ defaultValues: buildDefaults() });
  return <CameraProjectDeviceFields
    form={form} pending={false} activeProjectId="project-a" projectLocked={locked}
    projectKeyword="" projectOptions={[]} selectedProjectId="project-a"
    selectedProject={{ id: "project-a", name: "项目甲", address: "春风花园 1 栋", customer_name: "张先生" }}
    projectLoading={false} projectSelectError="" deviceKeyword="" deviceLoading={loading}
    deviceError={error} hasMoreDevices={false} availableDevices={[]}
    setProjectKeyword={() => {}} setSelectedProjectId={() => {}} setSelectedProject={() => {}}
    setDeviceKeyword={() => {}} loadMoreDevices={() => {}}
  />;
}

describe("scoped camera binding", () => {
  test("shows project identity without a project search or switch for scoped entry points", () => {
    const html = renderToStaticMarkup(<Fields />);
    expect(html).toContain("春风花园 1 栋 · 张先生");
    expect(html).not.toContain('id="camera-project-search"');
    expect(html).toContain("当前项目已固定");
    expect(html).toContain("可按设备编号或通道名搜索，也可加载更多设备。");
    expect(html).not.toContain("按关键词分页查询");
  });
  test("retains project search for global create consumers", () => {
    expect(renderToStaticMarkup(<Fields locked={false} />)).toContain('id="camera-project-search"');
  });
  test("explains the empty asset pool and links to device management with project context", () => {
    const html = renderToStaticMarkup(<Fields />);
    expect(html).toContain("尚未绑定项目");
    expect(html).toContain("前往设备管理");
    expect(html).toContain("tab=devices&amp;projectId=project-a");
  });
  test("does not present a loading or failed request as an empty asset pool", () => {
    expect(renderToStaticMarkup(<Fields loading />)).not.toContain("前往设备管理");
    expect(renderToStaticMarkup(<Fields error="设备加载失败" />)).not.toContain("前往设备管理");
  });
});

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
function renderActions(status: string, statusSource?: CameraRecord["status_source"]) {
  const camera: CameraRecord = {
    id: "camera-a", name: "客厅", vendor: "ezviz", status, position: null,
    can_view: true, can_control: false, capabilities: ["live"], cover_url: null,
    sort_order: 0, video_encrypted: false,
    status_source: statusSource,
  };
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <CameraRowActions projectId="project-a" camera={camera} devices={[]} />
    </AppRouterContext.Provider>,
  );
}

describe("camera action compatibility", () => {
  test("accepts project context and custom first/additional labels without device props", () => {
    for (const label of ["添加首个摄像头", "继续添加摄像头"]) {
      expect(renderToStaticMarkup(<CreateCameraButton projectId="project-a" project={{ id: "project-a", name: "项目甲" }} label={label} />)).toContain(label);
    }
    expect(renderToStaticMarkup(<CreateCameraButton projectId="" devices={[]} />)).toContain("添加摄像头");
  });
  test("disables offline live preview and explains why", () => {
    const html = renderActions("offline");
    const preview = html.match(/<button[^>]*>[\s\S]*?预览<\/button>/)?.[0];
    expect(preview).toContain('disabled=""');
    expect(preview).toContain("设备离线");
    expect(html).toContain("更多摄像头操作");
    expect(html).not.toContain("解绑</button>");
  });
  test("leaves preview and refresh possible for unknown device status", () => {
    const html = renderActions("unknown");
    const preview = html.match(/<button[^>]*>[\s\S]*?预览<\/button>/)?.[0];
    expect(preview).toBeDefined();
    expect(preview).not.toContain('disabled=""');
  });
  test("allows retrying persisted offline status while live and cached offline remain disabled", () => {
    for (const source of ["live", "cached", "persisted"] as const) {
      const html = renderActions("offline", source);
      const preview = html.match(/<button[^>]*>[\s\S]*?预览<\/button>/)?.[0];
      expect(preview).toBeDefined();
      if (source === "persisted") {
        expect(preview).not.toContain('disabled=""');
        expect(preview).not.toContain("设备离线");
      } else {
        expect(preview).toContain('disabled=""');
        expect(preview).toContain("设备离线");
      }
    }
  });
});
