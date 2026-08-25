import { describe, expect, mock, test } from "bun:test";

import type { DouyinContentInstallation } from "@/repositories/douyin-miniapp-content";
import type { AiGatewayChatInput } from "@/services/ai-gateway";
import type { JwtPayload } from "@/utils/jwt";
import { DouyinMiniappQaService } from "./qa";

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "44444444-4444-4444-8444-444444444444";
const APP_ID = "tt-app";

const user: JwtPayload = {
  token_type: "douyin_miniapp",
  tenant_id: TENANT_ID,
  douyin_installation_id: INSTALLATION_ID,
  douyin_app_id: APP_ID,
};

const attribution = {
  entry_path: "pages/qa/index" as const,
  scene: "021001",
  source_type: "direct" as const,
};

describe("DouyinMiniappQaService", () => {
  test("uses AI only to select safe answer codes and maps output to static copy", async () => {
    const chatCalls: AiGatewayChatInput[] = [];
    const chat = mock(async (input: AiGatewayChatInput) => {
      chatCalls.push(input);
      return {
        content: JSON.stringify({
          answer_code: "old_house_check",
          suggested_question_codes: ["budget_prepare", "measurement_prepare"],
        }),
        provider: "deepseek",
        model: "deepseek-chat",
      };
    });
    const findActiveInstallation = mock(activeInstallation);
    const service = new DouyinMiniappQaService({
      aiGateway: { chat },
      contextRepository: { findActiveInstallation },
    });

    await expect(service.ask(user, {
      question: "旧房翻新要先看哪些地方？",
      attribution,
    })).resolves.toEqual({
      answer_points: [
        "旧房翻新建议先看墙地面、水电线路、门窗和厨卫防水现状。",
        "如果计划局部改造，优先确认保留区域和需要拆改的边界。",
        "现场情况会影响施工方案，建议预约量房后再确认细节。",
      ],
      suggested_questions: [
        "装修预算前要先准备哪些信息？",
        "量房前需要准备什么？",
      ],
      disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
    });
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({
      sceneCode: "decoration_qa",
      tenantId: user.tenant_id,
      responseFormat: "json_object",
      source: "douyin_miniapp",
      billable: true,
    }));
    const prompt = JSON.stringify(chatCalls[0]?.messages);
    expect(prompt).toContain("旧房翻新要先看哪些地方？");
    expect(prompt).not.toContain("15518591857");
    expect(findActiveInstallation).toHaveBeenCalledWith({
      installationId: INSTALLATION_ID,
      tenantId: TENANT_ID,
      appId: APP_ID,
    });
  });

  test("rejects unsafe personal information before gateway call", async () => {
    const chat = mock(async () => ({ content: "{}", provider: "p", model: "m" }));
    const service = new DouyinMiniappQaService({
      aiGateway: { chat },
      contextRepository: { findActiveInstallation: mock(activeInstallation) },
    });

    for (const question of [
      "我手机号15518591857，装修怎么弄？",
      "人民路88号怎么装修？",
      "加我微信 abcdef",
    ]) {
      await expect(service.ask(user, { question, attribution }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: "DOUYIN_QA_INPUT_UNSAFE",
        });
    }
    expect(chat).not.toHaveBeenCalled();
  });

  test("does not reject ordinary decoration wording that mentions phone wiring", async () => {
    const service = new DouyinMiniappQaService({
      contextRepository: { findActiveInstallation: mock(activeInstallation) },
      aiGateway: {
        chat: mock(async () => ({
          content: JSON.stringify({
            answer_code: "partial_plan",
            suggested_question_codes: ["budget_prepare"],
          }),
          provider: "deepseek",
          model: "deepseek-chat",
        })),
      },
    });

    await expect(service.ask(user, {
      question: "电话线和网线改造要注意什么？",
      attribution,
    })).resolves.toMatchObject({
      answer_points: expect.arrayContaining([
        "局部装修建议先明确改造空间、保留区域和是否影响日常居住。",
      ]),
    });
  });


  test("falls back to a deterministic safe answer when AI output is invalid", async () => {
    const service = new DouyinMiniappQaService({
      contextRepository: { findActiveInstallation: mock(activeInstallation) },
      aiGateway: {
        chat: mock(async () => ({
          content: JSON.stringify({
            answer_code: "unknown",
            free_text: "拨打 15518591857 获取报价",
          }),
          provider: "deepseek",
          model: "deepseek-chat",
        })),
      },
    });

    await expect(service.ask(user, {
      question: "装修预算怎么准备？",
      attribution,
    })).resolves.toEqual({
      answer_points: [
        "预算沟通前建议先确认面积、房屋现状、装修范围和期望档位。",
        "同一面积下，旧房翻新、局部改造和材料档位都会影响预算区间。",
        "初步预算只适合做规划参考，正式方案需要结合现场量房确认。",
      ],
      suggested_questions: [
        "量房前需要准备什么？",
        "局部装修适合先确认什么？",
      ],
      disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
    });
  });

  test("requires a Douyin miniapp session scope", async () => {
    const findActiveInstallation = mock(activeInstallation);
    const service = new DouyinMiniappQaService({ aiGateway: {
      chat: mock(async () => ({ content: "{}", provider: "p", model: "m" })),
    }, contextRepository: { findActiveInstallation } });

    await expect(service.ask({ token_type: "auth", tenant_id: user.tenant_id }, {
      question: "装修预算怎么准备？",
      attribution,
    })).rejects.toMatchObject({ statusCode: 401 });
    expect(findActiveInstallation).not.toHaveBeenCalled();
  });

  test("rejects disabled or mismatched miniapp installations before gateway call", async () => {
    const chat = mock(async () => ({ content: "{}", provider: "p", model: "m" }));
    const service = new DouyinMiniappQaService({
      aiGateway: { chat },
      contextRepository: { findActiveInstallation: mock(async () => null) },
    });

    await expect(service.ask(user, {
      question: "装修预算怎么准备？",
      attribution,
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "DOUYIN_MINIAPP_DISABLED",
    });
    expect(chat).not.toHaveBeenCalled();
  });
});

function activeInstallation(): Promise<DouyinContentInstallation> {
  return Promise.resolve({
    id: INSTALLATION_ID,
    tenant_id: TENANT_ID,
    authorizer_appid: APP_ID,
    authorization_status: "active" as const,
    template_version: "0.1.5",
    installation_kind: "merchant" as const,
    runtime_config: {
      brand: { logo_url: null, qualifications: [] },
      theme: { primary_color: "#191817", navigation_text_color: "black" },
      features: {
        cases: true,
        sites: true,
        sms_lead: true,
        douyin_phone: false,
        phone_capture_mode: "sms",
      },
      home_banners: [],
      trust_metrics: [],
      privacy_policy_version: "2026-08-25",
    },
    tenant: { id: TENANT_ID, status: "active" as const },
  });
}
