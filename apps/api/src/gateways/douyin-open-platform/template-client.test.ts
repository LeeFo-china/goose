import { describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import { createDouyinTemplateManagementClient } from "./template-client";

const COMPONENT_TOKEN = "component-template-token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rawJsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Douyin template management V2", () => {
  test("lists bound template apps and preserves the latest draft metadata", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      rawJsonResponse(
        "{\"err_no\":0,\"err_msg\":\"\",\"log_id\":\"template-apps-log\","
        + "\"data\":{\"tpl_app_list\":[{\"tpl_app_id\":\"tt0d647bd99301341b01\","
        + "\"app_name\":\"鹅班长装企管家\",\"nick_name\":\"鹅班长装企管家\","
        + "\"user_version\":\"0.1.4\",\"user_desc\":\"收紧工地卡片并修复项目配置\","
        + "\"create_time\":1786608000,\"draft_id\":9133504853504535288}]}}",
      ));
    const client = createDouyinTemplateManagementClient({ fetch });

    await expect(client.listTemplateApps({ componentAccessToken: COMPONENT_TOKEN }))
      .resolves.toEqual({
        items: [{
          templateAppId: "tt0d647bd99301341b01",
          appName: "鹅班长装企管家",
          nickName: "鹅班长装企管家",
          version: "0.1.4",
          description: "收紧工地卡片并修复项目配置",
          createdAt: 1_786_608_000,
          draftId: "9133504853504535288",
        }],
        logId: "template-apps-log",
      });
    expect(fetch).toHaveBeenCalledWith(
      "https://open.douyin.com/api/tpapp/v2/template/get_tpl_app_list/",
      expect.objectContaining({
        method: "GET",
        headers: { "access-token": COMPONENT_TOKEN },
      }),
    );
  });

  test("adds a draft and lists the resulting reusable templates", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        err_no: 0,
        err_msg: "",
        log_id: "add-template-log",
      }))
      .mockResolvedValueOnce(rawJsonResponse(
        "{\"err_no\":0,\"err_msg\":\"\",\"log_id\":\"templates-log\","
        + "\"data\":{\"template_list\":[{\"template_id\":9133504853504535288,"
        + "\"user_version\":\"0.1.4\",\"user_desc\":\"收紧工地卡片并修复项目配置\","
        + "\"create_time\":1786608100}]}}",
      ));
    const client = createDouyinTemplateManagementClient({ fetch });

    await expect(client.addTemplate({
      componentAccessToken: COMPONENT_TOKEN,
      draftId: "9133504853504535288",
    })).resolves.toEqual({ logId: "add-template-log" });
    await expect(client.listTemplates({ componentAccessToken: COMPONENT_TOKEN }))
      .resolves.toEqual({
        items: [{
          templateId: "9133504853504535288",
          version: "0.1.4",
          description: "收紧工地卡片并修复项目配置",
          createdAt: 1_786_608_100,
        }],
        logId: "templates-log",
      });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/tpapp/v2/template/add_tpl/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": COMPONENT_TOKEN,
        "content-type": "application/json",
      },
      body: "{\"draft_id\":9133504853504535288}",
    });
    expect(fetch.mock.calls[1]?.[0]).toBe(
      "https://open.douyin.com/api/tpapp/v2/template/get_tpl_list/",
    );
  });

  test("rejects malformed or failed responses without exposing the component token", async () => {
    for (const responseBody of [
      { err_no: 0, log_id: "invalid-log", data: { tpl_app_list: [{ draft_id: 2 }] } },
      { err_no: 40_034, err_msg: COMPONENT_TOKEN, log_id: "provider-log" },
    ]) {
      const client = createDouyinTemplateManagementClient({
        fetch: async () => jsonResponse(responseBody),
      });
      let caught: unknown;
      try {
        await client.listTemplateApps({ componentAccessToken: COMPONENT_TOKEN });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect(JSON.stringify(caught)).not.toContain(COMPONENT_TOKEN);
    }
  });

  test("rejects unsafe draft IDs before calling the provider", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({}));
    const client = createDouyinTemplateManagementClient({ fetch });

    for (const draftId of ["0", "-1", "1.5", "10000000000000000000"]) {
      await expect(client.addTemplate({
        componentAccessToken: COMPONENT_TOKEN,
        draftId,
      })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_DRAFT_ID_INVALID" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
