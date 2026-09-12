import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { AiModelRouteTab } from "./ai-model-route-tab";
import { emptyRouteForm } from "./ai-model-routing-shared";
import { readFileSync } from "node:fs";
import * as shared from "./ai-route-editor-shared";
import { AiRouteModelSelector } from "./ai-route-model-selector";

describe("AiModelRouteTab simplified route form", () => {
  test("uses provider-first model selection and hides internal model IDs", () => {
    const provider = {
      id: "11111111-1111-4111-8111-111111111111",
      code: "openrouter",
      name: "OpenRouter",
      provider_type: "openrouter",
      endpoint_url: "https://openrouter.ai/api/v1",
      api_key_setting_key: "OPENROUTER_API_KEY",
      status: "active" as const,
      sort_order: 0,
      created_at: "2026-09-05T00:00:00.000Z",
      updated_at: "2026-09-05T00:00:00.000Z",
    };

    const html = renderToStaticMarkup(createElement(AiModelRouteTab, {
      routePage: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      providers: [provider],
      scenes: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      sceneLoadError: null,
      sceneLoading: false,
      primaryOptions: { data: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }, loading: false, error: null, selected: null },
      fallbackOptions: { data: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }, loading: false, error: null, selected: null },
      routeForm: emptyRouteForm(provider.id),
      selectedScene: null,
      isPending: false,
      isRouteLoading: false,
      isRouteSaving: false,
      canManageRoutes: true,
      onRouteFormChange: () => undefined,
      onSceneChange: () => undefined,
      onSceneRetry: () => undefined,
      onRouteSubmit: async () => undefined,
      onRouteReset: () => undefined,
      onRouteEdit: () => undefined,
      onRoutePageChange: () => undefined,
      onProviderChange: () => undefined,
      onKeywordChange: () => undefined,
      onModelSearch: () => undefined,
      onModelSelect: () => undefined,
    }));

    expect(html).toContain("主模型供应商");
    expect(html).toContain("搜索主模型");
    expect(html).not.toContain("OpenRouter 目录");
    expect(html).not.toContain("模型编码");
    expect(html).toContain("场景来源");
    expect(html).toContain("手动填写调用名称");
  });
});

test("custom identity is validated and never mixes registered fields", () => {
  const form = { ...emptyRouteForm(), scene_source: "custom" as const, scene_code: "old-code", custom_scene_name: " 效果图 ", custom_scene_modality: "image" as const };
  expect(shared.routeIdentity(form)).toEqual({ scene_source: "custom", scene_name: "效果图", modality: "image" });
  expect(shared.routeValidation({ ...form, custom_scene_name: " " }, null)).toContain("场景名称");
  expect(shared.routeIdentity({ ...form, scene_source: "registered" })).toEqual({ scene_source: "registered", scene_code: "old-code" });
});

test("manual drafts are independent and use scene modality and inputs", () => {
  const form = emptyRouteForm("provider");
  expect(form.primary_manual).not.toBe(form.fallback_manual);
  const image = { ...form, scene_source: "custom" as const, custom_scene_modality: "image" as const,
    primary_manual: { enabled: true, name: "主图片", model_name: "ep-image" },
    fallback_manual: { enabled: true, name: "", model_name: "ep-fallback" } };
  expect(shared.manualModelPayload(image, "primary", null)).toEqual({ source: "manual", name: "主图片", model_name: "ep-image", modality: "image", input_modalities: ["image"] });
  expect(shared.manualModelPayload(image, "fallback", null)?.model_name).toBe("ep-fallback");
  expect(shared.manualModelPayload({ ...image, primary_manual: { ...image.primary_manual, enabled: false } }, "primary", null)).toBeNull();
  expect(shared.routeMutablePayload(image, ["one", "two"])).not.toHaveProperty("response_format");
});

test("scene query uses exact page size and append deduplicates pinned records", () => {
  const path = new URL(shared.sceneQueryPath(2, " 图 "), "https://local.test");
  expect(path.pathname).toBe("/platform/ai-config/scenes");
  expect(Object.fromEntries(path.searchParams)).toEqual({ page: "2", pageSize: "20", keyword: "图" });
  const scene = { code: "one" };
  expect(shared.mergeSceneOptions([scene], [scene, { code: "two" }])).toEqual([scene, { code: "two" }]);
});

test("route source contract removes runtime mutation guards and wires manual and scene actions", () => {
  const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
  expect(source("./ai-model-route-tab.tsx")).toContain("<AiManualModelFields");
  expect(source("./ai-scene-selector.tsx")).toContain("新建自定义场景");
  expect(source("./ai-scene-selector.tsx")).toContain("删除场景");
  expect(source("./use-ai-route-editor.ts")).not.toContain('runtime_status === "not_connected"');
  expect(source("./use-ai-route-editor.ts")).not.toContain('runtime_status !== "connected"');
});

test("custom forms require a modality even when an old registered modality exists", () => {
  expect(shared.routeValidation({ ...emptyRouteForm(), scene_source: "custom", custom_scene_name: "效果图" }, null)).toContain("模态");
});

test("unsupported discovery, failed catalog and empty models remain distinct with a manual escape", () => {
  const data = { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
  const render = (protocol: string, error: string | null) => renderToStaticMarkup(createElement(AiRouteModelSelector, {
    title: "主模型", target: "primary", providers: [{ id: "one", code: "one", name: "供应商", provider_type: protocol, status: "active", endpoint_url: null, api_key_setting_key: null, sort_order: 0, created_at: "", updated_at: "" }],
    providerId: "one", keyword: "", value: "", state: { data: { ...data, discovery: protocol === "openai_compatible" ? { mode: "internal_only", status: "unsupported" } : { mode: "openrouter_catalog", status: "empty" } }, loading: false, error, selected: null },
    onProviderChange: () => {}, onKeywordChange: () => {}, onSearch: () => {}, onSelect: () => {}, onManual: () => {},
  }));
  expect(render("openai_compatible", null)).toContain("不支持自动发现厂商完整目录");
  const failed = render("openrouter", "unsafe upstream detail");
  expect(failed).toContain("重试加载模型"); expect(failed).toContain("手动填写调用名称");
  expect(failed).not.toContain("暂无符合"); expect(failed).not.toContain("unsafe upstream");
  expect(render("openrouter", null)).toContain("暂无符合场景模态");
});

test("discovery status is independent of nonempty registered model candidates", () => {
  const option = { source: "internal" as const, value: "registered", model_id: "registered", provider_id: "one", label: "已登记模型", description: "internal-model", modality: "text" as const, status: "active" };
  const render = (discovery: { mode: "openrouter_catalog"; status: "ready" | "empty" } | { mode: "internal_only"; status: "unsupported" } | { status: "failed" }) => renderToStaticMarkup(createElement(AiRouteModelSelector, {
    title: "主模型", target: "primary", providers: [{ id: "one", code: "one", name: "供应商", provider_type: "openrouter", status: "active", endpoint_url: null, api_key_setting_key: null, sort_order: 0, created_at: "", updated_at: "" }],
    providerId: "one", keyword: "", value: "registered", state: { data: { list: [option], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }, discovery }, loading: false, error: null, selected: option },
    onProviderChange: () => {}, onKeywordChange: () => {}, onSearch: () => {}, onSelect: () => {}, onManual: () => {},
  }));
  const empty = render({ mode: "openrouter_catalog", status: "empty" });
  expect(empty).toContain("OpenRouter 目录暂无符合条件的候选模型");
  expect(empty).toContain("已登记模型");
  expect(empty).not.toContain("目录已有可选模型");
  expect(render({ mode: "internal_only", status: "unsupported" })).toContain("不支持自动发现厂商完整目录");
  expect(render({ mode: "openrouter_catalog", status: "ready" })).toContain("OpenRouter 目录已有可选模型");
  const failed = render({ status: "failed" });
  const failureRegion = failed.match(/<div[^>]*role="alert"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
  expect(failureRegion).toContain("重试加载模型");
  expect(failureRegion).toContain("手动填写调用名称");
  expect(failed.match(/<button[^>]*id="ai-route-primary-model"[^>]*>/)?.[0]).not.toContain('disabled=""');
});

test("only an explicit matching delete acknowledgement removes a custom scene", () => {
  expect(shared.sceneDeleteConfirmed({ code: "scene", deleted: true }, "scene")).toBe(true);
  for (const response of [null, {}, { code: "other", deleted: true }, { code: "scene", deleted: false }]) {
    expect(shared.sceneDeleteConfirmed(response, "scene")).toBe(false);
  }
});

test("real editor hook loads models, rejects stale responses, saves custom scenes and retains conflicts", async () => {
  const { chromium } = await import("@playwright/test");
  const makeScene = (code: string, source = "system", status = "active") => ({ code, name: code, modality: "image", required_input_modalities: ["text", "image"], runtime_status: "not_connected", source, status, version: 3, requirements_source: "admin", requires_streaming: false, min_reference_images: 0, allow_new_configuration: status === "active" });
  const scenes = [makeScene("drawing"), makeScene("custom-code", "custom"), makeScene("disabled-custom", "custom", "inactive")];
  const pagination = { page: 1, pageSize: 20, total: 22, totalPages: 2 };
  const fixture = `import React from "react";
    import { createRoot } from "react-dom/client";
    import { useAiRouteEditor } from ${JSON.stringify(new URL("./use-ai-route-editor.ts", import.meta.url).pathname)};
    import { AiModelRouteTab } from ${JSON.stringify(new URL("./ai-model-route-tab.tsx", import.meta.url).pathname)};
    const providers = ["one", "two"].map(id => ({id, code:id, name:id, provider_type:id === "two" ? "openrouter" : "openai_compatible", status:"active", endpoint_url:null, api_key_setting_key:null, sort_order:0, created_at:"", updated_at:""}));
    const data = {list:[],pagination:{page:1,pageSize:20,total:0,totalPages:0}};
    const initialScenes = ${JSON.stringify({ list: scenes, pagination })};
    function App() {
      const [canManage, setCanManage] = React.useState(true);
      const editor = useAiRouteEditor({providers, scenes:initialScenes, sceneError:null, canManage, onSaved:async()=>{}, onBoundProviders:()=>{}});
      globalThis.editor = editor;
      globalThis.setCanManage = setCanManage; globalThis.canManage = canManage;
      React.useEffect(() => { globalThis.fixtureMounted = true; }, []);
      return React.createElement(AiModelRouteTab, {routePage:data, scenes:editor.scenes, sceneLoadError:editor.sceneLoadError, sceneLoading:editor.sceneLoading, sceneKeyword:editor.sceneKeyword, saveError:editor.saveError,
        providers, primaryOptions:editor.primaryOptions, fallbackOptions:editor.fallbackOptions, routeForm:editor.form, selectedScene:editor.scene,
        isPending:false, isRouteLoading:false, isRouteSaving:editor.saving, canManageRoutes:canManage,
        onRouteFormChange:editor.changeForm, onSceneChange:editor.changeScene, onSceneRetry:editor.refresh,
        onSceneSearch:editor.reloadScenes, onSceneMutation:editor.mutateScene, onRouteSubmit:editor.submit, onRouteReset:editor.reset,
        onRouteEdit:editor.edit, onRoutePageChange:()=>{}, onProviderChange:editor.changeProvider, onKeywordChange:editor.changeKeyword, onModelSearch:editor.searchModels, onModelSelect:editor.selectModel});
    }
    createRoot(document.getElementById("root")).render(React.createElement(App));`;
  const entrypoint = new URL("./route-editor-test-fixture.js", import.meta.url).pathname;
  const build = await Bun.build({ entrypoints: [entrypoint], target: "browser", plugins: [{ name: "fixture", setup(builder) {
    builder.onResolve({ filter: /route-editor-test-fixture\.js$/ }, () => ({ path: entrypoint, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: fixture, loader: "js", resolveDir: import.meta.dir }));
  } }] });
  expect(build.success).toBe(true);
  const bundle = await build.outputs[0].text();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requests: { path: string; body: Record<string, unknown> | null }[] = [];
  let releaseOld: (() => void) | undefined;
  let releaseScene: (() => void) | undefined;
  let oldHandled: (() => void) | undefined;
  let sceneHandled: (() => void) | undefined;
  const oldRequestFinished = new Promise<void>((resolve) => { oldHandled = resolve; });
  const sceneRequestFinished = new Promise<void>((resolve) => { sceneHandled = resolve; });
  let failOptions = false;
  let staleMutation = false;
  let allowDelete = false;
  try {
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script type="module" src="/fixture.js"></script>' });
      if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
      const body = route.request().postDataJSON();
      requests.push({ path: url.pathname + url.search, body });
      const respond = (data: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data }) });
      if (url.pathname.endsWith("/scenes")) {
        if (url.searchParams.get("keyword") === "slow-scene") await new Promise<void>((resolve) => { releaseScene = resolve; });
        const list = url.searchParams.get("keyword") === "server-code" ? [makeScene("server-code", "custom")]
          : url.searchParams.get("keyword") === "slow-scene" ? [makeScene("stale-scene")]
          : url.searchParams.get("page") === "2" ? [makeScene("next")] : scenes;
        await respond({ list, pagination: { ...pagination, page: Number(url.searchParams.get("page") || 1) } });
        if (url.searchParams.get("keyword") === "slow-scene") sceneHandled?.();
        return;
      }
      if (url.pathname.includes("route-model-options:resolve")) return respond({ model_id: url.pathname.includes("/one/") ? "manual-one" : "manual-two" });
      if (url.pathname.includes("route-model-options")) {
        if (url.searchParams.get("keyword") === "slow") await new Promise<void>((resolve) => { releaseOld = resolve; });
        if (failOptions) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ code: "AI_OPENROUTER_CATALOG_FAILED", message: "unsafe remote detail" }) });
        await respond({ list: [{ source: "internal", value: "model-" + (url.pathname.includes("/one/") ? "one" : "two"), model_id: "model-one", provider_id: "one", label: "Image model", description: "image-model", modality: "image", status: "active" }], pagination: { ...pagination, total: 1, totalPages: 1 },
          discovery: url.pathname.includes("/one/") ? { mode: "internal_only", status: "unsupported" } : { mode: "openrouter_catalog", status: "empty" } });
        if (url.searchParams.get("keyword") === "slow") oldHandled?.();
        return;
      }
      if (url.pathname.endsWith("/routes")) return respond({ id: "route", scene_code: "server-code", name: "新效果图", modality: "image", primary_model_id: "manual-two", fallback_model_id: "manual-one", temperature: null, timeout_ms: 60000, response_format: null, status: "active", version: 1, created_at: "", updated_at: "" });
      if (route.request().method() === "PATCH") {
        if (staleMutation) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "AI_CONFIG_VERSION_STALE", message: "unsafe detail" }) });
        const scene = scenes.find((item) => url.pathname.endsWith(item.code));
        if (scene) { Object.assign(scene, body, { version: scene.version + 1 }); return respond(scene); }
      }
      if (route.request().method() === "DELETE") {
        if (allowDelete) {
          const index = scenes.findIndex((item) => url.pathname.endsWith(item.code));
          const [deleted] = scenes.splice(index, 1);
          return respond({ code: deleted.code, deleted: true });
        }
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "AI_CUSTOM_SCENE_IN_USE", message: "unsafe remote detail" }) });
      }
      return route.fulfill({ status: 500, body: "unexpected test request" });
    });
    await page.goto("http://fixture.test/");
    await page.waitForFunction("globalThis.fixtureMounted && !editor.sceneLoading && editor.scenes.list.length === 3");
    const sceneRequests = () => requests.filter((item) => new URL(item.path, "http://fixture.test").pathname.endsWith("/scenes"));
    expect(sceneRequests()).toHaveLength(0);
    const sceneSearch = page.locator("#ai-route-scene-keyword");
    await sceneSearch.fill("d"); await sceneSearch.fill("dr"); await sceneSearch.fill("drawing");
    expect(sceneRequests()).toHaveLength(0);
    await sceneSearch.press("Enter");
    await page.waitForFunction("editor.sceneKeyword === 'drawing' && !editor.sceneLoading");
    expect(sceneRequests()).toHaveLength(1);
    expect(sceneRequests()[0].path).toBe("/api/backend/platform/ai-config/scenes?page=1&pageSize=20&keyword=drawing");
    await sceneSearch.fill("");
    await page.getByRole("button", { name: "搜索场景", exact: true }).click();
    await page.waitForFunction("editor.sceneKeyword === '' && !editor.sceneLoading");
    expect(sceneRequests()).toHaveLength(2);
    await page.evaluate("editor.changeProvider('primary', 'two')");
    await page.waitForFunction("editor.primaryOptions.data.list.length === 1 && !editor.primaryOptions.loading");
    expect(requests.some((item) => item.path.includes("/providers/two/route-model-options"))).toBe(true);
    await page.evaluate("editor.changeScene('drawing')");
    await page.waitForFunction("editor.primaryOptions.data.list.length === 1 && !editor.primaryOptions.loading");
    expect(await page.locator("#ai-route-primary-model").isEnabled()).toBe(true);
    expect(await page.locator("#ai-route-format").count()).toBe(0);
    expect(await page.getByRole("button", { name: "自定义场景操作" }).count()).toBe(0);
    await page.evaluate("editor.changeKeyword('primary', 'slow'); editor.searchModels('primary')");
    await page.waitForFunction("editor.primaryOptions.loading");
    await page.evaluate("editor.changeProvider('primary','two')");
    await page.waitForFunction("editor.primaryOptions.data.list[0]?.value === 'model-two'");
    releaseOld?.();
    await oldRequestFinished;
    expect(await page.evaluate<unknown>("editor.primaryOptions.data.list[0].value")).toBe("model-two");
    expect(await page.evaluate<unknown>("editor.primaryOptions.data.discovery.status")).toBe("empty");
    expect(await page.getByText("OpenRouter 目录暂无符合条件的候选模型", { exact: false }).count()).toBe(1);
    await page.evaluate("editor.selectModel('primary', editor.primaryOptions.data.list[0])");
    failOptions = true;
    await page.evaluate("editor.searchModels('primary')");
    await page.waitForFunction("editor.primaryOptions.error !== null");
    expect(await page.evaluate<unknown>("editor.form.primary_provider_id")).toBe("two");
    expect(await page.evaluate<unknown>("editor.primaryOptions.selected.value")).toBe("model-two");
    expect(await page.evaluate<unknown>("editor.primaryOptions.error")).not.toContain("unsafe");
    expect(await page.evaluate<unknown>("editor.primaryOptions.data.discovery.status")).toBe("failed");
    const primaryFailure = page.getByRole("group", { name: "主模型", exact: true }).getByRole("alert");
    expect(await primaryFailure.getByRole("button", { name: "重试加载模型" }).isEnabled()).toBe(true);
    await primaryFailure.getByRole("button", { name: "手动填写调用名称" }).click();
    expect(await page.evaluate<unknown>("editor.form.primary_manual.enabled")).toBe(true);
    expect(await page.evaluate<unknown>("editor.primaryOptions.selected.value")).toBe("model-two");
    failOptions = false;
    await page.evaluate("editor.reloadScenes(2, '')");
    await page.waitForFunction("editor.scenes.list.some(s=>s.code==='next')");
    expect(requests.some((item) => item.path === "/api/backend/platform/ai-config/scenes?page=2&pageSize=20")).toBe(true);
    await page.evaluate("editor.reloadScenes(1,'图')");
    await page.waitForFunction("!editor.sceneLoading && editor.sceneKeyword === '图'");
    expect(await page.evaluate<unknown>("editor.scenes.list.some(s=>s.code==='next')")).toBe(false);
    await page.evaluate("void editor.reloadScenes(1,'slow-scene')");
    await page.waitForFunction("editor.sceneLoading");
    await page.evaluate("editor.reloadScenes(1,'drawing')");
    await page.waitForFunction("!editor.sceneLoading");
    releaseScene?.();
    await sceneRequestFinished;
    expect(await page.evaluate<unknown>("editor.scenes.list.some(s=>s.code==='stale-scene')")).toBe(false);
    await page.evaluate("editor.changeScene('disabled-custom')");
    expect(await page.evaluate<unknown>("editor.scene.code")).toBe("disabled-custom");
    await page.getByRole("button", { name: "自定义场景操作" }).click();
    await page.getByRole("menuitem", { name: "启用场景" }).click();
    expect(await page.getByRole("alertdialog").textContent()).toContain("启用后可新增或修改此场景的路由配置");
    expect(await page.getByRole("alertdialog").textContent()).not.toContain("停用后");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await page.evaluate("setCanManage(false)");
    await page.waitForFunction("canManage === false");
    expect(await page.getByRole("button", { name: "自定义场景操作" }).isDisabled()).toBe(true);
    const requestsBeforeReadonlyMutation = requests.length;
    expect(await page.evaluate<unknown>("editor.mutateScene({status:'active'})")).toBe(false);
    expect(await page.evaluate<unknown>("editor.mutateScene({delete:true})")).toBe(false);
    expect(requests).toHaveLength(requestsBeforeReadonlyMutation);
    expect(await page.getByRole("alertdialog").count()).toBe(0);
    await page.evaluate("setCanManage(true)");
    await page.waitForFunction("canManage === true");
    await page.evaluate("editor.changeScene('custom-code')");
    await page.getByRole("button", { name: "自定义场景操作" }).click();
    expect(await page.getByRole("menuitem", { name: "重命名场景" }).count()).toBe(1);
    await page.getByRole("menuitem", { name: "删除场景" }).click();
    expect(await page.getByRole("alertdialog").count()).toBe(1);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await page.waitForFunction("document.activeElement?.getAttribute('aria-label') === '自定义场景操作'");
    expect(await page.getByRole("button", { name: "自定义场景操作" }).evaluate((button) => button === document.activeElement)).toBe(true);
    expect(await page.evaluate<unknown>("editor.mutateScene({delete:true})")).toBe(false);
    expect(await page.evaluate<unknown>("editor.scene.code")).toBe("custom-code");
    expect(await page.evaluate<unknown>("editor.saveError")).toContain("引用");
    expect(requests.find((item) => item.path.endsWith("/scenes/custom-code"))?.body).toEqual({ expected_version: 3 });
    staleMutation = true;
    expect(await page.evaluate<unknown>("editor.mutateScene({name:'重命名'})")).toBe(false);
    expect(await page.evaluate<unknown>("editor.saveError")).toContain("版本");
    scenes[1].version = 7;
    await page.evaluate("editor.refresh()");
    expect(await page.evaluate<unknown>("editor.scene.version")).toBe(7);
    staleMutation = false;
    expect(await page.evaluate<unknown>("editor.mutateScene({name:'新名称'})")).toBe(true);
    expect(await page.evaluate<unknown>("editor.scene.name")).toBe("新名称");
    expect(requests.filter((item) => item.path.endsWith("/scenes/custom-code")).at(-1)?.body).toEqual({ name: "新名称", expected_version: 7 });
    allowDelete = true;
    await page.getByRole("button", { name: "自定义场景操作" }).click();
    await page.getByRole("menuitem", { name: "删除场景" }).click();
    await page.getByRole("button", { name: "删除场景", exact: true }).click();
    await page.waitForFunction("!editor.saving && editor.scene === null");
    expect(await page.evaluate<unknown>("editor.scenes.list.some(s=>s.code==='custom-code')")).toBe(false);
    await page.waitForFunction("document.activeElement.id === 'ai-route-scene-source'");
    expect(await page.evaluate<unknown>("document.activeElement.id")).toBe("ai-route-scene-source");
    await page.evaluate("editor.changeForm({...editor.form,scene_source:'custom',custom_scene_name:'新效果图',custom_scene_modality:'image'})");
    await page.evaluate("editor.changeForm({...editor.form,primary_provider_id:'two',fallback_provider_id:'one',primary_manual:{enabled:true,name:'主图片',model_name:'ep-two'},fallback_manual:{enabled:true,name:'',model_name:'ep-one'}})");
    expect(await page.locator("#ai-route-primary-manual-model").inputValue()).toBe("ep-two");
    expect(await page.locator("#ai-route-fallback-manual-model").inputValue()).toBe("ep-one");
    await page.evaluate("editor.changeProvider('fallback','two')");
    expect(await page.evaluate<unknown>("editor.form.primary_manual.model_name")).toBe("ep-two");
    expect(await page.evaluate<unknown>("editor.form.fallback_manual.enabled")).toBe(false);
    await page.evaluate("editor.changeForm({...editor.form,fallback_provider_id:'one',fallback_manual:{enabled:true,name:'',model_name:'ep-one'}})");
    await page.evaluate("const saving = editor.submit(); editor.changeProvider('primary','one'); saving");
    expect(await page.evaluate<unknown>("editor.form.scene_source")).toBe("registered");
    expect(await page.evaluate<unknown>("editor.form.scene_code")).toBe("server-code");
    expect(await page.evaluate<unknown>("editor.form.primary_provider_id")).toBe("two");
    expect(await page.evaluate<unknown>("editor.scene.source")).toBe("custom");
    expect(await page.evaluate<unknown>("editor.primaryOptions.selected.status")).toBe("active");
    const resolves = requests.filter((item) => item.path.includes(":resolve"));
    expect(resolves.map((item) => item.body)).toEqual([
      { source: "manual", name: "主图片", model_name: "ep-two", modality: "image", input_modalities: ["image"] },
      { source: "manual", name: "ep-one", model_name: "ep-one", modality: "image", input_modalities: ["image"] },
    ]);
    const saved = requests.find((item) => item.path.endsWith("/routes") && item.body);
    expect(saved?.body).toMatchObject({ scene_source: "custom", scene_name: "新效果图", modality: "image", primary_model_id: "manual-two", fallback_model_id: "manual-one" });
    expect(saved?.body).not.toHaveProperty("scene_code");
    expect(saved?.body).not.toHaveProperty("response_format");
  } finally { releaseOld?.(); releaseScene?.(); await browser.close(); }
}, 30000);
