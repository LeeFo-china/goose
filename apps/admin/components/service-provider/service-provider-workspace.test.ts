import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("tenant service provider settings workspace", () => {
  test("exposes publication gates and tenant navigation contract without visible section copy", () => {
    const pageSource = readSource(
      "../../app/(console)/settings/service-provider/page.tsx",
    );
    const loadingSource = readSource(
      "../../app/(console)/settings/service-provider/loading.tsx",
    );
    const workspaceSource = readSource("./service-provider-workspace.tsx");
    const addressPickerSource = readSource("./service-provider-address-picker.tsx");
    const areaSectionSource = readSource("./service-provider-area-section.tsx");
    const regionPickerSource = readSource("./service-provider-region-picker.tsx");
    const actionsSource = readSource("./service-provider-actions.tsx");
    const menuSource = readSource("../layout/menu-config.ts");

    expect(pageSource).toContain("/tenant/service-provider-profile");
    expect(pageSource).toContain("/tenant/service-provider-areas");
    expect(pageSource).not.toContain("维护小程序本地服务商页使用的公开资料");
    expect(pageSource).not.toContain("可编辑并提交审核");
    expect(pageSource).not.toContain("仅可查看");
    expect(pageSource).not.toContain("无访问权限");
    expect(loadingSource).toContain("ServiceProviderSettingsLoading");
    expect(loadingSource).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]");
    expect(loadingSource).toContain("h-64 lg:h-[360px]");
    expect(loadingSource).not.toContain("SlidersHorizontal");
    expect(loadingSource).not.toContain("lg:grid-cols-[14rem_minmax(0,1fr)]");
    expect(workspaceSource).toContain("提交平台发布审核");
    expect(workspaceSource).not.toContain("<CardTitle>当前资料状态</CardTitle>");
    expect(workspaceSource).not.toContain("statusNotice");
    expect(workspaceSource).not.toContain("FieldDescription");
    expect(workspaceSource).not.toContain("修改公开简介后");
    expect(workspaceSource).not.toContain("建议说明服务范围");
    expect(workspaceSource).not.toContain("公开资料</h2>");
    expect(workspaceSource).not.toContain("服务区域</h2>");
    expect(workspaceSource.indexOf("保存资料")).toBeLessThan(workspaceSource.indexOf("刷新资料"));
    expect(workspaceSource).not.toContain("onSave={saveProfile}");
    expect(workspaceSource).not.toContain("onSave: () => void");
    expect(areaSectionSource).not.toContain("未发布区域前");
    expect(workspaceSource).not.toContain("地址区域代码");
    expect(workspaceSource).not.toContain("地址纬度");
    expect(workspaceSource).not.toContain("地址经度");
    expect(workspaceSource).toContain("ServiceProviderRegionPicker");
    expect(workspaceSource).toContain("ServiceProviderAddressPicker");
    expect(workspaceSource).toContain("ServiceProviderAddressMap");
    expect(workspaceSource).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]");
    expect(workspaceSource).toContain("lg:sticky lg:top-0");
    expect(addressPickerSource).toContain("export function ServiceProviderAddressMap");
    expect(addressPickerSource).toContain('previewClassName="h-64 lg:h-[360px]"');
    expect(addressPickerSource).toContain('query.set("province", value.address_province)');
    expect(addressPickerSource).toContain('query.set("city", value.address_city)');
    expect(addressPickerSource).toContain('query.set("district", value.address_district)');
    expect(addressPickerSource).toContain('query.set("adcode", value.address_region_code)');
    expect(addressPickerSource).toContain("function updateAddress(nextAddress: string)");
    expect(addressPickerSource).not.toContain('address_latitude: "",\n      address_longitude: "",');
    expect(workspaceSource).toContain("address_region_code: nullableText(form.address_region_code)");
    expect(workspaceSource).toContain("address_latitude: nullableNumber(form.address_latitude)");
    expect(workspaceSource).toContain("address_longitude: nullableNumber(form.address_longitude)");
    expect(regionPickerSource).toContain("/tenant/location/geocode");
    expect(regionPickerSource).toContain("address_latitude");
    expect(regionPickerSource).toContain("address_longitude");
    expect(regionPickerSource).toContain("full_name");
    expect(regionPickerSource).toContain('className="md:col-span-2"');
    expect(actionsSource).toContain("service_provider.profile.manage");
    expect(menuSource).toContain('href: "/settings/service-provider"');
  });

  test("does not imply onboarding approval means immediate public display", () => {
    const workspaceSource = readSource("./service-provider-workspace.tsx");

    expect(workspaceSource).not.toContain("入驻成功即展示");
  });
});
